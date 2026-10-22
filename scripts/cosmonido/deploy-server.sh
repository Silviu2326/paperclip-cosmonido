#!/usr/bin/env bash
# Server + UI deploy without rebuilding the image on the VPS.
#
# Builds the committed HEAD in local Docker Desktop (the Dockerfile's `build`
# stage, ~2-3 min warm), compares every file of the built /app against the
# running container, and ships only the files that changed. Then restarts the
# container. Dependency changes (package.json, pnpm-lock.yaml, patches) still
# need deploy-full.sh, because node_modules comes from the VPS image.
#
# Requirements: Docker Desktop running; changes committed (it builds HEAD).
# Usage (from the repo root, Git Bash):  scripts/cosmonido/deploy-server.sh
set -euo pipefail
export LC_ALL=C  # one byte order for sort/comm on both manifests

VPS_HOST="${VPS_HOST:-root@5.189.132.223}"
VPS_KEY="${VPS_KEY:-$HOME/.ssh/cosmonido_vps_ed25519}"
REMOTE_REPO="${REMOTE_REPO:-/root/paperclip}"
UI_DIR="${UI_DIR:-/root/paperclip-ui-dist}"
CONTAINER="${CONTAINER:-docker-paperclip-1}"
LOCAL_IMAGE="paperclip-build:local"

vps() { ssh -i "$VPS_KEY" -o BatchMode=yes "$VPS_HOST" "$@"; }

cd "$(git rev-parse --show-toplevel)"
branch=$(git branch --show-current)
head=$(git rev-parse HEAD)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Everything under /app that the image owns except dependencies and caches.
# ui/dist is served from a bind mount and synced separately below.
manifest_cmd='cd /app && find . \( -name node_modules -o -name .git -o -path ./packages/paperclip-runner/runner/target -o -path ./ui/dist \) -prune -o -type f -print0 | sort -z | xargs -0 sha1sum'

echo "==> Building $branch ($head) in local Docker"
start=$(date +%s)
# A directory context (not a tar on stdin) so Docker applies .dockerignore and
# the local image holds exactly what the VPS image holds. git archive gives the
# committed bytes, free of the Windows checkout's line endings.
mkdir -p "$work/ctx"
git archive --format=tar HEAD | tar -xf - -C "$work/ctx"
docker build --quiet --target build --build-arg PAPERCLIP_BUILD_COMMIT="$head" -t "$LOCAL_IMAGE" "$work/ctx" >/dev/null
echo "    built in $(( $(date +%s) - start ))s"

echo "==> Comparing with the running container"
docker run --rm --entrypoint sh "$LOCAL_IMAGE" -c "$manifest_cmd" > "$work/local.sha"
vps "docker exec $CONTAINER sh -c \"$manifest_cmd\"" > "$work/remote.sha"

# Dependency manifests decide what node_modules holds; that lives in the image.
dep_changes=$(diff <(grep -E '(/package\.json|/pnpm-lock\.yaml|/pnpm-workspace\.yaml|/\.npmrc|^\S+  \./patches/)' "$work/local.sha") \
                   <(grep -E '(/package\.json|/pnpm-lock\.yaml|/pnpm-workspace\.yaml|/\.npmrc|^\S+  \./patches/)' "$work/remote.sha") || true)
if [ -n "$dep_changes" ]; then
  echo "Dependencies changed; use scripts/cosmonido/deploy-full.sh instead:" >&2
  echo "$dep_changes" | head -n 10 >&2
  exit 1
fi

awk '{ $1=""; sub(/^ +/, ""); print }' "$work/local.sha" | sort > "$work/local.files"
awk '{ $1=""; sub(/^ +/, ""); print }' "$work/remote.sha" | sort > "$work/remote.files"
comm -23 <(sort "$work/local.sha") <(sort "$work/remote.sha") | awk '{ $1=""; sub(/^ +/, ""); print }' > "$work/changed.files"
# Only remove files the build owns. Anything else in /app on the VPS (an
# untracked docker/.env in the server checkout, for one) is left alone.
comm -13 "$work/local.files" "$work/remote.files" |
  grep -E '^\./(server|ui|cli|packages)/' | grep -vE '(^|/)\.env' > "$work/deleted.files" || true
echo "    $(wc -l < "$work/changed.files") changed or new, $(wc -l < "$work/deleted.files") deleted"
if [ -n "${DRY_RUN:-}" ]; then
  echo "--- changed (first 40)"; head -n 40 "$work/changed.files"
  echo "--- deleted (first 40)"; head -n 40 "$work/deleted.files"
  exit 0
fi

echo "==> Keeping the VPS repo on the same commit (needed by deploy-full.sh)"
remote_head=$(vps "git -C '$REMOTE_REPO' rev-parse HEAD")
if [ "$remote_head" != "$head" ]; then
  git merge-base --is-ancestor "$remote_head" "$head" || {
    echo "Server repo HEAD $remote_head is not an ancestor of $head; refusing to rewrite it." >&2
    exit 1
  }
  git bundle create "$work/deploy.bundle" "$remote_head..$branch" 2>/dev/null
  scp -q -i "$VPS_KEY" -o BatchMode=yes "$work/deploy.bundle" "$VPS_HOST:/root/paperclip-deploy.bundle"
  vps "set -e; cd '$REMOTE_REPO'; git fetch -q /root/paperclip-deploy.bundle '$branch'; git checkout -q -B '$branch' FETCH_HEAD; rm -f /root/paperclip-deploy.bundle"
fi

if [ -s "$work/changed.files" ]; then
  echo "==> Uploading changed files"
  # Owned by node (uid 1000), like the image's own COPY --chown=node:node.
  docker run --rm -i --entrypoint tar "$LOCAL_IMAGE" -C /app --owner=1000 --group=1000 --null -T - -czf - \
    < <(tr '\n' '\0' < "$work/changed.files") > "$work/changed.tgz"
  echo "    $(( $(wc -c < "$work/changed.tgz") / 1024 )) KiB compressed"
  vps "gunzip | docker cp -a - $CONTAINER:/app" < "$work/changed.tgz"
fi
if [ -s "$work/deleted.files" ]; then
  vps "docker exec -i $CONTAINER sh -c 'cd /app && xargs -d \"\\n\" rm -f --'" < "$work/deleted.files"
fi

echo "==> Syncing the UI"
docker run --rm --entrypoint tar "$LOCAL_IMAGE" -C /app/ui/dist -czf - . | vps "
  set -e
  staging=\$(mktemp -d)
  tar -xzf - -C \"\$staging\"
  rsync -a \"\$staging/assets/\" '$UI_DIR/assets/'
  rsync -a --exclude assets --exclude index.html --exclude sw.js \"\$staging/\" '$UI_DIR/'
  cp \"\$staging/sw.js\" \"\$staging/index.html\" '$UI_DIR/'
  rm -rf \"\$staging\"
  find '$UI_DIR/assets' -type f -mtime +7 -delete"

echo "==> Restarting the container"
vps "set -e
  docker restart $CONTAINER >/dev/null
  for i in \$(seq 1 40); do curl -fsS -o /dev/null http://127.0.0.1:3100/api/health && break; sleep 2; done
  curl -fsS http://127.0.0.1:3100/api/health >/dev/null && echo '    healthy (HTTP 200)'
  docker exec $CONTAINER cat /app/server/dist/build-info.json 2>/dev/null | grep -oE '\"commit\": *\"[0-9a-f]+\"' || true"
echo "==> Done. Files copied this way live in the container until the next deploy-full.sh, which rebuilds the image from the same commit."
