"""Agent 6 — The Skeptic / False-Positive Filter."""
from __future__ import annotations

from ..llm import StructuredLLM
from ..state import SEVERITY_ORDER, AuditState, Finding, SkepticOutput, Verdict
from .base import shared_context, render_findings

ROLE = "agent6_skeptic"

SYSTEM = """Role: The Skeptic. You are the last line of defence against hallucinated findings.
For EACH candidate finding, trace the real execution path in the code:
- Do modifiers (nonReentrant, onlyOwner, whenNotPaused, initializer) block it?
- Do require/revert/custom-error guards or Solidity >=0.8 checked arithmetic block it?
- Is the cited function/line real, and reachable by an unprivileged attacker?
- Does it need a trusted role to misbehave? (then at most low/informational)
- Is it the same root cause as another finding? (mark duplicate_of the best one)
Verdicts: confirmed | downgraded (set adjusted_severity) | rejected | duplicate.
Return exactly one verdict per finding id. Default to rejected when the path
cannot be demonstrated from the code shown."""


def run(llm: StructuredLLM, state: AuditState) -> dict:
    findings = state.get("raw_findings") or []
    if not findings:
        return {"verdicts": [], "final_findings": []}
    user = f"<candidate_findings>\n{render_findings(findings)}\n</candidate_findings>"
    out = llm.structured(role=ROLE, system=SYSTEM, user=user, schema=SkepticOutput, shared_context=shared_context(state))
    return {"verdicts": out.verdicts, "final_findings": apply_verdicts(findings, out.verdicts)}


def apply_verdicts(findings: list[Finding], verdicts) -> list[Finding]:
    """Keep confirmed/downgraded findings. A finding with no verdict is dropped (fail closed)."""
    by_id = {v.finding_id: v for v in verdicts}
    kept: list[Finding] = []
    for f in findings:
        v = by_id.get(f.id)
        if v is None or v.verdict in (Verdict.REJECTED, Verdict.DUPLICATE):
            continue
        if v.verdict is Verdict.DOWNGRADED and v.adjusted_severity is not None:
            f = f.model_copy(update={"severity": v.adjusted_severity})
        kept.append(f)
    return sorted(kept, key=lambda f: (SEVERITY_ORDER[f.severity], -f.confidence))
