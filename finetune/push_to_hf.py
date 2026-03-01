"""Push therapy-only LoRA adapter to HuggingFace."""
import os
from pathlib import Path

from huggingface_hub import HfApi

HF_TOKEN = os.environ.get("HF_TOKEN", "")
REPO_ID = "hyan/destress-therapy-lora"
ADAPTER_DIR = Path.home() / "ft_therapy" / "output" / "final"


def main():
    if not ADAPTER_DIR.exists():
        raise FileNotFoundError(f"Adapter not found at {ADAPTER_DIR}")
    api = HfApi(token=HF_TOKEN)
    api.create_repo(repo_id=REPO_ID, exist_ok=True, private=False)
    api.upload_folder(folder_path=str(ADAPTER_DIR), repo_id=REPO_ID,
                      commit_message="Upload therapy-only LoRA adapter")
    print(f"Pushed to https://huggingface.co/{REPO_ID}")


if __name__ == "__main__":
    main()
