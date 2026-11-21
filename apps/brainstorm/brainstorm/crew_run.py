"""Run a real CrewAI crew for one brainstorming pass.

Each seat is its own crew so the studio can show who is working and stop
between seats. Nothing here invents a result if the model call fails.
"""

from __future__ import annotations

import os
import threading
from typing import Any, Callable

from brainstorm.parse_board import parse_board

Emit = Callable[[dict[str, Any]], None]

ROLES = {
    "storm": ["Spark", "Skeptic", "Maker", "Chair"],
    "deepen": ["Expander", "Skeptic", "Maker", "Chair"],
    "combine": ["Weaver", "Skeptic", "Maker", "Chair"],
}

HEAT = {
    "grounded": (
        0.4,
        "Prefer ideas a small team could start this month. Name the mechanism, the user, and the first concrete action.",
    ),
    "bold": (
        0.8,
        "Prefer non-obvious ideas that still have a real mechanism. Avoid slogans and generic AI wrappers.",
    ),
    "unhinged": (
        1.0,
        "Prefer strange but coherent ideas. Surprise is required. Generic startup language is a failed idea.",
    ),
}

_import_lock = threading.Lock()
_crewai: Any = None


def crewai_modules() -> Any:
    global _crewai
    with _import_lock:
        if _crewai is None:
            os.environ.setdefault("CREWAI_TELEMETRY_OPT_OUT", "true")
            os.environ.setdefault("OTEL_SDK_DISABLED", "true")
            from crewai import Agent, Crew, LLM, Process, Task

            _crewai = {
                "Agent": Agent,
                "Crew": Crew,
                "LLM": LLM,
                "Process": Process,
                "Task": Task,
            }
        return _crewai


def run_brainstorm(payload: dict[str, Any], emit: Emit, stop: threading.Event | None = None) -> dict[str, Any]:
    stop = stop or threading.Event()
    brief = _brief(payload)
    if isinstance(brief, str):
        emit({"type": "error", "message": brief})
        return {"ok": False, "error": brief}

    if not os.environ.get("XAI_API_KEY"):
        message = "The crew has no model key in this environment, so it cannot run."
        emit({"type": "error", "message": message})
        return {"ok": False, "error": message}

    roles = ROLES[brief["mode"]]
    emit({"type": "start", "roles": roles, "mode": brief["mode"], "heat": brief["heat"], "count": brief["count"]})

    try:
        mods = crewai_modules()
    except Exception as exc:  # import / install problems are user-visible
        message = f"CrewAI failed to load: {exc.__class__.__name__}"
        emit({"type": "error", "message": message})
        return {"ok": False, "error": message}

    transcript: list[dict[str, str]] = []
    prior = ""
    for role in roles:
        if stop.is_set():
            emit({"type": "stopped"})
            return {"ok": False, "stopped": True, "transcript": transcript}
        emit({"type": "agent_start", "role": role})
        try:
            text = _seat(mods, role, brief, prior)
        except Exception as exc:
            message = _public_error(exc)
            emit({"type": "error", "role": role, "message": message})
            return {"ok": False, "error": message, "transcript": transcript}
        prior = text.strip()
        transcript.append({"role": role, "text": prior})
        emit({"type": "agent_done", "role": role, "text": prior})

    board = parse_board(prior) if roles[-1] == "Chair" else None
    if board is None:
        emit(
            {
                "type": "error",
                "message": "The chair finished, but the reply was not a usable board. The raw note is in the transcript.",
            }
        )
        return {"ok": False, "error": "unparsed", "transcript": transcript}

    emit({"type": "board", "board": board})
    emit({"type": "done", "board": board})
    return {"ok": True, "board": board, "transcript": transcript}


def _brief(payload: dict[str, Any]) -> dict[str, Any] | str:
    if not isinstance(payload, dict):
        return "The brief was empty."
    topic = _clip(payload.get("topic"), 4000)
    if len(topic) < 8:
        return "Give the crew a brief of at least a sentence."
    mode = str(payload.get("mode") or "storm")
    if mode not in ROLES:
        return "Unknown brainstorm mode."
    heat = str(payload.get("heat") or "bold")
    if heat not in HEAT:
        heat = "bold"
    try:
        count = int(payload.get("count") or 6)
    except (TypeError, ValueError):
        count = 6
    if count not in (4, 6, 8):
        count = 6
    return {
        "topic": topic,
        "audience": _clip(payload.get("audience"), 240),
        "constraints": _clip(payload.get("constraints"), 1500),
        "seeds": _clip(payload.get("seeds"), 2500),
        "focus": _clip(payload.get("focus"), 2000),
        "mode": mode,
        "heat": heat,
        "count": count,
    }


def _seat(mods: dict[str, Any], role: str, brief: dict[str, Any], prior: str) -> str:
    temperature, heat_line = HEAT[brief["heat"]]
    description, expected = _task(role, brief, prior, heat_line)
    last_error: Exception | None = None
    for temp in (temperature, None):
        try:
            llm = _llm(mods["LLM"], temp, 1100 if role == "Chair" else 900)
            agent = mods["Agent"](
                role=role,
                goal=_goal(role),
                backstory=_backstory(role),
                llm=llm,
                verbose=False,
                allow_delegation=False,
            )
            task = mods["Task"](
                name=role.lower(),
                description=description,
                expected_output=expected,
                agent=agent,
            )
            crew = mods["Crew"](
                agents=[agent],
                tasks=[task],
                process=mods["Process"].sequential,
                verbose=False,
                memory=False,
            )
            result = crew.kickoff()
            text = getattr(result, "raw", None) or str(result)
            text = text.strip()
            if not text:
                raise RuntimeError("empty reply")
            return text
        except Exception as exc:
            last_error = exc
            if temp is not None and "temperature" in str(exc).lower():
                continue
            raise
    assert last_error is not None
    raise last_error


