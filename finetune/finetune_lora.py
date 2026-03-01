"""LoRA fine-tune Mistral-7B on pure therapy data (no comedy).

Identical config to comedy+therapy run but different data and output paths.
"""
import json
import os
from pathlib import Path

import torch
import wandb
from datasets import Dataset
from peft import LoraConfig, TaskType, get_peft_model, prepare_model_for_kbit_training
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    DataCollatorForSeq2Seq,
    Trainer,
    TrainingArguments,
)

HF_TOKEN = os.environ.get("HF_TOKEN", "")
WANDB_KEY = os.environ.get("WANDB_KEY", "")

BASE_MODEL = "mistralai/Mistral-7B-Instruct-v0.3"
DATA_DIR = Path.home() / "ft_therapy" / "data"
OUTPUT_DIR = Path.home() / "ft_therapy" / "output"
MAX_SEQ_LENGTH = 2048


def load_jsonl(path):
    rows = []
    with open(path) as f:
        for line in f:
            rows.append(json.loads(line))
    return rows


def apply_chat_template(example, tokenizer):
    text = tokenizer.apply_chat_template(
        example["messages"], tokenize=False, add_generation_prompt=False
    )
    tokenized = tokenizer(text, truncation=True, max_length=MAX_SEQ_LENGTH, padding=False)
    tokenized["labels"] = tokenized["input_ids"].copy()
    return tokenized


def main():
    if WANDB_KEY:
        wandb.login(key=WANDB_KEY)
        os.environ["WANDB_PROJECT"] = "destress-ft"
    else:
        os.environ["WANDB_DISABLED"] = "true"

    print(f"Loading tokenizer for {BASE_MODEL} ...")
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, token=HF_TOKEN)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
        tokenizer.pad_token_id = tokenizer.eos_token_id

    train_raw = load_jsonl(DATA_DIR / "train.jsonl")
    val_raw = load_jsonl(DATA_DIR / "val.jsonl")
    train_ds = Dataset.from_list(train_raw).map(
        lambda ex: apply_chat_template(ex, tokenizer),
        remove_columns=["messages"], num_proc=4, desc="Tokenizing train")
    val_ds = Dataset.from_list(val_raw).map(
        lambda ex: apply_chat_template(ex, tokenizer),
        remove_columns=["messages"], num_proc=4, desc="Tokenizing val")
    print(f"Train: {len(train_ds)}, Val: {len(val_ds)}")

    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True, bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16, bnb_4bit_use_double_quant=True)

    print(f"Loading {BASE_MODEL} in 4-bit ...")
    model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL, quantization_config=bnb_config, device_map="auto",
        token=HF_TOKEN, torch_dtype=torch.bfloat16)
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(model)

    lora_config = LoraConfig(
        task_type=TaskType.CAUSAL_LM, r=16, lora_alpha=32, lora_dropout=0.05,
        target_modules=["q_proj", "v_proj", "k_proj", "o_proj"], bias="none")
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    training_args = TrainingArguments(
        output_dir=str(OUTPUT_DIR), num_train_epochs=1,
        per_device_train_batch_size=4, per_device_eval_batch_size=4,
        gradient_accumulation_steps=4, learning_rate=2e-4,
        lr_scheduler_type="cosine", warmup_ratio=0.05, weight_decay=0.01,
        bf16=True, logging_steps=10, eval_strategy="steps", eval_steps=100,
        save_strategy="steps", save_steps=100, save_total_limit=3,
        load_best_model_at_end=True, metric_for_best_model="eval_loss",
        greater_is_better=False,
        report_to="wandb" if WANDB_KEY else "none",
        run_name="destress-therapy-only-lora",
        gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False},
        optim="paged_adamw_8bit", dataloader_num_workers=2,
        remove_unused_columns=False)

    trainer = Trainer(
        model=model, args=training_args,
        train_dataset=train_ds, eval_dataset=val_ds,
        data_collator=DataCollatorForSeq2Seq(tokenizer=tokenizer, padding=True, pad_to_multiple_of=8))

    print("Starting therapy-only training ...")
    trainer.train()

    final_dir = OUTPUT_DIR / "final"
    trainer.save_model(str(final_dir))
    tokenizer.save_pretrained(str(final_dir))
    print(f"Adapter saved to {final_dir}")

    if WANDB_KEY:
        wandb.finish()


if __name__ == "__main__":
    main()
