"""
Find the wallets that actually win the BTC 5-minute market, and tell them apart
from the ones that only look like it.

Three phases, run separately because the middle one is slow and the network is
not always there:

    python whale_hunt.py --probe              # what does the API actually serve?
    python whale_hunt.py --collect --days 7   # harvest markets and fills
    python whale_hunt.py --analyze            # the verdict

The probe comes first on purpose. Guessing the shape of this API has already
cost this project an hour of the owner's evening; the endpoints, their field
names and their paging limits are established from evidence before anything is
built on them.

WHAT THE ANALYSIS IS ACTUALLY FOR

A leaderboard by win rate is worthless on its own. Among a few thousand wallets
several dozen will look brilliant on luck alone, and nothing in the ranking says
which. Worse, the two commonest ways to appear at the top are not skill:

  hedging      buying both sides of the same market. The position cannot lose,
               it also cannot win, and it inflates the trade count.
  making       quoting both sides continuously for the spread. High volume,
               near-50c average price, no directional opinion at all.

So four things are computed per wallet, and a wallet has to survive all four:

  1. DIRECTIONAL ONLY — markets where the wallet ended up net long exactly one
     outcome. Both-sides markets are counted and reported, never scored.
  2. REALIZED P&L, not win rate. A share bought at 65c that wins pays 35c; the
     same share losing costs 65c. Winning 60% at 65c loses money. Price is
     where the money is, so price is what gets counted.
  3. SPLIT-HALF — rank on the first half of the span, score the same wallets on
     the second. Skill correlates across the halves; luck does not, and that
     answer is worth as much because it stops the search.
  4. BONFERRONI over the number of wallets screened. With K wallets the best of
     them clears +2 sigma by chance almost every time.
"""

import csv
import json
import os
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone

import requests

os.environ.setdefault("TELEGRAM_TOKEN", "x")
import chart_pull as CP          # the paging that is already proven correct

GAMMA = "https://gamma-api.polymarket.com"
DATA = "https://data-api.polymarket.com"
UA = {"User-Agent": "btc-whale-hunt/1.0"}
MARKETS_FILE = os.environ.get("WHALE_MARKETS", "whale_markets.csv")
TRADES_FILE = os.environ.get("WHALE_TRADES", "whale_trades.csv")
ASSET = os.environ.get("WHALE_ASSET", "btc")
GRAN = 300
MCOLS = ("window_epoch", "condition_id", "slug", "winner")
TCOLS = ("window_epoch", "condition_id", "wallet", "name", "outcome",
         "side", "price", "size", "ts")


def get(url, **params):
    r = requests.get(url, params=params or None, timeout=30, headers=UA)
    r.raise_for_status()
    return r.json()


