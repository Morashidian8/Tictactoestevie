"""
Task A — every strategy traded on its own, one at a time, over the last year.

Walks the trailing 365 days of the frozen 5-minute BTC chart candle by candle and
trades each of rule1..rule7, golden and the combined pool INDEPENDENTLY, each with
its own private 3-rung martingale ladder ($20 / $40 / $80, one bet per window,
close-to-close settlement, flat next close = void).

Nothing here re-implements a rule. Every signal comes out of engine.run_rule() and
every ladder out of engine.simulate(); this file only slices, counts and prints.

    python3 research/btc5m/task_a_per_strategy.py

Deterministic: no randomness, no network, single frozen input file.

------------------------------------------------------------------------------
STRUCTURE OF out/task_a.pkl   (engine.restore("task_a.pkl"))
------------------------------------------------------------------------------
A dict keyed by strategy name. Nine strategy keys plus one meta key:

    {"rule1","rule2","rule3","rule4","rule5","rule6","rule7","golden","pool",
     "__meta__"}

__meta__ = {
    "generated_by":  str,          # this file
    "candles":       int,          # candles in the walked window
    "t_first","t_last": int,       # unix seconds of first/last candle walked
    "date_first","date_last": str, # UTC YYYY-MM-DD
    "days":          float,        # span in days
    "base": 20.0, "rungs": 3, "bankroll": 2000.0,
    "order":         [str],        # strategy names in report order
    "months":        [str],        # YYYY-MM blocks used for monthly/contrast
}

Every strategy value is a dict:

  signals      [(i, ts, side, won)]  RAW SIGNAL LIST, chronological. `i` indexes
                                     the walked candle list, `ts` is unix sec of
                                     the SIGNAL candle (the bet settles on the
                                     NEXT candle's close), side "up"/"down",
                                     `won` bool. Voids already dropped.
                                     <-- Agent B consumes this.
  n, wins, losses                    ints
  acc                                float percent
  wilson               (lo, hi)      float percent, 95%
  z                                  float, vs 50%
  busts                              int, count of 3-losses-in-a-row ladder busts
  bust_rate                          float, busts per 100 signals
  bust_times           [ts]          unix sec of the 3rd losing signal of each bust
  busts_per_day/week/month           float
  streaks              {len: count}  histogram of consecutive-loss runs (from
                                     engine.simulate; trailing open run included)
  streak_runs          [{"len":int,"start_ts":int,"end_ts":int,
                         "start":str,"end":str}]  every loss run, chronological
  max_streak                         int
  streak_ge            {6:{"count":int,"dates":[str]}, 7:{...}, 8:{...}}
  pnl_martingale                     float $
  drawdown                           float $, worst peak-to-trough
  path_low                           float $, worst cumulative P&L from START
  curve                [float]       cumulative martingale P&L after each signal
  ruin_2000            {"ruined_pathlow":bool,"date_pathlow":str|None,
                        "ruined_funding":bool,"date_funding":str|None,
                        "min_balance":float}
  pnl_flat                           float $ at flat $20
  flat                 {n,wins,losses,acc,pnl}
  per_day              {"YYYY-MM-DD": {"n":int,"wins":int,"busts":int}}
  signals_per_day      {"mean":float,"max":int,"max_day":str,"active_days":int}
  worst_bust_day       {"day":str,"busts":int}
  monthly              [{"month":str,"n":int,"wins":int,"acc":float,
                         "lo":float,"hi":float,"busts":int,"pnl":float}]
  split                {"train":{n,wins,acc,lo,hi,z},
                        "test":{...},
                        "z_diff":float,        # test-vs-train difference z
                        "cut_date":str}
  by_hour_tehran       {hour: {"n","wins","acc","lo","hi","busts"}}
  by_dow_tehran        {dow:  {...}}           # 0=Monday
  contrast_hour        {hour: {"n","raw_diff","mh_diff","z","passes"}}
  contrast_dow         {dow:  {...}}
  contrast_note        str          # what "passes" means / bonferroni threshold

`contrast_*` is the within-month stratified (Mantel-Haenszel style) accuracy
contrast of one bucket against every other bucket IN THE SAME MONTH. It exists
because the test half of this dataset is globally more mean-reverting than the
train half, so any bucket that correlates with the calendar inherits that drift
and looks predictive when it is not. "passes" is |z| > bonferroni_z(K) AND
n >= 200.
------------------------------------------------------------------------------
"""

