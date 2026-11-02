"""Agent 7: Sandbox Verifier & Patch Engineer.

For each surviving finding the model writes (a) a Foundry test that passes only
while the bug exists and (b) a minimal patch. The sandbox then runs the test twice:

    original code  -> test must PASS   (the bug is real and reproducible)
    patched code   -> test must FAIL   (the patch removes it, and the test is not a tautology)

Only both together earn ``verified``. Compile errors get up to 3 self-healing
retries with the compiler output fed back. A test that compiles but fails on the
original code is *not* retried: letting the model "fix" a failing assertion
would teach it to weaken the test until it passes.
"""
from __future__ import annotations

import difflib
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

from ..llm import LLMError, StructuredLLM
from ..preprocessor.static_runner import find_solc
from ..sandbox.foundry_runner import FoundryRunner, SandboxError, make_backend
from ..state import SEVERITY_ORDER, AuditState, Finding, Severity
from .base import render_memory, shared_context

ROLE = "agent7_verifier"
MAX_COMPILE_RETRIES = 3

SYSTEM = """Role: Sandbox Verifier & Patch Engineer.
For the finding given, produce two things.

1. test_source: one complete Foundry test file, saved as test/Verify.t.sol.
   - `pragma solidity ^0.8.20;`, `import "forge-std/Test.sol";`, and import the
     code under test as `import "../src/<path>";` using the paths listed.
   - Self-contained: write any mock tokens or helper contracts inside this file.
     No forks, RPC, FFI, file or environment cheatcodes (they are blocked).
   - The test must PASS while the bug is present and FAIL once it is fixed:
     assert the broken outcome (e.g. a victim's loss, an invariant violated),
     never a tautology. Use only functions that exist before and after the fix.
2. patch: the minimal fix, as the full new content of each changed file
   (same relative path). Keep the external interface unchanged.

If the finding is not real, still write the most faithful test you can; the
sandbox will report that it does not reproduce."""


class FilePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    path: str = Field(description="Relative path exactly as listed under <files>")
    content: str = Field(description="Full new content of the file")


class VerificationAttempt(BaseModel):
    model_config = ConfigDict(extra="forbid")

    test_source: str
    what_it_proves: str
    patch: list[FilePatch]


class VerifyStatus(str, Enum):
    VERIFIED = "verified"                            # passes on original, fails on patched
    FIX_UNPROVEN = "reproduced_fix_unproven"         # passes on both: test or patch is weak
    PATCH_BROKEN = "reproduced_patch_broken"         # passes on original, patch does not compile
    NOT_REPRODUCED = "not_reproduced"                # test fails on original code
    COMPILE_FAILED = "compile_failed"                # still not compiling after retries
    REJECTED = "rejected"                            # test used a blocked construct
    SKIPPED = "skipped"
    SANDBOX_ERROR = "sandbox_error"


class Verification(BaseModel):
    model_config = ConfigDict(extra="forbid")

    finding_id: str
    status: VerifyStatus
    attempts: int = 0
    what_it_proves: str = ""
    test_source: str = ""
    patch_diff: str = ""
    log: str = ""


def unified_diff(original: dict[str, str], patch: list[FilePatch]) -> str:
    chunks = []
    for p in patch:
        old = original.get(p.path, "")
        chunks.append("".join(difflib.unified_diff(
            old.splitlines(keepends=True), p.content.splitlines(keepends=True),
            fromfile=f"a/{p.path}", tofile=f"b/{p.path}",
        )))
    return "\n".join(c for c in chunks if c)


def _finding_brief(f: Finding) -> str:
    return (f"id: {f.id}\nseverity: {f.severity.value}\ntitle: {f.title}\nlocation: {f.location}\n"
            f"description: {f.description}\nexploit_scenario: {f.exploit_scenario}\nrecommendation: {f.recommendation}")