def _llm(LLM: Any, temperature: float | None, max_tokens: int) -> Any:
    kwargs: dict[str, Any] = {
        "model": os.environ.get("BRAINSTORM_MODEL", "openai/grok-4.5"),
        "base_url": os.environ.get("BRAINSTORM_BASE_URL", "https://api.x.ai/v1"),
        "api_key": os.environ["XAI_API_KEY"],
        "max_tokens": max_tokens,
        "timeout": 120,
    }
    if temperature is not None:
        kwargs["temperature"] = temperature
    return LLM(**kwargs)


def _task(role: str, brief: dict[str, Any], prior: str, heat_line: str) -> tuple[str, str]:
    n = brief["count"]
    header = (
        f"Heat: {heat_line}\n"
        f"Brief:\n{brief['topic']}\n"
    )
    if brief["audience"]:
        header += f"\nAudience: {brief['audience']}\n"
    if brief["constraints"]:
        header += f"\nConstraints:\n{brief['constraints']}\n"
    if brief["seeds"]:
        header += f"\nSeeds already on the table:\n{brief['seeds']}\n"
    if brief["focus"]:
        header += f"\nFocus concept:\n{brief['focus']}\n"
    if prior:
        header += f"\nPrevious seat wrote:\n{prior[:7000]}\n"

    if role in ("Spark", "Expander", "Weaver"):
        verb = {
            "Spark": f"Write exactly {n} raw ideas. Do not rank or reject.",
            "Expander": f"Branch the focus concept into exactly {n} distinct directions. Do not repeat the original in new words.",
            "Weaver": f"Combine the seeds into exactly {n} new ideas. A combination must change what gets built, not just the name.",
        }[role]
        return (
            header + "\n" + verb + " For each: a name of at most four words, one sentence on the mechanism, and who it is for.",
            f"Exactly {n} ideas. No introduction, no ranking.",
        )
    if role == "Skeptic":
        return (
            header
            + "\nCut generic, duplicated, or unstartable ideas. Keep the ones with a mechanism. "
            "For each survivor state the fatal assumption and why it is still worth a day of work. "
            "Name what you killed and why, in one line each.",
            "A cut list and a survivor list. No pep talk.",
        )
    if role == "Maker":
        return (
            header
            + f"\nTurn the survivors into exactly {n} buildable concepts. "
            "If fewer survived, invent variants that fix the fatal assumption rather than padding with slogans. "
            "For each concept include a title, a two-sentence pitch, how it works, the first step a person could take today, the biggest risk, and two tags.",
            f"Exactly {n} concepts with those fields.",
        )
    return (
        header
        + "\nPublish the decision board as JSON only. Schema: "
        '{"title":"","thesis":"","ideas":[{"id":"1","title":"","pitch":"","how":"","firstStep":"","risk":"","score":8,"tags":["a","b"]}],'
        '"killed":[{"title":"","why":""}],"questions":[""],"next":""}. '
        f"Include exactly {n} ideas. score is an integer from 1 to 10. "
        "Rank strongest first. next is the single best action after this session.",
        "One JSON object and nothing else.",
    )


def _goal(role: str) -> str:
    return {
        "Spark": "Cover the brief with distinct, mechanism-first ideas.",
        "Expander": "Open one concept into directions that would be built differently.",
        "Weaver": "Fuse the given ideas into concepts that neither idea is alone.",
        "Skeptic": "Remove anything that cannot be started or is only a slogan.",
        "Maker": "Leave concepts a person could act on today.",
        "Chair": "Hand back a ranked board and one next action.",
    }[role]


def _backstory(role: str) -> str:
    return {
        "Spark": "You open brainstorms. You never critique. You refuse filler phrases and ideas that are only a technology looking for a job.",
        "Expander": "You take one concept and push it into neighboring products, audiences, and business shapes.",
        "Weaver": "You combine ideas only when the combination creates a new mechanism.",
        "Skeptic": "You have buried a lot of workshops. You keep the idea that would still be interesting after the adjective is deleted.",
        "Maker": "You write the version someone could prototype without a platform team.",
        "Chair": "You close the session. You do not add new ideas. You decide.",
    }[role]


def _public_error(exc: Exception) -> str:
    text = str(exc).strip().replace("\n", " ")
    lowered = text.lower()
    if "api key" in lowered or "unauthorized" in lowered or "401" in text:
        return "The model rejected the crew's credentials."
    if "429" in text or "rate" in lowered:
        return "The model is rate-limiting the crew. Wait a moment and run again."
    if "timeout" in lowered or "timed out" in lowered:
        return "That seat timed out before it finished."
    if len(text) > 240:
        text = text[:240] + "…"
    return text or exc.__class__.__name__


def _clip(value: Any, limit: int) -> str:
    return str(value or "").strip()[:limit]