# --------------------------------------------------------------------------- #
# phase 1 — probe
# --------------------------------------------------------------------------- #
def probe():
    """
    Establish, from evidence, what this API serves today.

    Every assumption printed here is one that does not have to be guessed at
    later: which endpoints answer, what a row is called, whether a leaderboard
    exists, and what the paging ceiling is.
    """
    print("=" * 74)
    print("A. can we reach the two hosts at all?")
    print("=" * 74)
    for name, url in (("gamma", f"{GAMMA}/markets?limit=1"),
                      ("data-api", f"{DATA}/trades?limit=1")):
        try:
            r = requests.get(url, timeout=20, headers=UA)
            print(f"  {name:<10} HTTP {r.status_code}  {len(r.text):,} bytes")
        except Exception as exc:  # noqa: BLE001
            print(f"  {name:<10} FAILED  {type(exc).__name__}: {exc}")
            return

    print("\n" + "=" * 74)
    print("B. one recent 5-minute market — what fields does it carry?")
    print("=" * 74)
    # NOT by slug. /markets?slug=... returns nothing even for a market the same
    # endpoint just listed — established earlier in this project and written
    # down at the top of chart_pull.py. The date range is slow and correct.
    now = int(time.time()) // GRAN * GRAN
    rows, truncated = CP.fetch_range(now - 7200, now)
    print(f"  markets ending in the last 2 hours: {len(rows):,}"
          f"{'  (TRUNCATED at the offset wall)' if truncated else ''}")
    found = None
    for m in rows:
        hit = CP._SLUG.match((m.get("slug") or "").lower())
        if hit and hit.group(1) == ASSET:
            found = m
            break
    if not found:
        seen = sorted({CP._SLUG.match((m.get("slug") or "").lower()).group(1)
                       for m in rows
                       if CP._SLUG.match((m.get("slug") or "").lower())})
        print(f"  no '{ASSET}' market in that window.")
        print(f"  5-minute assets actually present: {', '.join(seen) or 'none'}")
        print(f"  set WHALE_ASSET to one of those and re-run.")
        return
    print(f"  slug: {found.get('slug')}")
    print(f"  keys: {', '.join(sorted(found)[:26])}")
    for k in ("conditionId", "condition_id", "id", "outcomes", "outcomePrices",
              "closed", "volume", "clobTokenIds"):
        if k in found:
            print(f"    {k:<16} {str(found[k])[:70]}")
    cid = found.get("conditionId") or found.get("condition_id")

    print("\n" + "=" * 74)
    print("C. trades for that market — do they exist, and what is a row?")
    print("=" * 74)
    if not cid:
        print("  no conditionId on the market; cannot ask for trades.")
        return
    for params in ({"market": cid, "limit": 5},
                   {"conditionId": cid, "limit": 5},
                   {"market": cid, "limit": 5, "takerOnly": "false"}):
        try:
            rows = get(f"{DATA}/trades", **params)
        except Exception as exc:  # noqa: BLE001
            print(f"  {params} -> {type(exc).__name__}")
            continue
        if isinstance(rows, dict):
            rows = rows.get("data") or rows.get("trades") or []
        print(f"  {params} -> {len(rows)} rows")
        if rows:
            print(f"    keys: {', '.join(sorted(rows[0]))}")
            print(f"    first: {json.dumps(rows[0])[:400]}")
            break

    print("\n" + "=" * 74)
    print("D. is there a leaderboard endpoint we could use instead?")
    print("=" * 74)
    for path, params in (("/leaderboard", {"limit": 3}),
                         ("/rankings", {"limit": 3}),
                         ("/traders", {"limit": 3}),
                         ("/holders", {"market": cid, "limit": 3})):
        try:
            r = requests.get(f"{DATA}{path}", params=params, timeout=15,
                             headers=UA)
            note = f"HTTP {r.status_code}"
            if r.status_code == 200:
                note += f"  {r.text[:160]}"
            print(f"  {path:<14} {note}")
        except Exception as exc:  # noqa: BLE001
            print(f"  {path:<14} {type(exc).__name__}")

    print("\n" + "=" * 74)
    print("E. paging ceiling on trades — where does it stop answering?")
    print("=" * 74)
    for lim in (100, 500, 1000):
        try:
            rows = get(f"{DATA}/trades", market=cid, limit=lim)
            if isinstance(rows, dict):
                rows = rows.get("data") or []
            print(f"  limit={lim:<5} -> {len(rows)} rows")
        except Exception as exc:  # noqa: BLE001
            print(f"  limit={lim:<5} -> {type(exc).__name__}")
    for off in (0, 500, 1000, 2000):
        try:
            rows = get(f"{DATA}/trades", market=cid, limit=100, offset=off)
            if isinstance(rows, dict):
                rows = rows.get("data") or []
            print(f"  offset={off:<5} -> {len(rows)} rows")
        except Exception as exc:  # noqa: BLE001
            print(f"  offset={off:<5} -> {type(exc).__name__}")
    print("\nRun --collect once the shapes above look right.")


