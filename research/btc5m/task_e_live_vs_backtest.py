"""
Task E — the bot's recent stretch against the whole year, on one configuration.

WHAT THIS IS NOT
    It is not an analysis of live signals. The live signal log lives in
    `breakout_closes.json` on the user's phone (BreakoutMonitor.STATE_FILE) and
    is not in this repository, on any branch, or in any git object — see
    `live_log_search` in the pickle for exactly where it was looked for. Every
    number produced here is a RECONSTRUCTION from the frozen candle file: what
    the bot's rules WOULD have signalled. Nothing here is measured-live.

THE CONFIGURATION REPLAYED
    bot.py `BreakoutMonitor.evaluate` + `_on_window_close`, at shipped defaults:
      * rules 1, 2, 3, 5, 6, 7 enabled; rule 4 OFF (RULE4_ENABLED default "0")
      * one bet per 5-minute window
      * a window is bet only when every rule that fired agrees on a side
        (`if len(bets) == 1`), otherwise the window is skipped entirely.
        There is no "most accurate rule wins the window" tie-break anywhere in
        bot.py — disagreement kills the window. engine.pool() is that rule.
      * the golden tier is a LABEL added to an already-firing window, not an
        extra signal, so it never changes which windows are bet.
    Money, fixed by the project: base $20, martingale 3 rungs, close-to-close.

PICKLE STRUCTURE  (engine.save(results, "task_e.pkl"))
    {
      "meta":        {generated, candles, span, config, stake, rungs},
      "live_log_search": {"found": False, "looked_in": [...], "need_from_user": [...]},
      "year":        block dict for the trailing 365 days (see BLOCK below),
      "recent":      block dict for the trailing RECENT_N signals,
      "earlier":     block dict for the year minus the recent stretch,
      "rate":        {"sigs_per_day", "days_for_recent", "recent_span_days"},
      "ztest":       {"z", "p", "diff_pts", "powered", "n_needed_53_vs_57"},
      "streaks":     {"year_hist", "recent_hist", "ge7_count_year",
                      "expected_wait_signals", "expected_wait_days",
                      "theoretical_ge7"},
      "windows":     {"n_draws", "acc": [...], "busts": [...], "maxstreak": [...],
                      "pct_acc", "pct_busts", "pct_maxstreak"},
      "deadband":    {"band_stats", "voided", "voided_pct", "raw", "banded",
                      "tiny_wins", "tiny_losses", "acc_shift_pts"},
      "daily":       [ {date, n, wins, acc, lo, hi, busts, pnl}, ... ]  # recent
      "monthly":     [ {month, n, wins, acc, lo, hi}, ... ]            # year
    }

    BLOCK = {"n","wins","acc","lo","hi","z","busts","bust_rate","max_streak",
             "streaks","pnl","path_low","drawdown","t0","t1"}

Deterministic: fixed seed, frozen candle file, no network. Re-run with
    python3 research/btc5m/task_e_live_vs_backtest.py
"""

import datetime
import math
import os
import random
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engine as E

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))

# The live rule set. Rule 4 is deliberately absent — RULE4_ENABLED defaults off.
LIVE_RULES = ("rule1", "rule2", "rule3", "rule5", "rule6", "rule7")
RECENT_N = 400            # the user's "roughly 400 signals"
N_DRAWS = 500             # random 400-signal windows
SEED = 20260807
# bot.py defaults, quoted here so the deadband replay cannot drift from the bot.
SETTLE_DEADBAND = 0.05
SETTLE_FLOOR = 3.0


