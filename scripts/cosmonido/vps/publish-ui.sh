#!/usr/bin/env bash
# Publishes a prebuilt board UI (a .tar.gz of ui/dist) without touching the
# container. If the served UI stops answering, the previous index.html and
# sw.js come back; the old hashed assets were never removed.
#
# Usage (on the VPS, as root): publish-ui.sh <ui-dist.tar.gz>
# Prints DEPLOY_OK or DEPLOY_FAILED as its last line.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

trap 'log "DEPLOY_FAILED"' ERR
take_lock

staging="$(mktemp -d)"
ui_saved="$(mktemp -d)"
tar -xzf "$1" -C "$staging"
[ -f "$staging/index.html" ] || { log "Archive has no index.html"; log "DEPLOY_FAILED"; exit 1; }
entry="$(grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' "$staging/index.html" | head -n 1)"

save_ui_entry "$ui_saved"
publish_ui "$staging"

ok=0
for _ in $(seq 1 10); do
  if curl -fsS -m 5 "$BASE_URL/" 2>/dev/null | grep -q "$entry"; then ok=1; break; fi
  sleep 2
done
if [ "$ok" != 1 ]; then
  log "UI not served after publish; restoring previous entry files"
  restore_ui_entry "$ui_saved"
  log "DEPLOY_FAILED"
  exit 1
fi

rm -rf "$staging" "$ui_saved" "$1"
log "UI live: $entry"
log "DEPLOY_OK"
