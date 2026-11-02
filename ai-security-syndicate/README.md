# AI Security Auditing Syndicate (ایجنت‌های هکر کلاه سفید)

A white-hat, multi-agent smart-contract security auditor: free static tools do
most of the work, Claude handles the reasoning, and every claimed bug is backed
by an executable Foundry proof.

> Use only on code you own or are authorised to audit (your own repos, bug-bounty
> scopes, audit contests).

```
START → static (Slither, free) → memory (checklists + lessons, free) → A1 Invariants → A2 Router ─┬→ A3 DeFi ───┐
                                                                                                 ├→ A4 Math ───┤
                                                                                                 ├→ A5 Edge ───┼→ A6 Skeptic
                                                                                                 └→ A0 Triage ─┘      │
                                                       report ← learn ← A7 Verifier (Foundry PoC + patch, sandboxed) ←┘
```

## What each stage costs

| Stage | Runs on | Cost |
|---|---|---|
| Static analysis: detectors, per-function facts, storage-layout diff | Slither (+ Aderyn if installed) | free |
| A2 router: explainable 1-10 risk per function, +2 for lines changed in a PR | `preprocessor/risk.py` (LLM fallback only if static fails) | free |
| Memory: knowledge-base checklists and lessons, selected by code signals | `memory/` | free |
| A0 triage of noisy high/medium static hits | Haiku 5.5, low effort; skipped when there are none | cents |
| A1 invariants, A3-A5 hunters, A6 skeptic | Opus 5.5; the code is a shared cacheable prefix | most of the bill |
| A7 verifier: PoC + patch per finding (default max 5) | Opus 5.5 + sandboxed `forge` | per finding |

`--static-only` runs only the free stages and makes no API calls. `--max-usd` caps spend,
and every run prints spend and cache reads per agent.

## Agents

| # | Agent | File | Output |
|---|---|---|---|
| 0 | Static triage | `agents/agent0_triage.py` | keep/drop per static hit → findings `S-xx` |
| 1 | Spec & invariant extractor | `agents/agent1_extractor.py` | invariants with formal expressions |
| 2 | Context architect & router | `preprocessor/risk.py` (LLM fallback `agents/agent2_router.py`) | risk map |
| 3 | Tokenomics & DeFi | `agents/hunters.py` | findings `A3-xx` |
| 4 | Bit-level math | `agents/hunters.py` | findings `A4-xx` |
| 5 | Edge cases & integration | `agents/hunters.py` | findings `A5-xx` |
| 6 | Skeptic | `agents/agent6_skeptic.py` | confirmed / downgraded / rejected / duplicate; fails closed |
| 7 | Sandbox verifier & patch engineer | `agents/agent7_verifier.py` | PoC test, patch diff, verification status |

### Agent 7: proof, not opinion

| PoC on original code | PoC on patched code | Status |
|---|---|---|
| passes | fails | **✅ verified**: real bug, working fix, non-tautological test |
| passes | passes | ⚠️ `reproduced_fix_unproven` |
| passes | doesn't compile | ⚠️ `reproduced_patch_broken` |
| fails | — | ❌ `not_reproduced`, never retried, so the test can't be weakened until it passes |
| doesn't compile | — | up to 3 self-healing retries with compiler output, then `compile_failed` |

The sandbox treats model-written Solidity as untrusted:
1. Cheatcodes that leave the EVM (`ffi`, file/env access, fork/RPC, broadcast) are rejected before compiling.
2. Foundry runs offline, with `ffi = false` and no fs permissions, in a fresh temp workspace.
3. Docker backend: `--network none`, read-only root, CPU/memory/pid limits. Without a Docker
   daemon it falls back to local `forge`, and the report says so in bold.

Mainnet forking is deliberately off, because it needs network access inside the sandbox.

## Memory (Phase 4)

* **Knowledge base:** `config/knowledge/patterns.yaml` has 13 vulnerability classes written as
  checklists. A class is retrieved when enough of its code signals appear, and each hunter
  sees only the classes tagged for its role. Add classes from real post-mortems here.
* **Lessons:** `syndicate lesson add "..." --agent agent4_math --keywords rewardpertoken`.
  With `--learn`, Agent 7 outcomes such as a PoC that never compiled are recorded
  automatically. Lessons go in the user message, never the cached prefix.

It is local and deterministic; no Qdrant or embeddings yet. `memory/knowledge.retrieve`
is the seam where a vector store over a large post-mortem corpus would plug in.

## PR scanning (Phase 6)

* `--diff-base origin/main` gives +2 risk to functions touched by the diff and compares
  storage layouts against the base (a removed, reordered or retyped slot is a high-impact hit).
* `ci/syndicate-pr.yml` is a GitHub Action: a free static pass on every PR, and a capped
  full audit on PRs labelled `deep-audit`. It uses `pull_request` (never `pull_request_target`),
  so fork PRs never see the API key. `--fail-on verified|high` sets the exit code.

## Benchmark gym (in progress)

`benchmarks/micro/` holds 3 hand-written cases (two vulnerable, one clean control) with
judged answer keys that agents never see. `gym/cases.py` loads them. `gym/judge.py` has a
free heuristic judge and a cheap LLM judge, with deterministic one-to-one scoring of
recall and precision before and after the Skeptic. **The benchmark runner that ties
these together is not written yet.**

## Usage

```bash
cd ai-security-syndicate
pip install -e ".[dev]" slither-analyzer      # plus solc on PATH or $SYNDICATE_SOLC, and forge for Agent 7
syndicate audit benchmarks/micro/vault-inflation/contracts --static-only          # free
export ANTHROPIC_API_KEY=...                                                       # or `ant auth login`
syndicate audit path/to/contracts --docs spec.md --max-usd 3 --verify-max 3 \
    --patch-dir patches/ --out reports/x.md
syndicate audit src --diff-base origin/main --static-only                          # PR-focused, free
syndicate lesson list
pytest                                       # 37 tests; Slither/forge tests skip when tools are missing
```

`Dockerfile` bundles Python, Slither and solc for the static stages.

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Graph, Agents 1-6, structured outputs, CLI | done |
| 2 | Slither layer, deterministic router, Haiku triage, prompt caching, cost caps | done |
| 3 | Agent 7 Foundry verifier with patch proof | done; Docker backend untested |
| 4 | Knowledge-base checklists + episodic lessons (local) | done; Qdrant not integrated |
| 5 | Gym: cases + judges done; **runner, mutator, Agent 8 harvester not built** | partial |
| 6 | Diff-focused audits, storage-layout diff, GitHub Action, `--fail-on` | done; Action not run on GitHub yet; no web/Telegram UI |

Not built yet:
- the Gym benchmark runner
- the mutation engine
- Agent 8, the post-mortem harvester and rule synthesiser
- fuzzing harnesses from Agent 1's invariants (Echidna/Medusa/Halmos)
- the o3-mini / DeepSeek provider (`StructuredLLM` in `llm.py` is the seam)
- a web or Telegram front end

**Never run against the real Claude API from this repo's CI.** All tests use a fake model;
the first real-API run should be a small, capped one on a micro-benchmark.
