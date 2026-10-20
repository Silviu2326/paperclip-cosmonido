#!/usr/bin/env bash
# Fast path for UI-only changes: build the board locally and copy it into the
# directory the running container serves (/app/ui/dist is a bind mount of
# $UI_DIR on the VPS). No image rebuild and no container restart.
#
# Usage (from the repo root, Git Bash):  scripts/cosmonido/deploy-ui.sh
# Server code, dependencies or Dockerfile changed? Use deploy-full.sh instead.
set -euo pipefail

VPS_HOST="${VPS_HOST:-root@5.189.132.223}"
VPS_KEY="${VPS_KEY:-$HOME/.ssh/cosmonido_vps_ed25519}"
UI_DIR="${UI_DIR:-/root/paperclip-ui-dist}"

cd "$(git rev-parse --show-toplevel)"

echo "==> Building UI locally"
pnpm --filter @paperclipai/ui build

echo "==> Uploading ui/dist to $VPS_HOST:$UI_DIR"
# Hashed assets go in first and old ones stay, so tabs still on the previous
# bundle keep loading their chunks; index.html and sw.js switch last.
tar -C ui/dist -czf - . | ssh -i "$VPS_KEY" -o BatchMode=yes "$VPS_HOST" "
  set -e
  staging=\$(mktemp -d)
  tar -xzf - -C \"\$staging\"
  mkdir -p '$UI_DIR'
  rsync -a \"\$staging/assets/\" '$UI_DIR/assets/'
  rsync -a --exclude assets --exclude index.html --exclude sw.js \"\$staging/\" '$UI_DIR/'
  cp \"\$staging/sw.js\" '$UI_DIR/sw.js'
  cp \"\$staging/index.html\" '$UI_DIR/index.html'
  rm -rf \"\$staging\"
  # Drop chunks older than a week that no current tab can still need.
  find '$UI_DIR/assets' -type f -mtime +7 -delete
  curl -fsS -o /dev/null http://127.0.0.1:3100/ && echo 'UI live (HTTP 200)'
"

# Line-ending-only differences do not count as changes.
if ! git diff --quiet --ignore-cr-at-eol HEAD -- ui || [ -n "$(git ls-files --others --exclude-standard -- ui/src)" ]; then
  echo "Note: ui/ has uncommitted changes. Commit them so the next full deploy keeps them."
fi
