"""
QLoRA fine-tune Mistral 7B on comedy data using PEFT + trl.
Designed for A100/A10 or any GPU with >= 16GB VRAM.

Usage:
    WANDB_PROJECT=mistral-comedy-ft python train_qlora.py
"""

import json
import os
from pathlib import Path

import torch
import wandb
from datasets import Dataset
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from trl import SFTTrainer, SFTConfig

# --- Config (override via env vars) ---
MODEL_NAME = os.environ.get("MODEL", "mistralai/Mistral-7B-Instruct-v0.3")
MAX_SEQ_LEN = int(os.environ.get("MAX_SEQ_LEN", "1024"))
LORA_R = int(os.environ.get("LORA_R", "16"))
LORA_ALPHA = int(os.environ.get("LORA_ALPHA", "32"))
LR = float(os.environ.get("LR", "2e-4"))
EPOCHS = int(os.environ.get("EPOCHS", "2"))
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "4"))
GRAD_ACCUM = int(os.environ.get("GRAD_ACCUM", "4"))
WANDB_PROJECT = os.environ.get("WANDB_PROJECT", "mistral-comedy-ft")
OUTPUT_DIR = os.environ.get("OUTPUT_DIR", "output")
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
HF_TOKEN = os.environ.get("HF_TOKEN", "")


def load_chat_jsonl(path):
    records = []
    with open(path) as f:
        for line in f:
            records.append(json.loads(line))
    return Dataset.from_list(records)


def format_chat(example, tokenizer):
    text = tokenizer.apply_chat_template(
        example["messages"],
        tokenize=False,
        add_generation_prompt=False,
    )
    return {"text": text}


def main():
    eff_batch = BATCH_SIZE * GRAD_ACCUM
    print(f"Model:          {MODEL_NAME}")
    print(f"LoRA r={LORA_R}, alpha={LORA_ALPHA}")
    print(f"LR={LR}, epochs={EPOCHS}, batch={BATCH_SIZE}x{GRAD_ACCUM}={eff_batch}")
    print(f"Max seq len:    {MAX_SEQ_LEN}")

    # --- 4-bit quantization config ---
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )

    # --- Load model ---
    print("Loading model...")
    tokenizer = AutoTokenizer.from_pretrained(
        MODEL_NAME, token=HF_TOKEN or None, trust_remote_code=True
    )
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        MODEL_NAME,
        quantization_config=bnb_config,
        device_map="auto",
        token=HF_TOKEN or None,
        trust_remote_code=True,
    )
    model = prepare_model_for_kbit_training(model)

    # --- LoRA config ---
    lora_config = LoraConfig(
        r=LORA_R,
        lora_alpha=LORA_ALPHA,
        lora_dropout=0.05,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        bias="none",
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, lora_config)

    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total = sum(p.numel() for p in model.parameters())
    print(f"Trainable params: {trainable:,} / {total:,} ({100*trainable/total:.2f}%)")

    # --- Load data ---
    for suffix in ["_clean", "_filtered", ""]:
        train_path = DATA_DIR / f"comedy_train{suffix}.jsonl"
        val_path = DATA_DIR / f"comedy_val{suffix}.jsonl"
        if train_path.exists():
            break

    if not train_path.exists():
        raise SystemExit(f"ERROR: No training data found in {DATA_DIR}/")

    train_ds = load_chat_jsonl(train_path)
    val_ds = load_chat_jsonl(val_path)

    train_ds = train_ds.map(lambda x: format_chat(x, tokenizer), remove_columns=["messages"])
    val_ds = val_ds.map(lambda x: format_chat(x, tokenizer), remove_columns=["messages"])

    print(f"Data: {train_path.name}")
    print(f"Train: {len(train_ds)} | Val: {len(val_ds)}")

    # --- W&B ---
    wandb.init(
        project=WANDB_PROJECT,
        name=f"qlora-r{LORA_R}-lr{LR}-ep{EPOCHS}",
        tags=["qlora", "mistral-7b", "comedy"],
        config={
            "model": MODEL_NAME,
            "lora_r": LORA_R,
            "lora_alpha": LORA_ALPHA,
            "lr": LR,
            "epochs": EPOCHS,
            "eff_batch_size": eff_batch,
            "max_seq_len": MAX_SEQ_LEN,
            "n_train": len(train_ds),
            "n_val": len(val_ds),
            "trainable_params": trainable,
        },
    )

    # --- Train ---
    training_args = SFTConfig(
        output_dir=OUTPUT_DIR,
        per_device_train_batch_size=BATCH_SIZE,
        gradient_accumulation_steps=GRAD_ACCUM,
        num_train_epochs=EPOCHS,
        learning_rate=LR,
        lr_scheduler_type="cosine",
        warmup_ratio=0.05,
        fp16=not torch.cuda.is_bf16_supported(),
        bf16=torch.cuda.is_bf16_supported(),
        logging_steps=10,
        eval_strategy="steps",
        eval_steps=50,
        save_strategy="steps",
        save_steps=100,
        save_total_limit=2,
        max_length=MAX_SEQ_LEN,
        dataset_text_field="text",
        report_to="wandb",
        seed=42,
    )

    trainer = SFTTrainer(
        model=model,
        processing_class=tokenizer,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        args=training_args,
    )

    print("\nStarting training...")
    trainer.train()

    # --- Save LoRA adapters ---
    print("\nSaving LoRA adapters...")
    model.save_pretrained(f"{OUTPUT_DIR}/lora")
    tokenizer.save_pretrained(f"{OUTPUT_DIR}/lora")

    # --- Merge and save full model ---
    print("Merging LoRA into base model...")
    merged = model.merge_and_unload()
    merged.save_pretrained(f"{OUTPUT_DIR}/merged")
    tokenizer.save_pretrained(f"{OUTPUT_DIR}/merged")

    wandb.finish()
    print(f"\nDone!")
    print(f"  LoRA adapters: {OUTPUT_DIR}/lora")
    print(f"  Merged model:  {OUTPUT_DIR}/merged")


if __name__ == "__main__":
    main()
