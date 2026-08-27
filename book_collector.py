"""
Record the actual order book of the 5-minute BTC market, several times a window.

WHY THIS FILE EXISTS

Every number this project has ever produced rests on an assumption nobody has
ever checked. `docs/research/btc-5m-patterns.md` says it plainly: "no order-book
data was ever collected", and calls it the single biggest untested assumption in
the whole body of work. Win rates were measured against a 50c entry that was
never observed. The owner's real terms — $50 in, $90 back — imply 55.56c, and at
that price almost nothing survives.

It also answers the hedging question directly, which is what prompted it. Buying
both sides of the same market at the ASK is a guaranteed loss whenever the two
asks sum to more than $1, because the pair redeems for exactly $1 — one side
pays a dollar, the other pays nothing. So the question "can a bot make money by
hedging every window" reduces to a measurable one:

    does ask(UP) + ask(DOWN) ever drop below $1.00, and by how much, for how
    long, and in what size?

That is arbitrage, not prediction, and it needs no view on Bitcoin at all. It is
also the thing professional bots hunt in milliseconds, so the honest expectation
is that it is rare and thin. This file finds out instead of guessing.

WHAT IT RECORDS

For each 5-minute window, at several moments through it: best bid and ask on
both outcomes, the size resting at each of those prices, the depth of the whole
book, the two-sided sum, and the seconds remaining until the window closes. The
last of those matters — near the close the outcome is nearly decided, and a book
that is slow to reprice a near-certainty is the other thing worth looking for.

    python book_collector.py --selftest        # can this device reach the API?
    python book_collector.py                   # run and keep recording
    python book_collector.py --report          # what the recording says

Runs on the phone, not in the agent sandbox — the sandbox's network policy
answers 403 to CONNECT for gamma-api.polymarket.com, so it can never collect
this itself.
"""

import csv
import json
import os
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("TELEGRAM_TOKEN", "x")
import polymarket_collector as pmc

OUT = "book_log.csv"
GRAN = 300
# When to look inside a window, as seconds after it opens. Early for the entry
# price the strategies assume, late for the near-certainty question.
SAMPLES = (15, 60, 150, 240, 285)
HEAD = ["ts", "window_start", "secs_left", "outcome", "best_bid", "bid_size",
        "best_ask", "ask_size", "bid_levels", "ask_levels", "bid_depth",
        "ask_depth", "spread"]


def _tokens(market):
    """(outcome name, token id) pairs, lower-cased, or [] if the shape is odd."""
    outcomes = [str(o).lower() for o in pmc._jload(market.get("outcomes"), [])]
    toks = pmc._jload(market.get("clobTokenIds"), [])
    if len(toks) != len(outcomes) or not toks:
        return []
    return list(zip(outcomes, toks))


def read_book(token_id):
    """
    One side of the book, or None.

    Sizes are summed at the touch price specifically, not across the book: what
    matters for "could I have traded $500" is what sits at the best price, and
    total depth flatters that badly.
    """
    try:
        b = pmc.get(f"{pmc.CLOB}/book", token_id=token_id)
    except Exception:
        return None
    bids = [(float(x["price"]), float(x["size"])) for x in (b.get("bids") or [])
            if x.get("price") is not None]
    asks = [(float(x["price"]), float(x["size"])) for x in (b.get("asks") or [])
            if x.get("price") is not None]
    if not bids or not asks:
        return None
    bb = max(p for p, _ in bids)
    ba = min(p for p, _ in asks)
    return {
        "best_bid": bb, "best_ask": ba,
        "bid_size": sum(s for p, s in bids if p == bb),
        "ask_size": sum(s for p, s in asks if p == ba),
        "bid_levels": len(bids), "ask_levels": len(asks),
        "bid_depth": sum(s for _, s in bids), "ask_depth": sum(s for _, s in asks),
        "spread": round(ba - bb, 4),
    }


