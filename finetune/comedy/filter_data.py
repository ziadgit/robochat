"""
Filter training data for quality and appropriateness.
1. Remove racist, sexist, homophobic, and otherwise offensive content
2. Remove low-effort/inane jokes
3. Use Mistral as a judge to score remaining examples on humor + appropriateness
4. Keep only examples that pass both filters

Usage:
    source .env
    python filter_data.py                    # filter with LLM judge
    python filter_data.py --keyword-only     # fast keyword filter only (no API calls)
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

DATA_DIR = Path("data")

# Keyword blocklist: terms strongly associated with offensive humor
BLOCKLIST_PATTERNS = [
    # Slurs and hate speech (partial list - catches most common patterns)
    r"\bnigg",
    r"\bfagg",
    r"\bretard",
    r"\btrann",
    r"\bcrippl",
    r"\bwetback",
    r"\bspic[ks]?\b",
    r"\bchink",
    r"\bgook\b",
    r"\bkike\b",
    r"\btowelhead",
    r"\bcamelj",
    r"\bjew[s]?\b(?=.*\b(oven|gas|cheap|nose|money))",  # antisemitic tropes
    # Sexual violence / pedophilia
    r"\brape[ds]?\b",
    r"\bmolest",
    r"\bpedophil",
    r"\bunderage",
    # Suicide as punchline
    r"\bkill\s+(your|my|him|her)self",
    r"\bsuicid",
    # Domestic violence as humor
    r"\bbeat\s+(my|his|your)\s+(wife|girlfriend|woman)",
    r"\bhit\s+(my|his|your)\s+(wife|girlfriend|woman)",
]

BLOCKLIST_COMPILED = [re.compile(p, re.IGNORECASE) for p in BLOCKLIST_PATTERNS]

# Low-effort patterns
LOW_EFFORT_PATTERNS = [
    r"^what do you call",
    r"^why did the chicken",
    r"\bdeez nuts\b",
    r"\bthat'?s what she said\b",
    r"\byour mom\b",
    r"\byo mama\b",
]
LOW_EFFORT_COMPILED = [re.compile(p, re.IGNORECASE) for p in LOW_EFFORT_PATTERNS]

JUDGE_PROMPT = """\
Rate this comedy text on two dimensions. Be strict.

Text: "{text}"

1. **appropriate** (1-5): Is this free of racism, sexism, homophobia, and punching-down humor? \
(1=offensive/hateful, 3=edgy but not harmful, 5=clean)
2. **funny** (1-5): Is this actually funny, clever, or witty? \
(1=not funny at all, 3=mild chuckle, 5=genuinely hilarious)