import datetime
import math
from collections import defaultdict

import engine
from engine import (UTC, TEHRAN, load, last_year, run_rule, simulate, flat,
                    wilson, zscore, split, bonferroni_z, save, pool, RULES)

BASE = engine.STAKE_BASE          # 20.0
RUNGS = engine.LADDER_RUNGS       # 3
BANKROLL = 2000.0
MIN_SUBGROUP = 200                # never report a subgroup smaller than this

ORDER = ["rule1", "rule2", "rule3", "rule4", "rule5", "rule6", "rule7",
         "golden", "pool"]

FA_DOW = ["دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه", "شنبه", "یک‌شنبه"]
EN_DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


# --- small time helpers -----------------------------------------------------
def utc_day(ts):
    return datetime.datetime.fromtimestamp(ts, UTC).strftime("%Y-%m-%d")


def utc_month(ts):
    return datetime.datetime.fromtimestamp(ts, UTC).strftime("%Y-%m")


def utc_stamp(ts):
    return datetime.datetime.fromtimestamp(ts, UTC).strftime("%Y-%m-%d %H:%M")


def teh(ts):
    return datetime.datetime.fromtimestamp(ts, TEHRAN)


# --- derived measurements (pure functions of a signal list) -----------------
def loss_runs(signals):
    """Every consecutive-loss run, chronological.

    Matches engine.simulate()'s streak histogram exactly, including the trailing
    open run — this only adds the dates, which simulate() does not keep.
    """
    runs, cur = [], []
    for s in signals:
        if s[3]:
            if cur:
                runs.append({"len": len(cur), "start_ts": cur[0][1],
                             "end_ts": cur[-1][1],
                             "start": utc_stamp(cur[0][1]),
                             "end": utc_stamp(cur[-1][1])})
                cur = []
        else:
            cur.append(s)
    if cur:
        runs.append({"len": len(cur), "start_ts": cur[0][1], "end_ts": cur[-1][1],
                     "start": utc_stamp(cur[0][1]), "end": utc_stamp(cur[-1][1])})
    return runs


def ruin_walk(signals, bankroll=BANKROLL, base=BASE, rungs=RUNGS):
    """Two readings of 'the account is empty', because they differ.

    pathlow  — cumulative P&L from the start reaches -bankroll. This is
               engine.simulate()'s `ruin` flag.
    funding  — the softer-sounding but stricter test: at some bet the balance
               left is smaller than the rung the ladder demands, so the bet
               cannot be placed at all.
    """
    bal = bankroll
    rung = 0
    lo = bal
    d_path = d_fund = None
    for s in signals:
        stake = base * 2 ** rung
        if d_fund is None and bal < stake:
            d_fund = s[1]
        bal = bal + stake if s[3] else bal - stake
        rung = 0 if s[3] else rung + 1
        if rung >= rungs:
            rung = 0
        lo = min(lo, bal)
        if d_path is None and bal <= 0:
            d_path = s[1]
    return {"ruined_pathlow": d_path is not None,
            "date_pathlow": utc_stamp(d_path) if d_path else None,
            "ruined_funding": d_fund is not None,
            "date_funding": utc_stamp(d_fund) if d_fund else None,
            "min_balance": lo}


def month_blocks(signals):
    """Signals grouped by UTC calendar month, chronological."""
    g = defaultdict(list)
    for s in signals:
        g[utc_month(s[1])].append(s)
    return g


