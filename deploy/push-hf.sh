#!/usr/bin/env bash
set -euo pipefail

# Publish only the static showcase with the official huggingface_hub library.
# Usage: HF_USERNAME=sylviacccyu SPACE_NAME=geopulse-studio bash deploy/push-hf.sh
# Offline validation: bash deploy/push-hf.sh --check
# Use HF_PYTHON=/path/to/venv/bin/python if huggingface_hub is in a virtualenv.
# Authentication is read privately from ~/.cache/huggingface/token.

DEPLOY_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
export HF_STATIC_DIR="${DEPLOY_DIR}/hf-static"
export HF_USERNAME="${HF_USERNAME:-sylviacccyu}"
export SPACE_NAME="${SPACE_NAME:-geopulse-studio}"

"${HF_PYTHON:-python3}" - "$@" <<'PY'
import os
from pathlib import Path
import re
import sys

folder = Path(os.environ["HF_STATIC_DIR"])
username = os.environ["HF_USERNAME"]
space_name = os.environ["SPACE_NAME"]
if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", username) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", space_name):
    sys.exit("Invalid HF_USERNAME or SPACE_NAME.")
allowed = ["README.md", "index.html"]
for name in allowed:
    if not (folder / name).is_file():
        sys.exit(f"Missing static showcase file: {name}")
readme = (folder / "README.md").read_text(encoding="utf-8")
if not readme.startswith("---\n") or "\nsdk: static\n" not in readme or "\napp_file: index.html\n" not in readme:
    sys.exit("README.md must declare sdk: static and app_file: index.html.")
if sys.argv[1:] == ["--check"]:
    print("Static showcase validated: README.md, index.html. No network request made.")
    sys.exit(0)
if sys.argv[1:]:
    sys.exit("Usage: bash deploy/push-hf.sh [--check]")
try:
    from huggingface_hub import HfApi
except ImportError:
    sys.exit("Install the official huggingface_hub package in your Python environment, or set HF_PYTHON to a virtualenv containing it.")

token_path = Path.home() / ".cache" / "huggingface" / "token"
try:
    token = token_path.read_text(encoding="utf-8").strip()
except OSError:
    sys.exit("Hugging Face token unavailable at ~/.cache/huggingface/token. Sign in with the official HF CLI first.")
if not token:
    sys.exit("The local Hugging Face token file is empty.")

api = HfApi(token=token)
repo_id = f"{username}/{space_name}"
try:
    identity = api.whoami()
    if identity.get("name") != username:
        sys.exit("The local token belongs to a different Hugging Face account. Select the intended account before publishing.")
    api.create_repo(repo_id=repo_id, repo_type="space", space_sdk="static", private=False, exist_ok=True)
    api.upload_folder(
        repo_id=repo_id,
        repo_type="space",
        folder_path=str(folder),
        path_in_repo="",
        allow_patterns=allowed,
        commit_message="Publish GeoPulse Studio 5.1 static showcase",
    )
except Exception as exc:
    # Do not echo exception bodies, request headers, or credential values.
    sys.exit(f"Hugging Face upload failed ({type(exc).__name__}). Check account access and connectivity using the official HF tools.")
print(f"Static showcase uploaded: https://huggingface.co/spaces/{repo_id}")
print("Uploaded README.md and index.html only; repository history was not rewritten.")
PY
