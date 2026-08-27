#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8765}"
export PORT
export DEBIAN_FRONTEND="${DEBIAN_FRONTEND:-noninteractive}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

CRON_TAG="# divider-vds-watch"
CRON_SCHEDULE="${DIVIDER_WATCH_CRON:-*/5 * * * *}"

usage() {
  cat <<EOF
Usage: $0 [start|stop|restart|status|logs|update|watch|install-watch|uninstall-watch]

Run Divider tools on Ubuntu 24.04 VDS with Docker Compose.

Commands:
  start            Build and start (default)
  stop             Stop containers
  restart          Rebuild and restart
  status           Show container status
  logs             Follow nginx logs
  update           git pull --ff-only + rebuild (same as ./update-vds.sh)
  watch            One-shot health check; soft-start if down (no rebuild)
  install-watch    Install cron watchdog + optional swapfile (helps after OOM)
  uninstall-watch  Remove cron watchdog

Environment:
  PORT                 Host port (default: 8765)
  BRANCH               Branch for update (default: main)
  DIVIDER_MEM_LIMIT    Container memory cap (default: 96m)
  DIVIDER_WATCH_CRON   Cron schedule (default: every 5 minutes)
  DIVIDER_SWAP_MB      Swapfile size to create if none exists (default: 1024; 0=skip)

Examples:
  $0
  PORT=8080 $0 start
  $0 install-watch
  $0 watch
  $0 update
EOF
}

run_as_root() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

docker_cmd() {
  if docker info >/dev/null 2>&1; then
    docker "$@"
  else
    run_as_root docker "$@"
  fi
}

install_docker_ubuntu_2404() {
  echo "==> Installing Docker Engine and Compose plugin (Ubuntu 24.04)..."

  run_as_root apt-get update -qq
  run_as_root apt-get install -y ca-certificates curl gnupg

  run_as_root install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | run_as_root tee /etc/apt/keyrings/docker.asc >/dev/null
    run_as_root chmod a+r /etc/apt/keyrings/docker.asc
  fi

  local arch codename
  arch="$(dpkg --print-architecture)"
  # shellcheck source=/dev/null
  codename="$(. /etc/os-release && echo "${VERSION_CODENAME}")"

  echo "deb [arch=${arch} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${codename} stable" \
    | run_as_root tee /etc/apt/sources.list.d/docker.list >/dev/null

  run_as_root apt-get update -qq
  run_as_root apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  run_as_root systemctl enable --now docker
}

ensure_docker() {
  if docker_cmd compose version >/dev/null 2>&1; then
    return 0
  fi

  if [[ -f /etc/os-release ]] && grep -Eq '^(ID=ubuntu|ID_LIKE=.*ubuntu)' /etc/os-release && grep -q 'VERSION_ID="24.04"' /etc/os-release; then
    install_docker_ubuntu_2404
    return 0
  fi

  echo "Docker Compose is not available. Install Docker on this host or run on Ubuntu 24.04." >&2
  exit 1
}

ensure_compose_files() {
  if [[ ! -f Dockerfile ]] || [[ ! -f docker-compose.yml ]]; then
    echo "Missing Dockerfile or docker-compose.yml in ${ROOT}" >&2
    exit 1
  fi
  local required=(index.html divider.html editor.html home.js divider.js editor.js styles.css nginx.conf)
  local f
  for f in "${required[@]}"; do
    if [[ ! -e "$f" ]]; then
      echo "Missing required app file: ${f}" >&2
      exit 1
    fi
  done
  if [[ ! -f vendor/jszip.min.js ]]; then
    echo "Missing vendor/jszip.min.js (needed by Divider)" >&2
    exit 1
  fi
}

server_ip() {
  hostname -I 2>/dev/null | awk '{print $1}'
}

print_access() {
  local ip
  ip="$(server_ip)"
  echo
  echo "Divider tools are running."
  if [[ -n "$ip" ]]; then
    echo "  http://${ip}:${PORT}/"
  fi
  echo "  http://127.0.0.1:${PORT}/"
  echo
  echo "Commands: $0 status | logs | stop | restart | update | install-watch"
}