# --------------------------------------------------------------------------- #
# phase 2 — collect
# --------------------------------------------------------------------------- #
def _append(path, cols, rows):
    fresh = not os.path.exists(path) or os.path.getsize(path) == 0
    with open(path, "a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        if fresh:
            w.writeheader()
        for r in rows:
            w.writerow(r)
        f.flush()
        os.fsync(f.fileno())


def _seen(path, key):
    out = set()
    if not os.path.exists(path):
        return out
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            v = r.get(key)
            if v:
                out.add(v)
    return out


def pick(d, *names, default=None):
    for n in names:
        if d.get(n) not in (None, ""):
            return d[n]
    return default


def collect(days):
    """
    Harvest resolved 5-minute markets and every published fill in them.

    Resumable on purpose: this is thousands of requests over a connection that
    drops, and a run that cannot be continued is a run that never finishes. Both
    files are append-only and already-fetched markets are skipped.
    """
    now = int(time.time()) // GRAN * GRAN
    start = now - days * 86400
    have_m = _seen(MARKETS_FILE, "condition_id")
    have_t = _seen(TRADES_FILE, "condition_id")
    print(f"{len(have_m):,} markets and {len(have_t):,} traded markets already "
          f"on disk")

    # --- markets ---------------------------------------------------------- #
    # Ranged and halved exactly as chart_pull does it: Gamma stops answering
    # past offset 2000, so a span holding more than ~2,100 markets silently
    # returns only its earliest ones. Asking by slug does not work at all.
    fresh, span = [], 3600
    cur = start
    while cur < now:
        hi = min(cur + span, now)
        rows = CP.collect_span(cur, hi)
        for m in rows:
            hit = CP._SLUG.match((m.get("slug") or "").lower())
            if not hit or hit.group(1) != ASSET:
                continue
            t = int(hit.group(2))
            cid = str(pick(m, "conditionId", "condition_id", default=""))
            if not cid or cid in have_m:
                continue
            try:
                prices = m.get("outcomePrices")
                if isinstance(prices, str):
                    prices = json.loads(prices)
                outs = m.get("outcomes")
                if isinstance(outs, str):
                    outs = json.loads(outs)
                winner = ""
                if prices and outs and len(prices) == len(outs):
                    for o, p in zip(outs, prices):
                        if float(p) > 0.9:
                            winner = str(o).lower()
            except Exception:  # noqa: BLE001
                winner = ""
            if not winner:
                continue              # unresolved: nothing to score against
            fresh.append({"window_epoch": t, "condition_id": cid,
                          "slug": hit.group(0), "winner": winner})
            have_m.add(cid)
        if fresh:
            _append(MARKETS_FILE, MCOLS, fresh)
            fresh = []
        print(f"  markets {len(have_m):,}  "
              f"{datetime.fromtimestamp(cur, timezone.utc):%m-%d %H:%M}",
              end="\r")
        cur = hi
    print(f"\n  {len(have_m):,} resolved {ASSET} markets on disk")

    # --- trades ----------------------------------------------------------- #
    todo = []
    with open(MARKETS_FILE, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r["condition_id"] not in have_t:
                todo.append(r)
    print(f"  {len(todo):,} markets still need their fills")
    batch, done, capped = [], 0, 0
    for r in todo:
        cid = r["condition_id"]
        try:
            rows = get(f"{DATA}/trades", market=cid, limit=1000)
        except Exception:
            time.sleep(1)
            continue
        if isinstance(rows, dict):
            rows = rows.get("data") or rows.get("trades") or []
        if rows and len(rows) >= 1000:
            capped += 1          # offset is ignored by this API: 1000 is a wall
        for tr in rows or []:
            try:
                size = float(pick(tr, "size", "amount", "shares", default=0) or 0)
                price = float(pick(tr, "price", "avgPrice", default=0) or 0)
            except (TypeError, ValueError):
                continue
            if size <= 0 or not 0 < price < 1:
                continue
            batch.append({
                "window_epoch": r["window_epoch"], "condition_id": cid,
                "wallet": str(pick(tr, "proxyWallet", "maker", "user", "wallet",
                                   default=""))[:44].lower(),
                "name": str(pick(tr, "pseudonym", "name", default=""))[:28],
                "outcome": str(pick(tr, "outcome", "outcomeIndex",
                                    default=""))[:8].lower(),
                "side": str(pick(tr, "side", default=""))[:4].upper(),
                "price": f"{price:.4f}", "size": f"{size:.2f}",
                "ts": int(pick(tr, "timestamp", "matchtime", default=0) or 0)})
        # Mark the market done even when it had no fills, or every empty market
        # is re-fetched on every run for ever.
        if not rows:
            batch.append({"window_epoch": r["window_epoch"],
                          "condition_id": cid, "wallet": "", "name": "",
                          "outcome": "", "side": "", "price": "0",
                          "size": "0", "ts": 0})
        done += 1
        if len(batch) >= 400:
            _append(TRADES_FILE, TCOLS, batch)
            batch = []
        if done % 20 == 0:
            print(f"  fills {done:,}/{len(todo):,}", end="\r")
    if batch:
        _append(TRADES_FILE, TCOLS, batch)
    print(f"\n  done ({capped:,} markets hit the 1,000-fill ceiling). run --analyze")


# --------------------------------------------------------------------------- #
# phase 3 — analyse
# --------------------------------------------------------------------------- #
def wilson(w, n, z=1.96):
    if not n:
        return 0.0, 0.0
    p = w / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    m = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5)
    return max(0.0, (c - m) / d), min(1.0, (c + m) / d)


def analyse(min_markets):
    """
    Score every wallet by CASH, not by position.

    The probe settled why this matters: the very first fill it returned was a
    SELL at 0.999 — someone taking their money out once the outcome was no
    longer in doubt. An accounting built on the position left at resolution
    calls that wallet flat and drops it, which would discard precisely the
    traders who are good enough to leave early.

    So every fill is a cash movement: a buy pays out, a sell takes in, and
    whatever is still held when the market resolves pays 1.0 a share if it won
    and nothing if it did not. That is the whole profit and loss, and it is the
    same arithmetic whether the wallet held to the end or traded out.
    """
    if not os.path.exists(TRADES_FILE):
        print(f"{TRADES_FILE} not found — run --collect first.")
        return
    winner, when = {}, {}
    with open(MARKETS_FILE, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            winner[r["condition_id"]] = r["winner"]
            when[r["condition_id"]] = int(r["window_epoch"])
    if not when:
        print("no markets on disk.")
        return

    cash = defaultdict(float)      # (wallet, market) -> net cash from trading
    held = defaultdict(float)      # (wallet, market, outcome) -> shares left
    bought = defaultdict(float)    # (wallet, market) -> gross bought, for size
    sides = defaultdict(set)
    took = defaultdict(set)        # outcomes actually BOUGHT — the call itself
    buy_px = defaultdict(float)
    buy_sh = defaultdict(float)
    names = {}
    with open(TRADES_FILE, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            w = r["wallet"]
            if not w:
                continue
            try:
                sz, pr = float(r["size"]), float(r["price"])
            except (TypeError, ValueError):
                continue
            if sz <= 0 or not 0 < pr <= 1:
                continue
            cid, out = r["condition_id"], r["outcome"]
            if r.get("name") and w not in names:
                names[w] = r["name"]
            if r["side"] == "SELL":
                cash[(w, cid)] += sz * pr
                held[(w, cid, out)] -= sz
            else:
                cash[(w, cid)] -= sz * pr
                held[(w, cid, out)] += sz
                bought[(w, cid)] += sz * pr
                buy_px[(w, cid)] += sz * pr
                buy_sh[(w, cid)] += sz
                took[(w, cid)].add(out)
            sides[(w, cid)].add(out)

    # settle whatever is still held when the market resolved
    for (w, cid, out), sh in held.items():
        if abs(sh) < 1e-9:
            continue
        cash[(w, cid)] += sh * (1.0 if winner.get(cid, "") == out else 0.0)

    # ---- data quality, before any conclusion is drawn from it ------------- #
    # 91% of markets hit the 1,000-fill ceiling on the first collection and the
    # API ignores `offset`, so what we hold is a SLICE of each busy market, not
    # all of it. Which slice decides whether the numbers below mean anything:
    # if the fills cluster at the end of the window at prices near 1.0, we are
    # looking at people cashing out a decided market and every entry is missing.
    span, px, per = defaultdict(list), [], defaultdict(int)
    with open(TRADES_FILE, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if not r["wallet"]:
                continue
            cid = r["condition_id"]
            per[cid] += 1
            try:
                ts, pr = int(r["ts"]), float(r["price"])
            except (TypeError, ValueError):
                continue
            if ts and cid in when:
                span[cid].append(ts - when[cid])
            px.append(pr)
    capped = sum(1 for c, n in per.items() if n >= 1000)
    print(f"\n{'=' * 104}")
    print("DATA QUALITY — is what we collected usable?")
    print("=" * 104)
    print(f"  markets with fills: {len(per):,}   at the 1,000 ceiling: "
          f"{capped:,} ({capped / max(len(per), 1) * 100:.0f}%)")
    if px:
        px.sort()
        buckets = [(0.0, 0.1), (0.1, 0.3), (0.3, 0.7), (0.7, 0.9), (0.9, 1.01)]
        print(f"  fill prices:", end=" ")
        for lo_, hi_ in buckets:
            k = sum(1 for x in px if lo_ <= x < hi_)
            print(f"{lo_:.1f}-{hi_:.1f}: {k / len(px) * 100:.0f}%", end="  ")
        print()
    offs = [o for v in span.values() for o in v]
    if offs:
        offs.sort()
        q = lambda f: offs[int(len(offs) * f)]
        print(f"  seconds into the 300s window: min {offs[0]}  "
              f"25% {q(.25)}  median {q(.5)}  75% {q(.75)}  max {offs[-1]}")
        early = sum(1 for o in offs if o < 150) / len(offs) * 100
        print(f"  fills in the FIRST half of the window: {early:.0f}%")
        if early < 20:
            print("  !! almost nothing from the first half — these are exits,")
            print("     not entries, and the P&L below cannot be trusted.")
        else:
            print("  entries are present; the slice is usable.")

    mid = sorted(when.values())[len(when) // 2]
    S = defaultdict(lambda: {"mk": 0, "pnl": 0.0, "stake": 0.0, "both": 0,
                             "held": 0, "won": 0, "first": 0.0, "second": 0.0,
                             "px": 0.0, "sh": 0.0, "out": 0})
    for (w, cid), c in cash.items():
        s = S[w]
        s["mk"] += 1
        s["pnl"] += c
        s["stake"] += bought[(w, cid)]
        if len(sides[(w, cid)]) > 1:
            s["both"] += 1
        # The call: one side bought and no other. Whether they then sold it
        # back at 0.99 or carried it to resolution is a question about exits,
        # not about whether they were right.
        if len(took[(w, cid)]) == 1:
            s["held"] += 1
            o = next(iter(took[(w, cid)]))
            s["won"] += 1 if winner.get(cid, "") == o else 0
            s["sh"] += buy_sh[(w, cid)]
            s["px"] += buy_px[(w, cid)]
        if abs(sum(held[(w, cid, o)] for o in sides[(w, cid)])) < 1e-9:
            s["out"] += 1
        (s.__setitem__("first", s["first"] + c) if when.get(cid, 0) < mid
         else s.__setitem__("second", s["second"] + c))

    rows = [(w, s) for w, s in S.items() if s["mk"] >= min_markets]
    if not rows:
        print(f"no wallet has {min_markets}+ markets yet — collect more days.")
        return
    K = len(rows)
    print(f"\n{'=' * 104}")
    print(f"{len(S):,} wallets · {K:,} with {min_markets}+ markets · "
          f"{len(winner):,} resolved markets · priced as cash in minus cash out")
    print("=" * 104)
    rows.sort(key=lambda r: -r[1]["pnl"])
    print(f"  {'wallet':<13}{'name':<16}{'mkts':>6}{'both':>6}{'calls':>6}"
          f"{'win%':>7}{'avg px':>8}{'staked':>11}{'P&L':>10}{'ROI':>7}"
          f"{'1st':>9}{'2nd':>9}")
    for w, s in rows[:30]:
        avg = s["px"] / s["sh"] if s["sh"] else 0
        roi = s["pnl"] / s["stake"] * 100 if s["stake"] > 0 else 0
        wr = s["won"] / s["held"] * 100 if s["held"] else 0
        print(f"  {w[:11]:<13}{names.get(w, '')[:14]:<16}{s['mk']:>6}"
              f"{s['both']:>6}{s['held']:>6}{wr:>6.1f}%{avg:>8.3f}"
              f"{s['stake']:>11,.0f}{s['pnl']:>+10,.0f}{roi:>+6.1f}%"
              f"{s['first']:>+9,.0f}{s['second']:>+9,.0f}")

    print(f"\n{'-' * 104}")
    print("DOES THE FIRST HALF PREDICT THE SECOND?")
    print(f"{'-' * 104}")
    a = [s["first"] for _, s in rows]
    b = [s["second"] for _, s in rows]
    n = len(a)
    ma, mb = sum(a) / n, sum(b) / n
    va = sum((x - ma) ** 2 for x in a) / n
    vb = sum((x - mb) ** 2 for x in b) / n
    cov = sum((x - ma) * (y - mb) for x, y in zip(a, b)) / n
    r = cov / ((va * vb) ** 0.5) if va > 0 and vb > 0 else 0.0
    print(f"  correlation of per-wallet P&L across the halves: r = {r:+.3f}")
    top = sorted(rows, key=lambda x: -x[1]["first"])[:max(3, n // 10)]
    print(f"  the top {len(top)} of half one earned "
          f"${sum(s['second'] for _, s in top):+,.0f} in half two")
    print("  skill persists across halves; luck does not — and that answer is")
    print("  worth as much, because it ends the search.")

    from statistics import NormalDist
    bar = NormalDist().inv_cdf(1 - 0.05 / (2 * K))
    print(f"\n  with K={K:,} wallets screened, |z| must reach {bar:.2f}.")
    print(f"  {'wallet':<13}{'name':<16}{'held':>6}{'win%':>7}{'z':>8}   verdict")
    for w, s in rows[:12]:
        if not s["held"]:
            continue
        z = (s["won"] / s["held"] - 0.5) / (0.25 / s["held"]) ** 0.5
        flags = []
        if z >= bar and s["pnl"] > 0:
            flags.append("SURVIVES")
        elif z >= bar:
            # The trap this whole script exists to catch: calls the direction
            # right and still loses, because the entry price ate the edge. A
            # leaderboard sorted by win rate puts this wallet at the top.
            flags.append(f"wins {s['won'] / s['held'] * 100:.0f}% and STILL "
                         f"LOSES — pays {s['px'] / s['sh']:.2f}")
        elif z <= -bar:
            flags.append("reliably WRONG — fade them")
        if s["both"] > s["mk"] * 0.3:
            flags.append("hedges")
        if s["mk"] and s["out"] / s["mk"] > 0.6:
            flags.append("trades out early")
        avg = s["px"] / s["sh"] if s["sh"] else 0
        # A maker quotes BOTH sides. Average price alone is not the tell —
        # a directional trader buying coin-flips also averages 0.50.
        if s["both"] > s["mk"] * 0.5 and 0.4 < avg < 0.6:
            flags.append("maker?")
        print(f"  {w[:11]:<13}{names.get(w, '')[:14]:<16}{s['held']:>6}"
              f"{s['won'] / s['held'] * 100:>6.1f}%{z:>+8.2f}   "
              f"{' · '.join(flags)}")


def main():
    argv = sys.argv[1:]
    if "--probe" in argv:
        probe()
    elif "--collect" in argv:
        days = int(argv[argv.index("--days") + 1]) if "--days" in argv else 7
        collect(days)
    elif "--analyze" in argv or "--analyse" in argv:
        m = int(argv[argv.index("--min") + 1]) if "--min" in argv else 20
        analyse(m)
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
