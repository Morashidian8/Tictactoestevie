"""Lightweight Solidity function inventory (Phase 1).

A regex pass, not a real parser: good enough to give Agent 2 a complete list of
entry points. Phase 2 replaces this with Tree-sitter + Slither JSON.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

_CONTRACT = re.compile(r"\b(contract|abstract\s+contract|library|interface)\s+(\w+)")
_FUNC = re.compile(r"\bfunction\s+(\w+)\s*\(([^)]*)\)([^{;]*)[{;]", re.S)
_SPECIAL = re.compile(r"\b(constructor|receive|fallback)\s*\(([^)]*)\)([^{;]*)[{;]", re.S)
_VIS = ("external", "public", "internal", "private")
_KEYWORDS = set(_VIS) | {"view", "pure", "payable", "virtual", "override", "returns", "memory", "calldata"}


@dataclass
class FunctionInfo:
    contract: str
    name: str
    params: str
    visibility: str
    modifiers: list[str] = field(default_factory=list)


def _strip_comments(src: str) -> str:
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    return re.sub(r"//[^\n]*", "", src)


def extract_functions(source: str) -> list[FunctionInfo]:
    src = _strip_comments(source)
    contracts = [(m.start(), m.group(2)) for m in _CONTRACT.finditer(src)]

    def owner(pos: int) -> str:
        name = "<file>"
        for start, cname in contracts:
            if start <= pos:
                name = cname
        return name

    out: list[FunctionInfo] = []
    for rx in (_FUNC, _SPECIAL):
        for m in rx.finditer(src):
            tail = m.group(3).split("returns")[0]
            words = re.findall(r"\b\w+\b", tail)
            vis = next((w for w in words if w in _VIS), "public" if rx is _SPECIAL else "internal")
            mods = [w for w in words if w not in _KEYWORDS and not w.isdigit()]
            out.append(FunctionInfo(owner(m.start()), m.group(1), " ".join(m.group(2).split()), vis, mods))
    return sorted(out, key=lambda f: (f.contract, f.name))