start_stack() {
  ensure_docker
  ensure_compose_files
  docker_cmd compose up -d --build --force-recreate --remove-orphans
  print_access
}

ensure_swapfile() {
  local mb="${DIVIDER_SWAP_MB:-1024}"
  if [[ "$mb" == "0" ]]; then
    echo "==> Skipping swap setup (DIVIDER_SWAP_MB=0)"
    return 0
  fi
  if swapon --show 2>/dev/null | awk 'NR>1 {found=1} END {exit !found}'; then
    echo "==> Swap already present"
    swapon --show || true
    return 0
  fi
  if [[ -f /swapfile ]]; then
    echo "==> Enabling existing /swapfile"
    run_as_root chmod 600 /swapfile
    run_as_root swapon /swapfile || true
    return 0
  fi

  echo "==> Creating ${mb}M swapfile (helps tiny VDS survive memory spikes)..."
  run_as_root fallocate -l "${mb}M" /swapfile || run_as_root dd if=/dev/zero of=/swapfile bs=1M count="$mb" status=none
  run_as_root chmod 600 /swapfile
  run_as_root mkswap /swapfile
  run_as_root swapon /swapfile
  if ! grep -qE '^/swapfile\s' /etc/fstab 2>/dev/null; then
    echo '/swapfile none swap sw 0 0' | run_as_root tee -a /etc/fstab >/dev/null
  fi
  echo "==> Swap ready"
  swapon --show || true
}

cron_line() {
  # Absolute paths; keep PORT from install-time env. Tag must stay on the same line.
  printf '%s cd %q && PORT=%q %q >>%q 2>&1 %s\n' \
    "$CRON_SCHEDULE" \
    "$ROOT" \
    "$PORT" \
    "$ROOT/watch-vds.sh" \
    "$ROOT/logs/watch-vds.cron.log" \
    "$CRON_TAG"
}

install_watch() {
  ensure_compose_files
  chmod +x "$ROOT/watch-vds.sh" "$ROOT/run-vds.sh"
  mkdir -p "$ROOT/logs"
  ensure_swapfile

  local tmp
  tmp="$(mktemp)"
  crontab -l 2>/dev/null | grep -vF "$CRON_TAG" >"$tmp" || true
  cron_line >>"$tmp"
  crontab "$tmp"
  rm -f "$tmp"

  echo "==> Installed cron watchdog:"
  crontab -l | grep -F "$CRON_TAG" || true
  echo
  echo "Runs every 5 minutes (override with DIVIDER_WATCH_CRON)."
  echo "One-shot check: $0 watch"
  echo "Logs: $ROOT/logs/watch-vds.log"
}

uninstall_watch() {
  local tmp
  tmp="$(mktemp)"
  if crontab -l 2>/dev/null | grep -vF "$CRON_TAG" >"$tmp"; then
    if [[ -s "$tmp" ]]; then
      crontab "$tmp"
    else
      crontab -r 2>/dev/null || true
    fi
  fi
  rm -f "$tmp"
  echo "==> Removed cron watchdog"
}

cmd="${1:-start}"

case "$cmd" in
  start)
    start_stack
    ;;
  stop)
    ensure_docker
    docker_cmd compose down
    ;;
  restart)
    ensure_docker
    ensure_compose_files
    docker_cmd compose down
    docker_cmd compose up -d --build --force-recreate --remove-orphans
    docker_cmd image prune -f >/dev/null 2>&1 || true
    print_access
    ;;
  status)
    ensure_docker
    docker_cmd compose ps
    ;;
  logs)
    ensure_docker
    docker_cmd compose logs -f --tail=100
    ;;
  update)
    exec "$ROOT/update-vds.sh"
    ;;
  watch)
    ensure_compose_files
    chmod +x "$ROOT/watch-vds.sh"
    exec "$ROOT/watch-vds.sh"
    ;;
  install-watch)
    install_watch
    ;;
  uninstall-watch)
    uninstall_watch
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    echo "Unknown command: $cmd" >&2
    usage >&2
    exit 1
    ;;
esac
