#!/usr/bin/env bash
set -euo pipefail

# Push GeoPulse Studio as a public Hugging Face Docker Space
# Usage: HF_USERNAME=sylviacccyu SPACE_NAME=geopulse-studio bash deploy/push-hf.sh

HF_USERNAME="${HF_USERNAME:-sylviacccyu}"
SPACE_NAME="${SPACE_NAME:-geopulse-studio}"
HF_REMOTE="https://huggingface.co/spaces/${HF_USERNAME}/${SPACE_NAME}"

echo "Target Hugging Face Docker Space: ${HF_REMOTE}"
if ! git remote get-url hf >/dev/null 2>&1; then
  git remote add hf "${HF_REMOTE}"
else
  git remote set-url hf "${HF_REMOTE}"
fi

git push hf main --force-with-lease
echo "[OK] Pushed to ${HF_REMOTE}"