def mh_contrast(signals, key_fn, bucket, blocks_fn=None):
    """Within-block accuracy contrast: this bucket vs every other bucket.

    Stratified by calendar month so that a bucket which merely correlates with
    the calendar cannot borrow the dataset's global drift toward mean reversion.
    Weight per block is the usual n1*n2/(n1+n2); the combined difference and its
    variance are the inverse-variance pooling of the per-block differences.
    """
    per_block = defaultdict(lambda: [0, 0, 0, 0])   # w1,n1,w2,n2
    for s in signals:
        b = utc_month(s[1])
        cell = per_block[b]
        if key_fn(s) == bucket:
            cell[1] += 1
            cell[0] += 1 if s[3] else 0
        else:
            cell[3] += 1
            cell[2] += 1 if s[3] else 0
    num = den = var = 0.0
    n_in = 0
    for w1, n1, w2, n2 in per_block.values():
        n_in += n1
        if n1 == 0 or n2 == 0:
            continue
        p1, p2 = w1 / n1, w2 / n2
        w = n1 * n2 / (n1 + n2)
        num += w * (p1 - p2)
        den += w
        var += w * w * (p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2)
    if den == 0:
        return {"n": n_in, "raw_diff": float("nan"), "mh_diff": float("nan"),
                "z": float("nan")}
    diff = num / den
    sd = math.sqrt(var) / den if var > 0 else float("nan")
    z = diff / sd if sd and not math.isnan(sd) and sd > 0 else float("nan")
    # unstratified difference, kept only so the report can show the gap between
    # the naive number and the controlled one
    a = [s for s in signals if key_fn(s) == bucket]
    b = [s for s in signals if key_fn(s) != bucket]
    raw = ((sum(1 for s in a if s[3]) / len(a)) -
           (sum(1 for s in b if s[3]) / len(b))) if a and b else float("nan")
    return {"n": n_in, "raw_diff": raw * 100, "mh_diff": diff * 100, "z": z}


def bucket_table(signals, key_fn, bust_times, keys):
    """Per-bucket n / wins / accuracy / Wilson / busts."""
    n = defaultdict(int)
    w = defaultdict(int)
    for s in signals:
        k = key_fn(s)
        n[k] += 1
        w[k] += 1 if s[3] else 0
    bu = defaultdict(int)
    for ts in bust_times:
        bu[key_fn((0, ts, "", False))] += 1
    out = {}
    for k in keys:
        lo, hi = wilson(w[k], n[k]) if n[k] else (float("nan"), float("nan"))
        out[k] = {"n": n[k], "wins": w[k],
                  "acc": w[k] / n[k] * 100 if n[k] else float("nan"),
                  "lo": lo, "hi": hi, "busts": bu[k]}
    return out


def side_stats(signals):
    d = {}
    for side in ("up", "down"):
        ss = [s for s in signals if s[2] == side]
        if not ss:
            continue
        w = sum(1 for s in ss if s[3])
        lo, hi = wilson(w, len(ss))
        d[side] = {"n": len(ss), "wins": w, "acc": w / len(ss) * 100,
                   "lo": lo, "hi": hi}
    return d


