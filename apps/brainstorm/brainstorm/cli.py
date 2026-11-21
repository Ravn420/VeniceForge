"""One-shot crew for the desktop app. JSON in on stdin, JSON lines out."""

from __future__ import annotations

import json
import signal
import sys
import threading

from brainstorm.crew_run import run_brainstorm


def main() -> int:
    raw_out = sys.stdout
    sys.stdout = sys.stderr
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())

    def emit(event: dict) -> None:
        raw_out.write(json.dumps(event, ensure_ascii=False) + "\n")
        raw_out.flush()

    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        emit({"type": "error", "message": "The desktop sent a brief the crew could not read."})
        return 2
    if not isinstance(payload, dict):
        emit({"type": "error", "message": "The desktop sent a brief the crew could not read."})
        return 2
    result = run_brainstorm(payload, emit, stop)
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
