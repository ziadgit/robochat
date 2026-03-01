#!/bin/bash
# Run this on a fresh Lambda Labs A10/A100 instance.
# Installs everything and starts training.
#
# Usage:
#   # From your laptop, copy files to Lambda:
#   scp -r data/ train_qlora.py eval_qlora.py lambda_setup.sh ubuntu@<IP>:~/comedy-ft/
#
#   # SSH in and run:
#   ssh ubuntu@<IP>
#   cd ~/comedy-ft && bash lambda_setup.sh

set -e

echo "=== Installing dependencies ==="
pip install -q --upgrade pip
pip install -q "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
pip install -q trl datasets wandb

echo ""
echo "=== GPU info ==="
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader

echo ""
echo "=== Logging into W&B ==="
# Set these before running, or pass as env vars
if [ -z "$WANDB_API_KEY" ]; then
    echo "Set WANDB_API_KEY first: export WANDB_API_KEY='your-key'"
    echo "Or run: wandb login"
fi

echo ""
echo "=== Verifying data ==="
wc -l data/comedy_train_filtered.jsonl data/comedy_val_filtered.jsonl

echo ""
echo "=== Starting QLoRA training ==="
echo "Estimated time: ~15-20 min for 2 epochs on A10"
echo ""

DATA_DIR=data \
WANDB_PROJECT=mistral-comedy-ft \
EPOCHS=2 \
LR=2e-4 \
BATCH_SIZE=4 \
GRAD_ACCUM=4 \
python train_qlora.py

echo ""
echo "=== Training complete! ==="
echo "Model saved to output/final (LoRA adapters) and output/merged (full model)"
echo ""
echo "To push to HuggingFace Hub:"
echo "  HUB_REPO=your-username/comedy-narrator PUSH_TO_HUB=1 python train_qlora.py"
