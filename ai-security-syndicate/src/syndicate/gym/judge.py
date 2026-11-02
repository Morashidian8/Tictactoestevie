"""Judges: decide which agent finding (if any) matches each judged finding.

Two interchangeable judges:

* ``HeuristicJudge``: free and deterministic. A match needs the right function
  in the location and a root-cause keyword in the text. Use it for smoke runs and
  CI. It is generous to findings with the right words but the wrong reasoning, so
  treat its numbers as an upper bound.
* ``LLMJudge``: one cheap call per case (``gym_judge`` role, Sonnet at low effort).
  It decides root-cause equivalence the way a Code4rena judge would.

Either way the judge only proposes matches. The scoring is plain Python, which
enforces one-to-one matching and computes the metrics, so a judge can't inflate
the score by matching one finding to two answers.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field

from ..llm import StructuredLLM
from ..state import SEVERITY_ORDER, Finding, Severity
from .cases import ExpectedFinding

JUDGE_ROLE = "gym_judge"


class MatchQuality(str, Enum):
    FULL = "full"        # same root cause, same location
    PARTIAL = "partial"  # right spot or symptom, root cause incomplete or wrong
    NONE = "none"


class ExpectedMatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_id: str
    agent_finding_id: str | None = Field(description="Id of the matching agent finding, or null")
    quality: MatchQuality
    reasoning: str


class JudgeOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    matches: list[ExpectedMatch]


class Judge(Protocol):
    name: str

    def match(self, expected: list[ExpectedFinding], findings: list[Finding]) -> list[ExpectedMatch]: ...


# --------------------------------------------------------------------------- #
# Heuristic judge
# --------------------------------------------------------------------------- #
def _mentions(text: str, word: str) -> bool:
    return re.search(rf"\b{re.escape(word.lower())}", text.lower()) is not None


class HeuristicJudge:
    name = "heuristic"

    def match(self, expected: list[ExpectedFinding], findings: list[Finding]) -> list[ExpectedMatch]:
        out = []
        for exp in expected:
            best: tuple[int, Finding | None, str] = (0, None, "no finding at this location with a matching root-cause keyword")
            for f in findings:
                loc_ok = _mentions(f.location, exp.function) and (
                    _mentions(f.location, exp.contract) or "." not in f.location
                )
                text = f"{f.title} {f.category} {f.description}"
                kw = next((k for k in exp.keywords if _mentions(text, k)), None)
                if loc_ok and kw:
                    rank, why = 2, f"location matches {exp.contract}.{exp.function}; keyword '{kw}'"
                elif kw and _mentions(f.location, exp.contract):
                    rank, why = 1, f"keyword '{kw}' but location {f.location!r}"
                else:
                    continue
                if rank > best[0]:
                    best = (rank, f, why)
            rank, f, why = best
            quality = {2: MatchQuality.FULL, 1: MatchQuality.PARTIAL, 0: MatchQuality.NONE}[rank]
            out.append(ExpectedMatch(expected_id=exp.id, agent_finding_id=f.id if f else None, quality=quality, reasoning=why))
        return out


# --------------------------------------------------------------------------- #
# LLM judge
# --------------------------------------------------------------------------- #
JUDGE_SYSTEM = """You are a strict Code4rena-style judge scoring an automated auditor.
You get the official judged findings for a contest and the auditor's submissions.
For EACH judged finding, pick the single submission that describes the SAME ROOT
CAUSE, or null if none does.

- full: same root cause in the same code location; fixing the submission's issue
  fixes the judged issue.
- partial: points at the right code and symptom, but the root cause is wrong,
  incomplete, or the impact is badly misjudged.
- none: nothing matches. Vague catch-all submissions ("check rounding everywhere")
  do not match anything.

