"""Common agent plumbing: prompt rendering helpers + LangGraph node wrapper."""
from __future__ import annotations

import json
from typing import Any, Callable

from ..llm import LLMError, StructuredLLM
from ..state import AuditState, ContextMapOutput, Finding, Invariant

SCOPE_GUARD = (
    "You are part of a white-hat security auditing team. You analyse code that the "
    "operator is authorised to audit, and you report defects so they can be fixed. "
    "Describe exploit paths precisely enough for a developer to reproduce them in a "
    "test, nothing more.\n\n"
    "Report only issues you can tie to a specific line of the given code. If you are "
    "unsure, lower the confidence score rather than inventing a path. "
    "An empty findings list is a valid answer."
)


def render_invariants(invs: list[Invariant] | None) -> str:
    if not invs:
        return "(none extracted)"
    return "\n".join(f"- {i.id} [{i.kind.value}] {i.statement}  ::  {i.formal}" for i in invs)


def render_context(ctx: ContextMapOutput | None, min_risk: int = 1) -> str:
    if ctx is None:
        return "(no context map)"
    rows = sorted(ctx.functions, key=lambda f: -f.risk_score)
    lines = [f"Summary: {ctx.summary}", "Trust boundaries: " + "; ".join(ctx.trust_boundaries), "Functions by risk:"]
    for f in rows:
        if f.risk_score >= min_risk:
            lines.append(
                f"- [{f.risk_score}/10] {f.contract}.{f.function} ({f.visibility}) — {f.rationale}"
                f" | calls: {', '.join(f.external_calls) or '-'} | writes: {', '.join(f.state_written) or '-'}"
            )
    return "\n".join(lines)


def render_findings(findings: list[Finding]) -> str:
    return json.dumps([f.model_dump(mode="json") for f in findings], indent=2)


def code_block(state: AuditState) -> str:
    return f"<source_code>\n{state['source_code']}\n</source_code>"


def make_node(name: str, llm: StructuredLLM, fn: Callable[[StructuredLLM, AuditState], dict[str, Any]]):
    """Wrap an agent so an LLM failure is recorded in state instead of killing the graph."""

    def node(state: AuditState) -> dict[str, Any]:
        try:
            return fn(llm, state)
        except LLMError as e:
            return {"errors": [f"{name}: {e}"]}

    node.__name__ = name
    return node