# --- step 1: does the live log exist in this sandbox? -----------------------
def live_log_search():
    """
    Look everywhere a committed copy of breakout_closes.json could hide.

    Honest by construction: it records what was searched, not just the verdict,
    so the next agent can see the search was real.
    """
    looked, hits = [], []

    def is_state(name):
        """Only a real bot state file counts. `run_odds.sh` is not one."""
        b = os.path.basename(name).lower()
        return b.startswith("breakout_closes") or b.endswith("_odds.jsonl")

    def note(what, found):
        real = [f for f in found if is_state(f)]
        looked.append(f"{what} -> {len(real)} hit(s)")
        hits.extend(real)

    # working tree + any sibling path
    fs = []
    for root, _dirs, files in os.walk(REPO):
        if ".git" in root:
            continue
        for f in files:
            if "breakout" in f.lower() and f.endswith(".json"):
                fs.append(os.path.join(root, f))
    note("working tree walk for breakout*.json", fs)

    def git(*args):
        try:
            return subprocess.run(["git", "-C", REPO, *args],
                                  capture_output=True, text=True,
                                  timeout=180).stdout
        except Exception:
            return ""

    # every branch, local and remote
    branches = [b.strip() for b in git("branch", "-a", "--format=%(refname:short)").split("\n") if b.strip()]
    found_b = []
    for b in branches:
        for line in git("ls-tree", "-r", "--name-only", b).split("\n"):
            if "breakout" in line.lower() or line.endswith("polymarket_odds.jsonl"):
                found_b.append(f"{b}:{line}")
    note(f"git ls-tree over {len(branches)} branches "
         f"(incl. origin/candle-bot-state, origin/app, origin/predict-bot-state)",
         found_b)

    # every object ever written, including dangling blobs
    objs = [l.split(" ", 1)[-1] for l in git("rev-list", "--all", "--objects").split("\n")
            if " " in l]
    note("git rev-list --all --objects (every blob ever written)", objs)

    # the odds store written by polymarket_collector.py (ODDS_STORE)
    store = os.path.join(REPO, os.environ.get("ODDS_STORE", "polymarket_odds.jsonl"))
    note(f"odds store {os.path.basename(store)}",
         [store] if os.path.exists(store) else [])

    return {
        "found": bool(hits),
        "hits": hits,
        "looked_in": looked,
        "need_from_user": [
            "breakout_closes.json from Termux (~/Tictactoestevie/breakout_closes.json) "
            "— it carries `score` {n,wins,void,rules} and the last SIGNALS_KEEP=300 "
            "rows of `signals` with t/bet/rules/won/mine/told/void/delta/ref/settle.",
            "the raw text of /score (cumulative n, wins, per-rule tallies — this is "
            "the ONLY place the full ~400 lives, because `signals` is capped at 300 "
            "and `history` at 40).",
            "the raw text of /log and /check (per-signal rows with ref -> settle "
            "prices, needed to audit the settlement itself).",
        ],
    }


# --- the live-configuration walk --------------------------------------------
def live_signals(candles, members=LIVE_RULES):
    """
    Every window the shipped bot would have bet, with the raw next-close move.

    Returns [(i, ts, side, won_raw, delta, band)] where `band` is the bot's
    _deadband() evaluated on exactly the closes the bot would have held.
    Voids are NOT dropped here — the caller decides which settlement rule to
    apply, which is the whole point of step 4.
    """
    cl = E.closes_of(candles)
    out = []
    for i in range(E.WARMUP, len(cl) - 1):
        window = cl[i + 1 - E.WARMUP:i + 1]
        s = E.pool(window, members=members)
        if not s:
            continue
        delta = cl[i + 1] - cl[i]
        # bot.py _deadband(): median of |moves| over self.closes[-101:], which at
        # settle time ends at close[i] — the reference price of this very bet.
        mv = [abs(m) for m in E._moves(cl[max(0, i - 100):i + 1])]
        band = max(E._median(mv) * SETTLE_DEADBAND, SETTLE_FLOOR) if mv else 0.0
        won = (s["side"] == "up") == (delta > 0)
        out.append((i, candles[i]["t"], s["side"], won, delta, band))
    return out


def settle_raw(rows):
    """engine/backtest settlement: void only on an exact tie."""
    return [(r[0], r[1], r[2], r[3]) for r in rows if r[4] != 0]


