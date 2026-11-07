#!/usr/bin/env bash
# Builds the image for <commit> on the VPS, backs up the data directory, swaps
# the container and verifies API + UI. Any failure after the swap restores the
# data backup, the previous UI entry files and the previous image.
#
# Usage (on the VPS, as root): activate.sh <full-commit-sha>
# The repository at $REPO_DIR must already be checked out at that commit.
# Prints DEPLOY_OK or DEPLOY_FAILED as its last line; the workflow waits for it.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

COMMIT="$1"
SHORT="${COMMIT:0:12}"
NEW_IMAGE="paperclip-cosmonido:$SHORT"
TS="$(date -u +%Y%m%d-%H%M%S)"

trap 'log "DEPLOY_FAILED"' ERR
take_lock

[ "$(git -C "$REPO_DIR" rev-parse HEAD)" = "$COMMIT" ] || { log "Repo is not at $COMMIT"; exit 1; }

log "Building $NEW_IMAGE"
build_log="$(mktemp)"
if ! docker build --target production \
  --build-arg PAPERCLIP_SKIP_PROVIDER_PACK=1 \
  --build-arg PAPERCLIP_BUILD_COMMIT="$COMMIT" \
  -t "$NEW_IMAGE" "$REPO_DIR" >"$build_log" 2>&1; then
  tail -n 30 "$build_log"
  log "Image build failed; production untouched"
  log "DEPLOY_FAILED"
  exit 1
fi
tail -n 3 "$build_log"
rm -f "$build_log"

PREV_IMAGE="$(docker inspect -f '{{.Image}}' "$CONTAINER")"
PREV_COMMIT="$(running_commit)"
docker tag "$PREV_IMAGE" paperclip-cosmonido:previous
log "Previous: ${PREV_COMMIT:0:12} ($PREV_IMAGE)"

staging="$(mktemp -d)"
ui_saved="$(mktemp -d)"
docker run --rm --entrypoint tar "$NEW_IMAGE" -C /app/ui/dist -cf - . | tar -xf - -C "$staging"
[ -f "$staging/index.html" ] || { log "New image has no UI build"; log "DEPLOY_FAILED"; exit 1; }
save_ui_entry "$ui_saved"

# From here on production is touched: a failure must roll back.
trap - ERR
backup="$BACKUP_DIR/data-$TS-$SHORT"
mkdir -p "$BACKUP_DIR"
log "Stopping $CONTAINER and backing up data to $backup"
docker stop "$CONTAINER" >/dev/null
if ! cp -a "$DATA_DIR" "$backup"; then
  log "Backup failed; restarting the previous container untouched"
  rm -rf "$backup"
  docker start "$CONTAINER" >/dev/null
  log "DEPLOY_FAILED"
  exit 1
fi

rollback() {
  log "Rolling back to ${PREV_COMMIT:0:12}"
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  mv "$DATA_DIR" "$DATA_DIR.failed-$TS"
  cp -a "$backup" "$DATA_DIR"
  restore_ui_entry "$ui_saved"
  run_container paperclip-cosmonido:previous "$PREV_COMMIT"
  if verify "$PREV_COMMIT" 240; then
    log "Rollback healthy. Failed data kept at $DATA_DIR.failed-$TS"
  else
    log "ROLLBACK ALSO FAILED: restore manually from $backup"
  fi
  log "DEPLOY_FAILED"
  exit 1
}

publish_ui "$staging" || rollback
run_container "$NEW_IMAGE" "$COMMIT" || rollback
log "Verifying $SHORT"
verify "$COMMIT" 300 || rollback

rm -rf "$staging" "$ui_saved"
# Keep the five newest data backups and drop old deploy images.
ls -1dt "$BACKUP_DIR"/data-* 2>/dev/null | tail -n +6 | xargs -r rm -rf
docker images --format '{{.Repository}}:{{.Tag}}' | grep '^paperclip-cosmonido:' \
  | grep -v -e ":previous$" -e ":$SHORT$" | xargs -r docker rmi >/dev/null 2>&1 || true
docker image prune -f >/dev/null
log "Live: $SHORT"
log "DEPLOY_OK"
