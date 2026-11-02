"""Benchmark case format.

    <suite>/<case_id>/
        contracts/*.sol        what the syndicate audits
        docs.md                optional spec, handed to Agent 1
        judged_report.yaml     answer key, read ONLY by the judge
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict, Field

from ..loader import load_sources
from ..state import Severity

ANSWER_KEY = "judged_report.yaml"


class ExpectedFinding(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    severity: Severity
    title: str
    contract: str
    function: str
    root_cause: str
    keywords: list[str] = Field(default_factory=list, description="Used only by the heuristic judge")


class JudgedReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    case: str
    source: str = ""
    findings: list[ExpectedFinding]


@dataclass
class BenchmarkCase:
    case_id: str
    path: Path
    source_code: str
    docs: str
    expected: JudgedReport


def load_case(path: Path) -> BenchmarkCase:
    key = path / ANSWER_KEY
    if not key.is_file():
        raise FileNotFoundError(f"{path.name}: missing {ANSWER_KEY}")
    contracts = path / "contracts"
    if not contracts.is_dir():
        raise FileNotFoundError(f"{path.name}: missing contracts/ directory")
    expected = JudgedReport.model_validate(yaml.safe_load(key.read_text()))
    ids = [f.id for f in expected.findings]
    if len(ids) != len(set(ids)):
        raise ValueError(f"{path.name}: duplicate finding ids in {ANSWER_KEY}")
    docs_file = path / "docs.md"
    return BenchmarkCase(
        case_id=path.name,
        path=path,
        # Only contracts/ is loaded, so the answer key can never reach an agent prompt.
        source_code=load_sources(contracts),
        docs=docs_file.read_text() if docs_file.is_file() else "",
        expected=expected,
    )


def discover(suite: Path, only: list[str] | None = None, limit: int | None = None) -> list[BenchmarkCase]:
    dirs = sorted(d for d in suite.iterdir() if d.is_dir() and (d / ANSWER_KEY).exists())
    if only:
        missing = set(only) - {d.name for d in dirs}
        if missing:
            raise ValueError(f"unknown case(s): {', '.join(sorted(missing))}")
        dirs = [d for d in dirs if d.name in only]
    if limit is not None:
        dirs = dirs[:limit]
    return [load_case(d) for d in dirs]
