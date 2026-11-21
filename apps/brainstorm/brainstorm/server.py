"""Studio server: Venice Forge renderer plus the CrewAI brainstorm API.

Binds 0.0.0.0:8080 so the live preview and the desktop can share one crew.
"""

from __future__ import annotations

import json
import os
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from brainstorm.crew_run import run_brainstorm

ROOT = Path(__file__).resolve().parents[2] / "desktop" / "src" / "renderer"
SESSION_SCRIPT = Path(__file__).resolve().parents[2] / "desktop" / "scripts" / "venice-browser-session.mjs"
HOST = os.environ.get("BRAINSTORM_HOST", "0.0.0.0")
PORT = int(os.environ.get("BRAINSTORM_PORT", "8080"))

_job = threading.Lock()
_stop = threading.Event()

TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".woff2": "font/woff2",
}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:
        sys_stderr = __import__("sys").stderr
        sys_stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path in ("/health", "/api/health"):
            self._json(200, {"ok": True, "crew": "crewai"})
            return
        if path == "/api/venice/session":
            self._json(200, venice_session())
            return
        if path in ("/", ""):
            path = "/index.html"
        self._static(path)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/brainstorm/stop":
            _stop.set()
            self._json(200, {"ok": True})
            return
        if path != "/api/brainstorm":
            self._json(404, {"ok": False, "error": "Not found"})
            return
        length = int(self.headers.get("Content-Length") or "0")
        if length <= 0 or length > 64_000:
            self._json(400, {"ok": False, "error": "Send a brief."})
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._json(400, {"ok": False, "error": "The brief was not valid JSON."})
            return
        if not _job.acquire(blocking=False):
            self._json(429, {"ok": False, "error": "A crew is already in the room. Stop it or wait."})
            return
        _stop.clear()
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        self._cors()
        self.end_headers()
        try:
            def emit(event: dict) -> None:
                if _stop.is_set() and event.get("type") == "agent_start":
                    return
                packet = f"data: {json.dumps(event, ensure_ascii=False)}\n\n".encode("utf-8")
                self.wfile.write(packet)
                self.wfile.flush()

            run_brainstorm(payload if isinstance(payload, dict) else {}, emit, _stop)
        except (BrokenPipeError, ConnectionResetError):
            _stop.set()
        finally:
            _job.release()

    def _chunk(self, data: bytes) -> None:
        self.wfile.write(f"{len(data):X}\r\n".encode("ascii"))
        self.wfile.write(data)
        self.wfile.write(b"\r\n")
        self.wfile.flush()

    def _static(self, url_path: str) -> None:
        rel = unquote(url_path).lstrip("/")
        candidate = (ROOT / rel).resolve()
        try:
            candidate.relative_to(ROOT.resolve())
        except ValueError:
            self._json(403, {"ok": False, "error": "Forbidden"})
            return
        if not candidate.is_file():
            self._json(404, {"ok": False, "error": "Not found"})
            return
        data = candidate.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", TYPES.get(candidate.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def _json(self, status: int, body: dict) -> None:
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")


def venice_session() -> dict:
    """Venice.ai has no desktop login. A live browser session means skip the login page."""
    try:
        proc = subprocess.run(
            ["node", str(SESSION_SCRIPT), "--status"],
            capture_output=True,
            text=True,
            timeout=12,
            env={**os.environ, "NODE_NO_WARNINGS": "1"},
            check=False,
        )
        data = json.loads(proc.stdout.strip() or "{}")
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError):
        data = {}
    logged = bool(data.get("loggedIn"))
    return {"loggedIn": logged, "source": data.get("source") or "", "skippedLogin": logged}


def main() -> None:
    if not ROOT.is_dir():
        raise SystemExit(f"renderer missing: {ROOT}")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"venice forge brainstorm on {HOST}:{PORT}", flush=True)
    threading.Thread(target=_warm, daemon=True).start()
    server.serve_forever()


def _warm() -> None:
    try:
        from brainstorm.crew_run import crewai_modules

        crewai_modules()
    except Exception as exc:
        print(f"crewai warmup failed: {exc}", flush=True)


if __name__ == "__main__":
    main()
