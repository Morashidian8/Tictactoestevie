"""Free, deterministic analysis layer (Phase 2).

Runs Slither (and Aderyn when installed) once, and returns two things:

* ``functions``: per-entry-point facts (state written, external calls, ETH
  sends, divisions, modifiers, line range). ``risk.py`` scores these, which
  replaces the LLM version of Agent 2.
* ``findings``: detector hits, normalised. High/medium ones go to the cheap
  triage agent; the rest go to the report's appendix, at no API cost.

No LLM is involved. If a tool is missing or compilation fails, the error is
reported and the pipeline falls back to the LLM-only path rather than aborting.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from dataclasses import asdict, dataclass, field
from pathlib import Path

FRAMEWORK_MARKERS = ("foundry.toml", "hardhat.config.js", "hardhat.config.ts", "truffle-config.js", "brownie-config.yaml")
SKIP_DIRS = {"lib", "node_modules", "test", "tests", "script", "out", "cache", ".git"}
VALUE_WORDS = ("balance", "share", "supply", "debt", "reward", "deposit", "stake", "collateral", "reserve", "price")


@dataclass
class StaticFinding:
    tool: str
    check: str
    impact: str          # High | Medium | Low | Informational | Optimization
    confidence: str      # High | Medium | Low
    description: str
    contract: str = ""
    function: str = ""
    lines: list[int] = field(default_factory=list)


@dataclass
class FunctionFacts:
    contract: str
    function: str
    signature: str
    visibility: str
    modifiers: list[str]
    view: bool
    payable: bool
    writes: list[str]
    reads: list[str]
    callees: list[str]   # internal functions and modifiers reached, by name
    external_calls: list[str]
    sends_eth: bool
    has_division: bool
    has_unchecked: bool
    file: str
    lines: tuple[int, int]


@dataclass
class StaticReport:
    tools: list[str] = field(default_factory=list)
    functions: list[FunctionFacts] = field(default_factory=list)
    findings: list[StaticFinding] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return bool(self.functions)

    def to_dict(self) -> dict:
        return asdict(self)


# --------------------------------------------------------------------------- #
# Slither
# --------------------------------------------------------------------------- #
def find_solc(explicit: str | None = None) -> str | None:
    for cand in (explicit, os.environ.get("SYNDICATE_SOLC"), shutil.which("solc")):
        if cand and Path(cand).is_file():
            return cand
    return None


def slither_available() -> bool:
    try:
        import slither  # noqa: F401
    except ImportError:
        return False
    return True


def _compile_units(target: Path) -> list[Path]:
    """A framework project compiles as one unit; a loose folder compiles file by file."""
    if target.is_file():
        return [target]
    if any((target / m).exists() for m in FRAMEWORK_MARKERS):
        return [target]
    return sorted(f for f in target.rglob("*.sol") if not (set(f.relative_to(target).parts[:-1]) & SKIP_DIRS))


def _internal_callees(f) -> set[str]:
    """Names of internal functions reached from ``f``, including through modifiers.

    Depending on the Slither version, ``all_internal_calls`` yields Function objects
    or InternalCall IR operations; handle both.
    """
    from slither.core.declarations import Function
    from slither.slithir.operations import InternalCall

    names = set()
    for x in f.all_internal_calls():
        if isinstance(x, InternalCall) and isinstance(x.function, Function):
            names.add(x.function.name)
        elif isinstance(x, Function):
            names.add(x.name)
    return names


def _facts_for(sl) -> list[FunctionFacts]:
    from slither.slithir.operations import Binary, BinaryType, HighLevelCall, LowLevelCall, Send, Transfer

    facts: list[FunctionFacts] = []
    for c in sl.contracts:
        if c.is_interface:
            continue
        for f in c.functions_entry_points:
            if f.contract_declarer != c or f.is_constructor:
                continue
            ops = list(f.all_slithir_operations())
            calls = sorted({f"{o.destination}.{o.function_name}" for o in ops if isinstance(o, HighLevelCall)})
            sends = any(isinstance(o, (Transfer, Send)) or (isinstance(o, LowLevelCall) and o.call_value is not None) for o in ops)
            lines = f.source_mapping.lines or [0]
            unchecked = "unchecked" in (f.source_mapping.content or "")
            facts.append(FunctionFacts(
                contract=c.name,
                function=f.name,
                signature=f.solidity_signature,
                visibility=f.visibility,
                modifiers=[m.name for m in f.modifiers],
                view=bool(f.view or f.pure),
                payable=bool(f.payable),
                writes=sorted({v.name for v in f.all_state_variables_written()}),
                reads=sorted({v.name for v in f.all_state_variables_read()}),
                callees=sorted(_internal_callees(f) | {m.name for m in f.modifiers}),
                external_calls=calls,
                sends_eth=sends,
                has_division=any(isinstance(o, Binary) and o.type == BinaryType.DIVISION for o in ops),
                has_unchecked=unchecked,
                file=f.source_mapping.filename.relative,
                lines=(lines[0], lines[-1]),
            ))
    return facts


def _element_location(elements: list[dict]) -> tuple[str, str, list[int]]:
    for e in elements:
        tsf = e.get("type_specific_fields") or {}
        lines = (e.get("source_mapping") or {}).get("lines") or []
        if e.get("type") == "function":
            return (tsf.get("parent") or {}).get("name", ""), e.get("name", ""), lines
        if e.get("type") == "node":
            fn = tsf.get("parent") or {}
            contract = ((fn.get("type_specific_fields") or {}).get("parent") or {}).get("name", "")
            return contract, fn.get("name", ""), lines
    for e in elements:
        if e.get("type") == "contract":
            return e.get("name", ""), "", (e.get("source_mapping") or {}).get("lines") or []
    return "", "", []


def run_slither(target: Path, solc: str | None = None) -> StaticReport:
    report = StaticReport()
    if not slither_available():
        report.errors.append("slither not installed (pip install slither-analyzer)")
        return report
    solc_bin = find_solc(solc)
    if solc_bin is None:
        report.errors.append("no solc binary found (set SYNDICATE_SOLC or put solc on PATH)")
        return report

    import inspect

    from slither import Slither
    from slither.detectors import all_detectors
    from slither.detectors.abstract_detector import AbstractDetector

    detectors = [d for _, d in inspect.getmembers(all_detectors, inspect.isclass) if issubclass(d, AbstractDetector)]
    report.tools.append("slither")
    seen_contracts: set[str] = set()
    seen_findings: set[str] = set()
    for unit in _compile_units(target):
        try:
            sl = Slither(str(unit), solc=solc_bin)
        except Exception as e:  # compilation errors surface as many exception types
            report.errors.append(f"slither failed on {unit.name}: {str(e).strip().splitlines()[-1] if str(e).strip() else type(e).__name__}")
            continue
        # A loose folder compiles each file separately, so shared imports show up repeatedly.
        for fact in _facts_for(sl):
            key = f"{fact.contract}.{fact.signature}"
            if key not in seen_contracts:
                seen_contracts.add(key)
                report.functions.append(fact)
        for d in detectors:
            sl.register_detector(d)
        for result in (r for batch in sl.run_detectors() for r in batch):
            if result.get("id") in seen_findings:
                continue
            seen_findings.add(result.get("id"))
            contract, function, lines = _element_location(result.get("elements") or [])
            report.findings.append(StaticFinding(
                tool="slither", check=result["check"], impact=result["impact"], confidence=result["confidence"],
                description=" ".join(result["description"].split()), contract=contract, function=function, lines=lines,
            ))
    return report


# --------------------------------------------------------------------------- #
# Aderyn (optional; Rust binary)
# --------------------------------------------------------------------------- #
def run_aderyn(target: Path, report: StaticReport, timeout: int = 300) -> None:
    exe = shutil.which("aderyn")
    if exe is None:
        return  # optional, so its absence is not an error
    root = target if target.is_dir() else target.parent
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "aderyn.json"
        try:
            subprocess.run([exe, str(root), "--output", str(out)], check=True, capture_output=True, timeout=timeout)
            data = json.loads(out.read_text())
        except (subprocess.SubprocessError, OSError, json.JSONDecodeError) as e:
            report.errors.append(f"aderyn failed: {type(e).__name__}")
            return
    report.tools.append("aderyn")
    for bucket, impact in (("high_issues", "High"), ("low_issues", "Low")):
        for issue in (data.get(bucket) or {}).get("issues", []):
            for inst in issue.get("instances", []):
                report.findings.append(StaticFinding(
                    tool="aderyn", check=issue.get("detector_name", issue.get("title", "")), impact=impact,
                    confidence="Medium", description=issue.get("title", ""),
                    lines=[inst["line_no"]] if "line_no" in inst else [],
                ))


def analyse(target: str | Path, solc: str | None = None) -> StaticReport:
    target = Path(target)
    report = run_slither(target, solc)
    run_aderyn(target, report)
    return report
