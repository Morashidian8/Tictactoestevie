"""Shared state and strict Pydantic v2 output schemas for the syndicate.

Every agent returns one of the ``*Output`` models below; the LLM layer forces
structured output against these schemas, so nothing downstream ever parses
free text.
"""
from __future__ import annotations

import operator
from enum import Enum
from typing import Annotated, TypedDict

from pydantic import BaseModel, ConfigDict, Field


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --------------------------------------------------------------------------- #
# Agent 1 — Spec & Invariant Extractor
# --------------------------------------------------------------------------- #
class InvariantKind(str, Enum):
    MATHEMATICAL = "mathematical"   # e.g. sum(balances) == totalSupply
    ACCESS = "access_control"       # e.g. only owner can pause
    STATE_MACHINE = "state_machine" # e.g. cannot withdraw before unlock
    ECONOMIC = "economic"           # e.g. share price never decreases


class Invariant(_Strict):
    id: str = Field(description="Stable identifier, e.g. INV-01")
    kind: InvariantKind
    statement: str = Field(description="Natural-language invariant")
    formal: str = Field(description="Formal/pseudo-Solidity expression of the invariant")
    source: str = Field(description="Where it came from: doc section, NatSpec, or inferred from code")


class InvariantsOutput(_Strict):
    invariants: list[Invariant]


# --------------------------------------------------------------------------- #
# Agent 2 — Context Architect & Attention Router
# --------------------------------------------------------------------------- #
class FunctionRisk(_Strict):
    contract: str
    function: str
    visibility: str
    risk_score: int = Field(ge=1, le=10)
    rationale: str
    external_calls: list[str] = Field(description="External calls / value transfers made")
    state_written: list[str] = Field(description="Storage variables written")


class ContextMapOutput(_Strict):
    summary: str = Field(description="Architecture and value-flow summary")
    functions: list[FunctionRisk]
    trust_boundaries: list[str] = Field(description="Privileged roles, oracles, external protocols")


# --------------------------------------------------------------------------- #
# Agents 3/4/5 — Hunters
# --------------------------------------------------------------------------- #
class Severity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "informational"


SEVERITY_ORDER = {s: i for i, s in enumerate(Severity)}


class Finding(_Strict):
    id: str = Field(description="Agent-local id, e.g. A3-01")
    title: str
    severity: Severity
    category: str = Field(description="e.g. oracle-manipulation, rounding, fee-on-transfer")
    location: str = Field(description="Contract.function and line hint")
    description: str
    exploit_scenario: str = Field(description="Concrete step-by-step attack path")
    recommendation: str
    violated_invariants: list[str] = Field(description="Invariant ids this breaks, if any")
    confidence: float = Field(ge=0.0, le=1.0)
    source_agent: str = ""


class FindingsOutput(_Strict):
    findings: list[Finding]


# --------------------------------------------------------------------------- #
# Agent 6 — Skeptic
# --------------------------------------------------------------------------- #
class Verdict(str, Enum):
    CONFIRMED = "confirmed"
    DOWNGRADED = "downgraded"
    REJECTED = "rejected"
    DUPLICATE = "duplicate"


class SkepticVerdict(_Strict):
    finding_id: str
    verdict: Verdict
    adjusted_severity: Severity | None = Field(description="Required when downgraded, else null")
    duplicate_of: str | None = Field(description="Finding id this duplicates, else null")
    reasoning: str = Field(description="Guards, modifiers and paths checked")


class SkepticOutput(_Strict):
    verdicts: list[SkepticVerdict]


# --------------------------------------------------------------------------- #
# LangGraph state
# --------------------------------------------------------------------------- #
class AuditState(TypedDict, total=False):
    # inputs
    target: str
    source_code: str
    docs: str
    # agent outputs
    invariants: list[Invariant]
    context_map: ContextMapOutput
    raw_findings: Annotated[list[Finding], operator.add]  # fan-in reducer for 3/4/5
    verdicts: list[SkepticVerdict]
    final_findings: list[Finding]
    report_markdown: str
    errors: Annotated[list[str], operator.add]
