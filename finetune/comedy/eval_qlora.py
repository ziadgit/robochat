"""
Quick eval of the QLoRA fine-tuned model on Lambda.
Generates responses and logs to W&B.

Usage:
    python eval_qlora.py                          # eval merged model
    python eval_qlora.py --model output/merged    # custom path
    python eval_qlora.py --compare                # compare ft vs base
"""

import argparse
import os

import torch
import wandb
from peft import AutoPeftModelForCausalLM
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

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

WANDB_PROJECT = os.environ.get("WANDB_PROJECT", "mistral-comedy-ft")
BASE_MODEL = os.environ.get("MODEL", "mistralai/Mistral-7B-Instruct-v0.3")
HF_TOKEN = os.environ.get("HF_TOKEN", "")


def load_model(model_path, is_lora=False):
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )

    if is_lora:
        model = AutoPeftModelForCausalLM.from_pretrained(
            model_path,
            quantization_config=bnb_config,
            device_map="auto",
            token=HF_TOKEN or None,
        )
    else:
        model = AutoModelForCausalLM.from_pretrained(
            model_path,
            quantization_config=bnb_config,
            device_map="auto",
            token=HF_TOKEN or None,
            trust_remote_code=True,
        )

    tokenizer = AutoTokenizer.from_pretrained(
        model_path, token=HF_TOKEN or None, trust_remote_code=True
    )
    model.eval()
    return model, tokenizer


def generate(model, tokenizer, prompt, max_new_tokens=150):
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]
    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer(text, return_tensors="pt").to(model.device)

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            temperature=0.8,
            do_sample=True,
            top_p=0.9,
        )

    # Decode only the new tokens
    new_tokens = outputs[0][inputs["input_ids"].shape[1]:]
    return tokenizer.decode(new_tokens, skip_special_tokens=True).strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="output/lora", help="Path to fine-tuned model (LoRA adapters or merged)")
    parser.add_argument("--lora", action="store_true", help="Load as LoRA adapters (vs merged model)")
    parser.add_argument("--compare", action="store_true", help="Also run base model")
    args = parser.parse_args()

    # Load fine-tuned model
    print(f"Loading fine-tuned model: {args.model}")
    ft_model, ft_tokenizer = load_model(args.model, is_lora=args.lora)

    run = wandb.init(
        project=WANDB_PROJECT,
        name="qlora-eval",
        tags=["eval", "qlora", "local"],
        config={"ft_model": args.model, "compare": args.compare},
    )

    ft_results = []
    for prompt in TEST_PROMPTS:
        resp = generate(ft_model, ft_tokenizer, prompt)
        ft_results.append({"prompt": prompt, "response": resp})
        print(f"\nPROMPT: {prompt}")
        print(f"  [FT] {resp}")

    if args.compare:
        # Free memory and load base
        del ft_model
        torch.cuda.empty_cache()

        print(f"\nLoading base model: {BASE_MODEL}")
        base_model, base_tokenizer = load_model(BASE_MODEL, is_lora=False)

        base_results = []
        for prompt in TEST_PROMPTS:
            resp = generate(base_model, base_tokenizer, prompt)
            base_results.append({"prompt": prompt, "response": resp})
            print(f"\nPROMPT: {prompt}")
            print(f"  [Base] {resp}")

        # Log comparison table
        rows = []
        for ft, base in zip(ft_results, base_results):
            rows.append([ft["prompt"], ft["response"], base["response"]])
        table = wandb.Table(
            columns=["prompt", "fine_tuned", "base"],
            data=rows,
        )
        run.log({"comparison": table})
    else:
        rows = [[r["prompt"], r["response"]] for r in ft_results]
        table = wandb.Table(columns=["prompt", "response"], data=rows)
        run.log({"responses": table})

    run.finish()
    print(f"\nResults logged to W&B")


if __name__ == "__main__":
    main()
