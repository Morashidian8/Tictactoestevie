"""Agent 2 — Context Architect & Attention Router.

LLM fallback only. When Slither runs, ``preprocessor.risk`` builds the context
map deterministically for free and this agent is never called (see graph.py).
"""
from __future__ import annotations

from ..llm import StructuredLLM
from ..preprocessor.ast_parser import extract_functions
from ..state import AuditState, ContextMapOutput
from .base import shared_context, render_invariants

ROLE = "agent2_router"

SYSTEM = """Role: Context Architect & Attention Router.
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
        f"<invariants>\n{render_invariants(state.get('invariants'))}\n</invariants>"
    )
    out = llm.structured(role=ROLE, system=SYSTEM, user=user, schema=ContextMapOutput, shared_context=shared_context(state))
    return {"context_map": out}
