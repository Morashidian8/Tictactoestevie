# AI Security Auditing Syndicate (ایجنت‌های هکر کلاه سفید)

A white-hat, multi-agent smart-contract security auditor built on LangGraph +
Claude, with every agent output schema-enforced by Pydantic v2.

> Use only on code you own or are authorised to audit (your own repos, bug-bounty
> scopes, audit contests).

## Status: Phase 1 (core) ✅ · Phase 2 (free static layer) ✅ · Gym groundwork (cases + judges) ✅

```
START → static (Slither/Aderyn, free) → A1 Invariants → A2 Router ─┬→ A3 DeFi ──────┐
                                                                    ├→ A4 Math ──────┤
                                                                    ├→ A5 Edge ──────┼→ A6 Skeptic → Report
                                                                    └→ A0 Triage ────┘
```

### Cost tiers (Phase 2)

| Tier | What | Cost |
|---|---|---|
| Free | Slither (+ Aderyn if installed): detectors + per-function facts | $0 |
| Free | **A2 router is deterministic** (`preprocessor/risk.py`): risk 1-10 with every point explained; falls back to the LLM router only if static analysis fails | $0 |
| Cheap | **A0 triage** (Haiku 5.5, low effort) filters noisy high/medium static hits; skipped entirely when there are none | ~cents |
| Expensive | A1, A3-A6 on Opus 5.5. The code goes first as a shared cacheable block, and hunters are told to spend their depth on functions scored >= 5 | most of the bill |

`--static-only` runs only the free tiers and makes **no API calls**.

Two things learned building it:
- On `staking-rewards` Slither reports neither real bug, so free tools alone are not enough.
- Naive local scoring put both real bug sites at risk 1-3. Risk now **propagates**: a
  helper called by fund-moving functions inherits their risk, and a privileged setter of a
  parameter they read is lifted to 5. A test pins every judged bug site at >= 5.
  The score only sets priority; hunters always see the whole code.

| Agent | File | Output schema |
|---|---|---|
| 1 Spec & Invariant Extractor | `agents/agent1_extractor.py` | `InvariantsOutput` |
| 2 Context Architect & Router | `agents/agent2_router.py` (+ `preprocessor/ast_parser.py`) | `ContextMapOutput` (risk 1–10 per function) |
| 3 Tokenomics & DeFi | `agents/hunters.py` | `FindingsOutput` |
| 4 Bit-level Math | `agents/hunters.py` | `FindingsOutput` |
| 5 Edge-case & Integration | `agents/hunters.py` | `FindingsOutput` |
| 6 Skeptic | `agents/agent6_skeptic.py` | `SkepticOutput` → confirmed / downgraded / rejected / duplicate |

Design choices:
- **Parallel fan-out/fan-in:** hunters run concurrently; `raw_findings` merges via an `operator.add` reducer and the Skeptic waits for all three.
- **Fail closed:** a finding the Skeptic gives no verdict for is dropped. An agent that errors or refuses is recorded in `errors` and shown in the report; the rest of the graph keeps running.
- **No silent truncation:** codebases over ~600k chars are rejected with a message (audit a sub-directory or diff instead).
- **Models:** `config/models.yaml` routes each agent to a model plus an effort level. The default is `claude-opus-5-5` with adaptive thinking, and the Math agent runs at `effort: max`. Calls stream, enforce structured output, and use the server-side refusal fallback (`fallbacks: "default"`).
- **Report is deterministic** (no LLM), and is labelled *unverified* until Agent 7 proves findings with Foundry.

## Usage

```bash
cd ai-security-syndicate
pip install -e ".[dev]" slither-analyzer      # plus a solc binary on PATH or in $SYNDICATE_SOLC
syndicate audit benchmarks/micro/vault-inflation/contracts --static-only   # free, no API key
export ANTHROPIC_API_KEY=...                   # or `ant auth login`
syndicate audit path/to/contracts --docs spec.md --max-usd 2 --out reports/x.md
pytest                                         # offline; Slither tests skip if slither/solc are missing
```

`Dockerfile` bundles Python, Slither and solc (not yet built or tested in CI).

## Roadmap

| Phase | Scope | State |
|---|---|---|
| 1 | state, graph, Agents 1–6, CLI | **done** |
| 2 | Slither (+ optional Aderyn) feeding a deterministic Agent 2, Haiku triage, prompt caching, `--static-only` | **done** (Tree-sitter skipped: Slither already gives the AST facts) |
| 3 | Agent 7 + `sandbox/foundry_runner.py`: PoC test per finding, 3 self-healing compile retries, mainnet fork, `git diff` patch | |
| 5 → before 4 | Blind benchmark gym: micro-benchmarks, case loader and judges **done**; runner not written yet. Then real post-cutoff Code4rena/Sherlock contests, mutator | in progress |
| 4 | Qdrant post-mortem RAG + episodic failure memory | |
| 6 | GitHub Action PR scanner, web/Telegram UI | |

Not yet implemented: the OpenAI o3-mini / DeepSeek-R1 provider for Agent 4. The
`StructuredLLM` protocol in `llm.py` is the seam where a second provider plugs in.