Do not reward wording overlap; reason about the mechanism. Each submission can
match at most one judged finding. Return exactly one entry per judged finding."""


def _render_expected(expected: list[ExpectedFinding]) -> str:
    return json.dumps(
        [e.model_dump(mode="json", include={"id", "severity", "title", "contract", "function", "root_cause"}) for e in expected],
        indent=2,
    )


def _render_findings(findings: list[Finding]) -> str:
    keep = {"id", "severity", "title", "category", "location", "description", "exploit_scenario"}
    return json.dumps([f.model_dump(mode="json", include=keep) for f in findings], indent=2)


class LLMJudge:
    name = "llm"

    def __init__(self, llm: StructuredLLM):
        self.llm = llm

    def match(self, expected: list[ExpectedFinding], findings: list[Finding]) -> list[ExpectedMatch]:
        if not expected or not findings:  # nothing to decide; costs nothing
            return HeuristicJudge().match(expected, []) if expected else []
        user = (
            f"<judged_findings>\n{_render_expected(expected)}\n</judged_findings>\n\n"
            f"<submissions>\n{_render_findings(findings)}\n</submissions>"
        )
        out = self.llm.structured(role=JUDGE_ROLE, system=JUDGE_SYSTEM, user=user, schema=JudgeOutput)
        return out.matches


# --------------------------------------------------------------------------- #
# Scoring (deterministic)
# --------------------------------------------------------------------------- #
@dataclass
class StageScore:
    """Metrics for one stage: ``raw`` (hunters, before the Skeptic) or ``final``."""

    n_findings: int
    credit: float          # sum of match credit (full=1, partial=partial_credit)
    n_expected: int
    matched_ids: list[str] = field(default_factory=list)
    false_positive_ids: list[str] = field(default_factory=list)

    @property
    def recall(self) -> float | None:
        return self.credit / self.n_expected if self.n_expected else None

    @property
    def precision(self) -> float | None:
        return self.credit / self.n_findings if self.n_findings else None

    def to_dict(self) -> dict:
        return {
            "n_findings": self.n_findings, "n_expected": self.n_expected, "credit": self.credit,
            "recall": self.recall, "precision": self.precision,
            "matched_ids": self.matched_ids, "false_positive_ids": self.false_positive_ids,
        }


def scorable(findings: list[Finding], min_severity: Severity) -> list[Finding]:
    """Findings at or above ``min_severity``. Lows/QA are neither credited nor penalised."""
    cutoff = SEVERITY_ORDER[min_severity]
    return [f for f in findings if SEVERITY_ORDER[f.severity] <= cutoff]


def resolve(matches: list[ExpectedMatch], expected: list[ExpectedFinding], valid_ids: set[str]) -> list[ExpectedMatch]:
    """Make matches one-to-one, drop unknown ids, and add a 'none' entry for any expected finding left out.

    When two expected findings claim the same submission, the full match wins, and
    on a tie the higher-severity expected finding wins.
    """
    exp_by_id = {e.id: e for e in expected}
    latest = {m.expected_id: m for m in matches if m.expected_id in exp_by_id}
    rank = {MatchQuality.FULL: 0, MatchQuality.PARTIAL: 1, MatchQuality.NONE: 2}
    order = sorted(latest.values(), key=lambda m: (rank[m.quality], SEVERITY_ORDER[exp_by_id[m.expected_id].severity]))

    used: set[str] = set()
    resolved: dict[str, ExpectedMatch] = {}
    for m in order:
        aid = m.agent_finding_id
        if m.quality is MatchQuality.NONE or aid is None:
            resolved[m.expected_id] = m.model_copy(update={"agent_finding_id": None, "quality": MatchQuality.NONE})
        elif aid not in valid_ids:
            resolved[m.expected_id] = ExpectedMatch(expected_id=m.expected_id, agent_finding_id=None,
                                                    quality=MatchQuality.NONE, reasoning=f"judge cited unknown id {aid!r}")
        elif aid in used:
            resolved[m.expected_id] = ExpectedMatch(expected_id=m.expected_id, agent_finding_id=None, quality=MatchQuality.NONE,
                                                    reasoning=f"{aid} already credited to another finding")
        else:
            used.add(aid)
            resolved[m.expected_id] = m
    for e in expected:
        resolved.setdefault(e.id, ExpectedMatch(expected_id=e.id, agent_finding_id=None,
                                                quality=MatchQuality.NONE, reasoning="judge returned no verdict"))
    return [resolved[e.id] for e in expected]


def score_stage(stage_findings: list[Finding], matches: list[ExpectedMatch], n_expected: int, partial_credit: float) -> StageScore:
    ids = {f.id for f in stage_findings}
    credit_of = {MatchQuality.FULL: 1.0, MatchQuality.PARTIAL: partial_credit, MatchQuality.NONE: 0.0}
    credit, matched = 0.0, []
    for m in matches:
        if m.agent_finding_id in ids:
            credit += credit_of[m.quality]
            matched.append(m.agent_finding_id)
    fps = sorted(ids - set(matched))
    return StageScore(n_findings=len(ids), credit=credit, n_expected=n_expected, matched_ids=matched, false_positive_ids=fps)
