"""Agent 0: Static Triage (cheap tier).

Slither/Aderyn high and medium hits are noisy. One low-effort call on the cheap
model decides which are real before they reach the expensive Skeptic. Kept hits
become ordinary ``Finding`` objects (ids S-01, S-02, ...), so the rest of the
pipeline treats them like any hunter finding.

Costs nothing when the tools report no high/medium hits.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from ..llm import StructuredLLM
from ..state import AuditState, Finding, Severity
from .base import shared_context

ROLE = "agent0_triage"
TRIAGE_IMPACTS = ("High", "Medium")

SYSTEM = """Role: Static-Analysis Triage.
You receive hits from static analysers (Slither, Aderyn). Most are false positives
or harmless. For each hit, check the cited code and decide:
- keep=true only if an unprivileged user could cause loss of funds, a broken core
  function, or a stuck state. Then fill severity, a precise title, the exploit
  path, and a fix.
- keep=false for style issues, intended behaviour, guarded paths, trusted-role
  issues, and detector pattern-matches that do not hold in context. Say why in
  the reasoning field.
Return exactly one item per hit id."""


class TriageItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    static_id: str
    keep: bool
    severity: Severity
    title: str
    description: str
    exploit_scenario: str
    recommendation: str
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str


class TriageOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[TriageItem]


def candidates(state: AuditState) -> list[tuple[str, object]]:
    report = state.get("static_report")
    if report is None:
        return []
    hits = [s for s in report.findings if s.impact in TRIAGE_IMPACTS]
    return [(f"S-{n:02d}", s) for n, s in enumerate(hits, 1)]


def run(llm: StructuredLLM, state: AuditState) -> dict:
    hits = candidates(state)
    if not hits:
        return {}
    lines = []
    for sid, s in hits:
        where = f"{s.contract}.{s.function}" if s.function else (s.contract or "?")
        lines.append(f"- {sid} [{s.tool}:{s.check}] impact={s.impact} confidence={s.confidence} at {where} "
                     f"lines {s.lines[:1] or '?'}: {s.description}")
    user = "<static_hits>\n" + "\n".join(lines) + "\n</static_hits>"
    out = llm.structured(role=ROLE, system=SYSTEM, user=user, schema=TriageOutput, shared_context=shared_context(state))

    by_id = dict(hits)
    kept: list[Finding] = []
    for item in out.items:
        s = by_id.get(item.static_id)
        if s is None or not item.keep:
            continue
        line = f" L{s.lines[0]}" if s.lines else ""
        kept.append(Finding(
            id=item.static_id, title=item.title, severity=item.severity, category=s.check,
            location=f"{s.contract}.{s.function}{line}" if s.function else f"{s.contract}{line}",
            description=item.description, exploit_scenario=item.exploit_scenario,
            recommendation=item.recommendation, violated_invariants=[], confidence=item.confidence,
            source_agent=f"{s.tool}+{ROLE}",
        ))
    dropped = len(hits) - len(kept)
    return {"raw_findings": kept, "triage_summary": [f"{len(hits)} static hit(s) triaged: {len(kept)} kept, {dropped} dropped"]}
