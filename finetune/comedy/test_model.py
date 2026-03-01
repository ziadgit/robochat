"""
Test fine-tuned vs base model with LLM-as-judge evaluation, logged to W&B.

Usage:
    python test_model.py --model ft:open-mistral-7b:xxx:comedy-narrator --compare
"""

import argparse
import json
import os
import sys

import wandb
from mistralai import Mistral

SYSTEM_PROMPT = (
    "You are a sharp-witted, darkly funny AI game narrator. "
    "You deliver punchlines like a standup comedian. "
    "Keep responses short (1-3 sentences), punchy, and comedically timed."
)

TEST_PROMPTS = [
    "The player just walked off a cliff.",
    "The player shot their own teammate.",
    "The player has been standing still for 5 minutes.",
    "The player just died for the 10th time on the same level.",
    "Tell me a joke.",
    "The player is trying to fight the final boss with a wooden sword.",
    "Make me laugh.",
    "The player just rage quit and came back 30 seconds later.",
    "The player accidentally sold their best weapon.",
    "The player is lost in the tutorial level.",
]

JUDGE_PROMPT = """\
You are evaluating an AI game narrator's response. The narrator should be funny, \
coherent, and relevant to the game situation described.

Game situation: {prompt}
Narrator response: {response}

Score the response on these 4 dimensions (1-5 each):

1. **coherence**: Is the response grammatically correct, logically consistent, \
and does it read like natural English? (1=gibberish, 5=perfectly clear)
2. **humor**: Is it genuinely funny or witty? (1=not at all, 5=laugh out loud)
3. **relevance**: Does it address the specific game situation? \
(1=completely off-topic, 5=directly references the situation)
4. **brevity**: Is it concise and punchy? (1=rambling/repetitive, 5=tight and well-timed)

Return ONLY valid JSON, no other text:
{{"coherence": <int>, "humor": <int>, "relevance": <int>, "brevity": <int>}}"""

WANDB_PROJECT = "mistral-comedy-ft"
JUDGE_MODEL = "mistral-large-latest"


def query_model(client, model, user_msg):
    resp = client.chat.complete(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        max_tokens=150,
        temperature=0.8,
    )
    return resp.choices[0].message.content.strip()


def judge_response(client, prompt, response):
    """Use Mistral Large to score a response on coherence, humor, relevance, brevity."""
    judge_msg = JUDGE_PROMPT.format(prompt=prompt, response=response)
    resp = client.chat.complete(
        model=JUDGE_MODEL,
        messages=[{"role": "user", "content": judge_msg}],
        max_tokens=100,
        temperature=0.0,
    )
    raw = resp.choices[0].message.content.strip()
    # Extract JSON from response (handle markdown code blocks)
    if "```" in raw:
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        scores = json.loads(raw)
        for key in ("coherence", "humor", "relevance", "brevity"):
            scores[key] = max(1, min(5, int(scores[key])))
        return scores
    except (json.JSONDecodeError, KeyError, ValueError):
        print(f"  [Judge parse error] {raw}")
        return None


def run_eval(client, model_id, model_label, prompts):
    """Generate responses and judge them. Returns list of result dicts."""
    results = []
    for prompt in prompts:
        response = query_model(client, model_id, prompt)
        scores = judge_response(client, prompt, response)
        result = {
            "prompt": prompt,
            "response": response,
            "model": model_label,
        }
        if scores:
            result.update(scores)
        results.append(result)
        status = f"C={scores['coherence']} H={scores['humor']} R={scores['relevance']} B={scores['brevity']}" if scores else "judge failed"
        print(f"  [{model_label}] {status} | {response[:80]}...")
    return results


def compute_averages(results):
    """Compute average scores across all judged results."""
    dims = ("coherence", "humor", "relevance", "brevity")
    avgs = {}
    for dim in dims:
        vals = [r[dim] for r in results if dim in r]
        avgs[dim] = sum(vals) / len(vals) if vals else 0
    avgs["overall"] = sum(avgs.values()) / len(dims) if avgs else 0
    return avgs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, help="Fine-tuned model ID")
    parser.add_argument("--base", default="open-mistral-7b", help="Base model for comparison")
    parser.add_argument("--compare", action="store_true", help="Compare with base model + log to W&B")
    parser.add_argument("--judge", default=JUDGE_MODEL, help="Model to use as judge")
    args = parser.parse_args()

    api_key = os.environ.get("MISTRAL_API_KEY")
    if not api_key:
        print("ERROR: Set MISTRAL_API_KEY")
        sys.exit(1)

    client = Mistral(api_key=api_key)

    if args.compare:
        run = wandb.init(
            project=WANDB_PROJECT,
            name=f"eval-{args.model.split(':')[-1] if ':' in args.model else args.model[:20]}",
            tags=["eval", "llm-judge"],
            config={
                "ft_model": args.model,
                "base_model": args.base,
                "judge_model": args.judge,
                "n_prompts": len(TEST_PROMPTS),
            },
        )

        # Evaluate both models
        print("Evaluating fine-tuned model...")
        ft_results = run_eval(client, args.model, "fine_tuned", TEST_PROMPTS)

        print("\nEvaluating base model...")
        base_results = run_eval(client, args.base, "base", TEST_PROMPTS)

        # Build comparison table
        table_cols = [
            "prompt",
            "ft_response", "ft_coherence", "ft_humor", "ft_relevance", "ft_brevity",
            "base_response", "base_coherence", "base_humor", "base_relevance", "base_brevity",
        ]
        table_data = []
        for ft, base in zip(ft_results, base_results):
            table_data.append([
                ft["prompt"],
                ft["response"],
                ft.get("coherence", ""),
                ft.get("humor", ""),
                ft.get("relevance", ""),
                ft.get("brevity", ""),
                base["response"],
                base.get("coherence", ""),
                base.get("humor", ""),
                base.get("relevance", ""),
                base.get("brevity", ""),
            ])
        run.log({"eval_comparison": wandb.Table(columns=table_cols, data=table_data)})

        # Compute and log average scores
        ft_avgs = compute_averages(ft_results)
        base_avgs = compute_averages(base_results)

        for dim, val in ft_avgs.items():
            run.summary[f"ft_{dim}"] = round(val, 2)
        for dim, val in base_avgs.items():
            run.summary[f"base_{dim}"] = round(val, 2)

        # Log bar chart data
        dims = ["coherence", "humor", "relevance", "brevity", "overall"]
        score_table = wandb.Table(
            columns=["dimension", "fine_tuned", "base"],
            data=[[d, ft_avgs[d], base_avgs[d]] for d in dims],
        )
        run.log({"score_summary": score_table})

        # Print summary
        print(f"\n{'Dimension':<12} {'Fine-tuned':>10} {'Base':>10} {'Delta':>10}")
        print("-" * 44)
        for dim in dims:
            delta = ft_avgs[dim] - base_avgs[dim]
            sign = "+" if delta > 0 else ""
            print(f"{dim:<12} {ft_avgs[dim]:>10.2f} {base_avgs[dim]:>10.2f} {sign}{delta:>9.2f}")

        run.finish()
        print(f"\nFull eval logged to W&B: {run.url}")

    else:
        # Quick eval without comparison
        print("Evaluating model with LLM judge...")
        results = run_eval(client, args.model, "model", TEST_PROMPTS)
        avgs = compute_averages(results)
        print(f"\n{'Dimension':<12} {'Score':>10}")
        print("-" * 24)
        for dim in ("coherence", "humor", "relevance", "brevity", "overall"):
            print(f"{dim:<12} {avgs[dim]:>10.2f}")


if __name__ == "__main__":
    main()
