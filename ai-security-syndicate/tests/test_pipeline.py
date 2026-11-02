from pathlib import Path
from unittest.mock import MagicMock

import pytest

from syndicate.agents.agent6_skeptic import apply_verdicts
from syndicate.graph import run_audit
from syndicate.llm import AnthropicLLM, FakeLLM, LLMError, RoleConfig
from syndicate.loader import load_sources
from syndicate.preprocessor.ast_parser import extract_functions
from syndicate.state import (
    ContextMapOutput, Finding, FindingsOutput, FunctionRisk, Invariant, InvariantsOutput,
    Severity, SkepticOutput, SkepticVerdict, Verdict,
)

EXAMPLE = Path(__file__).resolve().parents[1] / "examples" / "VulnerableVault.sol"


def finding(fid, sev=Severity.HIGH, conf=0.8):
    return Finding(
        id=fid, title=f"t{fid}", severity=sev, category="c", location="Vault.withdraw",
        description="d", exploit_scenario="e", recommendation="r", violated_invariants=["INV-01"], confidence=conf,
    )


def verdict(fid, v, sev=None, dup=None):
    return SkepticVerdict(finding_id=fid, verdict=v, adjusted_severity=sev, duplicate_of=dup, reasoning="checked")


def fake_llm(skeptic_seen: list):
    def skeptic(system, user):
        skeptic_seen.append(user)
        return SkepticOutput(verdicts=[
            verdict("A3-01", Verdict.CONFIRMED),
            verdict("A4-01", Verdict.DOWNGRADED, Severity.LOW),
            verdict("A5-01", Verdict.REJECTED),
            verdict("A5-02", Verdict.DUPLICATE, dup="A3-01"),
        ])

    return FakeLLM({
        "agent1_extractor": lambda s, u: InvariantsOutput(invariants=[Invariant(
            id="INV-01", kind="mathematical", statement="shares redeemable", formal="x", source="NatSpec")]),
        "agent2_router": lambda s, u: ContextMapOutput(summary="vault", trust_boundaries=["owner"], functions=[
            FunctionRisk(contract="VulnerableVault", function="withdraw", visibility="external", risk_score=10,
                         rationale="moves funds", external_calls=["asset.transfer"], state_written=["shares"])]),
        "agent3_defi": lambda s, u: FindingsOutput(findings=[finding("A3-01", Severity.CRITICAL)]),
        "agent4_math": lambda s, u: FindingsOutput(findings=[finding("A4-01", Severity.MEDIUM)]),
        "agent5_edge": lambda s, u: FindingsOutput(findings=[finding("A5-01"), finding("A5-02")]),
        "agent6_skeptic": skeptic,
    })


def test_full_graph_fan_out_fan_in_and_filter():
    seen = []
    llm = fake_llm(seen)
    state = run_audit(llm, target="Vault", source_code=load_sources(EXAMPLE))

    # all three hunters' findings merged before the skeptic ran exactly once
    assert len(seen) == 1
    assert {f.id for f in state["raw_findings"]} == {"A3-01", "A4-01", "A5-01", "A5-02"}
    assert [f.source_agent for f in state["raw_findings"] if f.id == "A4-01"] == ["agent4_math"]

    final = state["final_findings"]
    assert [f.id for f in final] == ["A3-01", "A4-01"]
    assert final[1].severity is Severity.LOW
    report = state["report_markdown"]
    assert "[CRITICAL-01]" in report and "Filtered out by the Skeptic" in report
    assert state["errors"] == []
    # downstream agents received upstream context
    hunter_prompt = next(u for r, u in llm.calls if r == "agent3_defi")
    assert "INV-01" in hunter_prompt and "[10/10] VulnerableVault.withdraw" in hunter_prompt


def test_agent_failure_is_recorded_not_fatal():
    llm = fake_llm([])

    def boom(s, u):
        raise LLMError("refused")

    llm.responders["agent4_math"] = boom
    state = run_audit(llm, target="Vault", source_code="contract A {}")
    assert state["errors"] == ["agent4_math: refused"]
    assert "Pipeline errors" in state["report_markdown"]


def test_unverdicted_findings_are_dropped():
    kept = apply_verdicts([finding("X"), finding("Y")], [verdict("X", Verdict.CONFIRMED)])
    assert [f.id for f in kept] == ["X"]


def test_ast_inventory():
    fns = {(f.contract, f.name): f for f in extract_functions(EXAMPLE.read_text())}
    assert fns[("VulnerableVault", "sweep")].modifiers == ["onlyOwner"]
    assert fns[("VulnerableVault", "deposit")].visibility == "external"
    assert ("IERC20", "transfer") in fns
    assert ("VulnerableVault", "constructor") in fns


def test_anthropic_llm_request_shape_and_refusal():
    client = MagicMock()
    def respond(msg):
        client.beta.messages.stream.return_value.__enter__.return_value.get_final_message.return_value = msg

    respond(MagicMock(stop_reason="end_turn", parsed_output=InvariantsOutput(invariants=[])))
    llm = AnthropicLLM({"default": RoleConfig(model="claude-opus-5-5", effort="max")}, client=client)
    llm.structured(role="x", system="s", user="u", schema=InvariantsOutput)
    kw = client.beta.messages.stream.call_args.kwargs
    assert kw["model"] == "claude-opus-5-5" and kw["output_format"] is InvariantsOutput
    assert kw["output_config"] == {"effort": "max"} and kw["fallbacks"] == "default"

    respond(MagicMock(stop_reason="refusal", stop_details=None))
    with pytest.raises(LLMError, match="refused"):
        llm.structured(role="x", system="s", user="u", schema=InvariantsOutput)