Return ONLY JSON: {{"appropriate": <int>, "funny": <int>}}"""


def keyword_filter(text):
    """Return True if text passes keyword filter (no blocklisted terms)."""
    for pattern in BLOCKLIST_COMPILED:
        if pattern.search(text):
            return False
    return True


def low_effort_filter(text):
    """Return True if text passes low-effort filter."""
    for pattern in LOW_EFFORT_COMPILED:
        if pattern.search(text):
            return False
    return True


def _judge_one(client, text):
    """Judge a single text. Returns scores dict."""
    try:
        resp = client.chat.complete(
            model="mistral-small-latest",
            messages=[{"role": "user", "content": JUDGE_PROMPT.format(text=text[:500])}],
            max_tokens=50,
            temperature=0.0,
        )
        raw = resp.choices[0].message.content.strip()
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        scores = json.loads(raw)
        return {
            "appropriate": max(1, min(5, int(scores["appropriate"]))),
            "funny": max(1, min(5, int(scores["funny"]))),
        }
    except Exception:
        return {"appropriate": 3, "funny": 3}


def llm_judge_batch(client, texts, max_workers=20):
    """Judge texts using Mistral with concurrent API calls."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    results = [None] * len(texts)
    done = 0

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_idx = {
            executor.submit(_judge_one, client, text): i
            for i, text in enumerate(texts)
        }
        for future in as_completed(future_to_idx):
            idx = future_to_idx[future]
            results[idx] = future.result()
            done += 1
            if done % 200 == 0:
                print(f"  Judged {done}/{len(texts)}...", flush=True)

    print(f"  Judged {len(texts)}/{len(texts)} (done)", flush=True)
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--keyword-only", action="store_true", help="Skip LLM judge, keyword filter only")
    parser.add_argument("--min-appropriate", type=int, default=3, help="Min appropriateness score (1-5)")
    parser.add_argument("--min-funny", type=int, default=2, help="Min humor score (1-5)")
    args = parser.parse_args()

    for split in ["comedy_train", "comedy_val"]:
        input_path = DATA_DIR / f"{split}_filtered.jsonl"
        if not input_path.exists():
            input_path = DATA_DIR / f"{split}.jsonl"

        with open(input_path) as f:
            examples = [json.loads(line) for line in f]

        print(f"\n{'='*50}")
        print(f"Processing {split}: {len(examples)} examples")

        # Step 1: Length filter (keep < 2048 chars total)
        before = len(examples)
        examples = [
            ex for ex in examples
            if len(" ".join(m["content"] for m in ex["messages"])) <= 2048
        ]
        print(f"  Length filter: {before} -> {len(examples)}")

        # Step 2: Keyword blocklist
        before = len(examples)
        examples = [
            ex for ex in examples
            if keyword_filter(ex["messages"][2]["content"])
        ]
        print(f"  Keyword filter: {before} -> {len(examples)}")

        # Step 3: Low-effort filter
        before = len(examples)
        examples = [
            ex for ex in examples
            if low_effort_filter(ex["messages"][2]["content"])
        ]
        print(f"  Low-effort filter: {before} -> {len(examples)}")

        # Step 4: LLM judge (optional)
        if not args.keyword_only:
            api_key = os.environ.get("MISTRAL_API_KEY")
            if not api_key:
                print("  WARNING: No MISTRAL_API_KEY, skipping LLM judge")
            else:
                from mistralai import Mistral
                client = Mistral(api_key=api_key)

                texts = [ex["messages"][2]["content"] for ex in examples]
                print(f"  Running LLM judge on {len(texts)} examples...")
                scores = llm_judge_batch(client, texts)

                before = len(examples)
                filtered = []
                score_stats = {"appropriate": [], "funny": []}
                for ex, score in zip(examples, scores):
                    score_stats["appropriate"].append(score["appropriate"])
                    score_stats["funny"].append(score["funny"])
                    if score["appropriate"] >= args.min_appropriate and score["funny"] >= args.min_funny:
                        filtered.append(ex)

                examples = filtered
                avg_app = sum(score_stats["appropriate"]) / len(score_stats["appropriate"])
                avg_fun = sum(score_stats["funny"]) / len(score_stats["funny"])
                print(f"  LLM judge: {before} -> {len(examples)}")
                print(f"    Avg appropriate: {avg_app:.1f}, avg funny: {avg_fun:.1f}")
                print(f"    Thresholds: appropriate>={args.min_appropriate}, funny>={args.min_funny}")

        # Write output
        output_path = DATA_DIR / f"{split}_clean.jsonl"
        with open(output_path, "w") as f:
            for ex in examples:
                f.write(json.dumps(ex) + "\n")

        total_chars = sum(len(" ".join(m["content"] for m in ex["messages"])) for ex in examples)
        print(f"  Wrote {output_path}: {len(examples)} examples, ~{total_chars//4:,} tokens")

    # Print training time estimate for clean data
    clean_train = DATA_DIR / "comedy_train_clean.jsonl"
    if clean_train.exists():
        with open(clean_train) as f:
            n = sum(1 for _ in f)
        steps_2ep = n * 2 / 16
        print(f"\n=== Clean dataset ready ===")
        print(f"Train: {n} examples")
        print(f"Est. 2 epochs: {int(steps_2ep)} steps, ~{int(steps_2ep * 0.05)} min on A10")


if __name__ == "__main__":
    main()
