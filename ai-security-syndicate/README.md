# AI Security Auditing Syndicate (ایجنت‌های هکر کلاه سفید)

A white-hat, multi-agent smart-contract security auditor built on LangGraph +
Claude, with every agent output schema-enforced by Pydantic v2.

> Use only on code you own or are authorised to audit (your own repos, bug-bounty
> scopes, audit contests).

## Status: Phase 1 (Core MVP) ✅

```
START → A1 Invariants → A2 Router ─┬→ A3 DeFi  ─┐
                                   ├→ A4 Math  ─┼→ A6 Skeptic → Report → END
                                   └→ A5 Edge  ─┘
```

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
pip install -e ".[dev]"
export ANTHROPIC_API_KEY=...        # or `ant auth login`
syndicate audit examples/VulnerableVault.sol --docs spec.md --out reports/vault.md --json reports/vault.json
pytest                              # offline tests (FakeLLM), no API key needed
```

## Roadmap

| Phase | Scope | State |
|---|---|---|
| 1 | state, graph, Agents 1–6, CLI | **done** |
| 2 | Dockerized Slither / Aderyn / Tree-sitter feeding Agent 2 (replaces regex inventory) | next |
| 3 | Agent 7 + `sandbox/foundry_runner.py`: PoC test per finding, 3 self-healing compile retries, mainnet fork, `git diff` patch | |
| 5 → before 4 | Blind benchmark gym (Code4rena/Sherlock recall + precision), mutator | recommended to move earlier: you can't tell whether a change helps without it |
| 4 | Qdrant post-mortem RAG + episodic failure memory | |
| 6 | GitHub Action PR scanner, web/Telegram UI | |

Not yet implemented: the OpenAI o3-mini / DeepSeek-R1 provider for Agent 4. The
`StructuredLLM` protocol in `llm.py` is the seam where a second provider plugs in.
