"""Agent 2 — Context Architect & Attention Router.

Phase 1 seeds the LLM with a deterministic function inventory from
``preprocessor.ast_parser``; Phase 2 will add Slither call graphs.
"""
from __future__ import annotations

from ..llm import StructuredLLM
from ..preprocessor.ast_parser import extract_functions
from ..state import AuditState, ContextMapOutput
from .base import SCOPE_GUARD, code_block, render_invariants

ROLE = "agent2_router"

SYSTEM = SCOPE_GUARD + """

Role: Context Architect & Attention Router.
Map the architecture: contracts, inheritance, call graph, and how value (ETH,
tokens, shares) flows in and out. For EVERY externally reachable function in the
inventory assign a risk score 1-10:
 9-10 moves funds or mints/burns with external calls or price inputs
 6-8  writes accounting state or depends on external contracts
 3-5  privileged admin setters, view functions used by others for pricing
 1-2  pure helpers / trivial getters
The downstream hunters spend most of their budget on high scores, so be calibrated."""


def run(llm: StructuredLLM, state: AuditState) -> dict:
    inventory = extract_functions(state["source_code"])
    inv_text = "\n".join(f"- {f.contract}.{f.name}({f.params}) {f.visibility} {' '.join(f.modifiers)}" for f in inventory)
    user = (
        f"<function_inventory>\n{inv_text or '(parser found none)'}\n</function_inventory>\n\n"
        f"<invariants>\n{render_invariants(state.get('invariants'))}\n</invariants>\n\n{code_block(state)}"
    )
    out = llm.structured(role=ROLE, system=SYSTEM, user=user, schema=ContextMapOutput)
    return {"context_map": out}