def verify_finding(llm: StructuredLLM, state: AuditState, runner: FoundryRunner, f: Finding) -> Verification:
    files = "\n".join(f"- src/{p}" for p in runner.sources)
    base_user = f"<files>\n{files}\n</files>\n\n<finding>\n{_finding_brief(f)}\n</finding>" + render_memory(state, ROLE)
    feedback = ""
    attempt: VerificationAttempt | None = None
    log: list[str] = []

    for n in range(1, MAX_COMPILE_RETRIES + 2):  # first try + retries
        user = base_user + (f"\n\n<previous_attempt_failed>\n{feedback}\n</previous_attempt_failed>" if feedback else "")
        attempt = llm.structured(role=ROLE, system=SYSTEM, user=user, schema=VerificationAttempt,
                                 shared_context=shared_context(state))
        res = runner.run_test(attempt.test_source)
        log.append(f"attempt {n}: original -> {res.status}")
        common = dict(finding_id=f.id, attempts=n, what_it_proves=attempt.what_it_proves,
                      test_source=attempt.test_source, patch_diff=unified_diff(runner.sources, attempt.patch))
        if res.status in ("compile_error", "rejected"):
            if n > MAX_COMPILE_RETRIES:
                status = VerifyStatus.REJECTED if res.status == "rejected" else VerifyStatus.COMPILE_FAILED
                return Verification(status=status, log="\n".join(log) + "\n" + res.output, **common)
            feedback = f"Your test did not run ({res.status}):\n{res.output}\nReturn a corrected test and patch."
            continue
        if res.status in ("timeout", "infra_error"):
            return Verification(status=VerifyStatus.SANDBOX_ERROR, log="\n".join(log) + "\n" + res.output, **common)
        if res.status == "failed":
            return Verification(status=VerifyStatus.NOT_REPRODUCED, log="\n".join(log) + "\n" + res.output, **common)

        # Reproduced on the original code; now the patch must make the same test fail.
        if not attempt.patch:
            return Verification(status=VerifyStatus.FIX_UNPROVEN, log="\n".join(log + ["no patch supplied"]), **common)
        patched = runner.run_test(attempt.test_source, replace={p.path: p.content for p in attempt.patch})
        log.append(f"attempt {n}: patched -> {patched.status}")
        if patched.status == "failed":
            status = VerifyStatus.VERIFIED
        elif patched.status == "passed":
            status = VerifyStatus.FIX_UNPROVEN
        else:
            status = VerifyStatus.PATCH_BROKEN
        return Verification(status=status, log="\n".join(log) + ("\n" + patched.output if status != VerifyStatus.VERIFIED else ""),
                            **common)
    raise AssertionError("unreachable")


def run(llm: StructuredLLM, state: AuditState) -> dict:
    opts = state.get("options") or {}
    findings = state.get("final_findings") or []
    if not opts.get("verify", True) or not findings:
        return {}
    if not state.get("target_path"):
        return {"verify_notes": ["verification skipped: no target path"]}
    solc = find_solc(opts.get("solc"))
    if solc is None:
        return {"verify_notes": ["verification skipped: no solc binary (set SYNDICATE_SOLC)"]}
    try:
        runner = FoundryRunner.from_path(state["target_path"], solc, backend=make_backend(opts.get("sandbox", "auto")))
    except SandboxError as e:
        return {"verify_notes": [f"verification skipped: {e}"]}

    cutoff = SEVERITY_ORDER[Severity(opts.get("verify_min_severity", "medium"))]
    limit = int(opts.get("verify_max", 5))
    eligible = sorted((f for f in findings if SEVERITY_ORDER[f.severity] <= cutoff),
                      key=lambda f: (SEVERITY_ORDER[f.severity], -f.confidence))
    out: list[Verification] = []
    errors: list[str] = []
    for i, f in enumerate(eligible):
        if i >= limit:
            out.append(Verification(finding_id=f.id, status=VerifyStatus.SKIPPED, log=f"over verify_max={limit}"))
            continue
        try:
            out.append(verify_finding(llm, state, runner, f))
        except SandboxError as e:
            out.append(Verification(finding_id=f.id, status=VerifyStatus.SANDBOX_ERROR, log=str(e)))
        except LLMError as e:  # budget, refusal, rate limit: keep what is already verified
            out.append(Verification(finding_id=f.id, status=VerifyStatus.SKIPPED, log=str(e)))
            errors.append(f"agent7: {e}")
    notes = [f"sandbox backend: {runner.backend.name}"]
    if runner.backend.name == "local":
        notes.append("**warning:** ran without Docker isolation (source screening + offline Foundry config only)")
    return {"verifications": out, "errors": errors, "verify_notes": notes}
