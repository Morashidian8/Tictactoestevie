import subprocess
from pathlib import Path

import pytest

from syndicate.cli import main
from syndicate.preprocessor.git_diff import changed_ranges, compare_layouts, overlaps, storage_layout_diff
from syndicate.preprocessor.risk import build_context_map
from syndicate.preprocessor.static_runner import analyse, find_solc, slither_available

V1 = """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract Box {
    address public owner;
    uint256 public value;
    function set(uint256 v) external { value = v; }
    function get() external view returns (uint256) { return value; }
}
"""
V2 = V1.replace("    address public owner;\n", "    uint256 public fee;\n    address public owner;\n").replace(
    "{ value = v; }", "{ value = v + fee; }")


def git(repo, *args):
    subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True)


@pytest.fixture
def repo(tmp_path):
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "Box.sol").write_text(V1)
    git(tmp_path, "init", "-q", "-b", "main")
    git(tmp_path, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "root")
    git(tmp_path, "add", ".")
    git(tmp_path, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "v1")
    git(tmp_path, "checkout", "-q", "-b", "feature")
    (tmp_path / "src" / "Box.sol").write_text(V2)
    git(tmp_path, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-am", "v2")
    return tmp_path


def test_changed_ranges(repo):
    r = changed_ranges(repo, "main")
    assert list(r) == ["src/Box.sol"]
    assert overlaps("src/Box.sol", (7, 7), r)          # set() was edited
    assert not overlaps("src/Box.sol", (8, 8), r)      # get() untouched


def test_compare_layouts_pure():
    before = {"Box": [("owner", "address"), ("value", "uint256")]}
    assert compare_layouts(before, {"Box": [("owner", "address"), ("value", "uint256"), ("x", "uint256")]}) == []
    f = compare_layouts(before, {"Box": [("fee", "uint256"), ("owner", "address"), ("value", "uint256")]})
    assert len(f) == 1 and "slot 0 changed from `owner`" in f[0].description and f[0].impact == "High"


needs = pytest.mark.skipif(not (slither_available() and find_solc()), reason="slither/solc not installed")


@needs
def test_storage_layout_diff_and_diff_risk(repo):
    hits = storage_layout_diff(repo / "src", "main")
    assert [h.check for h in hits] == ["storage-layout-change"]
    ctx = build_context_map(analyse(repo / "src"), changed_ranges(repo, "main"))
    rows = {r.function: r for r in ctx.functions}
    assert "+2 changed in this diff" in rows["set"].rationale
    assert "changed in this diff" not in rows["get"].rationale


@needs
def test_cli_static_only_with_diff_base(repo, tmp_path_factory, capsys):
    out = tmp_path_factory.mktemp("o") / "r.md"
    main(["audit", str(repo / "src"), "--static-only", "--diff-base", "main", "--out", str(out)])
    md = out.read_text()
    assert "Diff scope" in md and "storage-layout-change" in md
