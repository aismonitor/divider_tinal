#!/usr/bin/env bash
set -euo pipefail

# Keep Divider up on a small VDS after OOM / accidental stops.
# Intended for cron (see: ./run-vds.sh install-watch).
# Does NOT rebuild images — only starts the stack if the health check fails.

PORT="${PORT:-8765}"
export PORT

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

LOG_DIR="${DIVIDER_WATCH_LOG_DIR:-$ROOT/logs}"
LOG_FILE="${DIVIDER_WATCH_LOG:-$LOG_DIR/watch-vds.log}"
MAX_LOG_BYTES="${DIVIDER_WATCH_LOG_MAX:-1048576}"

mkdir -p "$LOG_DIR"

log() {
  local line
  line="$(date -u +'%Y-%m-%dT%H:%M:%SZ') $*"
  printf '%s\n' "$line" >>"$LOG_FILE"
}

rotate_log() {
  if [[ -f "$LOG_FILE" ]]; then
    local size
    size="$(wc -c <"$LOG_FILE" | tr -d ' ')"
    if [[ "${size:-0}" -gt "$MAX_LOG_BYTES" ]]; then
      mv -f "$LOG_FILE" "${LOG_FILE}.1"
    fi
  fi
}

docker_cmd() {
  if docker info >/dev/null 2>&1; then
    docker "$@"
  elif command -v sudo >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then
    sudo docker "$@"
  else
    return 127
  fi
}

health_ok() {
  # Prefer container health, then HTTP on the published port.
  if docker_cmd compose ps --status running --services 2>/dev/null | grep -qx 'divider'; then
    if curl -fsS --max-time 5 "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
      return 0
    fi
    # wget fallback when curl is missing
    if command -v wget >/dev/null 2>&1 && wget -q -O /dev/null --timeout=5 "http://127.0.0.1:${PORT}/"; then
      return 0
    fi
  fi
  return 1
}

recover() {
  log "unhealthy — starting stack (no rebuild)"
  # Soft start: bring containers back without a heavy rebuild that can OOM a tiny VDS.
  if ! docker_cmd compose up -d --remove-orphans; then
    log "compose up failed"
    return 1
  fi
  sleep 2
  if health_ok; then
    log "recovered"
    return 0
  fi
  log "still unhealthy after compose up"
  return 1
}

rotate_log

if ! docker_cmd info >/dev/null 2>&1; then
  log "docker unavailable — skip"
  exit 0
fi

if health_ok; then
  exit 0
fi

recover
exit $?
