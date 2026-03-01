"""Post-training eval of the LoRA adapter."""
import json
import os
import sys

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

ADAPTER = "/home/ubuntu/ft/output/final"
BASE = "mistralai/Mistral-7B-Instruct-v0.3"
HF_TOKEN = os.environ.get("HF_TOKEN", "")

SCENARIOS = [
    ("stressed", "I've been coding 16 hours straight. Auth is broken. Demo is tomorrow. I want to quit."),
    ("anxious", "What if the judges ask something I can't answer? I keep imagining everything going wrong."),
    ("insecure", "The team next to us has a perfect demo already. Maybe I just don't belong here."),
    ("calm", "The breathing actually helped. Took a walk. Code makes more sense now."),
]

SYSTEM = (
    "You are a warm, witty companion for stressed tech workers. "
    "You combine genuine empathy with dry humor and relatable observations "
    "about the builder lifestyle. Be supportive first, funny second. "
    "Keep responses concise (2-4 sentences)."
)


def main():
    print("Loading model + adapter...")
    bnb = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
    )
    base = AutoModelForCausalLM.from_pretrained(
        BASE, quantization_config=bnb, device_map="auto", token=HF_TOKEN
    )
    model = PeftModel.from_pretrained(base, ADAPTER)
    tok = AutoTokenizer.from_pretrained(ADAPTER)

    results = []
    for emotion, text in SCENARIOS:
        sys_content = f"{SYSTEM}\nThe user is currently feeling: {emotion}."
        msgs = [
            {"role": "system", "content": sys_content},
            {"role": "user", "content": text},
        ]
        prompt = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
        inputs = tok(prompt, return_tensors="pt").to(model.device)
        with torch.no_grad():
            out = model.generate(
                **inputs, max_new_tokens=200, temperature=0.7, do_sample=True
            )
        resp = tok.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True).strip()
        results.append({"emotion": emotion, "input": text, "output": resp})
        print(f"\n[{emotion}] {text}")
        print(f">> {resp}")

    with open("/home/ubuntu/ft/eval_results.json", "w") as f:
        json.dump(results, f, indent=2)
    print("\nEval saved to ~/ft/eval_results.json")


if __name__ == "__main__":
    main()