# --- the per-strategy analysis ---------------------------------------------
def analyse(name, signals, days):
    st = simulate(signals, base=BASE, rungs=RUNGS, bankroll=BANKROLL)
    fl = flat(signals, stake=BASE)
    lo, hi = wilson(st["wins"], st["n"])

    runs = loss_runs(signals)
    # cross-check against engine.simulate's own histogram; a mismatch means this
    # file has drifted from the engine and the whole report is void.
    mine = defaultdict(int)
    for r in runs:
        mine[r["len"]] += 1
    assert dict(mine) == st["streaks"], f"{name}: streak histogram disagrees with engine"

    ge = {}
    for k in (6, 7, 8):
        hit = [r for r in runs if r["len"] >= k]
        ge[k] = {"count": len(hit),
                 "dates": [f"{r['start']} → {r['end']} ({r['len']})" for r in hit]}

    # per-day
    per_day = defaultdict(lambda: {"n": 0, "wins": 0, "busts": 0})
    for s in signals:
        d = per_day[utc_day(s[1])]
        d["n"] += 1
        d["wins"] += 1 if s[3] else 0
    for ts in st["bust_times"]:
        per_day[utc_day(ts)]["busts"] += 1
    per_day = dict(per_day)
    max_day = max(per_day, key=lambda d: per_day[d]["n"]) if per_day else None
    bust_day = (max(per_day, key=lambda d: per_day[d]["busts"])
                if per_day else None)

    # monthly, with P&L read off the running ladder curve (the ladder state
    # genuinely carries across the month boundary; resetting it would be a lie)
    curve = st["curve"]
    idx_of = {}
    for j, s in enumerate(signals):
        idx_of.setdefault(utc_month(s[1]), []).append(j)
    monthly = []
    for m in sorted(idx_of):
        js = idx_of[m]
        ss = [signals[j] for j in js]
        w = sum(1 for s in ss if s[3])
        wl, wh = wilson(w, len(ss))
        before = curve[js[0] - 1] if js[0] > 0 else 0.0
        monthly.append({"month": m, "n": len(ss), "wins": w,
                        "acc": w / len(ss) * 100, "lo": wl, "hi": wh,
                        "busts": sum(1 for ts in st["bust_times"]
                                     if utc_month(ts) == m),
                        "pnl": curve[js[-1]] - before})

    # chronological 70/30
    tr, te = split(signals, 0.70)
    def half(ss):
        if not ss:
            return {"n": 0, "wins": 0, "acc": float("nan"),
                    "lo": float("nan"), "hi": float("nan"), "z": float("nan")}
        w = sum(1 for s in ss if s[3])
        a, b = wilson(w, len(ss))
        return {"n": len(ss), "wins": w, "acc": w / len(ss) * 100,
                "lo": a, "hi": b, "z": zscore(w, len(ss))}
    h_tr, h_te = half(tr), half(te)
    if h_tr["n"] and h_te["n"]:
        p1, n1 = h_tr["wins"] / h_tr["n"], h_tr["n"]
        p2, n2 = h_te["wins"] / h_te["n"], h_te["n"]
        p = (h_tr["wins"] + h_te["wins"]) / (n1 + n2)
        se = math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2))
        zd = (p2 - p1) / se if se else float("nan")
    else:
        zd = float("nan")

    # time of day / day of week, Tehran
    hour_of = lambda s: teh(s[1]).hour
    dow_of = lambda s: teh(s[1]).weekday()
    by_hour = bucket_table(signals, hour_of, st["bust_times"], range(24))
    by_dow = bucket_table(signals, dow_of, st["bust_times"], range(7))

    zh, zd7 = bonferroni_z(24), bonferroni_z(7)
    c_hour = {}
    for h in range(24):
        c = mh_contrast(signals, hour_of, h)
        c["passes"] = (by_hour[h]["n"] >= MIN_SUBGROUP and
                       not math.isnan(c["z"]) and abs(c["z"]) > zh)
        c_hour[h] = c
    c_dow = {}
    for d in range(7):
        c = mh_contrast(signals, dow_of, d)
        c["passes"] = (by_dow[d]["n"] >= MIN_SUBGROUP and
                       not math.isnan(c["z"]) and abs(c["z"]) > zd7)
        c_dow[d] = c

    return {
        "signals": signals,
        "n": st["n"], "wins": st["wins"], "losses": st["losses"],
        "acc": st["acc"], "wilson": (lo, hi), "z": zscore(st["wins"], st["n"]),
        "busts": st["busts"], "bust_rate": st["bust_rate"],
        "bust_times": st["bust_times"],
        "busts_per_day": st["busts"] / days,
        "busts_per_week": st["busts"] / days * 7,
        "busts_per_month": st["busts"] / days * 30.44,
        "streaks": st["streaks"], "streak_runs": runs,
        "max_streak": st["max_streak"], "streak_ge": ge,
        "pnl_martingale": st["pnl"], "drawdown": st["drawdown"],
        "path_low": st["path_low"], "curve": curve,
        "open_rung": st["open_rung"],
        "ruin_2000": ruin_walk(signals),
        "engine_ruin_flag": st["ruin"],
        "pnl_flat": fl["pnl"], "flat": fl,
        "per_day": per_day,
        "signals_per_day": {
            "mean": st["n"] / days,
            "mean_active": st["n"] / len(per_day) if per_day else float("nan"),
            "max": per_day[max_day]["n"] if max_day else 0,
            "max_day": max_day, "active_days": len(per_day)},
        "worst_bust_day": {"day": bust_day,
                           "busts": per_day[bust_day]["busts"] if bust_day else 0},
        "monthly": monthly,
        "split": {"train": h_tr, "test": h_te, "z_diff": zd,
                  "cut_date": utc_stamp(te[0][1]) if te else None},
        "by_hour_tehran": by_hour, "by_dow_tehran": by_dow,
        "contrast_hour": c_hour, "contrast_dow": c_dow,
        "by_side": side_stats(signals),
        "contrast_note": (f"within-month stratified contrast; passes = n>={MIN_SUBGROUP} "
                          f"and |z| > bonferroni_z(24)={zh:.2f} for hours, "
                          f"bonferroni_z(7)={zd7:.2f} for weekdays"),
    }


