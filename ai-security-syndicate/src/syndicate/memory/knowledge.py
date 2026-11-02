"""Knowledge base retrieval (Phase 4, local and free).

Patterns in ``config/knowledge/patterns.yaml`` are review checklists for known
vulnerability classes. A pattern is retrieved when enough of its code signals
appear in the audited code, so selection is deterministic, explainable, and
costs nothing. Each hunter gets only the patterns tagged with its role.

This is the seam for a vector store later (e.g. Qdrant over a large post-mortem
corpus): anything that returns ``Pattern`` objects for a code string can replace
``retrieve``.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml

DEFAULT_PATTERNS = Path(__file__).resolve().parents[3] / "config" / "knowledge" / "patterns.yaml"


@dataclass
class Pattern:
    id: str
    title: str
    roles: list[str]
    signals: list[str]
    checks: list[str]
    min_signals: int = 2
    matched: list[str] = field(default_factory=list)


def load_patterns(path: Path | str = DEFAULT_PATTERNS) -> list[Pattern]:
    raw = yaml.safe_load(Path(path).read_text()) or []
    ids = [p["id"] for p in raw]
    if len(ids) != len(set(ids)):
        raise ValueError(f"duplicate pattern ids in {path}")
    return [Pattern(**p) for p in raw]


def retrieve(code: str, patterns: list[Pattern], limit: int = 8) -> list[Pattern]:
    text = code.lower()
    hits = []
    for p in patterns:
        matched = [s for s in p.signals if s.lower() in text]
        if len(matched) >= p.min_signals:
            hits.append(Pattern(**{**p.__dict__, "matched": matched}))
    hits.sort(key=lambda p: (-len(p.matched) / max(1, len(p.signals)), p.id))
    return hits[:limit]


def render_checklist(patterns: list[Pattern], role: str) -> str:
    mine = [p for p in patterns if role in p.roles]
    if not mine:
        return ""
    lines = ["Known vulnerability classes whose signals appear in this code. Check each; report only what the code confirms:"]
    for p in mine:
        lines.append(f"- {p.id} {p.title} (signals: {', '.join(p.matched)})")
        lines += [f"    - {c}" for c in p.checks]
    return "\n".join(lines)