def settle_band(rows):
    """bot.py settlement: void anything inside the dead band."""
    return [(r[0], r[1], r[2], r[3]) for r in rows if abs(r[4]) > r[5]]


# bot.py labels each rule with its measured accuracy in `evaluate`. If the bot
# ever resolved a disagreement by "the most accurate rule takes the window" this
# is the order it would use. It does NOT — disagreement kills the window — but
# the variant is measured anyway so the choice is shown to be immaterial.
RULE_PRIORITY = ("rule6", "rule1", "rule2", "rule5", "rule7", "rule3")


def priority_signals(candles, members=LIVE_RULES, order=RULE_PRIORITY):
    """Sensitivity variant: on disagreement, the highest-labelled rule wins."""
    cl = E.closes_of(candles)
    out = []
    for i in range(E.WARMUP, len(cl) - 1):
        window = cl[i + 1 - E.WARMUP:i + 1]
        fired = {}
        for n in members:
            s = E.RULES[n](window)
            if s:
                fired[n] = s["side"]
        if not fired:
            continue
        side = next(fired[n] for n in order if n in fired)
        delta = cl[i + 1] - cl[i]
        if delta == 0:
            continue
        out.append((i, candles[i]["t"], side, (side == "up") == (delta > 0)))
    return out


# --- statistics -------------------------------------------------------------
def block(sigs, label=""):
    st = E.simulate(sigs, base=E.STAKE_BASE, rungs=E.LADDER_RUNGS)
    lo, hi = E.wilson(st["wins"], st["n"])
    return {
        "label": label, "n": st["n"], "wins": st["wins"], "acc": st["acc"],
        "lo": lo, "hi": hi, "half_width": (hi - lo) / 2,
        "z": E.zscore(st["wins"], st["n"]),
        "busts": st["busts"], "bust_rate": st["bust_rate"],
        "max_streak": st["max_streak"], "streaks": dict(st["streaks"]),
        "pnl": st["pnl"], "path_low": st["path_low"], "drawdown": st["drawdown"],
        "t0": sigs[0][1] if sigs else None, "t1": sigs[-1][1] if sigs else None,
    }


def two_prop_z(w1, n1, w2, n2):
    """Pooled two-proportion z-test. Returns (z, two-sided p)."""
    if not n1 or not n2:
        return float("nan"), float("nan")
    p1, p2 = w1 / n1, w2 / n2
    p = (w1 + w2) / (n1 + n2)
    se = math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2))
    if se == 0:
        return 0.0, 1.0
    z = (p1 - p2) / se
    return z, 2 * (1 - _phi(abs(z)))


