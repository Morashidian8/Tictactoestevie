"""Phase 3: Agent 7 against real forge, on our own deliberately vulnerable micro-benchmark.

The model is faked; forge, solc and the sandbox logic are real. Skips when
forge/solc are missing.
"""
import shutil
from pathlib import Path

import pytest

from syndicate.agents.agent7_verifier import FilePatch, VerificationAttempt, VerifyStatus, verify_finding
from syndicate.graph import run_audit
from syndicate.llm import FakeLLM
from syndicate.loader import load_sources
from syndicate.preprocessor.static_runner import find_solc
from syndicate.sandbox.foundry_runner import FoundryRunner, LocalBackend, screen_source
from syndicate.state import Finding, FindingsOutput, InvariantsOutput, Severity, SkepticOutput, SkepticVerdict, Verdict

CASE = Path(__file__).resolve().parents[1] / "benchmarks" / "micro" / "staking-rewards" / "contracts"
FORGE = shutil.which("forge")
pytestmark = pytest.mark.skipif(not (FORGE and find_solc()), reason="forge/solc not installed")

ORIGINAL = (CASE / "StakingRewards.sol").read_text()
FIXED = (ORIGINAL
         .replace("((block.timestamp - lastUpdate) * rewardRate) / totalStaked",
                  "((block.timestamp - lastUpdate) * rewardRate * 1e18) / totalStaked")
         .replace("(rewardPerToken() - userRewardPerTokenPaid[account]) + rewards[account]",
                  "(rewardPerToken() - userRewardPerTokenPaid[account]) / 1e18 + rewards[account]"))
assert FIXED != ORIGINAL

POC = """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "forge-std/Test.sol";
import "../src/StakingRewards.sol";

contract MockToken {
    mapping(address => uint256) public balanceOf;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function transfer(address to, uint256 a) external returns (bool) { balanceOf[msg.sender] -= a; balanceOf[to] += a; return true; }
    function transferFrom(address f, address to, uint256 a) external returns (bool) { balanceOf[f] -= a; balanceOf[to] += a; return true; }
}

contract VerifyTest is Test {
    function test_rewardsTruncateToZero() public {
        MockToken stakeTok = new MockToken();
        MockToken rewardTok = new MockToken();
        StakingRewards pool = new StakingRewards(IERC20(address(stakeTok)), IERC20(address(rewardTok)), 1e15);
        stakeTok.mint(address(this), 1000e18);
        pool.stake(1000e18);
        vm.warp(block.timestamp + 1 days);
        // A full day of emissions at 0.001 token/s should be ~86.4 tokens, but the
        // unscaled division truncates the per-token increment to zero.
        assertEq(pool.earned(address(this)), 0, "staker earned nothing");
    }
}
"""

FINDING = Finding(id="A4-01", title="rewardPerToken truncates", severity=Severity.HIGH, category="precision",
                  location="StakingRewards.rewardPerToken", description="d", exploit_scenario="e",
                  recommendation="scale by 1e18", violated_invariants=[], confidence=0.9, source_agent="agent4_math")


@pytest.fixture(scope="module")
def runner():
    return FoundryRunner.from_path(CASE, find_solc(), backend=LocalBackend(FORGE))


def attempt(test=POC, patch=FIXED):
    return VerificationAttempt(test_source=test, what_it_proves="rewards round to zero",
                               patch=[FilePatch(path="StakingRewards.sol", content=patch)] if patch else [])


def llm_returning(*attempts):
    queue = list(attempts)
    return FakeLLM({"agent7_verifier": lambda s, u: queue.pop(0)})


def state():
    return {"source_code": ORIGINAL}


def test_verified_when_poc_passes_on_original_and_fails_after_patch(runner):
    v = verify_finding(llm_returning(attempt()), state(), runner, FINDING)
    assert v.status is VerifyStatus.VERIFIED, v.log
    assert "+        return rewardPerTokenStored + ((block.timestamp - lastUpdate) * rewardRate * 1e18)" in v.patch_diff
    assert v.patch_diff.startswith("--- a/StakingRewards.sol")


def test_compile_error_self_heals_with_compiler_feedback(runner):
    broken = attempt(test=POC.replace("pool.stake(1000e18);", "pool.stake(1000e18)"))  # missing semicolon
    llm = llm_returning(broken, attempt())
    v = verify_finding(llm, state(), runner, FINDING)
    assert v.status is VerifyStatus.VERIFIED and v.attempts == 2
    retry_prompt = llm.calls[1][1]
    assert "<previous_attempt_failed>" in retry_prompt and "compile_error" in retry_prompt


def test_gives_up_after_three_retries(runner):
    broken = attempt(test="pragma solidity ^0.8.20; contract X { oops }")
    v = verify_finding(llm_returning(*[broken] * 4), state(), runner, FINDING)
    assert v.status is VerifyStatus.COMPILE_FAILED and v.attempts == 4


def test_failing_poc_is_not_retried(runner):
    wrong = attempt(test=POC.replace('assertEq(pool.earned(address(this)), 0, "staker earned nothing");',
                                     'assertGt(pool.earned(address(this)), 0);'))
    llm = llm_returning(wrong, attempt())
    v = verify_finding(llm, state(), runner, FINDING)
    assert v.status is VerifyStatus.NOT_REPRODUCED and len(llm.calls) == 1


def test_tautological_test_is_not_verified(runner):
    tautology = POC.replace('assertEq(pool.earned(address(this)), 0, "staker earned nothing");', "assertTrue(true);")
    v = verify_finding(llm_returning(attempt(test=tautology)), state(), runner, FINDING)
    assert v.status is VerifyStatus.FIX_UNPROVEN


def test_blocked_cheatcodes_never_reach_forge():
    assert screen_source("vm.ffi(cmd);")
    assert screen_source("string memory k = vm.envString('PRIVATE_KEY');")
    assert screen_source("vm.createSelectFork('mainnet');")
    assert screen_source("vm.writeFile('x', 'y');")
    assert screen_source(POC) is None


def test_agent7_in_full_graph():
    def skeptic(s, u):
        return SkepticOutput(verdicts=[SkepticVerdict(finding_id="A4-01", verdict=Verdict.CONFIRMED,
                                                      adjusted_severity=None, duplicate_of=None, reasoning="ok")])
    empty = lambda s, u: FindingsOutput(findings=[])  # noqa: E731
    llm = FakeLLM({
        "agent1_extractor": lambda s, u: InvariantsOutput(invariants=[]),
        "agent3_defi": empty, "agent5_edge": empty,
        "agent4_math": lambda s, u: FindingsOutput(findings=[FINDING]),
        "agent6_skeptic": skeptic,
        "agent7_verifier": lambda s, u: attempt(),
    })
    st = run_audit(llm, target="staking", source_code=load_sources(CASE), target_path=str(CASE),
                   options={"sandbox": "local"})
    assert [v.status for v in st["verifications"]] == [VerifyStatus.VERIFIED]
    md = st["report_markdown"]
    assert "✅ verified" in md and "```diff" in md and "without Docker isolation" in md