# --- printing ---------------------------------------------------------------
def cascade_signals(res):
    """The bot's live priority cascade: rule6 > golden > statistical pool.

    Rebuilt from the already-walked signal lists, not re-derived from candles —
    a window is a window, and every one of these three already carries its own
    side and outcome for that window. `golden`'s windows are a strict subset of
    `pool`'s and always agree with it on side, so golden only affects priority,
    never the bet; it is kept in the chain so the code reads like the bot.
    """
    p = {s[0]: s for s in res["pool"]["signals"]}
    g = {s[0]: s for s in res["golden"]["signals"]}
    six = {s[0]: s for s in res["rule6"]["signals"]}
    return [six.get(i) or g.get(i) or p[i] for i in sorted(set(p) | set(six))]


def ci(lo, hi):
    return f"[{lo:.1f}-{hi:.1f}]"


def hr(ch="-", n=100):
    print(ch * n)


def report(res, meta):
    print("=" * 100)
    print("TASK A — every strategy traded on its own, last 365 days, "
          "independent 3-rung ladders")
    print(f"window: {meta['date_first']} .. {meta['date_last']}  "
          f"({meta['candles']:,} 5m candles, {meta['days']:.0f} days)")
    print(f"stake ${BASE:.0f} base, {RUNGS} rungs "
          f"(${BASE:.0f}/${BASE*2:.0f}/${BASE*4:.0f}), bankroll ${BANKROLL:,.0f}")
    print("=" * 100)

    print("\n### 1+2+4 HEADLINE")
    hr()
    print(f"{'strategy':<10}{'n':>7}{'acc%':>8}{'95% Wilson':>16}{'z':>7}"
          f"{'busts':>7}{'/100':>7}{'/wk':>6}{'max':>5}"
          f"{'martingale$':>13}{'flat$':>10}{'DD$':>9}{'low$':>9}")
    hr()
    for k in meta["order"]:
        r = res[k]
        lo, hi = r["wilson"]
        print(f"{k:<10}{r['n']:>7,}{r['acc']:>8.2f}"
              f"{ci(lo, hi):>16}{r['z']:>7.2f}"
              f"{r['busts']:>7,}{r['bust_rate']:>7.2f}{r['busts_per_week']:>6.1f}"
              f"{r['max_streak']:>5}"
              f"{r['pnl_martingale']:>+13,.0f}{r['pnl_flat']:>+10,.0f}"
              f"{r['drawdown']:>9,.0f}{r['path_low']:>+9,.0f}")
    hr()

    print("\n### 1b THE LADDER IDENTITY — a 3-rung ladder has exactly one lever")
    print("Every ladder cycle ends either in a win (+$20 net, whatever rung it took)")
    print("or in a bust (-$140). So P&L = 20*wins - 140*busts, exactly, and the")
    print("strategy is profitable iff busts < wins/7 (bust:win ratio < 0.1429).")
    print("At a fair 50% coin the ratio is exactly 1/7 and the ladder is EV-zero:")
    print("it reshapes variance, it does not create edge.")
    print("(`open` is the unresolved tail: the year ends mid-ladder, so subtract")
    print(" the stakes already sunk on the rungs that never got their answer.)")
    hr()
    print(f"{'strategy':<10}{'wins':>8}{'busts':>7}{'bust:win':>10}"
          f"{'vs 1/7':>9}{'open$':>8}{'20w-140b-open':>15}{'engine P&L':>12}")
    hr()
    for k in meta["order"]:
        r = res[k]
        ratio = r["busts"] / r["wins"] if r["wins"] else float("nan")
        open_cost = BASE * (2 ** r["open_rung"] - 1)
        closed = 20 * r["wins"] - 140 * r["busts"] - open_cost
        assert abs(closed - r["pnl_martingale"]) < 1e-6, f"{k}: ladder identity broken"
        print(f"{k:<10}{r['wins']:>8,}{r['busts']:>7,}{ratio:>10.4f}"
              f"{ratio - 1/7:>+9.4f}{open_cost:>8,.0f}{closed:>+15,.0f}"
              f"{r['pnl_martingale']:>+12,.0f}")
    hr()

    print("\n### 2 BUST FREQUENCY")
    hr()
    print(f"{'strategy':<10}{'busts':>7}{'per 100 sig':>13}{'per day':>10}"
          f"{'per week':>10}{'per month':>11}   worst day")
    hr()
    for k in meta["order"]:
        r = res[k]
        wd = r["worst_bust_day"]
        print(f"{k:<10}{r['busts']:>7,}{r['bust_rate']:>13.2f}"
              f"{r['busts_per_day']:>10.2f}{r['busts_per_week']:>10.2f}"
              f"{r['busts_per_month']:>11.2f}   {wd['day']} ({wd['busts']})")
    hr()

    print("\n### 3 CONSECUTIVE-LOSS-STREAK HISTOGRAM  (count of runs of EXACTLY n losses)")
    hr()
    mx = max(r["max_streak"] for r in res.values() if isinstance(r, dict)
             and "max_streak" in r)
    head = "".join(f"{i:>6}" for i in range(1, mx + 1))
    print(f"{'strategy':<10}{head}{'  longest':>10}")
    hr()
    for k in meta["order"]:
        r = res[k]
        row = "".join(f"{r['streaks'].get(i, 0):>6,}" for i in range(1, mx + 1))
        print(f"{k:<10}{row}{r['max_streak']:>10}")
    hr()
    print(f"{'strategy':<10}{'>=6':>7}{'>=7':>7}{'>=8':>7}   dates of every run >= 6")
    hr()
    for k in meta["order"]:
        r = res[k]
        g = r["streak_ge"]
        print(f"{k:<10}{g[6]['count']:>7}{g[7]['count']:>7}{g[8]['count']:>7}")
        for d in g[6]["dates"]:
            print(f"{'':<10}   {d}")
        if not g[6]["dates"]:
            print(f"{'':<10}   (none)")
    hr()

    print("\n### 4 MONEY — martingale, drawdown, path low, $2,000 bankroll")
    hr()
    print(f"{'strategy':<10}{'martingale$':>13}{'DD-from-peak$':>15}"
          f"{'path low$':>11}{'min balance$':>14}   $2,000 wiped out?")
    hr()
    for k in meta["order"]:
        r = res[k]
        ru = r["ruin_2000"]
        if ru["ruined_pathlow"]:
            verdict = f"YES on {ru['date_pathlow']}"
        elif ru["ruined_funding"]:
            verdict = f"could not fund a rung on {ru['date_funding']}"
        else:
            verdict = "no — never came close"
        print(f"{k:<10}{r['pnl_martingale']:>+13,.0f}{r['drawdown']:>15,.0f}"
              f"{r['path_low']:>+11,.0f}{ru['min_balance']:>14,.0f}   {verdict}")
    hr()

    print("\n### 5 FLAT $20 vs MARTINGALE")
    hr()
    print(f"{'strategy':<10}{'n':>7}{'wins':>7}{'losses':>8}{'flat$':>10}"
          f"{'martingale$':>13}{'ratio':>8}")
    hr()
    for k in meta["order"]:
        r = res[k]
        f = r["flat"]
        ratio = (r["pnl_martingale"] / f["pnl"]) if f["pnl"] else float("nan")
        print(f"{k:<10}{f['n']:>7,}{f['wins']:>7,}{f['losses']:>8,}"
              f"{f['pnl']:>+10,.0f}{r['pnl_martingale']:>+13,.0f}{ratio:>8.2f}")
    hr()

    print("\n### 6 SIGNALS PER DAY")
    hr()
    print(f"{'strategy':<10}{'mean/day':>10}{'mean/active':>13}{'max':>6}"
          f"   busiest day{'':<8}active days")
    hr()
    for k in meta["order"]:
        r = res[k]
        sp = r["signals_per_day"]
        print(f"{k:<10}{sp['mean']:>10.1f}{sp['mean_active']:>13.1f}"
              f"{sp['max']:>6}   {sp['max_day']:<19}{sp['active_days']:>4}")
    hr()

    print("\n### 7 MONTHLY")
    for k in meta["order"]:
        r = res[k]
        print(f"\n{k}")
        print(f"  {'month':<9}{'n':>6}{'acc%':>8}{'95% Wilson':>16}"
              f"{'busts':>7}{'P&L$':>11}")
        for m in r["monthly"]:
            print(f"  {m['month']:<9}{m['n']:>6,}{m['acc']:>8.2f}"
                  f"{ci(m['lo'], m['hi']):>16}"
                  f"{m['busts']:>7}{m['pnl']:>+11,.0f}")

    print("\n\n### 8 CHRONOLOGICAL 70/30 TRAIN/TEST")
    hr()
    print(f"{'strategy':<10}{'train n':>9}{'train%':>9}{'train CI':>16}"
          f"{'test n':>8}{'test%':>8}{'test CI':>16}{'z(diff)':>9}  holds?")
    hr()
    for k in meta["order"]:
        r = res[k]
        a, b = r["split"]["train"], r["split"]["test"]
        holds = "yes" if b["n"] >= MIN_SUBGROUP and b["lo"] > 50 else (
            "NO" if b["n"] >= MIN_SUBGROUP else "n<200")
        print(f"{k:<10}{a['n']:>9,}{a['acc']:>9.2f}"
              f"{ci(a['lo'], a['hi']):>16}"
              f"{b['n']:>8,}{b['acc']:>8.2f}"
              f"{ci(b['lo'], b['hi']):>16}"
              f"{r['split']['z_diff']:>9.2f}  {holds}")
    hr()
    print("note: test half of this dataset is globally more mean-reverting than "
          "the train half\n(unconditional fade 49.46% -> 50.84%), so a rising "
          "train->test accuracy is expected drift,\nnot evidence of a rule "
          "improving.")

    print("\n\n### 9 TIME OF DAY (Tehran, UTC+3:30) AND DAY OF WEEK")
    print(res[meta["order"][0]]["contrast_note"])
    zh, z7 = bonferroni_z(24), bonferroni_z(7)
    for k in meta["order"]:
        r = res[k]
        print(f"\n{k}   (n={r['n']:,}, busts={r['busts']})")
        print(f"  {'hour':<6}{'n':>7}{'acc%':>8}{'busts':>7}"
              f"{'raw diff':>10}{'within-month diff':>19}{'z':>8}  flag")
        for h in range(24):
            b = r["by_hour_tehran"][h]
            c = r["contrast_hour"][h]
            if not b["n"]:
                continue
            flag = "SURVIVES" if c["passes"] else (
                "n<200" if b["n"] < MIN_SUBGROUP else "")
            print(f"  {h:02d}:00 {b['n']:>7,}{b['acc']:>8.2f}{b['busts']:>7}"
                  f"{c['raw_diff']:>+10.2f}{c['mh_diff']:>+19.2f}"
                  f"{c['z']:>8.2f}  {flag}")
        print(f"  {'dow':<6}{'n':>7}{'acc%':>8}{'busts':>7}"
              f"{'raw diff':>10}{'within-month diff':>19}{'z':>8}  flag")
        for d in range(7):
            b = r["by_dow_tehran"][d]
            c = r["contrast_dow"][d]
            if not b["n"]:
                continue
            flag = "SURVIVES" if c["passes"] else (
                "n<200" if b["n"] < MIN_SUBGROUP else "")
            print(f"  {EN_DOW[d]:<6}{b['n']:>7,}{b['acc']:>8.2f}{b['busts']:>7}"
                  f"{c['raw_diff']:>+10.2f}{c['mh_diff']:>+19.2f}"
                  f"{c['z']:>8.2f}  {flag}")
        surv = ([f"{h:02d}:00" for h in range(24) if r["contrast_hour"][h]["passes"]] +
                [EN_DOW[d] for d in range(7) if r["contrast_dow"][d]["passes"]])
        print(f"  -> survives within-block contrast at bonferroni "
              f"(z>{zh:.2f} hours / z>{z7:.2f} dow): "
              f"{', '.join(surv) if surv else 'NOTHING'}")

    # The per-strategy threshold above is generous: this section is ONE sweep of
    # (9 strategies x every eligible time bucket), so the family is the whole grid,
    # not one strategy's row. Re-judge every survivor against that.
    print("\n" + "-" * 100)
    print("FULL-GRID CORRECTION — the honest family size")
    hr()
    eligible = []
    for k in meta["order"]:
        r = res[k]
        for h in range(24):
            if r["by_hour_tehran"][h]["n"] >= MIN_SUBGROUP:
                eligible.append((k, f"{h:02d}:00 Tehran", r["contrast_hour"][h]))
        for d in range(7):
            if r["by_dow_tehran"][d]["n"] >= MIN_SUBGROUP:
                eligible.append((k, EN_DOW[d], r["contrast_dow"][d]))
    K = len(eligible)
    zg = bonferroni_z(K)
    print(f"eligible tests (n >= {MIN_SUBGROUP}) across all 9 strategies: K = {K}")
    print(f"required |z| = bonferroni_z({K}) = {zg:.2f}")
    hr()
    ranked = sorted(eligible, key=lambda e: -abs(e[2]["z"]))
    print(f"{'rank':<6}{'strategy':<10}{'bucket':<16}{'n':>7}"
          f"{'within-month diff':>19}{'z':>8}   verdict")
    for j, (k, lbl, c) in enumerate(ranked[:12], 1):
        v = "SURVIVES FULL GRID" if abs(c["z"]) > zg else "noise at grid level"
        print(f"{j:<6}{k:<10}{lbl:<16}{c['n']:>7,}"
              f"{c['mh_diff']:>+19.2f}{c['z']:>8.2f}   {v}")
    winners = [(k, l, c) for k, l, c in eligible if abs(c["z"]) > zg]
    hr()
    print(f"survivors of the full-grid correction: "
          f"{len(winners)} of {K}"
          + ("" if not winners else
             "  -> " + ", ".join(f"{k}/{l} (z={c['z']:+.2f})" for k, l, c in winners)))
    print("Report a time-of-day or weekday effect as a FINDING only if it appears "
          "on this line.")
    res["__meta__"]["grid_correction"] = {
        "K": K, "z_required": zg,
        "top": [{"strategy": k, "bucket": l, "n": c["n"],
                 "mh_diff": c["mh_diff"], "z": c["z"]} for k, l, c in ranked[:12]],
        "survivors": [{"strategy": k, "bucket": l, "n": c["n"],
                       "mh_diff": c["mh_diff"], "z": c["z"]}
                      for k, l, c in winners]}

    print("\n\n### EXTRA — up vs down side")
    hr()
    print(f"{'strategy':<10}{'up n':>8}{'up acc%':>9}{'up CI':>16}"
          f"{'down n':>9}{'down acc%':>11}{'down CI':>16}")
    hr()
    for k in meta["order"]:
        r = res[k]
        u = r["by_side"].get("up")
        d = r["by_side"].get("down")
        us = (f"{u['n']:>8,}{u['acc']:>9.2f}{ci(u['lo'], u['hi']):>16}"
              if u else f"{0:>8}{'':>9}{'':>16}")
        ds = (f"{d['n']:>9,}{d['acc']:>11.2f}{ci(d['lo'], d['hi']):>16}"
              if d else f"{0:>9}{'':>11}{'':>16}")
        print(f"{k:<10}{us}{ds}")
    hr()


