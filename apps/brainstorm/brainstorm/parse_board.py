"""Pull a decision board out of the chair's raw reply."""

from __future__ import annotations

import json
import re
from typing import Any


def parse_board(text: str) -> dict[str, Any] | None:
    raw = _extract_json(text or "")
    if raw is None:
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    ideas = []
    for i, item in enumerate(_as_list(data.get("ideas")), start=1):
        if isinstance(item, str):
            item = {"title": item}
        if not isinstance(item, dict):
            continue
        title = _clip(item.get("title") or item.get("name") or f"Idea {i}", 120)
        ideas.append(
            {
                "id": _clip(item.get("id") or str(i), 32),
                "title": title,
                "pitch": _clip(item.get("pitch") or item.get("summary") or "", 600),
                "how": _clip(item.get("how") or item.get("mechanism") or "", 800),
                "firstStep": _clip(item.get("firstStep") or item.get("first_step") or "", 400),
                "risk": _clip(item.get("risk") or "", 400),
                "score": _score(item.get("score")),
                "tags": [_clip(t, 32) for t in _as_list(item.get("tags")) if str(t).strip()][:4],
            }
        )
    if not ideas:
        return None
    killed = []
    for item in _as_list(data.get("killed")):
        if isinstance(item, str):
            killed.append({"title": _clip(item, 120), "why": ""})
        elif isinstance(item, dict):
            killed.append(
                {
                    "title": _clip(item.get("title") or item.get("name") or "Dropped", 120),
                    "why": _clip(item.get("why") or item.get("reason") or "", 400),
                }
            )
    questions = [_clip(q, 300) for q in _as_list(data.get("questions")) if str(q).strip()][:6]
    return {
        "title": _clip(data.get("title") or ideas[0]["title"], 140),
        "thesis": _clip(data.get("thesis") or "", 500),
        "ideas": ideas[:8],
        "killed": killed[:6],
        "questions": questions,
        "next": _clip(data.get("next") or "", 500),
    }


def _extract_json(text: str) -> str | None:
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        return fence.group(1)
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end <= start:
        return None
    return text[start : end + 1]


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _clip(value: Any, limit: int) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text[:limit]


def _score(value: Any) -> int:
    try:
        n = int(round(float(value)))
    except (TypeError, ValueError):
        return 0
    return max(1, min(10, n))
