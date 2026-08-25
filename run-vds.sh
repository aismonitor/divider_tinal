#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8765}"
export PORT
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

usage() {
  cat <<EOF
Usage: $0 [start|stop|restart|status|logs]

Run Divider on Ubuntu 24.04 VDS with Docker Compose.

Environment:
  PORT   Host port (default: 8765)

Examples:
  $0
  PORT=8080 $0 start
  $0 logs
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

server_ip() {
  hostname -I 2>/dev/null | awk '{print $1}'
}

print_access() {
  local ip
  ip="$(server_ip)"
  echo
  echo "Divider is running."
  if [[ -n "$ip" ]]; then
    echo "  http://${ip}:${PORT}/"
  fi
  echo "  http://127.0.0.1:${PORT}/"
  echo
  echo "Commands: $0 status | logs | stop | restart"
}

cmd="${1:-start}"

case "$cmd" in
  start)
    ensure_docker
    docker_cmd compose up -d --build
    print_access
    ;;
  stop)
    ensure_docker
    docker_cmd compose down
    ;;
  restart)
    ensure_docker
    docker_cmd compose down
    docker_cmd compose up -d --build
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
  -h|--help|help)
    usage
    ;;
  *)
    echo "Unknown command: $cmd" >&2
    usage >&2
    exit 1
    ;;
esac
