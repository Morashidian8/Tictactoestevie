"""
Every signal the rules would have fired over the last month, graded by
Polymarket's own settlements.

The live ledger only goes back to the day it was written. This reconstructs the
whole month: the rules are re-run over a full 5-minute price series, and every
signal they produce is scored against the outcome Polymarket actually paid —
not against a close computed here.

    python replay_month.py            # 30 days
    python replay_month.py 14         # a shorter span

Writes signals_month.csv (one row per signal, in order) and prints a summary.
Nothing here touches the bot or its records.
"""

import csv
import os
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

os.environ.setdefault("TELEGRAM_TOKEN", "x")          # bot.py refuses to import bare
import requests

import bot
import polymarket_collector as pmc

GRAN = bot.GRANULARITY
CHART = os.environ.get("CHART_FILE", "polymarket_chart.csv")
OUT = os.environ.get("SIGNALS_FILE", "signals_month.csv")
COLS = ("n", "window_epoch", "et", "tehran", "bet", "rules",
        "polymarket", "result", "close")
UA = {"User-Agent": "btc-replay/1.0"}


# --------------------------------------------------------------------------- #
# the price series
# --------------------------------------------------------------------------- #
def _bybit(start_ms, end_ms):
    r = requests.get("https://api.bybit.com/v5/market/kline", timeout=30,
                     headers=UA, params={"category": "spot", "symbol": "BTCUSDT",
                                         "interval": "5", "start": start_ms,
                                         "end": end_ms, "limit": 1000})
    r.raise_for_status()
    rows = (r.json().get("result") or {}).get("list") or []
    return [(int(x[0]) // 1000, float(x[4])) for x in rows]


def _binance(start_ms, end_ms):
    for host in ("https://data-api.binance.vision", "https://api.binance.com"):
        try:
            r = requests.get(f"{host}/api/v3/klines", timeout=30, headers=UA,
                             params={"symbol": "BTCUSDT", "interval": "5m",
                                     "startTime": start_ms, "endTime": end_ms,
                                     "limit": 1000})
            r.raise_for_status()
            return [(int(x[0]) // 1000, float(x[4])) for x in r.json()]
        except Exception:
            continue
    return []


def _okx(start_ms, end_ms):
    r = requests.get("https://www.okx.com/api/v5/market/history-candles",
                     timeout=30, headers=UA,
                     params={"instId": "BTC-USDT", "bar": "5m",
                             "after": end_ms, "limit": 300})
    r.raise_for_status()
    return [(int(x[0]) // 1000, float(x[4]))
            for x in (r.json().get("data") or [])
            if start_ms <= int(x[0]) <= end_ms]


VENUES = (("bybit", _bybit, 1000), ("binance", _binance, 1000), ("okx", _okx, 300))


def fetch_closes(start, end):
    """
    A contiguous 5-minute close series for [start, end), from whichever venue
    answers.

    One venue for the whole span, never a blend. The rules read rolling extremes
    and a volatility ratio, and a series stitched from two venues carries their
    price difference as a fake candle at every seam — the exact failure that
    once fabricated a $47 move and settled a real bet on it.
    """
    for name, fn, step in VENUES:
        got, cursor, fails = {}, start, 0
        while cursor < end and fails < 3:
            try:
                rows = fn(cursor * 1000, min(end, cursor + step * GRAN) * 1000)
            except Exception as exc:
                fails += 1
                print(f"  {name}: {type(exc).__name__}, retrying")
                time.sleep(2)
                continue
            fresh = {t: c for t, c in rows if start <= t < end and c > 0}
            if not fresh:
                break
            got.update(fresh)
            cursor = max(fresh) + GRAN
            print(f"  {name}: {len(got):>6,} candles "
                  f"→ {datetime.fromtimestamp(cursor, timezone.utc):%m-%d %H:%M}",
                  end="\r")
        if len(got) > (end - start) // GRAN * 0.9:
            print(f"\n  price series from {name}: {len(got):,} candles")
            return got
        print(f"\n  {name}: only {len(got):,} — trying the next venue")
    return {}


def load_outcomes():
    out = {}
    if not os.path.exists(CHART):
        return out
    with open(CHART, newline="") as f:
        for cells in csv.reader(f):
            if not cells or not cells[0].strip().isdigit():
                continue
            w = next((c.strip().lower() for c in cells[1:]
                      if c.strip().lower() in ("up", "down")), None)
            if w:
                out[int(cells[0])] = w
    return out


def main():
    days = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 30
    now = int(time.time()) // GRAN * GRAN
    end = now
    # The rules need history before the first window they can judge.
    warmup = (bot.BREAKOUT_FULL_HISTORY + bot.RULE8_MA + 5) * GRAN
    start = end - days * 86400

    outcomes = load_outcomes()
    print(f"outcomes: {len(outcomes):,} settled windows from {CHART}")
    if not outcomes:
        print("none — run chart_pull.py first.")
        return

    print(f"fetching {days} days of 5-minute closes …")
    closes = fetch_closes(start - warmup, end)
    if not closes:
        print("no venue returned a usable series.")
        return

    ts = sorted(closes)
    rows, ungraded = [], 0
    per = defaultdict(lambda: [0, 0])
    print(f"\nreplaying {len(ts):,} windows …")
    for i in range(len(ts) - 1):
        t = ts[i]
        if t < start:
            continue
        # Contiguity: the rules are meaningless across a hole, so require a
        # clean run behind this window before judging it.
        need = bot.BREAKOUT_FULL_HISTORY + bot.RULE8_MA
        if i < need or ts[i - need] != t - need * GRAN:
            continue
        window = [closes[x] for x in ts[i - need:i + 1]]
        hits = bot.BreakoutMonitor.evaluate(window)
        if not hits:
            continue
        bets = {h[2] for h in hits}
        if len(bets) != 1:
            continue
        bet = bets.pop()
        # The signal fired at the close of window t, so it bets on t + one.
        target = t + GRAN
        winner = outcomes.get(target)
        if winner is None:
            ungraded += 1
            continue
        won = bet == winner
        for name, _, _, _ in hits:
            per[name][0] += 1
            per[name][1] += won
        rows.append({"n": len(rows) + 1, "window_epoch": target,
                     "et": datetime.fromtimestamp(target, pmc.ET)
                                   .strftime("%m-%d %I:%M%p"),
                     "tehran": datetime.fromtimestamp(target, bot.TEHRAN)
                                       .strftime("%m-%d %H:%M"),
                     "bet": bet, "rules": " + ".join(h[0] for h in hits),
                     "polymarket": winner, "result": "WIN" if won else "LOSS",
                     "close": f"{closes[t]:.2f}"})

    if not rows:
        print("no signal in this span could be graded.")
        return
    with open(OUT, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=COLS)
        w.writeheader()
        w.writerows(rows)

    won = sum(1 for r in rows if r["result"] == "WIN")
    n = len(rows)
    lo, hi = bot._wilson(won, n)
    print(f"\n{'=' * 68}")
    print(f"{n:,} signals · {won:,} won · {won/n*100:.2f}%  "
          f"[{lo*100:.2f}–{hi*100:.2f}]   ({ungraded:,} ungraded)")
    print("=" * 68)
    print(f"{'rule':<34}{'n':>7}{'won':>7}{'rate':>9}{'95% CI':>16}")
    for name, (tot, w_) in sorted(per.items(), key=lambda kv: -kv[1][0]):
        a, b = bot._wilson(w_, tot)
        print(f"{name[:33]:<34}{tot:>7,}{w_:>7,}{w_/tot*100:>8.2f}%"
              f"   [{a*100:>5.1f}–{b*100:<5.1f}]")

    print(f"\nfull list written to {OUT} ({n:,} rows, in order)")
    print(f"\nlast 15:")
    for r in rows[-15:]:
        print(f"  {r['n']:>5}  {r['et']:<14} {r['bet']:<5} "
              f"{r['result']:<5} {r['rules'][:44]}")


if __name__ == "__main__":
    main()
