# CLAUDE.md

Guidance for AI agents working in this repository.

## Agent skills

### Issue tracker

Issues and PRDs are tracked as **GitHub issues** (`Morashidian8/Tictactoestevie`) via the `gh` CLI. External PRs are **not** a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical vocabulary — `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

**Multi-context** layout: `CONTEXT-MAP.md` at the root points at one `CONTEXT.md` per sub-project. See `docs/agents/domain.md`.

## Trading research — read before touching PolyBot strategy

`docs/research/btc-5m-patterns.md` holds the settled findings on BTC 5-minute
candle patterns (162k real candles, chronological train/test, multiple-testing
corrected). Load the `btc-patterns` skill for the short version. Three facts that
override intuition and must not be re-litigated from scratch:

- **No >90% next-candle pattern exists** — cherry-picking on the test set across
  114,003 rules tops out at 65.3%, and shuffled random labels produce *better*
  in-sample patterns than the real data.
- **The measured edge is mean reversion (fade), ~55–57%** — while every
  `follow1`..`follow15` strategy in `polybot_web/index.html` bets *with* the
  previous candle, i.e. against the edge.
- **The 50% baseline is statistical, not a market price.** No Polymarket
  order-book data has ever been collected; the edge dies above ~55c.

### Entry price — settled, do not raise again

**Price every calculation at 50c and stop there.** A win pays the stake, a loss
costs it. This is the owner's standing instruction, given 2026-08-20 after the
point had been made to them repeatedly and in detail; it is a decision, not an
oversight, and it is not to be reopened.

That means: no 52c/55c comparison columns, no "but at the real price…" footnote
appended to a result, and no proposal to lower `ENTRY_MAX_PRICE`. Scripts take a
price parameter so an explicit request can still be served, but the default is
0.50 and the default output shows that one number only. Do not ask about it.
