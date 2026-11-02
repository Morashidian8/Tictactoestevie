"""Phase 2: static layer, deterministic router, triage, caching, cost accounting.

The Slither tests run the real tool on the micro-benchmarks (free, offline) and
skip when slither or solc is not installed.
"""
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from syndicate.agents.agent0_triage import TriageItem, TriageOutput
from syndicate.graph import run_audit
from syndicate.llm import AnthropicLLM, BudgetExceeded, FakeLLM, RoleConfig
from syndicate.loader import load_sources
from syndicate.preprocessor.risk import build_context_map
from syndicate.preprocessor.static_runner import analyse, find_solc, slither_available
from syndicate.state import (
    FindingsOutput, InvariantsOutput, Severity, SkepticOutput, SkepticVerdict, Verdict,
)

MICRO = Path(__file__).resolve().parents[1] / "benchmarks" / "micro"
needs_slither = pytest.mark.skipif(not (slither_available() and find_solc()), reason="slither/solc not installed")


@pytest.fixture(scope="module")
def reports():
    if not (slither_available() and find_solc()):
        pytest.skip("slither/solc not installed")
    return {c: analyse(MICRO / c / "contracts") for c in ("vault-inflation", "staking-rewards", "clean-escrow")}


def scores(report):
    return {r.function: r.risk_score for r in build_context_map(report).functions}


@needs_slither
def test_slither_extracts_facts_and_findings(reports):
    vault = reports["vault-inflation"]
    assert vault.tools == ["slither"] and vault.errors == []
    deposit = next(f for f in vault.functions if f.function == "deposit")
    assert deposit.has_division and "asset.transferFrom" in deposit.external_calls
    assert {"shares", "totalShares"} <= set(deposit.writes)
    assert any(s.impact == "Medium" for s in vault.findings)  # noisy hits for triage


@needs_slither
def test_risk_scoring_reaches_every_known_bug_site(reports):
    # Every function holding a judged high/medium bug must land in the focus band (>= 5).
    for case in ("vault-inflation", "staking-rewards"):
        key = json.loads(json.dumps(__import__("yaml").safe_load((MICRO / case / "judged_report.yaml").read_text())))
        s = scores(reports[case])
        for f in key["findings"]:
            assert s[f["function"]] >= 5, (case, f["function"], s)


@needs_slither
def test_risk_scoring_propagation_and_privilege(reports):
    s = scores(reports["staking-rewards"])
    assert s["stake"] >= 7
    assert s["rewardPerToken"] == 6          # view, but called by fund-moving functions
    assert s["setRewardRate"] == 5           # owner-only, but feeds rewardRate to fund movers
    assert max(scores(reports["clean-escrow"]).values()) < 7


# --------------------------------------------------------------------------- #
# Graph with static layer (FakeLLM)
# --------------------------------------------------------------------------- #
def confirm_all(system, user):
    ids = [f["id"] for f in json.loads(user.split("<candidate_findings>\n")[1].split("\n</candidate_findings>")[0])]
    return SkepticOutput(verdicts=[
        SkepticVerdict(finding_id=i, verdict=Verdict.CONFIRMED, adjusted_severity=None, duplicate_of=None, reasoning="ok")
        for i in ids])


def triage_keep_first(system, user):
    ids = [line.split()[1] for line in user.splitlines() if line.startswith("- S-")]
    return TriageOutput(items=[
        TriageItem(static_id=i, keep=(n == 0), severity=Severity.MEDIUM, title=f"t{i}", description="d",
                   exploit_scenario="e", recommendation="r", confidence=0.6, reasoning="checked")
        for n, i in enumerate(ids)])


def fake():
    empty = lambda s, u: FindingsOutput(findings=[])  # noqa: E731
    return FakeLLM({
        "agent0_triage": triage_keep_first,
        "agent1_extractor": lambda s, u: InvariantsOutput(invariants=[]),
        "agent3_defi": empty, "agent4_math": empty, "agent5_edge": empty,
        "agent6_skeptic": confirm_all,
    })


def audit(llm, case, **opts):
    path = MICRO / case / "contracts"
    return run_audit(llm, target=case, source_code=load_sources(path), target_path=str(path), options=opts)


@needs_slither
def test_static_router_replaces_llm_router_and_triage_filters():
    llm = fake()
    state = audit(llm, "vault-inflation", verify=False)
    roles = [r for r, _ in llm.calls]
    assert "agent2_router" not in roles and state["router_mode"] == "static"
    assert roles.count("agent0_triage") == 1
    static_ids = [f.id for f in state["raw_findings"] if f.id.startswith("S-")]
    assert static_ids == ["S-01"]                       # triage kept one of the medium hits
    assert state["final_findings"][0].source_agent == "slither+agent0_triage"
    # every LLM call carried the shared, cacheable code context
    assert all(c and "contract SimpleVault" in c for c in llm.contexts)
    # hunters were told the deterministic risk scores
    hunter_prompt = next(u for r, u in llm.calls if r == "agent4_math")
    assert "[9/10] SimpleVault.deposit" in hunter_prompt
    assert "Static analysis (slither)" in state["report_markdown"]


@needs_slither
def test_triage_costs_nothing_without_medium_hits():
    llm = fake()
    audit(llm, "staking-rewards")
    assert "agent0_triage" not in [r for r, _ in llm.calls]


def test_static_disabled_falls_back_to_llm_router():
    llm = fake()
    from syndicate.state import ContextMapOutput
    llm.responders["agent2_router"] = lambda s, u: ContextMapOutput(summary="x", functions=[], trust_boundaries=[])
    state = audit(llm, "clean-escrow", static=False)
    assert state["router_mode"] == "llm"
    assert "agent2_router" in [r for r, _ in llm.calls]


# --------------------------------------------------------------------------- #
# LLM layer: caching blocks, cost accounting, budget
# --------------------------------------------------------------------------- #
def mock_client(usage, model="claude-opus-5-5"):
    client = MagicMock()
    msg = MagicMock(stop_reason="end_turn", parsed_output=InvariantsOutput(invariants=[]), model=model, usage=usage)
    client.beta.messages.stream.return_value.__enter__.return_value.get_final_message.return_value = msg
    return client


def test_shared_context_is_sent_first_with_cache_breakpoint():
    client = mock_client(SimpleNamespace(input_tokens=10, output_tokens=10))
    llm = AnthropicLLM({"default": RoleConfig(model="claude-opus-5-5")}, client=client)
    llm.structured(role="r", system="ROLE", user="u", schema=InvariantsOutput, shared_context="CODE")
    system = client.beta.messages.stream.call_args.kwargs["system"]
    assert system[0] == {"type": "text", "text": "CODE", "cache_control": {"type": "ephemeral"}}
    assert system[1] == {"type": "text", "text": "ROLE"}


def test_cost_accounting_and_budget():
    usage = SimpleNamespace(input_tokens=1_000_000, output_tokens=100_000,
                            cache_read_input_tokens=1_000_000, cache_creation_input_tokens=0)
    llm = AnthropicLLM({"default": RoleConfig(model="claude-opus-5-5")}, client=mock_client(usage), budget_usd=5.0)
    llm.structured(role="r", system="s", user="u", schema=InvariantsOutput)
    # $4 input + $2 output + $0.40 cache read
    assert llm.spent_usd == pytest.approx(6.40)
    assert llm.usage["r"].cache_read_tokens == 1_000_000
    with pytest.raises(BudgetExceeded):
        llm.structured(role="r", system="s", user="u", schema=InvariantsOutput)
