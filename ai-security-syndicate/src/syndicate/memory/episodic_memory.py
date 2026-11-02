"""Episodic memory: lessons learned from earlier runs (Phase 4).

A lesson is a short, reusable instruction for one agent ("agent7_verifier: mock
tokens must implement decimals() when the vault reads it"). Lessons come from:

* ``syndicate lesson add``: a human writes one after reviewing a report;
* automatic recording (``--learn``): deterministic notes from Agent 7 outcomes,
  e.g. the compiler error that defeated a PoC after all retries.

Lessons are stored as JSON lines (one file, easy to review and edit by hand)
and injected into the *user* message, never the cached system prefix, so they
don't invalidate the prompt cache.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_PATH = Path(os.environ.get("SYNDICATE_LESSONS", Path.home() / ".cache" / "syndicate" / "lessons.jsonl"))
WORD = re.compile(r"[a-z_][a-z0-9_]{2,}")


@dataclass
class Lesson:
    agent: str                     # role name, or "all"
    text: str
    keywords: list[str] = field(default_factory=list)   # empty = always relevant to the agent
    source: str = "manual"         # manual | verification | gym
    created: str = ""
    id: str = ""

    def __post_init__(self):
        self.created = self.created or datetime.now(timezone.utc).isoformat(timespec="seconds")
        self.id = self.id or hashlib.sha256(f"{self.agent}\0{self.text}".encode()).hexdigest()[:12]


class LessonStore:
    def __init__(self, path: Path | str = DEFAULT_PATH):
        self.path = Path(path)

    def all(self) -> list[Lesson]:
        if not self.path.is_file():
            return []
        out = []
        for line in self.path.read_text().splitlines():
            line = line.strip()
            if line:
                try:
                    out.append(Lesson(**json.loads(line)))
                except (json.JSONDecodeError, TypeError):
                    continue  # a hand-edited bad line must not break audits
        return out

    def add(self, lesson: Lesson) -> bool:
        """Append unless an identical lesson (same agent + text) exists. Returns True if added."""
        if any(x.id == lesson.id for x in self.all()):
            return False
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a") as fh:
            fh.write(json.dumps(asdict(lesson)) + "\n")
        return True

    def remove(self, lesson_id: str) -> bool:
        keep = [x for x in self.all() if x.id != lesson_id]
        if len(keep) == len(self.all()):
            return False
        self.path.write_text("".join(json.dumps(asdict(x)) + "\n" for x in keep))
        return True

    def relevant(self, role: str, code: str, limit: int = 5) -> list[Lesson]:
        words = set(WORD.findall(code.lower()))
        scored = []
        for x in self.all():
            if x.agent not in (role, "all"):
                continue
            overlap = sum(1 for k in x.keywords if k.lower() in words)
            if x.keywords and overlap == 0:
                continue
            scored.append((overlap, x.created, x))
        scored.sort(key=lambda t: t[1], reverse=True)   # newest first...
        scored.sort(key=lambda t: -t[0])                 # ...within equal keyword overlap
        return [x for _, _, x in scored[:limit]]


def render_lessons(lessons: list[Lesson]) -> str:
    if not lessons:
        return ""
    return "Lessons from earlier audits (apply where relevant):\n" + "\n".join(f"- {x.text}" for x in lessons)


def lessons_from_verifications(verifications) -> list[Lesson]:
    """Deterministic lessons from Agent 7 outcomes worth remembering."""
    out = []
    for v in verifications or []:
        if v.status.value == "compile_failed":
            err = next((line.strip() for line in v.log.splitlines() if re.search(r"Error \(\d+\)|Error:", line)), "")
            if err:
                out.append(Lesson(agent="agent7_verifier", source="verification",
                                  text=f"A PoC failed to compile after all retries with: {err[:200]}. Avoid that construct."))
        elif v.status.value == "rejected":
            out.append(Lesson(agent="agent7_verifier", source="verification",
                              text="PoC tests must not use ffi, file, env, fork/RPC or broadcast cheatcodes; they are blocked."))
    return out