def append(rows):
    new = not os.path.exists(OUT)
    with open(OUT, "a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=HEAD)
        if new:
            w.writeheader()
        for r in rows:
            w.writerow(r)


def sample_once(market, window_start, now):
    rows = []
    for name, tok in _tokens(market):
        bk = read_book(tok)
        if not bk:
            continue
        rows.append(dict(ts=int(now), window_start=window_start,
                         secs_left=int(window_start + GRAN - now),
                         outcome=name, **bk))
    return rows


def selftest():
    """Can this device see the API at all, and does a book come back?"""
    print("1. gamma reachable?")
    try:
        pmc.get(f"{pmc.GAMMA}/markets", limit=1)
        print("   yes")
    except Exception as e:
        print(f"   NO — {repr(e)[:160]}")
        print("   This device cannot reach Polymarket. Nothing else will work.")
        return
    now = int(time.time())
    for boundary in ((now // GRAN) * GRAN, (now // GRAN) * GRAN + GRAN):
        print(f"2. market for {datetime.fromtimestamp(boundary, timezone.utc):%H:%M}?")
        m = pmc.market_for(boundary, deadline=time.time() + 25)
        if not m:
            print("   not found")
            continue
        print(f"   {m.get('slug')}")
        toks = _tokens(m)
        print(f"3. book on {len(toks)} outcome(s):")
        total_ask = total_bid = 0.0
        for name, tok in toks:
            bk = read_book(tok)
            if not bk:
                print(f"   {name}: empty book")
                continue
            total_ask += bk["best_ask"]
            total_bid += bk["best_bid"]
            print(f"   {name:<6} bid {bk['best_bid']:.3f} x{bk['bid_size']:>8,.0f}"
                  f"   ask {bk['best_ask']:.3f} x{bk['ask_size']:>8,.0f}"
                  f"   spread {bk['spread']:.3f}")
        if total_ask:
            print(f"\n   BUY BOTH SIDES AT THE ASK: ${total_ask:.4f} per $1 of payout")
            print(f"   SELL BOTH SIDES AT THE BID: ${total_bid:.4f}")
            if total_ask < 1.0:
                print(f"   *** asks sum BELOW $1 — free ${1 - total_ask:.4f} "
                      f"per dollar, before fees ***")
            else:
                print(f"   hedging both sides costs ${total_ask - 1:.4f} per "
                      f"dollar. That is the guaranteed loss.")
        return
    print("   no market found in either window.")


def run():
    print(f"recording to {OUT} — ctrl-C to stop")
    seen = set()
    while True:
        now = time.time()
        ws = int(now // GRAN) * GRAN
        into = now - ws
        # the next sample point still ahead of us in this window
        nxt = next((s for s in SAMPLES if s > into), None)
        if nxt is None:
            time.sleep(max(1.0, GRAN - into) + 0.5)
            continue
        time.sleep(max(0.0, ws + nxt - time.time()))
        now = time.time()
        ws = int(now // GRAN) * GRAN
        key = (ws, nxt)
        if key in seen:
            time.sleep(1.0)
            continue
        seen.add(key)
        if len(seen) > 500:
            seen = set(list(seen)[-200:])
        try:
            m = pmc.market_for(ws, deadline=time.time() + 20)
        except Exception as e:
            print(f"  {datetime.now():%H:%M:%S} market lookup failed: "
                  f"{repr(e)[:80]}")
            continue
        if not m:
            print(f"  {datetime.now():%H:%M:%S} no market for this window")
            continue
        rows = sample_once(m, ws, now)
        if rows:
            append(rows)
            asks = {r["outcome"]: r["best_ask"] for r in rows}
            tot = sum(asks.values()) if len(asks) == 2 else 0.0
            flag = "  <<< ASKS SUM BELOW $1" if 0 < tot < 1.0 else ""
            print(f"  {datetime.now():%H:%M:%S} t-{rows[0]['secs_left']:>3}s  "
                  + "  ".join(f"{k} {v:.3f}" for k, v in sorted(asks.items()))
                  + f"   sum {tot:.4f}{flag}")
        else:
            print(f"  {datetime.now():%H:%M:%S} book empty")


def report():
    if not os.path.exists(OUT):
        print(f"{OUT} not found — run the collector first.")
        return
    rows = []
    with open(OUT, newline="") as f:
        for r in csv.DictReader(f):
            for k in ("best_bid", "best_ask", "bid_size", "ask_size",
                      "bid_depth", "ask_depth", "spread"):
                r[k] = float(r[k])
            for k in ("ts", "window_start", "secs_left"):
                r[k] = int(r[k])
            rows.append(r)
    if not rows:
        print("no rows yet.")
        return

    # pair the two outcomes of the same window at the same instant
    pairs = defaultdict(dict)
    for r in rows:
        pairs[(r["window_start"], r["secs_left"])][r["outcome"]] = r
    both = [v for v in pairs.values() if len(v) == 2]
    print("=" * 78)
    print(f"  {len(rows):,} book readings · {len({r['window_start'] for r in rows}):,}"
          f" windows · {len(both):,} paired snapshots")
    t0 = datetime.fromtimestamp(min(r["ts"] for r in rows))
    t1 = datetime.fromtimestamp(max(r["ts"] for r in rows))
    print(f"  {t0:%Y-%m-%d %H:%M} -> {t1:%Y-%m-%d %H:%M}")
    print("=" * 78)

    print("\n  1. CAN YOU HEDGE BOTH SIDES FOR A PROFIT?")
    print("  " + "-" * 60)
    sums = sorted(sum(v[o]["best_ask"] for o in v) for v in both)
    if sums:
        free = [s for s in sums if s < 1.0]
        print(f"  cheapest both-sides cost   ${sums[0]:.4f}")
        print(f"  median                     ${sums[len(sums) // 2]:.4f}")
        print(f"  snapshots below $1.00      {len(free):,} of {len(sums):,}"
              f"  ({len(free) / len(sums) * 100:.2f}%)")
        if free:
            print(f"  best free edge             ${1 - free[0]:.4f} per dollar")
            print("  -> real arbitrage appeared. Check the size at those prices")
            print("     before believing it is tradeable.")
        else:
            print("  -> never. Hedging both sides is a guaranteed loss here,")
            print(f"     costing ${sums[len(sums) // 2] - 1:.4f} per dollar at the median.")

    print("\n  2. WHAT PRICE COULD YOU ACTUALLY GET?  (per moment in the window)")
    print("  " + "-" * 60)
    print(f"  {'secs left':>10}{'n':>7}{'median ask':>13}{'median spread':>15}"
          f"{'size at ask':>13}")
    by_t = defaultdict(list)
    for r in rows:
        by_t[r["secs_left"] // 15 * 15].append(r)
    for k in sorted(by_t, reverse=True):
        g = by_t[k]
        asks = sorted(x["best_ask"] for x in g)
        sp = sorted(x["spread"] for x in g)
        sz = sorted(x["ask_size"] for x in g)
        print(f"  {k:>10}{len(g):>7,}{asks[len(asks) // 2]:>13.4f}"
              f"{sp[len(sp) // 2]:>15.4f}{sz[len(sz) // 2]:>13,.0f}")

    print("\n  3. HOW BIG A TRADE FITS AT THE BEST PRICE?")
    print("  " + "-" * 60)
    sz = sorted(r["ask_size"] for r in rows)
    for q, lbl in ((10, "worst 10%"), (50, "median"), (90, "best 10%")):
        print(f"  {lbl:<12}{sz[int(len(sz) * q / 100) - 1]:>12,.0f} shares"
              f"  (~${sz[int(len(sz) * q / 100) - 1] * 0.55:,.0f} at 55c)")
    print("\n  A trade bigger than this walks up the book, and the whole edge")
    print("  measured anywhere in this project is about 1.7 cents wide.")
    print("=" * 78)


def main():
    argv = sys.argv[1:]
    if "--selftest" in argv:
        selftest()
    elif "--report" in argv:
        report()
    else:
        try:
            run()
        except KeyboardInterrupt:
            print("\nstopped.")


if __name__ == "__main__":
    main()
