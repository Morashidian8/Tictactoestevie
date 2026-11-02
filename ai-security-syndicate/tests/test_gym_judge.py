from pathlib import Path

import pytest

from syndicate.gym.cases import discover, load_case
from syndicate.gym.judge import (
    ExpectedMatch, HeuristicJudge, JudgeOutput, LLMJudge, MatchQuality, resolve, score_stage, scorable,
)
from syndicate.llm import FakeLLM
from syndicate.state import Finding, Severity

MICRO = Path(__file__).resolve().parents[1] / "benchmarks" / "micro"


def f(fid, title, location, sev=Severity.HIGH, desc=""):
    return Finding(id=fid, title=title, severity=sev, category="c", location=location, description=desc,
                   exploit_scenario="e", recommendation="r", violated_invariants=[], confidence=0.7)


def test_cases_load_and_answer_key_stays_out_of_sources():
    cases = {c.case_id: c for c in discover(MICRO)}
    assert set(cases) == {"vault-inflation", "staking-rewards", "clean-escrow"}
    assert [e.id for e in cases["vault-inflation"].expected.findings] == ["H-01", "M-01"]
    assert cases["clean-escrow"].expected.findings == []
    for c in cases.values():
        assert "root_cause" not in c.source_code and "judged_report" not in c.source_code
        assert "H-01" not in c.source_code


def test_discover_filters_and_rejects_unknown():
    assert [c.case_id for c in discover(MICRO, only=["clean-escrow"])] == ["clean-escrow"]
    assert len(discover(MICRO, limit=2)) == 2
    with pytest.raises(ValueError, match="unknown case"):
        discover(MICRO, only=["nope"])


def test_load_case_requires_answer_key(tmp_path):
    (tmp_path / "contracts").mkdir()
    (tmp_path / "contracts" / "A.sol").write_text("contract A {}")
    with pytest.raises(FileNotFoundError, match="judged_report.yaml"):
        load_case(tmp_path)


def test_heuristic_judge_full_partial_none():
    exp = load_case(MICRO / "vault-inflation").expected.findings
    findings = [
        f("A3-01", "First depositor inflation attack", "SimpleVault.deposit"),          # H-01 full
        f("A5-01", "Fee-on-transfer tokens break accounting", "SimpleVault.withdraw"),  # M-01 partial: wrong fn
    ]
    m = {x.expected_id: x for x in HeuristicJudge().match(exp, findings)}
    assert (m["H-01"].agent_finding_id, m["H-01"].quality) == ("A3-01", MatchQuality.FULL)
    assert (m["M-01"].agent_finding_id, m["M-01"].quality) == ("A5-01", MatchQuality.PARTIAL)
    m = HeuristicJudge().match(exp, [f("X", "Missing event", "SimpleVault.deposit")])
    assert all(x.quality is MatchQuality.NONE for x in m)


def test_resolve_enforces_one_to_one_and_drops_unknown_ids():
    exp = load_case(MICRO / "vault-inflation").expected.findings
    claims = [
        ExpectedMatch(expected_id="H-01", agent_finding_id="A3-01", quality=MatchQuality.PARTIAL, reasoning=""),
        ExpectedMatch(expected_id="M-01", agent_finding_id="A3-01", quality=MatchQuality.FULL, reasoning=""),
    ]
    r = {x.expected_id: x for x in resolve(claims, exp, {"A3-01"})}
    assert r["M-01"].agent_finding_id == "A3-01"            # full match wins the contested submission
    assert r["H-01"].quality is MatchQuality.NONE
    r = resolve([ExpectedMatch(expected_id="H-01", agent_finding_id="GHOST", quality=MatchQuality.FULL, reasoning="")],
                exp, {"A3-01"})
    assert all(x.agent_finding_id is None for x in r) and len(r) == 2   # missing verdicts filled with none


def test_scoring_raw_vs_final_and_low_severity_ignored():
    exp_n = 2
    matches = [
        ExpectedMatch(expected_id="H-01", agent_finding_id="A", quality=MatchQuality.FULL, reasoning=""),
        ExpectedMatch(expected_id="M-01", agent_finding_id="B", quality=MatchQuality.PARTIAL, reasoning=""),
    ]
    raw = [f("A", "", "x"), f("B", "", "x"), f("C", "", "x"), f("L", "", "x", sev=Severity.LOW)]
    raw_s = scorable(raw, Severity.MEDIUM)
    assert [x.id for x in raw_s] == ["A", "B", "C"]
    s = score_stage(raw_s, matches, exp_n, partial_credit=0.5)
    assert (s.recall, s.precision, s.false_positive_ids) == (0.75, 0.5, ["C"])
    final = score_stage([raw[0]], matches, exp_n, partial_credit=0.5)   # Skeptic kept only A
    assert (final.recall, final.precision) == (0.5, 1.0)
    clean = score_stage([f("Z", "", "x")], [], 0, 0.5)
    assert clean.recall is None and clean.precision == 0.0


def test_llm_judge_skips_call_when_nothing_to_compare():
    exp = load_case(MICRO / "vault-inflation").expected.findings
    llm = FakeLLM({"gym_judge": lambda s, u: JudgeOutput(matches=[])})
    assert all(m.quality is MatchQuality.NONE for m in LLMJudge(llm).match(exp, []))
    assert LLMJudge(llm).match([], [f("A", "t", "x")]) == []
    assert llm.calls == []
    LLMJudge(llm).match(exp, [f("A", "t", "SimpleVault.deposit")])
    assert len(llm.calls) == 1 and "root_cause" not in llm.calls[0][1].split("<submissions>")[1]
