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
    if (state.get("options") or {}).get("llm") is False:
        out += ["> **Static-only mode:** no LLM stage ran (no API cost). Findings below come from the free",
                "> tools only and are untriaged. Run without `--static-only` for the full audit.", ""]
    static_only = (state.get("options") or {}).get("llm") is False
    out += [] if static_only else [
        "> **Status: unverified hypotheses.** Findings passed the Skeptic filter (Agent 6) but have not yet",
        "> been proven with an executable Foundry test (Agent 7, Phase 3). Verify before acting.",
        "",
    ]
    out += [
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

    out += render_static(state)

    invs = state.get("invariants") or []
    if invs:
        out += ["## System invariants (Agent 1)", ""]
        out += [f"- **{i.id}** ({i.kind.value}) {i.statement} — `{i.formal}`" for i in invs]
        out.append("")

    ctx = state.get("context_map")
    if ctx:
        how = {"static": "deterministic, from Slither facts", "llm": "LLM router"}.get(state.get("router_mode", ""), "")
        out += [f"## Attack surface (Agent 2{': ' + how if how else ''})", "", ctx.summary, "", "| Risk | Function | Rationale |", "|---|---|---|"]
        for f in sorted(ctx.functions, key=lambda f: -f.risk_score)[:15]:
            out.append(f"| {f.risk_score} | `{f.contract}.{f.function}` | {f.rationale} |")
        out.append("")

    out += ["## Findings", ""]
    if static_only:
        out += ["LLM stages disabled (`--static-only`). See the static analysis section above.", ""]
    elif not findings:
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


def render_static(state: AuditState) -> list[str]:
    """Free section: what the static tools saw. Low/info hits live only here."""
    report = state.get("static_report")
    if report is None:
        return []
    out = [f"## Static analysis ({', '.join(report.tools) or 'no tools ran'})", ""]
    out += [f"- {line}" for line in state.get("triage_summary") or []]
    if not state.get("triage_summary"):
        hm = [s for s in report.findings if s.impact in ("High", "Medium")]
        if hm:
            out += ["High/medium hits (**untriaged**: static detectors are noisy, so verify each one):", ""]
            out += [f"- [{s.impact}] `{s.check}` at `{s.contract}.{s.function}` L{s.lines[0] if s.lines else '?'}: {s.description}"
                    for s in hm]
    rest = [s for s in report.findings if s.impact not in ("High", "Medium")]
    if rest:
        by_check = Counter((s.check, s.impact) for s in rest)
        out += ["", "Low / informational / optimization hits (not sent to any LLM):", "",
                "| Check | Impact | Count |", "|---|---|---|"]
        out += [f"| {c} | {i} | {n} |" for (c, i), n in sorted(by_check.items(), key=lambda x: -x[1])]
    out.append("")
    return out
