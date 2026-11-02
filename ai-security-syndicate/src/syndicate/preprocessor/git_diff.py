"""Git-Diff Hunter (Phase 6 groundwork): focus audits on what a PR changed.

Two free, deterministic outputs:

* ``changed_ranges``: line ranges each changed ``.sol`` file touches. The risk
  scorer gives +2 to functions overlapping a change, so hunters look at the PR
  first while still seeing the whole code base.
* ``storage_layout_diff``: for every contract present before and after, compares
  the ordered storage variables. A removed, reordered, or retyped slot in an
  upgradeable contract corrupts state after the upgrade, so it is reported as a
  high-impact static hit (which then goes through triage like any other).
"""
from __future__ import annotations

import re
import subprocess
import tempfile
from pathlib import Path

from .static_runner import StaticFinding, find_solc, slither_available

HUNK = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@")


class GitError(RuntimeError):
    pass


def _git(repo: Path, *args: str) -> str:
    proc = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True)
    if proc.returncode != 0:
        raise GitError(proc.stderr.strip() or f"git {' '.join(args)} failed")
    return proc.stdout


def repo_root(path: Path) -> Path:
    start = path if path.is_dir() else path.parent
    return Path(_git(start, "rev-parse", "--show-toplevel").strip())


def changed_ranges(repo: Path, base: str) -> dict[str, list[tuple[int, int]]]:
    """``{repo-relative .sol path: [(first_line, last_line), ...]}`` for ``base...HEAD``."""
    diff = _git(repo, "diff", "--unified=0", "--no-color", f"{base}...HEAD", "--", "*.sol")
    out: dict[str, list[tuple[int, int]]] = {}
    current = None
    for line in diff.splitlines():
        if line.startswith("+++ "):
            current = None if line.endswith("/dev/null") else line[6:] if line.startswith("+++ b/") else line[4:]
            if current:
                out.setdefault(current, [])
        elif current and (m := HUNK.match(line)):
            start, count = int(m.group(1)), int(m.group(2) or 1)
            out[current].append((start, start + max(count, 1) - 1))  # pure deletions mark the line they follow
    return out


def overlaps(file: str, lines: tuple[int, int], ranges: dict[str, list[tuple[int, int]]]) -> bool:
    for path, rs in ranges.items():
        if file.endswith(path) or path.endswith(file):
            if any(a <= lines[1] and lines[0] <= b for a, b in rs):
                return True
    return False


# --------------------------------------------------------------------------- #
# Storage layout diff
# --------------------------------------------------------------------------- #
def storage_layouts(target: Path, solc: str) -> dict[str, list[tuple[str, str]]]:
    from slither import Slither

    from .static_runner import _compile_units

    layouts: dict[str, list[tuple[str, str]]] = {}
    for unit in _compile_units(target):
        sl = Slither(str(unit), solc=solc)
        for c in sl.contracts:
            if not c.is_interface and not c.is_library:
                layouts.setdefault(c.name, [(v.name, str(v.type)) for v in c.storage_variables_ordered])
    return layouts


def compare_layouts(before: dict, after: dict) -> list[StaticFinding]:
    findings = []
    for name, old in before.items():
        new = after.get(name)
        if new is None:
            continue
        for i, (var, typ) in enumerate(old):
            if i >= len(new):
                problem = f"slot {i} `{var}` ({typ}) was removed"
            elif new[i] != (var, typ):
                problem = f"slot {i} changed from `{var}` ({typ}) to `{new[i][0]}` ({new[i][1]})"
            else:
                continue
            findings.append(StaticFinding(
                tool="layout-diff", check="storage-layout-change", impact="High", confidence="Medium", contract=name,
                description=(f"{name}: {problem}. If {name} sits behind an upgradeable proxy, existing storage is "
                             "reinterpreted after the upgrade. Append new variables instead, and keep gaps."),
            ))
            break  # later slots shift too; one finding per contract is enough
    return findings


def storage_layout_diff(target: Path, base: str, solc: str | None = None) -> list[StaticFinding]:
    """Check out ``base`` into a temp worktree, and compare its storage layouts with the current code."""
    solc_bin = find_solc(solc)
    if not slither_available() or solc_bin is None:
        return []
    target = target.resolve()
    root = repo_root(target)
    rel = target.relative_to(root)
    with tempfile.TemporaryDirectory(prefix="syndicate-base-") as tmp:
        wt = Path(tmp) / "base"
        _git(root, "worktree", "add", "--detach", "-q", str(wt), base)
        try:
            old_target = wt / rel
            if not old_target.exists():
                return []  # the audited path is new in this PR
            before = storage_layouts(old_target, solc_bin)
        finally:
            _git(root, "worktree", "remove", "--force", str(wt))
    return compare_layouts(before, storage_layouts(target, solc_bin))
