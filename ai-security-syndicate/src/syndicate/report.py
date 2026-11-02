"""Deterministic Markdown report — no LLM involved."""
from __future__ import annotations

from collections import Counter

from .state import AuditState, Verdict


def render_report(state: AuditState) -> str:
    findings = state.get("final_findings") or []
    raw = state.get("raw_findings") or []
    verdicts = state.get("verdicts") or []
    errors = state.get("errors") or []
    sev = Counter(f.severity.value for f in findings)
    vc = Counter(v.verdict.value for v in verdicts)

    out = [f"# Security Audit Report — {state.get('target', 'target')}", ""]
    out += [
        "> **Status: unverified hypotheses.** Findings passed the Skeptic filter (Agent 6) but have not yet",
        "> been proven with an executable Foundry test (Agent 7, Phase 3). Verify before acting.",
        "",
        "## Summary",
        "",
        "| Severity | Count |",
        "|---|---|",
    ]
    for s in ("critical", "high", "medium", "low", "informational"):
        out.append(f"| {s} | {sev.get(s, 0)} |")
    out += [
        "",
        f"Candidates raised by hunters: **{len(raw)}** · "
        + " · ".join(f"{k}: {vc.get(k, 0)}" for k in (v.value for v in Verdict)),
        "",
    ]
    if errors:
        out += ["## Pipeline errors", ""] + [f"- {e}" for e in errors] + [""]

    invs = state.get("invariants") or []
    if invs:
        out += ["## System invariants (Agent 1)", ""]
        out += [f"- **{i.id}** ({i.kind.value}) {i.statement} — `{i.formal}`" for i in invs]
        out.append("")

    ctx = state.get("context_map")
    if ctx:
        out += ["## Attack surface (Agent 2)", "", ctx.summary, "", "| Risk | Function | Rationale |", "|---|---|---|"]
        for f in sorted(ctx.functions, key=lambda f: -f.risk_score)[:15]:
            out.append(f"| {f.risk_score} | `{f.contract}.{f.function}` | {f.rationale} |")
        out.append("")

    out += ["## Findings", ""]
    if not findings:
        out += ["No findings survived verification.", ""]
    vmap = {v.finding_id: v for v in verdicts}
    for n, f in enumerate(findings, 1):
        v = vmap.get(f.id)
        out += [
            f"### [{f.severity.value.upper()}-{n:02d}] {f.title}",
            "",
            f"- **Location:** `{f.location}`",
            f"- **Category:** {f.category} · **Raised by:** {f.source_agent} ({f.id}) · **Confidence:** {f.confidence:.0%}",
        ]
        if f.violated_invariants:
            out.append(f"- **Violates:** {', '.join(f.violated_invariants)}")
        out += ["", f.description, "", "**Exploit scenario**", "", f.exploit_scenario, "", "**Recommendation**", "", f.recommendation, ""]
        if v:
            out += [f"<details><summary>Skeptic: {v.verdict.value}</summary>\n\n{v.reasoning}\n\n</details>", ""]

    rejected = [v for v in verdicts if v.verdict in (Verdict.REJECTED, Verdict.DUPLICATE)]
    if rejected:
        out += ["## Filtered out by the Skeptic", ""]
        out += [f"- `{v.finding_id}` — {v.verdict.value}: {v.reasoning}" for v in rejected]
        out.append("")
    return "\n".join(out)
