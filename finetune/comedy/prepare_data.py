"""
Prepare comedy fine-tuning data for Mistral from two HuggingFace datasets:
- zachgitt/comedy-transcripts: full standup transcripts (~419 transcripts)
- ysharma/short_jokes: one-liner jokes (~231K jokes)

Converts both into Mistral chat JSONL format and splits train/val.
"""

import json
import random
import re
import textwrap
from pathlib import Path

from datasets import load_dataset

SYSTEM_PROMPT = (
    "You are a sharp-witted, darkly funny AI game narrator. "
    "You deliver punchlines like a standup comedian. "
    "Keep responses short (1-3 sentences), punchy, and comedically timed."
)

OUTPUT_DIR = Path("data")
SEED = 42
MAX_SHORT_JOKES = 3000
MAX_TRANSCRIPT_CHUNKS = 2000
VAL_RATIO = 0.05


def chunk_transcript(text, comedian_name, max_chars=300):
    """Split a standup transcript into short, usable chunks.

    Extracts individual bits/segments that work as standalone comedy lines.
    Skips metadata, stage directions, and overly short fragments.
    """
    lines = text.split("\n")
    chunks = []
    current = []
    current_len = 0

    for line in lines:
        line = line.strip()
        if not line:
            if current and current_len > 50:
                chunks.append(" ".join(current))
            current = []
            current_len = 0
            continue

        # skip metadata/headers
        if any(kw in line.lower() for kw in [
            "transcript", "full script", "copyright", "http", "www.",
            "subscribe", "follow", "applause", "cheering", "laughter",
            "[music", "[end", "[intro",
        ]):
            continue

        current.append(line)
        current_len += len(line)

        if current_len >= max_chars:
            chunks.append(" ".join(current))
            current = []
            current_len = 0

    if current and current_len > 50:
        chunks.append(" ".join(current))

    return chunks


def format_transcript_example(chunk, comedian_name):
    """Turn a transcript chunk into a chat training example."""
    # Create varied prompts so the model doesn't overfit to one format
    prompts = [
        f"Do a bit about something funny, in the style of {comedian_name}.",
        f"Say something funny like {comedian_name} would.",
        f"Give me a comedy bit.",
        "Make me laugh.",
        "Tell me something funny.",
        "Do some standup.",
        "Roast the situation.",
    ]
    return {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": random.choice(prompts)},
            {"role": "assistant", "content": chunk.strip()},
        ]
    }


def format_joke_example(joke_text):
    """Turn a short joke into a chat training example."""
    prompts = [
        "Tell me a joke.",
        "Make me laugh.",
        "Hit me with a one-liner.",
        "Say something funny.",
        "Give me a quick joke.",
        "Got any good jokes?",
    ]
    return {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": random.choice(prompts)},
            {"role": "assistant", "content": joke_text.strip()},
        ]
    }


def clean_joke(text):
    """Basic cleaning for short jokes."""
    text = text.strip()
    text = re.sub(r"\s+", " ", text)
    return text


def main():
    random.seed(SEED)
    OUTPUT_DIR.mkdir(exist_ok=True)

    all_examples = []

    # --- 1. Process standup transcripts ---
    print("Loading zachgitt/comedy-transcripts...")
    transcripts_ds = load_dataset("zachgitt/comedy-transcripts", split="train")

    transcript_chunks = []
    for row in transcripts_ds:
        name = row.get("transcript-link", "a comedian")
        # Extract comedian name from link text like "George Carlin: It's Bad For Ya (2008)"
        comedian = name.split(":")[0].strip() if ":" in name else name.split("(")[0].strip()
        chunks = chunk_transcript(row["transcript"], comedian)
        for c in chunks:
            transcript_chunks.append((c, comedian))

    print(f"  Got {len(transcript_chunks)} chunks from {len(transcripts_ds)} transcripts")

    random.shuffle(transcript_chunks)
    for chunk, comedian in transcript_chunks[:MAX_TRANSCRIPT_CHUNKS]:
        all_examples.append(format_transcript_example(chunk, comedian))

    # --- 2. Process short jokes ---
    print("Loading ysharma/short_jokes...")
    jokes_ds = load_dataset("ysharma/short_jokes", split="train")

    jokes = []
    for row in jokes_ds:
        joke = clean_joke(row["Joke"])
        # Filter: skip very short, very long, or low-quality
        if 20 < len(joke) < 280:
            jokes.append(joke)

    print(f"  Got {len(jokes)} valid jokes from {len(jokes_ds)} total")

    random.shuffle(jokes)
    for joke in jokes[:MAX_SHORT_JOKES]:
        all_examples.append(format_joke_example(joke))

    # --- 3. Shuffle and split ---
    random.shuffle(all_examples)
    n_val = max(10, int(len(all_examples) * VAL_RATIO))
    val_examples = all_examples[:n_val]
    train_examples = all_examples[n_val:]

    print(f"\nTotal examples: {len(all_examples)}")
    print(f"  Train: {len(train_examples)}")
    print(f"  Val:   {len(val_examples)}")

    # --- 4. Write JSONL files ---
    train_path = OUTPUT_DIR / "comedy_train.jsonl"
    val_path = OUTPUT_DIR / "comedy_val.jsonl"

    for path, examples in [(train_path, train_examples), (val_path, val_examples)]:
        with open(path, "w") as f:
            for ex in examples:
                f.write(json.dumps(ex) + "\n")
        print(f"Wrote {path} ({path.stat().st_size / 1024:.1f} KB)")

    # Show a few samples
    print("\n--- Sample training examples ---")
    for ex in train_examples[:3]:
        print(json.dumps(ex, indent=2)[:300])
        print("...")


if __name__ == "__main__":
    main()
