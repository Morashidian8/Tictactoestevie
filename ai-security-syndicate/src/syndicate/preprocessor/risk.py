"""Deterministic risk scoring: the no-LLM version of Agent 2.

Each externally reachable function gets a 1-10 score from facts Slither
extracted. Every point is listed in the rationale, so a score can be audited
(and tuned against the Gym) instead of trusted.
"""
from __future__ import annotations

import re

from ..state import ContextMapOutput, FunctionRisk
from .static_runner import VALUE_WORDS, StaticReport

PRIVILEGED = re.compile(r"owner|admin|auth|role|governance|governor|guardian|keeper|operator", re.I)
TOKEN_MOVES = re.compile(r"\.(transfer|transferFrom|safeTransfer|safeTransferFrom|mint|burn|withdraw|deposit|redeem|swap)\b", re.I)


def score_function(f, detector_hits: int) -> tuple[int, list[str]]:
    if f.view:
        score, why = 1, ["view/pure"]
        if f.has_division:
            # Views that do pricing math feed other contracts and integrators.
            score, why = 3, ["view with division (pricing/accounting math)"]
        return score, why

    score, why = 2, ["state-changing entry point"]
    if f.sends_eth:
        score += 3; why.append("+3 sends ETH")
    if any(TOKEN_MOVES.search(c) for c in f.external_calls):
        score += 3; why.append("+3 moves tokens")
    elif f.external_calls:
        score += 2; why.append("+2 external calls")
    value_writes = [w for w in f.writes if any(k in w.lower() for k in VALUE_WORDS)]
    if value_writes:
        score += 1; why.append(f"+1 writes accounting state ({', '.join(value_writes[:3])})")
    if f.has_division:
        score += 1; why.append("+1 division (rounding)")
    if f.has_unchecked:
        score += 1; why.append("+1 unchecked block")
    if f.payable:
        score += 1; why.append("+1 payable")
    if detector_hits:
        score += 2; why.append(f"+2 {detector_hits} medium/high detector hit(s)")
    guards = [m for m in f.modifiers if PRIVILEGED.search(m)]
    if guards:
        score -= 3; why.append(f"-3 privileged ({', '.join(guards)})")
    return max(1, min(10, score)), why


HIGH = 7


def propagate(report: StaticReport, scored: dict) -> None:
    """Lift functions whose bugs would surface through a high-risk function.

    Local facts alone undersell two common bug sites:
    * pricing/accounting helpers (often public views) called by fund-moving functions;
    * privileged setters of parameters that fund-moving functions read.
    Single pass over the initial scores, so the order of functions doesn't matter.
    """
    initial = {k: v[0] for k, v in scored.items()}
    by_contract: dict[str, list] = {}
    for f in report.functions:
        by_contract.setdefault(f.contract, []).append(f)

    for contract, funcs in by_contract.items():
        hot = [f for f in funcs if initial[(contract, f.function)] >= HIGH]
        if not hot:
            continue
        hot_callees = {c for f in hot for c in f.callees}
        hot_reads = {r for f in hot for r in f.reads}
        for f in funcs:
            key = (contract, f.function)
            score, why = scored[key]
            if f.function in hot_callees and score < HIGH - 1:
                scored[key] = [HIGH - 1, why + [f"=> {HIGH - 1}: called by high-risk functions"]]
            elif not f.view and score < 5 and (set(f.writes) & hot_reads):
                feeds = sorted(set(f.writes) & hot_reads)
                scored[key] = [5, why + [f"=> 5: writes {', '.join(feeds)} read by high-risk functions"]]


def build_context_map(report: StaticReport) -> ContextMapOutput:
    hits: dict[tuple[str, str], int] = {}
    for s in report.findings:
        if s.impact in ("High", "Medium") and s.function:
            hits[(s.contract, s.function)] = hits.get((s.contract, s.function), 0) + 1

    scored = {}
    for f in report.functions:
        scored[(f.contract, f.function)] = list(score_function(f, hits.get((f.contract, f.function), 0)))
    propagate(report, scored)

    rows = []
    for f in report.functions:
        score, why = scored[(f.contract, f.function)]
        rows.append(FunctionRisk(
            contract=f.contract, function=f.function, visibility=f.visibility, risk_score=score,
            rationale="; ".join(why), external_calls=f.external_calls, state_written=f.writes,
        ))
    rows.sort(key=lambda r: (-r.risk_score, r.contract, r.function))

    contracts = sorted({f.contract for f in report.functions})
    movers = [f"{r.contract}.{r.function}" for r in rows if r.risk_score >= 7]
    privileged = sorted({m for f in report.functions for m in f.modifiers if PRIVILEGED.search(m)})
    externals = sorted({c.split(".")[0] for f in report.functions for c in f.external_calls})
    summary = (
        f"{len(contracts)} contract(s) ({', '.join(contracts)}), {len(rows)} entry points. "
        f"High-risk (>=7): {', '.join(movers) or 'none'}."
    )
    boundaries = [f"privileged modifier: {m}" for m in privileged] + [f"external dependency: {e}" for e in externals]
    return ContextMapOutput(summary=summary, functions=rows, trust_boundaries=boundaries)
