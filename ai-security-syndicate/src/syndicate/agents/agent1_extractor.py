"""Agent 1 — Spec & Invariant Extractor."""
from __future__ import annotations

from ..llm import StructuredLLM
from ..state import AuditState, InvariantsOutput
from .base import shared_context

ROLE = "agent1_extractor"

SYSTEM = """Role: Specification & Invariant Extractor.
From the documentation, NatSpec comments and the code itself, derive the system
invariants a correct implementation must preserve. Cover: conservation of value
(balances vs totals), access control, state-machine ordering, and economic
properties (share price monotonicity, solvency, fee bounds).
Each invariant needs a formal expression a Foundry invariant test could assert.
Mark invariants not stated in the docs as source="inferred from code".
Use ids INV-01, INV-02, ..."""


def run(llm: StructuredLLM, state: AuditState) -> dict:
    user = f"<documentation>\n{state.get('docs') or '(no documentation supplied)'}\n</documentation>"
    out = llm.structured(role=ROLE, system=SYSTEM, user=user, schema=InvariantsOutput, shared_context=shared_context(state))
    return {"invariants": out.invariants}