def main():
    candles = load()
    y = last_year(candles)
    days = (y[-1]["t"] - y[0]["t"]) / 86400.0

    res = {}
    for name in ORDER:
        fn = pool if name == "pool" else RULES[name]
        sigs = run_rule(name, y, fn=fn)
        res[name] = analyse(name, sigs, days)

    # The bot's LIVE configuration, rebuilt from the same signal lists rather
    # than walked again: rule6 > golden > statistical pool, one bet per window.
    # Kept because it is the only row that describes what actually trades, and
    # because it is the independent check the project manager asked for.
    res["cascade"] = analyse("cascade", cascade_signals(res), days)

    months = sorted({utc_month(s[1]) for s in res["rule1"]["signals"]})
    meta = {
        "generated_by": "research/btc5m/task_a_per_strategy.py",
        "candles": len(y), "t_first": y[0]["t"], "t_last": y[-1]["t"],
        "date_first": utc_day(y[0]["t"]), "date_last": utc_day(y[-1]["t"]),
        "days": days, "base": BASE, "rungs": RUNGS, "bankroll": BANKROLL,
        "order": ORDER, "order_extra": ["cascade"], "months": months,
    }
    res["__meta__"] = meta
    report(res, meta)
    write_markdown(res, meta)
    p = save(res, "task_a.pkl")
    print(f"\nsaved -> {p}")


if __name__ == "__main__":
    main()
