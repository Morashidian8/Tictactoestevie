"""Foundry sandbox: run model-written tests against a throwaway copy of the code.

Model-written Solidity is untrusted input, so it gets several layers of isolation:

1. **Source screening.** Tests touching cheatcodes that reach outside the EVM
   (ffi, file/env access, RPC/fork switching, broadcasting) are rejected before
   anything is compiled.
2. **Foundry config.** ``ffi = false``, empty ``fs_permissions``, ``offline = true``.
3. **Process isolation.** The Docker backend runs ``forge`` with ``--network none``,
   a read-only root filesystem, and CPU/memory/pid limits. The local backend
   (for machines without Docker) gets only layers 1 and 2 plus a scrubbed
   environment and a timeout. Use Docker in production.

Each run uses a fresh temp workspace; the user's project is never written to.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

FORGE_STD_TAG = "v1.9.4"
FORGE_STD_CACHE = Path(os.environ.get("SYNDICATE_CACHE", Path.home() / ".cache" / "syndicate")) / "forge-std"
DOCKER_IMAGE = os.environ.get("SYNDICATE_FOUNDRY_IMAGE", "ghcr.io/foundry-rs/foundry:stable")

# Cheatcodes and constructs that escape the EVM sandbox or reach the network/disk.
FORBIDDEN = re.compile(
    r"\bvm\s*\.\s*(ffi|tryFfi|readFile|readFileBinary|readLine|readDir|writeFile|writeFileBinary|writeLine|"
    r"writeJson|writeToml|removeFile|removeDir|createDir|copyFile|closeFile|fsMetadata|exists|isFile|isDir|"
    r"projectRoot|env\w*|setEnv|createFork|createSelectFork|selectFork|rpc|rpcUrl\w*|"
    r"broadcast|startBroadcast|stopBroadcast|getCode|getDeployedCode|prompt\w*)\b"
)

FOUNDRY_TOML = """[profile.default]
src = "src"
test = "test"
libs = ["lib"]
solc = "{solc}"
offline = true
ffi = false
fs_permissions = []
optimizer = false
remappings = ["forge-std/=lib/forge-std/src/"]
"""


class SandboxError(RuntimeError):
    pass


@dataclass
class TestCase:
    name: str
    passed: bool
    reason: str = ""


@dataclass
class ForgeResult:
    status: str                    # passed | failed | compile_error | rejected | timeout | infra_error
    tests: list[TestCase] = field(default_factory=list)
    output: str = ""               # trimmed compiler/runner output, fed back to the model on errors

    @property
    def any_passed(self) -> bool:
        return any(t.passed for t in self.tests)


def screen_source(source: str) -> str | None:
    """Return a rejection reason, or None if the test may run."""
    m = FORBIDDEN.search(source)
    if m:
        return f"forbidden cheatcode `vm.{m.group(1)}`: tests may not touch files, env, network or FFI"
    if re.search(r"\bassembly\b", source) and re.search(r"\b(call|delegatecall|staticcall)\s*\(\s*gas\s*\(\s*\)", source):
        return "raw assembly calls are not allowed in verification tests"
    return None


def ensure_forge_std(cache: Path = FORGE_STD_CACHE) -> Path:
    if (cache / "src" / "Test.sol").is_file():
        return cache
    cache.parent.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(["git", "clone", "-q", "--depth", "1", "--branch", FORGE_STD_TAG,
                        "https://github.com/foundry-rs/forge-std.git", str(cache)], check=True, timeout=180)
    except (subprocess.SubprocessError, OSError) as e:
        raise SandboxError(f"could not fetch forge-std {FORGE_STD_TAG}: {e}") from e
    return cache


def _tail(text: str, limit: int = 4000) -> str:
    text = re.sub(r"\x1b\[[0-9;]*m", "", text).strip()
    return text if len(text) <= limit else "...\n" + text[-limit:]


def parse_forge_json(stdout: str) -> list[TestCase]:
    start = stdout.find("{")
    if start < 0:
        return []
    try:
        data = json.loads(stdout[start:])
    except json.JSONDecodeError:
        return []
    out = []
    for suite in data.values():
        for name, r in (suite.get("test_results") or {}).items():
            out.append(TestCase(name=name, passed=r.get("status") == "Success", reason=r.get("reason") or ""))
    return out


# --------------------------------------------------------------------------- #
# Backends
# --------------------------------------------------------------------------- #
class LocalBackend:
    name = "local"

    def __init__(self, forge: str | None = None):
        self.forge = forge or shutil.which("forge") or str(Path.home() / ".foundry" / "bin" / "forge")
        if not Path(self.forge).is_file():
            raise SandboxError("forge not found (install Foundry or use the docker backend)")

    def run(self, workspace: Path, solc: str, timeout: int) -> subprocess.CompletedProcess:
        env = {"PATH": "/usr/bin:/bin", "HOME": str(workspace), "FOUNDRY_OFFLINE": "true", "NO_COLOR": "1"}
        return subprocess.run([self.forge, "test", "--json", "--offline"], cwd=workspace, env=env,
                              capture_output=True, text=True, timeout=timeout)


class DockerBackend:
    name = "docker"

    def __init__(self, image: str = DOCKER_IMAGE):
        self.image = image
        if shutil.which("docker") is None:
            raise SandboxError("docker CLI not found")
        probe = subprocess.run(["docker", "info"], capture_output=True, text=True)
        if probe.returncode != 0:
            raise SandboxError("docker daemon not reachable")

    def run(self, workspace: Path, solc: str, timeout: int) -> subprocess.CompletedProcess:
        cmd = [
            "docker", "run", "--rm", "--network", "none", "--read-only",
            "--cpus", "2", "--memory", "2g", "--pids-limit", "256", "--security-opt", "no-new-privileges",
            "--tmpfs", "/tmp:rw,size=256m", "-e", "HOME=/tmp", "-e", "FOUNDRY_OFFLINE=true",
            "-v", f"{workspace}:/work:rw", "-v", f"{solc}:/opt/solc:ro", "-w", "/work",
            "--entrypoint", "forge", self.image, "test", "--json", "--offline",
        ]
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def make_backend(kind: str = "auto"):
    if kind in ("docker", "auto"):
        try:
            return DockerBackend()
        except SandboxError:
            if kind == "docker":
                raise
    return LocalBackend()


# --------------------------------------------------------------------------- #
# Runner
# --------------------------------------------------------------------------- #
class FoundryRunner:
    """Copies the target into a fresh workspace, adds one test file, runs forge."""

    def __init__(self, sources: dict[str, str], solc: str, backend=None, timeout: int = 180):
        self.sources = sources            # relative path -> contents
        self.solc = solc
        self.backend = backend or make_backend()
        self.timeout = timeout
        self.forge_std = ensure_forge_std()

    @classmethod
    def from_path(cls, target: str | Path, solc: str, **kw) -> "FoundryRunner":
        target = Path(target)
        files = [target] if target.is_file() else sorted(target.rglob("*.sol"))
        base = target.parent if target.is_file() else target
        skip = {"lib", "node_modules", "test", "tests", "script", "out", "cache"}
        sources = {str(f.relative_to(base)): f.read_text() for f in files
                   if not (set(f.relative_to(base).parts[:-1]) & skip)}
        return cls(sources, solc, **kw)

    def run_test(self, test_source: str, *, replace: dict[str, str] | None = None) -> ForgeResult:
        """Run one test file. ``replace`` swaps source files (relative path -> new contents) to test a patch."""
        reason = screen_source(test_source)
        if reason:
            return ForgeResult(status="rejected", output=reason)
        unknown = set(replace or {}) - set(self.sources)
        if unknown:
            return ForgeResult(status="rejected", output=f"patch targets unknown file(s): {', '.join(sorted(unknown))}")

        with tempfile.TemporaryDirectory(prefix="syndicate-forge-") as tmp:
            ws = Path(tmp)
            solc_path = "/opt/solc" if isinstance(self.backend, DockerBackend) else self.solc
            (ws / "foundry.toml").write_text(FOUNDRY_TOML.format(solc=solc_path))
            for rel, text in {**self.sources, **(replace or {})}.items():
                dst = ws / "src" / rel
                dst.parent.mkdir(parents=True, exist_ok=True)
                dst.write_text(text)
            (ws / "test").mkdir()
            (ws / "test" / "Verify.t.sol").write_text(test_source)
            shutil.copytree(self.forge_std, ws / "lib" / "forge-std", ignore=shutil.ignore_patterns(".git"))
            try:
                proc = self.backend.run(ws, self.solc, self.timeout)
            except subprocess.TimeoutExpired:
                return ForgeResult(status="timeout", output=f"forge exceeded {self.timeout}s")
            except OSError as e:
                return ForgeResult(status="infra_error", output=str(e))

        tests = parse_forge_json(proc.stdout)
        combined = _tail((proc.stderr or "") + "\n" + (proc.stdout if not tests else ""))
        if not tests:
            compile_fail = re.search(r"Compil(er|ation) (run )?failed|Error \(\d+\)|ParserError|TypeError|DeclarationError",
                                     combined)
            return ForgeResult(status="compile_error" if compile_fail else "infra_error", output=combined)
        status = "passed" if all(t.passed for t in tests) else "failed"
        failures = "\n".join(f"{t.name}: {t.reason}" for t in tests if not t.passed)
        return ForgeResult(status=status, tests=tests, output=_tail(failures))
