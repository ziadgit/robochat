#!/bin/bash
set -e
cd "$(dirname "$0")"

source .env

echo "=== Step 1: Prepare data ==="
python prepare_data.py

echo ""
echo "=== Step 2: Launch fine-tuning + poll until done ==="
python finetune.py --poll

# Extract model ID from job info
MODEL_ID=$(python -c "import json; print(json.load(open('data/job_info.json'))['job_id'])" 2>/dev/null || echo "")

echo ""
echo "=== Step 3: Text eval (LLM judge) ==="
echo "Run: python test_model.py --model <MODEL_ID> --compare"

echo ""
echo "=== Step 4: Voice pipeline eval ==="
echo "Run: python eval_voice.py --model <MODEL_ID> --compare"

echo ""
echo "Check data/job_info.json for the fine-tuned model ID"
echo "All results logged to W&B project: mistral-comedy-ft"
