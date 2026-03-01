"""
Launch a Mistral fine-tuning job with W&B tracking.

Usage:
    export MISTRAL_API_KEY="your-key-here"
    export WANDB_API_KEY="your-key-here"  # or run `wandb login`

    python prepare_data.py       # prepare data (once)
    python finetune.py           # launch + track with wandb
    python finetune.py --status JOB_ID
    python finetune.py --list
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

import wandb
from mistralai import Mistral

DATA_DIR = Path("data")
BASE_MODEL = "open-mistral-nemo"  # nemo supports fine-tuning; alternatives: mistral-tiny-latest, magistral-small-latest
TRAINING_STEPS = 300
LEARNING_RATE = 1e-4
SUFFIX = "comedy-narrator"
WANDB_PROJECT = "mistral-comedy-ft"
POLL_INTERVAL = 30  # seconds between status checks


def get_client():
    api_key = os.environ.get("MISTRAL_API_KEY")
    if not api_key:
        print("ERROR: Set MISTRAL_API_KEY environment variable")
        sys.exit(1)
    return Mistral(api_key=api_key)


def upload_file(client, filepath):
    """Upload a JSONL file to Mistral."""
    print(f"Uploading {filepath}...")
    with open(filepath, "rb") as f:
        uploaded = client.files.upload(
            file={"file_name": filepath.name, "content": f},
            purpose="fine-tune",
        )
    print(f"  File ID: {uploaded.id}")
    return uploaded


def count_lines(filepath):
    with open(filepath) as f:
        return sum(1 for _ in f)


def sample_data_for_wandb(filepath, n=10):
    """Read a few examples to log as a W&B table."""
    rows = []
    with open(filepath) as f:
        for i, line in enumerate(f):
            if i >= n:
                break
            ex = json.loads(line)
            msgs = ex["messages"]
            rows.append({
                "user": msgs[1]["content"],
                "assistant": msgs[2]["content"][:200],
            })
    return rows


def poll_job(client, job_id, run):
    """Poll Mistral job status and log metrics to W&B."""
    print(f"\nPolling job {job_id} every {POLL_INTERVAL}s...")
    prev_status = None
    step = 0

    while True:
        job = client.fine_tuning.jobs.get(job_id=job_id)
        status = job.status

        if status != prev_status:
            print(f"  [{time.strftime('%H:%M:%S')}] Status: {status}")
            prev_status = status

        # Log whatever metrics Mistral exposes
        metrics = {}
        if hasattr(job, "trained_tokens") and job.trained_tokens:
            metrics["trained_tokens"] = job.trained_tokens
        if hasattr(job, "training_loss") and job.training_loss is not None:
            metrics["training_loss"] = job.training_loss
        if hasattr(job, "validation_loss") and job.validation_loss is not None:
            metrics["validation_loss"] = job.validation_loss

        # Log events/checkpoints if available
        if hasattr(job, "events") and job.events:
            for event in job.events:
                if hasattr(event, "data") and event.data:
                    for k, v in event.data.items() if isinstance(event.data, dict) else []:
                        if isinstance(v, (int, float)):
                            metrics[f"event_{k}"] = v

        if metrics:
            run.log(metrics, step=step)
            step += 1

        if status in ("SUCCESS", "FAILED", "CANCELLED"):
            break

        time.sleep(POLL_INTERVAL)

    return job


def launch_finetune(args):
    client = get_client()

    train_path = DATA_DIR / "comedy_train.jsonl"
    val_path = DATA_DIR / "comedy_val.jsonl"

    if not train_path.exists():
        print(f"ERROR: {train_path} not found. Run prepare_data.py first.")
        sys.exit(1)

    n_train = count_lines(train_path)
    n_val = count_lines(val_path)

    config = {
        "base_model": BASE_MODEL,
        "training_steps": TRAINING_STEPS,
        "learning_rate": LEARNING_RATE,
        "n_train": n_train,
        "n_val": n_val,
        "suffix": SUFFIX,
        "datasets": ["zachgitt/comedy-transcripts", "ysharma/short_jokes"],
    }

    # Init W&B run
    run = wandb.init(
        project=WANDB_PROJECT,
        config=config,
        name=f"{SUFFIX}-{BASE_MODEL}-{TRAINING_STEPS}steps",
        tags=["mistral", "comedy", "fine-tune"],
    )

    # Log training data samples as a table
    samples = sample_data_for_wandb(train_path, n=20)
    table = wandb.Table(columns=["user", "assistant"], data=[[s["user"], s["assistant"]] for s in samples])
    run.log({"training_samples": table})

    # Log the data files as artifacts
    artifact = wandb.Artifact("comedy-training-data", type="dataset")
    artifact.add_file(str(train_path))
    artifact.add_file(str(val_path))
    run.log_artifact(artifact)

    print(f"Training data: {n_train} examples")
    print(f"Validation data: {n_val} examples")
    print(f"Base model: {BASE_MODEL}")
    print(f"Training steps: {TRAINING_STEPS}")
    print(f"Learning rate: {LEARNING_RATE}")
    print(f"W&B run: {run.url}")
    print()

    # Upload files to Mistral
    train_file = upload_file(client, train_path)
    val_file = upload_file(client, val_path)

    # Create fine-tuning job
    print("\nCreating fine-tuning job...")
    job = client.fine_tuning.jobs.create(
        model=BASE_MODEL,
        training_files=[{"file_id": train_file.id, "weight": 1}],
        validation_files=[val_file.id],
        hyperparameters={
            "training_steps": TRAINING_STEPS,
            "learning_rate": LEARNING_RATE,
        },
        suffix=SUFFIX,
        auto_start=True,
    )

    run.config.update({"job_id": job.id})
    print(f"Job created: {job.id}")
    print(f"Status: {job.status}")

    # Save job info locally
    job_info = {
        "job_id": job.id,
        "wandb_run": run.url,
        **config,
        "train_file_id": train_file.id,
        "val_file_id": val_file.id,
    }
    info_path = DATA_DIR / "job_info.json"
    with open(info_path, "w") as f:
        json.dump(job_info, f, indent=2)

    if args.poll:
        final_job = poll_job(client, job.id, run)
        if final_job.status == "SUCCESS":
            ft_model = getattr(final_job, "fine_tuned_model", None)
            if ft_model:
                run.summary["fine_tuned_model"] = ft_model
                print(f"\nFine-tuned model: {ft_model}")
                print(f"Test with: python test_model.py --model {ft_model}")
        else:
            print(f"\nJob ended with status: {final_job.status}")
    else:
        print(f"\nMonitor with: python finetune.py --status {job.id}")
        print(f"Or poll:      python finetune.py --poll {job.id}")

    run.finish()


def check_status(args):
    client = get_client()
    job = client.fine_tuning.jobs.get(job_id=args.status)
    print(f"Job ID:     {job.id}")
    print(f"Status:     {job.status}")
    print(f"Model:      {job.model}")
    if hasattr(job, "fine_tuned_model") and job.fine_tuned_model:
        print(f"Fine-tuned: {job.fine_tuned_model}")
    if hasattr(job, "trained_tokens") and job.trained_tokens:
        print(f"Tokens:     {job.trained_tokens:,}")


def poll_existing(args):
    """Poll an already-running job and log to W&B."""
    client = get_client()
    job = client.fine_tuning.jobs.get(job_id=args.poll)

    run = wandb.init(
        project=WANDB_PROJECT,
        config={"job_id": args.poll, "base_model": job.model},
        name=f"poll-{args.poll[:8]}",
        tags=["mistral", "comedy", "poll"],
    )

    final_job = poll_job(client, args.poll, run)
    if final_job.status == "SUCCESS":
        ft_model = getattr(final_job, "fine_tuned_model", None)
        if ft_model:
            run.summary["fine_tuned_model"] = ft_model
            print(f"\nFine-tuned model: {ft_model}")

    run.finish()


def list_jobs(args):
    client = get_client()
    jobs = client.fine_tuning.jobs.list()
    if not jobs.data:
        print("No fine-tuning jobs found.")
        return
    print(f"{'Job ID':<40} {'Status':<15} {'Model':<25}")
    print("-" * 80)
    for job in jobs.data:
        ft_model = getattr(job, "fine_tuned_model", "") or ""
        print(f"{job.id:<40} {job.status:<15} {ft_model or job.model:<25}")


def main():
    parser = argparse.ArgumentParser(description="Mistral comedy fine-tuning with W&B")
    parser.add_argument("--status", type=str, help="Check status of a job ID")
    parser.add_argument("--poll", type=str, nargs="?", const="__launch__",
                        help="Poll job until done (no arg = poll after launch, with arg = poll existing job)")
    parser.add_argument("--list", action="store_true", help="List all fine-tuning jobs")
    args = parser.parse_args()

    if args.status:
        check_status(args)
    elif args.list:
        list_jobs(args)
    elif args.poll and args.poll != "__launch__":
        poll_existing(args)
    else:
        if args.poll == "__launch__":
            args.poll = True
        else:
            args.poll = False
        launch_finetune(args)


if __name__ == "__main__":
    main()