def _phi(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def n_for_power(p1, p2, alpha=0.05, power=0.80):
    """Signals needed PER GROUP to tell p1 from p2. The honest power answer."""
    za, zb = 1.959964, 0.8416212
    pbar = (p1 + p2) / 2
    num = (za * math.sqrt(2 * pbar * (1 - pbar))
           + zb * math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2
    return math.ceil(num / (p1 - p2) ** 2)


def streak_runs(sigs):
    """Lengths of every consecutive-loss run, in order."""
    runs, cur = [], 0
    for s in sigs:
        if s[3]:
            if cur:
                runs.append(cur)
            cur = 0
        else:
            cur += 1
    if cur:
        runs.append(cur)
    return runs


def streak_runs_dated(sigs):
    """Every consecutive-loss run as (length, timestamp it ended)."""
    runs, cur, start = [], 0, None
    for s in sigs:
        if s[3]:
            if cur:
                runs.append((cur, start, s[1]))
            cur, start = 0, None
        else:
            if not cur:
                start = s[1]
            cur += 1
    if cur:
        runs.append((cur, start, sigs[-1][1]))
    return runs


def cluster_stats(runs, min_len=7, within_days=(1.0, 2.0, 3.0)):
    """
    How often two long losing runs land close together.

    The user saw two >=7 runs on consecutive days and read it as a breakage.
    Whether that reading is right is a question about the GAP distribution
    between long runs, not about their count.
    """
    long_runs = [r for r in runs if r[0] >= min_len]
    gaps = [(long_runs[i + 1][1] - long_runs[i][2]) / 86400
            for i in range(len(long_runs) - 1)]
    out = {"count": len(long_runs), "gaps_days": gaps,
           "median_gap_days": sorted(gaps)[len(gaps) // 2] if gaps else None}
    for d in within_days:
        pairs = sum(1 for g in gaps if g <= d)
        out[f"pairs_within_{d:g}d"] = pairs
        # share of the long runs that arrive in a cluster like the user's
        out[f"share_clustered_{d:g}d"] = (pairs / len(gaps) * 100) if gaps else 0.0
    return out


def percentile_of(values, x):
    """Share of the distribution at or below x, in percent."""
    if not values:
        return float("nan")
    return sum(1 for v in values if v <= x) / len(values) * 100


def tehran_date(ts):
    return datetime.datetime.fromtimestamp(ts, E.TEHRAN).strftime("%Y-%m-%d")


def month_of(ts):
    return datetime.datetime.fromtimestamp(ts, E.UTC).strftime("%Y-%m")


def grouped(sigs, keyfn):
    out = {}
    for s in sigs:
        out.setdefault(keyfn(s[1]), []).append(s)
    return out


# --- main -------------------------------------------------------------------
def main():
    random.seed(SEED)
    candles = E.load()
    year = E.last_year(candles)
    rows = live_signals(year)
    ysig = settle_raw(rows)

    span_days = (year[-1]["t"] - year[0]["t"]) / 86400
    rate = len(ysig) / span_days

    recent = ysig[-RECENT_N:]
    earlier = ysig[:-RECENT_N]

    res = {}
    res["meta"] = {
        "generated": datetime.datetime.now(E.UTC).isoformat(),
        "candles": len(candles), "year_candles": len(year),
        "year_from": datetime.datetime.fromtimestamp(year[0]["t"], E.UTC).isoformat(),
        "year_to": datetime.datetime.fromtimestamp(year[-1]["t"], E.UTC).isoformat(),
        "config": {"rules": list(LIVE_RULES), "rule4": False,
                   "consensus": "unanimous among rules that fired",
                   "golden": "label only, not an extra signal"},
        "stake": E.STAKE_BASE, "rungs": E.LADDER_RUNGS, "seed": SEED,
        "reconstructed": True, "measured_live": False,
    }
    res["live_log_search"] = live_log_search()

    res["year"] = block(ysig, "سالِ گذشته")
    res["recent"] = block(recent, f"{RECENT_N} سیگنالِ اخیر")
    res["earlier"] = block(earlier, "بقیهٔ سال")
    res["rate"] = {
        "sigs_per_day": rate,
        "days_for_recent": RECENT_N / rate,
        "recent_span_days": (recent[-1][1] - recent[0][1]) / 86400,
        "year_span_days": span_days,
    }

    # --- z-test recent vs the rest of the year (within-block contrast) -------
    z, p = two_prop_z(res["recent"]["wins"], res["recent"]["n"],
                      res["earlier"]["wins"], res["earlier"]["n"])
    zy, py = two_prop_z(res["recent"]["wins"], res["recent"]["n"],
                        res["year"]["wins"], res["year"]["n"])
    res["ztest"] = {
        "vs_earlier": {"z": z, "p": p,
                       "diff_pts": res["recent"]["acc"] - res["earlier"]["acc"]},
        "vs_year": {"z": zy, "p": py,
                    "diff_pts": res["recent"]["acc"] - res["year"]["acc"]},
        "recent_half_width": res["recent"]["half_width"],
        "n_needed_53_vs_57": n_for_power(0.53, 0.57),
        "n_needed_54_vs_57": n_for_power(0.54, 0.57),
        "powered_for_4pts": RECENT_N >= n_for_power(0.53, 0.57),
    }

    # --- streaks ------------------------------------------------------------
    yruns = streak_runs(ysig)
    rruns = streak_runs(recent)
    ge7 = sum(1 for r in yruns if r >= 7)
    ploss = 1 - res["year"]["wins"] / res["year"]["n"]
    pwin = 1 - ploss
    # expected count of runs of length >= k in n signals: n * p_win * p_loss^k
    theo7 = res["year"]["n"] * pwin * ploss ** 7
    res["streaks"] = {
        "year_hist": res["year"]["streaks"],
        "recent_hist": res["recent"]["streaks"],
        "year_max": res["year"]["max_streak"],
        "recent_max": res["recent"]["max_streak"],
        "ge7_count_year": ge7,
        "ge8_count_year": sum(1 for r in yruns if r >= 8),
        "theoretical_ge7": theo7,
        "expected_wait_signals": res["year"]["n"] / ge7 if ge7 else float("inf"),
        "expected_wait_days": (res["year"]["n"] / ge7 / rate) if ge7 else float("inf"),
        "ge7_in_400": 1 - (1 - pwin * ploss ** 7) ** RECENT_N,
        "cluster": cluster_stats(streak_runs_dated(ysig), min_len=7),
    }

    # --- 500 random 400-signal windows --------------------------------------
    accs, busts, maxs, pnls = [], [], [], []
    hi = len(ysig) - RECENT_N
    for _ in range(N_DRAWS):
        s = random.randint(0, hi)
        w = ysig[s:s + RECENT_N]
        st = E.simulate(w)
        accs.append(st["acc"])
        busts.append(st["busts"])
        maxs.append(st["max_streak"])
        pnls.append(st["pnl"])
    res["windows"] = {
        "n_draws": N_DRAWS, "acc": accs, "busts": busts,
        "maxstreak": maxs, "pnl": pnls,
        "acc_mean": sum(accs) / len(accs),
        "acc_sd": E._stdev(accs),
        "acc_p05": sorted(accs)[int(0.05 * N_DRAWS)],
        "acc_p50": sorted(accs)[N_DRAWS // 2],
        "acc_p95": sorted(accs)[int(0.95 * N_DRAWS)],
        "busts_mean": sum(busts) / len(busts),
        "maxstreak_mean": sum(maxs) / len(maxs),
        "maxstreak_p50": sorted(maxs)[N_DRAWS // 2],
        "pct_acc": percentile_of(accs, res["recent"]["acc"]),
        "pct_busts": percentile_of(busts, res["recent"]["busts"]),
        "pct_maxstreak": percentile_of(maxs, res["recent"]["max_streak"]),
        "pct_pnl": percentile_of(pnls, res["recent"]["pnl"]),
        "share_maxstreak_ge7": sum(1 for m in maxs if m >= 7) / N_DRAWS * 100,
    }

    # --- step 4: the dead band ----------------------------------------------
    bsig = settle_band(rows)
    voided = [r for r in rows if r[4] != 0 and abs(r[4]) <= r[5]]
    tiny_w = sum(1 for r in voided if r[3])
    tiny_l = sum(1 for r in voided if not r[3])
    bands = sorted(r[5] for r in rows)
    res["deadband"] = {
        "settle_deadband": SETTLE_DEADBAND, "settle_floor": SETTLE_FLOOR,
        "band_median": bands[len(bands) // 2],
        "band_min": bands[0], "band_max": bands[-1],
        "band_at_floor_pct": sum(1 for b in bands if b <= SETTLE_FLOOR) / len(bands) * 100,
        "n_raw": len(ysig), "n_banded": len(bsig),
        "voided": len(voided),
        "voided_pct": len(voided) / len(ysig) * 100,
        "tiny_wins": tiny_w, "tiny_losses": tiny_l,
        "raw": res["year"],
        "banded": block(bsig, "سال با آستانهٔ ربات"),
    }
    res["deadband"]["acc_shift_pts"] = (res["deadband"]["banded"]["acc"]
                                        - res["year"]["acc"])
    # the same measurement restricted to the recent stretch
    rrows = [r for r in rows if r[1] >= recent[0][1]]
    rvoid = [r for r in rrows if r[4] != 0 and abs(r[4]) <= r[5]]
    res["deadband"]["recent_voided"] = len(rvoid)
    res["deadband"]["recent_voided_pct"] = len(rvoid) / len(recent) * 100
    res["deadband"]["recent_banded"] = block(
        [(r[0], r[1], r[2], r[3]) for r in rrows if abs(r[4]) > r[5]],
        "اخیر با آستانهٔ ربات")

    # How exposed the scorecard is to the feed itself. The bot grades a window
    # with its OWN Chainlink samples; bot.py notes the feed sits ~$1 from
    # Polymarket's at the same instant, and FEED_MAX_AGE allows a 60s-stale
    # round. Any window whose whole move is smaller than that slack can be
    # graded one way here and the other way on the market — which is the
    # mechanism behind the win the user caught on a losing position.
    slack = {}
    for thr in (0.5, 1.0, 2.0, 3.0, 5.0, 10.0):
        inside = [r for r in rows if abs(r[4]) <= thr]
        slack[thr] = {
            "n": len(inside),
            "pct": len(inside) / len(ysig) * 100,
            "wins": sum(1 for r in inside if r[3]),
        }
    res["deadband"]["feed_slack"] = slack
    # The band only protects the windows it covers: how many sit in the exposed
    # gap between the band and the $1 feed discrepancy is what matters.
    res["deadband"]["graded_under_1usd"] = sum(
        1 for r in rows if r[4] != 0 and abs(r[4]) > r[5] and abs(r[4]) <= 1.0)

    # --- sensitivity: what if disagreement did not kill the window? ----------
    psig = priority_signals(year)
    res["sensitivity"] = {
        "note": "bot.py skips a window when its rules disagree. This variant "
                "instead lets the highest-labelled rule take it, to show the "
                "choice does not drive the conclusion.",
        "order": list(RULE_PRIORITY),
        "year": block(psig, "سال — واریانتِ اولویت"),
        "recent": block(psig[-RECENT_N:], "اخیر — واریانتِ اولویت"),
    }
    zs, ps = two_prop_z(res["sensitivity"]["recent"]["wins"],
                        res["sensitivity"]["recent"]["n"],
                        res["sensitivity"]["year"]["wins"],
                        res["sensitivity"]["year"]["n"])
    res["sensitivity"]["z"] = zs
    res["sensitivity"]["p"] = ps

    # --- tables -------------------------------------------------------------
    daily = []
    for d, ss in sorted(grouped(recent, tehran_date).items()):
        st = E.simulate(ss)
        lo, hi_ = E.wilson(st["wins"], st["n"])
        daily.append({"date": d, "n": st["n"], "wins": st["wins"],
                      "acc": st["acc"], "lo": lo, "hi": hi_,
                      "busts": st["busts"], "max_streak": st["max_streak"],
                      "pnl": st["pnl"], "path_low": st["path_low"]})
    res["daily"] = daily

    monthly = []
    for m, ss in sorted(grouped(ysig, month_of).items()):
        st = E.simulate(ss)
        lo, hi_ = E.wilson(st["wins"], st["n"])
        monthly.append({"month": m, "n": st["n"], "wins": st["wins"],
                        "acc": st["acc"], "lo": lo, "hi": hi_,
                        "busts": st["busts"], "max_streak": st["max_streak"]})
    res["monthly"] = monthly

    path = E.save(res, "task_e.pkl")
    report(res, path)
    return res


def report(r, path):
    p = print
    p("=" * 78)
    p("TASK E — reconstructed recent stretch vs the year. NO LIVE DATA USED.")
    p("=" * 78)
    s = r["live_log_search"]
    p(f"\n[1] live log in this sandbox: {'FOUND' if s['found'] else 'NOT FOUND'}")
    for w in s["looked_in"]:
        p(f"    searched: {w}")
    if not s["found"]:
        p("    the user must send:")
        for w in s["need_from_user"]:
            p(f"      - {w}")

    p(f"\n[2] live configuration replayed: {', '.join(LIVE_RULES)} "
      f"(rule4 off, unanimous consensus, golden = label)")
    p(f"    year: {r['meta']['year_from'][:10]} .. {r['meta']['year_to'][:10]}  "
      f"{r['rate']['sigs_per_day']:.1f} signals/day")
    p(f"    {RECENT_N} signals therefore span "
      f"{r['rate']['recent_span_days']:.2f} days "
      f"({r['recent']['t0'] and datetime.datetime.fromtimestamp(r['recent']['t0'], E.UTC):%Y-%m-%d %H:%M} .. "
      f"{datetime.datetime.fromtimestamp(r['recent']['t1'], E.UTC):%Y-%m-%d %H:%M} UTC)")

    for k in ("recent", "earlier", "year"):
        b = r[k]
        p(f"\n  {b['label']:<22} n={b['n']:6d}  acc={b['acc']:6.2f}% "
          f"[{b['lo']:.2f}–{b['hi']:.2f}]  (+/-{b['half_width']:.2f})  "
          f"busts={b['busts']:4d} ({b['bust_rate']:.2f}%)  max={b['max_streak']:2d}  "
          f"P&L={b['pnl']:+10,.0f}  low={b['path_low']:+9,.0f}")

    p("\n[3] recent streak histogram: " +
      ", ".join(f"{k}x{v}" for k, v in sorted(r["recent"]["streaks"].items())))
    p("    year   streak histogram: " +
      ", ".join(f"{k}x{v}" for k, v in sorted(r["year"]["streaks"].items())))

    z = r["ztest"]
    p(f"\n[4] two-proportion z, recent vs rest-of-year: "
      f"z={z['vs_earlier']['z']:+.3f}  p={z['vs_earlier']['p']:.3f}  "
      f"diff={z['vs_earlier']['diff_pts']:+.2f} pts")
    p(f"    recent vs whole year:  z={z['vs_year']['z']:+.3f}  p={z['vs_year']['p']:.3f}")
    p(f"    POWER: {RECENT_N} signals give +/-{z['recent_half_width']:.2f} points. "
      f"Telling 53% from 57% needs {z['n_needed_53_vs_57']:,} per group "
      f"-> underpowered by {z['n_needed_53_vs_57'] / RECENT_N:.1f}x")

    st = r["streaks"]
    p(f"\n[5] losing runs >=7 in the year: {st['ge7_count_year']} "
      f"(theory {st['theoretical_ge7']:.1f}), >=8: {st['ge8_count_year']}")
    p(f"    expected wait between them: {st['expected_wait_signals']:.0f} signals "
      f"= {st['expected_wait_days']:.1f} days")
    p(f"    P(at least one >=7 run inside any 400 signals) = "
      f"{st['ge7_in_400'] * 100:.1f}%")
    cl = st["cluster"]
    p(f"    CLUSTERING (the user's actual experience — two long runs back to back):")
    p(f"      median gap between >=7 runs: {cl['median_gap_days']:.2f} days")
    for d in (1.0, 2.0, 3.0):
        p(f"      pairs of >=7 runs within {d:g} day(s) of each other: "
          f"{cl[f'pairs_within_{d:g}d']} "
          f"({cl[f'share_clustered_{d:g}d']:.1f}% of all gaps)")

    w = r["windows"]
    p(f"\n[6] {w['n_draws']} random {RECENT_N}-signal windows from the year:")
    p(f"    acc  mean={w['acc_mean']:.2f}%  sd={w['acc_sd']:.2f}  "
      f"p5={w['acc_p05']:.2f}  p50={w['acc_p50']:.2f}  p95={w['acc_p95']:.2f}")
    p(f"    busts mean={w['busts_mean']:.1f}   maxstreak mean={w['maxstreak_mean']:.2f} "
      f"median={w['maxstreak_p50']}  share with max>=7: {w['share_maxstreak_ge7']:.1f}%")
    p(f"    RECENT SITS AT: accuracy {w['pct_acc']:.1f}th pct, "
      f"busts {w['pct_busts']:.1f}th pct, maxstreak {w['pct_maxstreak']:.1f}th pct, "
      f"P&L {w['pct_pnl']:.1f}th pct")

    d = r["deadband"]
    p(f"\n[7] dead band = max(median|move| x {d['settle_deadband']}, "
      f"${d['settle_floor']:.0f}); median band ${d['band_median']:.2f}, "
      f"{d['band_at_floor_pct']:.1f}% of windows pinned to the floor")
    p(f"    year signals inside the band: {d['voided']:,} of {d['n_raw']:,} "
      f"= {d['voided_pct']:.2f}%   (of those, {d['tiny_wins']} scored WIN and "
      f"{d['tiny_losses']} scored LOSS by close-to-close)")
    b = d["banded"]
    p(f"    year WITH the band: n={b['n']:,}  acc={b['acc']:.2f}% "
      f"[{b['lo']:.2f}–{b['hi']:.2f}]  busts={b['busts']} ({b['bust_rate']:.2f}%)  "
      f"P&L={b['pnl']:+,.0f}   shift={d['acc_shift_pts']:+.3f} pts")
    rb = d["recent_banded"]
    p(f"    recent WITH the band: n={rb['n']}  acc={rb['acc']:.2f}% "
      f"[{rb['lo']:.2f}–{rb['hi']:.2f}]  ({d['recent_voided']} voided)")
    p("    feed slack — windows whose ENTIRE move is under a threshold:")
    for thr, v in sorted(d["feed_slack"].items()):
        p(f"      |move| <= ${thr:<5.1f}  {v['n']:5d} windows ({v['pct']:5.2f}%)"
          f"  of which {v['wins']:4d} graded WIN")
    p(f"      still GRADED despite being under $1: {d['graded_under_1usd']} windows")

    s = r["sensitivity"]
    p(f"\n[7b] sensitivity — if disagreement did NOT kill the window "
      f"(priority {', '.join(s['order'])}):")
    for k in ("year", "recent"):
        b = s[k]
        p(f"    {k:<8} n={b['n']:6d}  acc={b['acc']:6.2f}% "
          f"[{b['lo']:.2f}–{b['hi']:.2f}]  busts={b['busts']:4d}  max={b['max_streak']:2d}")
    p(f"    recent vs year: z={s['z']:+.3f}  p={s['p']:.3f}")

    p("\n[8] day by day (Tehran), reconstructed:")
    p(f"    {'date':<12}{'n':>5}{'wins':>6}{'acc%':>8}{'95% Wilson':>18}"
      f"{'busts':>7}{'max':>5}{'P&L':>9}")
    for x in r["daily"]:
        ci = f"{x['lo']:.0f}-{x['hi']:.0f}"
        p(f"    {x['date']:<12}{x['n']:>5}{x['wins']:>6}{x['acc']:>8.1f}{ci:>18}"
          f"{x['busts']:>7}{x['max_streak']:>5}{x['pnl']:>+9,.0f}")

    p("\n[9] month by month (year, reconstructed):")
    for x in r["monthly"]:
        p(f"    {x['month']}  n={x['n']:5d}  acc={x['acc']:5.2f}% "
          f"[{x['lo']:.1f}–{x['hi']:.1f}]  busts={x['busts']:3d}  max={x['max_streak']:2d}")

    p(f"\nsaved -> {path}")


if __name__ == "__main__":
    main()
