#!/usr/bin/env python3
"""Token-protected VDS update API: git fetch/pull + rebuild divider (not self)."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

REPO_DIR = Path(os.environ.get("REPO_DIR", "/repo")).resolve()
BRANCH = os.environ.get("BRANCH", "main")
REMOTE = os.environ.get("REMOTE", "origin")
LISTEN_HOST = os.environ.get("UPDATE_LISTEN", "0.0.0.0")
LISTEN_PORT = int(os.environ.get("UPDATE_PORT", "8080"))
TOKEN = os.environ.get("UPDATE_TOKEN", "").strip()
COMPOSE_SERVICE = os.environ.get("COMPOSE_SERVICE", "divider")
COMPOSE_PROJECT = os.environ.get("COMPOSE_PROJECT_NAME", "divider")

_lock = threading.Lock()
_state = {
    "busy": False,
    "started_at": None,
    "finished_at": None,
    "ok": None,
    "message": "",
    "log": "",
}


def _token_ok(provided: str) -> bool:
    if not TOKEN:
        return False
    a = hashlib.sha256(provided.encode("utf-8")).digest()
    b = hashlib.sha256(TOKEN.encode("utf-8")).digest()
    return a == b


def _run(cmd: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=str(cwd or REPO_DIR),
        text=True,
        capture_output=True,
        check=False,
        env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
    )


def _append(log: list[str], title: str, proc: subprocess.CompletedProcess[str]) -> None:
    log.append(f"$ {' '.join(proc.args) if isinstance(proc.args, list) else proc.args}")
    if proc.stdout:
        log.append(proc.stdout.rstrip())
    if proc.stderr:
        log.append(proc.stderr.rstrip())
    log.append(f"[exit {proc.returncode}] {title}")
    log.append("")


def _do_update() -> tuple[bool, str, str]:
    log: list[str] = []
    if not (REPO_DIR / ".git").is_dir():
        return False, "Not a git repository", ""

    safe = _run(["git", "config", "--global", "--add", "safe.directory", str(REPO_DIR)])
    _append(log, "safe.directory", safe)

    dirty = _run(["git", "status", "--porcelain"])
    _append(log, "git status", dirty)
    if dirty.returncode != 0:
        return False, "git status failed", "\n".join(log)
    if dirty.stdout.strip():
        return False, "Working tree has local changes; clean them before updating", "\n".join(log)

    fetch = _run(["git", "fetch", REMOTE])
    _append(log, "git fetch", fetch)
    if fetch.returncode != 0:
        return False, "git fetch failed", "\n".join(log)

    current = _run(["git", "branch", "--show-current"])
    _append(log, "git branch", current)
    cur = (current.stdout or "").strip()
    if cur and cur != BRANCH:
        co = _run(["git", "checkout", BRANCH])
        _append(log, "git checkout", co)
        if co.returncode != 0:
            return False, f"git checkout {BRANCH} failed", "\n".join(log)

    pull = _run(["git", "pull", "--ff-only", REMOTE, BRANCH])
    _append(log, "git pull", pull)
    if pull.returncode != 0:
        return False, "git pull --ff-only failed", "\n".join(log)

    # Rebuild only the web service so this updater container stays up.
    build = _run(
        [
            "docker",
            "compose",
            "-p",
            COMPOSE_PROJECT,
            "-f",
            str(REPO_DIR / "docker-compose.yml"),
            "up",
            "-d",
            "--build",
            "--force-recreate",
            "--no-deps",
            COMPOSE_SERVICE,
        ]
    )
    _append(log, "compose up divider", build)
    if build.returncode != 0:
        return False, "docker compose rebuild failed", "\n".join(log)

    prune = _run(["docker", "image", "prune", "-f"])
    _append(log, "image prune", prune)

    head = _run(["git", "rev-parse", "--short", "HEAD"])
    _append(log, "HEAD", head)
    sha = (head.stdout or "").strip() or "?"
    return True, f"Updated to {sha} and rebuilt {COMPOSE_SERVICE}", "\n".join(log)


def _worker() -> None:
    ok, message, log = _do_update()
    with _lock:
        _state["busy"] = False
        _state["finished_at"] = time.time()
        _state["ok"] = ok
        _state["message"] = message
        _state["log"] = log[-12000:]


class Handler(BaseHTTPRequestHandler):
    server_version = "divider-updater/1.0"

    def log_message(self, fmt: str, *args) -> None:
        sys_stderr = __import__("sys").stderr
        print(f"[updater] {self.address_string()} {fmt % args}", file=sys_stderr)

    def _send(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _auth(self) -> bool:
        auth = self.headers.get("Authorization", "")
        token = ""
        if auth.lower().startswith("bearer "):
            token = auth[7:].strip()
        if not token:
            token = self.headers.get("X-Update-Token", "").strip()
        return _token_ok(token)

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path in ("/api/update/status", "/api/status"):
            with _lock:
                payload = {
                    "configured": bool(TOKEN),
                    "busy": _state["busy"],
                    "ok": _state["ok"],
                    "message": _state["message"],
                    "started_at": _state["started_at"],
                    "finished_at": _state["finished_at"],
                    "log": _state["log"] if not _state["busy"] else "",
                    "branch": BRANCH,
                }
            self._send(200, payload)
            return
        if path in ("/health", "/api/health"):
            self._send(200, {"ok": True, "configured": bool(TOKEN)})
            return
        self._send(404, {"ok": False, "message": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path not in ("/api/update", "/api/update/run"):
            self._send(404, {"ok": False, "message": "not found"})
            return
        if not TOKEN:
            self._send(503, {"ok": False, "message": "UPDATE_TOKEN is not set on the server"})
            return
        if not self._auth():
            self._send(401, {"ok": False, "message": "Invalid or missing update token"})
            return

        length = int(self.headers.get("Content-Length", "0") or "0")
        if length > 0:
            self.rfile.read(min(length, 1_000_000))

        with _lock:
            if _state["busy"]:
                self._send(409, {"ok": False, "message": "Update already in progress", "busy": True})
                return
            _state["busy"] = True
            _state["started_at"] = time.time()
            _state["finished_at"] = None
            _state["ok"] = None
            _state["message"] = "Update started"
            _state["log"] = ""

        threading.Thread(target=_worker, name="vds-update", daemon=True).start()
        self._send(202, {"ok": True, "message": "Update started", "busy": True})


def main() -> None:
    if not TOKEN:
        print("[updater] WARNING: UPDATE_TOKEN is empty — update endpoint disabled", flush=True)
    print(f"[updater] listening on {LISTEN_HOST}:{LISTEN_PORT} repo={REPO_DIR}", flush=True)
    server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
