"""LangGraph wiring.

    START → agent1 → agent2 ─┬→ agent3 (DeFi) ─┐
                             ├→ agent4 (Math) ─┼→ agent6 (Skeptic) → report → END
                             └→ agent5 (Edge) ─┘
Agents 3/4/5 run in parallel; ``raw_findings`` is merged by the operator.add
reducer, and agent6 waits for all three branches.
"""
from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from .agents import agent1_extractor, agent2_router, agent6_skeptic
from .agents.base import make_node
from .agents.hunters import HUNTERS
from .llm import StructuredLLM
from .report import render_report
from .state import AuditState


def build_graph(llm: StructuredLLM):
    g = StateGraph(AuditState)
    g.add_node("agent1", make_node("agent1", llm, agent1_extractor.run))
    g.add_node("agent2", make_node("agent2", llm, agent2_router.run))
    for h in HUNTERS:
        g.add_node(h.role, make_node(h.role, llm, h.run))
    g.add_node("agent6", make_node("agent6", llm, agent6_skeptic.run))
    g.add_node("report", lambda s: {"report_markdown": render_report(s)})

    g.add_edge(START, "agent1")
    g.add_edge("agent1", "agent2")
    for h in HUNTERS:
        g.add_edge("agent2", h.role)
    g.add_edge([h.role for h in HUNTERS], "agent6")  # fan-in barrier
    g.add_edge("agent6", "report")
    g.add_edge("report", END)
    return g.compile()


def run_audit(llm: StructuredLLM, *, target: str, source_code: str, docs: str = "") -> AuditState:
    graph = build_graph(llm)
    return graph.invoke({"target": target, "source_code": source_code, "docs": docs, "raw_findings": [], "errors": []})
