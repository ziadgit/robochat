"""Prepare pure therapy data for fine-tuning."""
import json
import os
from collections import Counter
from pathlib import Path

from datasets import load_dataset

HF_TOKEN = os.environ.get("HF_TOKEN", "")
OUTPUT_DIR = Path.home() / "ft_therapy" / "data"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

SYSTEM_PROMPT = (
    "You are a warm, empathetic emotional support companion for people "
    "experiencing stress, anxiety, or burnout. Listen carefully to both "
    "what the user says and how they feel. Validate their emotions, ask "
    "gentle follow-up questions, and suggest evidence-based grounding "
    "techniques when appropriate. Keep responses concise (2-3 sentences) "
    "and conversational."
)


def format_conversation(row, min_turns=2, max_turns=20):
    emotion = row.get("emotion", "")
    convs = row["conversations"]
    if len(convs) < min_turns or len(convs) > max_turns:
        return None

    sys_content = SYSTEM_PROMPT
    if emotion:
        sys_content += f"\nThe user is currently feeling: {emotion}."

    messages = [{"role": "system", "content": sys_content}]
    prev_role = "system"
    for turn in convs:
        role = turn["role"]
        content = turn["content"].strip()
        if not content or role == prev_role:
            continue
        messages.append({"role": role, "content": content})
        prev_role = role

    has_user = any(m["role"] == "user" for m in messages)
    has_assistant = any(m["role"] == "assistant" for m in messages)
    if has_user and has_assistant and messages[-1]["role"] == "assistant":
        return {"messages": messages}
    return None


def main():
    print("Downloading Estwld/empathetic_dialogues_llm (therapy only)...")
    ds_train = load_dataset("Estwld/empathetic_dialogues_llm", split="train", token=HF_TOKEN)
    ds_val = load_dataset("Estwld/empathetic_dialogues_llm", split="valid", token=HF_TOKEN)

    train_rows = [r for r in (format_conversation(row) for row in ds_train) if r]
    val_rows = [r for r in (format_conversation(row) for row in ds_val) if r]

    print(f"Train: {len(train_rows)}, Val: {len(val_rows)}")

    for path, rows in [(OUTPUT_DIR / "train.jsonl", train_rows), (OUTPUT_DIR / "val.jsonl", val_rows)]:
        with open(path, "w") as f:
            for row in rows:
                f.write(json.dumps(row) + "\n")
    print(f"Saved to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
