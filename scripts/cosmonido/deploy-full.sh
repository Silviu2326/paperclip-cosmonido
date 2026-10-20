#!/usr/bin/env bash
# Full deploy: ship the committed HEAD to the VPS, rebuild the self-hosted
# image (production target, no remote provider pack) and recreate the
# container. Use this when server code, dependencies or the Dockerfile change;
# for UI-only changes deploy-ui.sh is much faster.
#
# Usage (from the repo root, Git Bash):  scripts/cosmonido/deploy-full.sh
set -euo pipefail

VPS_HOST="${VPS_HOST:-root@5.189.132.223}"
VPS_KEY="${VPS_KEY:-$HOME/.ssh/cosmonido_vps_ed25519}"
REMOTE_REPO="${REMOTE_REPO:-/root/paperclip}"
UI_DIR="${UI_DIR:-/root/paperclip-ui-dist}"
ENV_FILE="${ENV_FILE:-/root/paperclip-runtime.env}"
DATA_DIR="${DATA_DIR:-/root/paperclip/data/docker-paperclip}"

vps() { ssh -i "$VPS_KEY" -o BatchMode=yes "$VPS_HOST" "$@"; }

cd "$(git rev-parse --show-toplevel)"
branch=$(git branch --show-current)
local_head=$(git rev-parse HEAD)

echo "==> Shipping $branch ($local_head) to $VPS_HOST"
remote_head=$(vps "git -C '$REMOTE_REPO' rev-parse HEAD")
if [ "$remote_head" != "$local_head" ]; then
  git merge-base --is-ancestor "$remote_head" "$local_head" || {
    echo "Server HEAD $remote_head is not an ancestor of $local_head; refusing to rewrite server history." >&2
    exit 1
  }
  bundle=$(mktemp -t paperclip-deploy.XXXXXX.bundle)
  git bundle create "$bundle" "$remote_head..$branch"
  scp -i "$VPS_KEY" -o BatchMode=yes "$bundle" "$VPS_HOST:/root/paperclip-deploy.bundle"
  rm -f "$bundle"
  vps "set -e; cd '$REMOTE_REPO'
    git fetch -q /root/paperclip-deploy.bundle '$branch'
    git checkout -q -B '$branch' FETCH_HEAD
    rm -f /root/paperclip-deploy.bundle"
fi

echo "==> Building image on the VPS (this is the slow part)"
build_start=$(date +%s)
vps "set -eo pipefail; cd '$REMOTE_REPO'
  commit=\$(git rev-parse HEAD)
  docker image inspect docker-paperclip:latest >/dev/null 2>&1 && docker tag docker-paperclip:latest docker-paperclip:previous
  docker build --target production \
    --build-arg PAPERCLIP_SKIP_PROVIDER_PACK=1 \
    --build-arg PAPERCLIP_BUILD_COMMIT=\$commit \
    -t docker-paperclip:latest . 2>&1 | tail -n 5"
echo "    image built in $(( $(date +%s) - build_start ))s"

echo "==> Refreshing the mounted UI from the new image and recreating the container"
vps "set -eo pipefail
  commit=\$(git -C '$REMOTE_REPO' rev-parse HEAD)
  staging=\$(mktemp -d)
  docker run --rm --entrypoint tar docker-paperclip:latest -C /app/ui/dist -cf - . | tar -xf - -C \"\$staging\"
  mkdir -p '$UI_DIR'
  rsync -a \"\$staging/assets/\" '$UI_DIR/assets/'
  rsync -a --exclude assets \"\$staging/\" '$UI_DIR/'
  rm -rf \"\$staging\"
  docker rm -f docker-paperclip-1 >/dev/null 2>&1 || true
  docker run -d --name docker-paperclip-1 --network docker_default -p 3100:3100 \
    -v '$DATA_DIR':/paperclip \
    -v '$UI_DIR':/app/ui/dist:ro \
    --env-file '$ENV_FILE' -e PAPERCLIP_BUILD_COMMIT=\$commit \
    --restart unless-stopped docker-paperclip:latest >/dev/null
  for i in \$(seq 1 30); do
    curl -fsS -o /dev/null http://127.0.0.1:3100/api/health && break
    sleep 3
  done
  curl -fsS http://127.0.0.1:3100/api/health | grep -oE '\"commit\":\"[0-9a-f]+\"' || { echo 'Health check failed; docker logs docker-paperclip-1' >&2; exit 1; }
  docker image prune -f >/dev/null"

echo "==> Done. Roll back with: docker tag docker-paperclip:previous docker-paperclip:latest and rerun the container step."
