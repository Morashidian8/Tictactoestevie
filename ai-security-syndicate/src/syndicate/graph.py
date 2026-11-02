"""LangGraph wiring.

    START → static (Slither/Aderyn, free) → memory (checklists + lessons, free) → A1 invariants → A2 router ─┬→ A3 DeFi ─────┐
                                                                      ├→ A4 Math ─────┤
                                                                      ├→ A5 Edge ─────┼→ A6 Skeptic ┐
                                                                      └→ A0 triage ───┘  (cheap model, static hits)
    A6 Skeptic → A7 Verifier (Foundry PoC on original + patched code, sandboxed) → learn → report

* A2 is deterministic (``preprocessor.risk``) whenever static analysis
  succeeded, and falls back to the LLM router otherwise. ``options.router="llm"``
  forces the LLM router.
* A3/A4/A5/A0 run in parallel; ``raw_findings`` merges via the operator.add
  reducer, and A6 waits for all four branches.
"""
from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from .agents import agent0_triage, agent1_extractor, agent2_router, agent6_skeptic, agent7_verifier
from .agents.base import make_node
from .agents.hunters import HUNTERS
from .llm import StructuredLLM
from .memory.episodic_memory import LessonStore, lessons_from_verifications
from .memory.knowledge import load_patterns, retrieve
from .preprocessor.risk import build_context_map
from .preprocessor.static_runner import analyse
from .report import render_report
from .state import AuditState

DEFAULT_OPTIONS = {
    "static": True, "solc": None, "router": "auto", "focus_min_risk": 5,
    "verify": True, "sandbox": "auto", "verify_max": 5, "verify_min_severity": "medium",
    "memory": True, "lessons_path": None, "learn": False,
    "diff_base": None, "diff_ranges": None,
}
MEMORY_ROLES = [h.role for h in HUNTERS] + [agent7_verifier.ROLE]
BRANCHES = [h.role for h in HUNTERS] + [agent0_triage.ROLE]


def static_node(state: AuditState) -> dict:
    opts = state.get("options") or {}
    path = state.get("target_path")
    if not opts.get("static", True) or not path:
        return {}
    try:
        report = analyse(path, opts.get("solc"))
    except Exception as e:  # static analysis must never take the audit down
        return {"errors": [f"static: {type(e).__name__}: {e}"]}
    errors = [f"static: {e}" for e in report.errors]
    if opts.get("diff_base"):
        from pathlib import Path

        from .preprocessor.git_diff import GitError, storage_layout_diff
        try:
            report.findings.extend(storage_layout_diff(Path(path), opts["diff_base"], opts.get("solc")))
        except (GitError, OSError) as e:
            errors.append(f"layout-diff: {e}")
    return {"static_report": report, "errors": errors}


def memory_node(state: AuditState) -> dict:
    """Free, deterministic retrieval: knowledge-base checklists + lessons per role."""
    opts = state.get("options") or {}
    if not opts.get("memory", True):
        return {}
    code = state.get("source_code", "")
    try:
        knowledge = retrieve(code, load_patterns())
        store = LessonStore(opts["lessons_path"]) if opts.get("lessons_path") else LessonStore()
        lessons = {r: store.relevant(r, code) for r in MEMORY_ROLES}
    except (OSError, ValueError) as e:
        return {"errors": [f"memory: {e}"]}
    return {"knowledge": knowledge, "lessons": lessons}


def learn_node(state: AuditState) -> dict:
    """With ``learn`` on, record deterministic lessons from this run's verification outcomes."""
    opts = state.get("options") or {}
    if not opts.get("learn"):
        return {}
    store = LessonStore(opts["lessons_path"]) if opts.get("lessons_path") else LessonStore()
    added = [x.text for x in lessons_from_verifications(state.get("verifications")) if store.add(x)]
    return {"learned": added}


def router_node(llm: StructuredLLM):
    llm_router = make_node("agent2", llm, agent2_router.run)

    def node(state: AuditState) -> dict:
        report = state.get("static_report")
        mode = (state.get("options") or {}).get("router", "auto")
        if mode != "llm" and report is not None and report.ok:
            ranges = (state.get("options") or {}).get("diff_ranges")
            return {"context_map": build_context_map(report, ranges), "router_mode": "static"}
        return {**llm_router(state), "router_mode": "llm"}

    return node


def build_graph(llm: StructuredLLM):
    g = StateGraph(AuditState)
    g.add_node("static", static_node)
    g.add_node("memory", memory_node)
    g.add_node("learn", learn_node)
    g.add_node("agent1", make_node("agent1", llm, agent1_extractor.run))
    g.add_node("agent2", router_node(llm))
    for h in HUNTERS:
        g.add_node(h.role, make_node(h.role, llm, h.run))
    g.add_node(agent0_triage.ROLE, make_node(agent0_triage.ROLE, llm, agent0_triage.run))
    g.add_node("agent6", make_node("agent6", llm, agent6_skeptic.run))
    g.add_node("agent7", make_node("agent7", llm, agent7_verifier.run))
    g.add_node("report", lambda s: {"report_markdown": render_report(s)})

    g.add_edge(START, "static")
    g.add_edge("static", "memory")
    g.add_edge("memory", "agent1")
    g.add_edge("agent1", "agent2")
    for b in BRANCHES:
        g.add_edge("agent2", b)
    g.add_edge(BRANCHES, "agent6")  # fan-in barrier
    g.add_edge("agent6", "agent7")
    g.add_edge("agent7", "learn")
    g.add_edge("learn", "report")
    g.add_edge("report", END)
    return g.compile()


def run_audit(
    llm: StructuredLLM, *, target: str, source_code: str, docs: str = "",
    target_path: str | None = None, options: dict | None = None,
) -> AuditState:
    graph = build_graph(llm)
    return graph.invoke({
        "target": target, "target_path": target_path, "source_code": source_code, "docs": docs,
        "options": {**DEFAULT_OPTIONS, **(options or {})},
        "raw_findings": [], "errors": [], "triage_summary": [],
    })
