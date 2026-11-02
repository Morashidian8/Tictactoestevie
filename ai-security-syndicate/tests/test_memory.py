from pathlib import Path

from syndicate.agents.agent7_verifier import Verification, VerifyStatus
from syndicate.agents.base import render_memory
from syndicate.cli import main
from syndicate.graph import learn_node, memory_node
from syndicate.loader import load_sources
from syndicate.memory.episodic_memory import Lesson, LessonStore, lessons_from_verifications
from syndicate.memory.knowledge import load_patterns, render_checklist, retrieve

MICRO = Path(__file__).resolve().parents[1] / "benchmarks" / "micro"


def ids(case):
    return {p.id for p in retrieve(load_sources(MICRO / case / "contracts"), load_patterns())}


def test_knowledge_retrieval_matches_the_right_classes():
    assert {"KB-VAULT-INFLATION", "KB-FEE-ON-TRANSFER"} <= ids("vault-inflation")
    assert {"KB-PRECISION-SCALING", "KB-REWARD-CHECKPOINT"} <= ids("staking-rewards")
    assert "KB-VAULT-INFLATION" not in ids("staking-rewards")
    assert "KB-ORACLE" not in ids("clean-escrow")


def test_checklist_is_role_scoped():
    kb = retrieve(load_sources(MICRO / "staking-rewards" / "contracts"), load_patterns())
    math = render_checklist(kb, "agent4_math")
    assert "KB-PRECISION-SCALING" in math and "KB-REWARD-CHECKPOINT" not in math
    assert render_checklist(kb, "agent6_skeptic") == ""


def test_lesson_store_dedup_relevance_and_remove(tmp_path):
    store = LessonStore(tmp_path / "l.jsonl")
    assert store.add(Lesson(agent="agent4_math", text="check 1e18 scaling", keywords=["rewardpertoken"]))
    assert not store.add(Lesson(agent="agent4_math", text="check 1e18 scaling", keywords=["rewardpertoken"]))
    store.add(Lesson(agent="all", text="general"))
    store.add(Lesson(agent="agent3_defi", text="other role"))
    (tmp_path / "l.jsonl").open("a").write("not json\n")            # hand-edit damage is ignored
    code = "function rewardPerToken() public view"
    assert [x.text for x in store.relevant("agent4_math", code)] == ["check 1e18 scaling", "general"]
    assert [x.text for x in store.relevant("agent4_math", "contract Escrow {}")] == ["general"]
    assert store.remove(store.all()[0].id) and len(store.all()) == 2


def test_memory_reaches_hunter_prompt_and_learn_records(tmp_path):
    path = tmp_path / "l.jsonl"
    LessonStore(path).add(Lesson(agent="agent4_math", text="LESSON-X"))
    state = {"source_code": load_sources(MICRO / "staking-rewards" / "contracts"),
             "options": {"memory": True, "lessons_path": str(path), "learn": True}}
    state.update(memory_node(state))
    block = render_memory(state, "agent4_math")
    assert "<memory>" in block and "LESSON-X" in block and "KB-PRECISION-SCALING" in block

    v = Verification(finding_id="A", status=VerifyStatus.COMPILE_FAILED, log="Error (7576): Undeclared identifier.")
    assert lessons_from_verifications([v])[0].agent == "agent7_verifier"
    out = learn_node({**state, "verifications": [v]})
    assert len(out["learned"]) == 1 and len(LessonStore(path).all()) == 2
    assert learn_node({**state, "verifications": [v]})["learned"] == []   # no duplicates


def test_lesson_cli(tmp_path, capsys):
    f = str(tmp_path / "l.jsonl")
    main(["lesson", "add", "mock tokens need decimals()", "--agent", "agent7_verifier", "--lessons", f])
    main(["lesson", "list", "--lessons", f])
    assert "mock tokens need decimals()" in capsys.readouterr().out


def test_fail_on_gate():
    from syndicate.cli import gate
    from syndicate.state import Finding, Severity

    hi = Finding(id="A", title="t", severity=Severity.HIGH, category="c", location="l", description="d",
                 exploit_scenario="e", recommendation="r", violated_invariants=[], confidence=0.5)
    v = Verification(finding_id="A", status=VerifyStatus.VERIFIED)
    assert gate("none", {"final_findings": [hi]}) == 0
    assert gate("high", {"final_findings": [hi]}) == 2
    assert gate("verified", {"final_findings": [hi], "verifications": []}) == 0
    assert gate("verified", {"final_findings": [hi], "verifications": [v]}) == 2
