#!/usr/bin/env bash
set -euo pipefail

# Pull the latest app code on a VDS and rebuild the Docker stack.
# Typical usage (from the cloned repo on the server):
#   ./update-vds.sh
#   BRANCH=main PORT=8765 ./update-vds.sh

BRANCH="${BRANCH:-main}"
REMOTE="${REMOTE:-origin}"
PORT="${PORT:-8765}"
export PORT

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [[ ! -d .git ]]; then
  echo "Not a git repository: ${ROOT}" >&2
  echo "Clone the repo on the VDS first, then run this script from the project root." >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Invalid git work tree: ${ROOT}" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree has local changes. Commit, stash, or discard them before updating." >&2
  git status -sb >&2
  exit 1
fi

echo "==> Fetching ${REMOTE}..."
git fetch "$REMOTE"

if ! git show-ref --verify --quiet "refs/remotes/${REMOTE}/${BRANCH}"; then
  echo "Remote branch ${REMOTE}/${BRANCH} not found after fetch." >&2
  exit 1
fi

current="$(git branch --show-current || true)"
if [[ "$current" != "$BRANCH" ]]; then
  echo "==> Checking out ${BRANCH} (was: ${current:-detached})..."
  git checkout "$BRANCH"
fi

echo "==> Fast-forwarding to ${REMOTE}/${BRANCH}..."
git pull --ff-only "$REMOTE" "$BRANCH"

echo "==> Rebuilding and restarting containers..."
exec "$ROOT/run-vds.sh" restart
