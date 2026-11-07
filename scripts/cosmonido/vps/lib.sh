# Shared helpers for the Cosmonido VPS deploy scripts. Sourced, not executed.
# Runs on the VPS as root. The GitHub workflow copies this directory to the VPS
# before every deploy, so the repository is the source of truth.

REPO_DIR="${REPO_DIR:-/root/paperclip}"
UI_DIR="${UI_DIR:-/root/paperclip-ui-dist}"
DATA_DIR="${DATA_DIR:-/root/paperclip/data/docker-paperclip}"
ENV_FILE="${ENV_FILE:-/root/paperclip-runtime.env}"
CONTAINER="${CONTAINER:-docker-paperclip-1}"
NETWORK="${NETWORK:-docker_default}"
BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
# The release tooling under /root/paperclip-releases uses this lock too, so the
# two never touch the container at the same time.
LOCK_FILE="${LOCK_FILE:-/root/paperclip-releases/deploy.lock}"
BASE_URL="http://127.0.0.1:3100"

log() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*"; }

take_lock() {
  mkdir -p "$(dirname "$LOCK_FILE")"
  exec 9>"$LOCK_FILE"
  flock -n 9 || { log "Another deploy holds $LOCK_FILE"; exit 1; }
}

# The image also declares PAPERCLIP_BUILD_COMMIT (empty); the value passed with
# `docker run -e` comes last and is the one that counts.
running_commit() {
  docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$CONTAINER" 2>/dev/null \
    | sed -n 's/^PAPERCLIP_BUILD_COMMIT=//p' | grep . | tail -n 1
}

run_container() { # image commit
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker run -d --name "$CONTAINER" --network "$NETWORK" -p 3100:3100 \
    -v "$DATA_DIR":/paperclip \
    -v "$UI_DIR":/app/ui/dist:ro \
    --env-file "$ENV_FILE" -e PAPERCLIP_BUILD_COMMIT="$2" \
    --restart unless-stopped "$1" >/dev/null
}

# The server runs as `node`: an unreadable UI directory makes it start in
# API-only mode and answer "Cannot GET /".
# Chained with && because callers use `publish_ui ... || rollback`, where bash
# ignores `set -e` inside the function.
publish_ui() { # staging-dir
  # Hashed assets first and old ones kept, so open tabs still load their chunks;
  # index.html and sw.js switch last.
  mkdir -p "$UI_DIR/assets" \
    && rsync -a --no-perms --chmod=Da+rx,Fa+r "$1/assets/" "$UI_DIR/assets/" \
    && rsync -a --no-perms --chmod=Da+rx,Fa+r --exclude assets --exclude index.html --exclude sw.js "$1/" "$UI_DIR/" \
    && { [ ! -f "$1/sw.js" ] || cp "$1/sw.js" "$UI_DIR/sw.js"; } \
    && cp "$1/index.html" "$UI_DIR/index.html" \
    && chmod -R a+rX "$UI_DIR" \
    || return 1
  find "$UI_DIR/assets" -type f -mtime +7 -delete || true
}

save_ui_entry() { # dest-dir
  mkdir -p "$1"
  cp -a "$UI_DIR/index.html" "$1/" 2>/dev/null || true
  cp -a "$UI_DIR/sw.js" "$1/" 2>/dev/null || true
}

restore_ui_entry() { # saved-dir
  if [ -f "$1/index.html" ]; then cp "$1/index.html" "$UI_DIR/index.html"; fi
  if [ -f "$1/sw.js" ]; then cp "$1/sw.js" "$UI_DIR/sw.js"; fi
  chmod -R a+rX "$UI_DIR"
}

# Healthy means: the API answers with the expected commit, the board UI is
# served (not API-only mode) and the container is not restart-looping.
verify() { # expected-commit [timeout-seconds]
  local expected="$1" deadline=$(( $(date +%s) + ${2:-240} )) health
  while [ "$(date +%s)" -lt "$deadline" ]; do
    health=$(curl -fsS -m 5 "$BASE_URL/api/health" 2>/dev/null || true)
    if printf '%s' "$health" | grep -q "\"commit\":\"$expected" \
      && printf '%s' "$health" | grep -q '"status":"ok"' \
      && [ "$(curl -sS -m 5 -o /dev/null -w '%{http_code}' "$BASE_URL/" 2>/dev/null)" = "200" ] \
      && [ "$(docker inspect -f '{{.RestartCount}}' "$CONTAINER")" = "0" ] \
      && ! docker logs "$CONTAINER" 2>&1 | grep -q 'running in API-only mode'; then
      return 0
    fi
    sleep 5
  done
  log "Verification failed. Last container log lines:"
  docker logs --tail 20 "$CONTAINER" 2>&1 | cut -c1-300
  return 1
}
