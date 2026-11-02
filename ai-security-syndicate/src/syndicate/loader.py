"""Collect Solidity sources from a file or a project directory."""
from __future__ import annotations

from pathlib import Path

SKIP_DIRS = {"lib", "node_modules", "test", "tests", "script", "out", "cache", ".git"}
MAX_CHARS = 600_000  # ~150k tokens; leaves room for prompts in a 1M context


class SourceTooLarge(ValueError):
    pass


def load_sources(path: str | Path, include_tests: bool = False) -> str:
    p = Path(path)
    if p.is_file():
        files = [p]
    else:
        skip = SKIP_DIRS - ({"test", "tests"} if include_tests else set())
        files = sorted(f for f in p.rglob("*.sol") if not (set(f.relative_to(p).parts[:-1]) & skip))
    if not files:
        raise FileNotFoundError(f"no .sol files under {p}")
    base = p if p.is_dir() else p.parent
    parts = [f"// ===== FILE: {f.relative_to(base)} =====\n{f.read_text()}" for f in files]
    blob = "\n\n".join(parts)
    if len(blob) > MAX_CHARS:
        raise SourceTooLarge(
            f"{len(files)} files / {len(blob):,} chars exceeds {MAX_CHARS:,}. "
            "Point at a sub-directory or a PR diff instead of truncating the codebase."
        )
    return blob
