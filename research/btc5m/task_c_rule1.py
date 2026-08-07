"""
Task C — is rule 1 (the 20-candle break) what busts the ladder, and can any
variant of it bust less?

Everything here calls into engine.py. No rule is re-implemented: `walk()` is the
same chart walk as engine.run_rule, kept separate only because it preserves the
signal dict (level / kind / vol ratio / depth) that run_rule throws away, and
because the variant sweep needs those fields. `walk(engine.rule1, ...)` is
asserted equal to `engine.run_rule("rule1", ...)` at startup.

Run:  python3 research/btc5m/task_c_rule1.py
Out:  research/btc5m/out/task_c.pkl
      research/btc5m/reports/task-c-rule1.md

------------------------------------------------------------------------------
STRUCTURE OF task_c.pkl
------------------------------------------------------------------------------
{
  "meta": {
      "candles":   int,          # 5m candles in the tested year
      "from","to": "YYYY-MM-DD",
      "base":      20.0,         # stake
      "rungs":     3,
      "K":         int,          # variants counted for Bonferroni
      "bonf_z":    float,        # engine.bonferroni_z(K)
      "pool_members": (...),     # what the bot votes with today
  },
  "part1": {                     # is the user's belief true?
      "pool":        stats,      # engine.simulate() dict, the live pool
      "pool_no1":    stats,      # same pool with rule 1 removed as a voter
      "pool_skip1":  stats,      # pool, but windows where rule 1 fired are skipped
      "rule1_alone": stats,
      "busts_total": int,
      "busts_any1":  int,        # busts with >=1 rule-1 window in the 3 losses
      "busts_all1":  int,        # busts where all 3 losses were rule-1 windows
      "busts_no1":   int,
      "streak6_total": int,      # losing runs of length >= 6
      "streak6_any1":  int,
      "streak6_all1":  int,
  },
  "variants": {  name: {
      "group":  str,             # which sweep it belongs to
      "desc":   str,             # Persian one-liner
      "kind":   "sel" | "seq",   # selection-only vs outcome-dependent
      "n","wins","acc","lo","hi","z","busts","bust_rate",
      "max_streak","streaks","pnl","path_low","drawdown","flat_pnl",
      "per_day": float,
      "train":  {"n","acc","z"}, # engine.split, chronological 70/30
      "test":   {"n","acc","z"},
      "block_lift": float,       # accuracy minus baseline, contrasted inside
                                 # calendar months and re-weighted (guards
                                 # against the train/test regime drift)
      "sig":    [(i, ts, side, won), ...],
  } },
  "shuffle": {
      "reps": 200,
      "best_acc": float,         # best accuracy any variant reached on shuffled
      "best_variant": str,       #   labels, i.e. the null for the whole sweep
      "p95": float, "p99": float,
      "per_variant": {name: {"mean","p95","max"}},
  },
}
"""

import datetime
import math
import os
import random
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import engine  # noqa: E402

SEED = 20260807
BASE = engine.STAKE_BASE
RUNGS = engine.LADDER_RUNGS
POOL_MEMBERS = ("rule1", "rule2", "rule3", "rule5", "rule6", "rule7")
OTHERS = ("rule2", "rule3", "rule5", "rule6", "rule7", "golden")
MIN_N = 200
SHUFFLES = 200


# --------------------------------------------------------------------------
# the walk (engine.run_rule, but keeping the signal dict)
# --------------------------------------------------------------------------
def walk(fn, candles, warmup=engine.WARMUP, **kw):
    """[(i, ts, side, won, meta)] — the 4-tuple prefix engine.simulate expects."""
    cl = engine.closes_of(candles)
    out = []
    for i in range(warmup, len(cl) - 1):
        window = cl[i + 1 - warmup:i + 1]
        s = fn(window, **kw) if kw else fn(window)
        if not s:
            continue
        nxt = cl[i + 1] - cl[i]
        if nxt == 0:
            continue
        out.append((i, candles[i]["t"], s["side"], (s["side"] == "up") == (nxt > 0), s))
    return out


def rule1_meta(closes, lookback=20):
    """engine.rule1 with the vol filter off, plus break depth in median moves."""
    s = engine.rule1(closes, lookback=lookback, vol_filter=False)
    if not s:
        return None
    med = engine._median([abs(m) for m in engine._moves(closes[-101:])])
    cur = closes[-1]
    s["depth"] = (abs(cur - s["level"]) / med) if med > 0 else 0.0
    return s


def rule1_hl(cands, i, lookback=20, vol_th=engine.VOL_TH, vol_filter=True,
             trigger="hl"):
    """
    Rule 1 with the level taken from candle HIGHS/LOWS instead of closes.

    trigger="hl"    -> the break is the candle's own high/low crossing it
                       (what the original research measured)
    trigger="close" -> the level is high/low based but the break is on close
    Everything else — the volatility filter, the fade direction — is engine's.
    """
    if i < lookback + 1 or i < 101:
        return None
    win = cands[i - lookback:i]
    hi = max(x["h"] for x in win)
    lo = min(x["l"] for x in win)
    cur = cands[i]
    up = (cur["h"] > hi) if trigger == "hl" else (cur["c"] > hi)
    dn = (cur["l"] < lo) if trigger == "hl" else (cur["c"] < lo)
    if up and dn:
        return None                      # both sides broken: ambiguous, skip
    if up:
        side, level, kind = "down", hi, "breakout-up"
    elif dn:
        side, level, kind = "up", lo, "breakout-down"
    else:
        return None
    tail = [x["c"] for x in cands[i - 100:i + 1]]
    rets = [(tail[k] - tail[k - 1]) / tail[k - 1] for k in range(1, len(tail))
            if tail[k - 1]]
    slow = engine._stdev(rets)
    if slow <= 0:
        return None
    ratio = engine._stdev(rets[-20:]) / slow
    if vol_filter and ratio < vol_th:
        return None
    return {"side": side, "level": level, "kind": kind, "ratio": ratio}


def walk_hl(cands, warmup=engine.WARMUP, **kw):
    out = []
    for i in range(warmup, len(cands) - 1):
        s = rule1_hl(cands, i, **kw)
        if not s:
            continue
        nxt = cands[i + 1]["c"] - cands[i]["c"]
        if nxt == 0:
            continue
        out.append((i, cands[i]["t"], s["side"], (s["side"] == "up") == (nxt > 0), s))
    return out


# --------------------------------------------------------------------------
# scoring
# --------------------------------------------------------------------------
def month_of(ts):
    d = datetime.datetime.fromtimestamp(ts, engine.UTC)
    return d.year * 12 + d.month


def block_lift(sig, base_by_month):
    """
    Accuracy lift over the baseline, contrasted INSIDE calendar months.

    The test half of this dataset fades more than the train half, so any variant
    whose signals drift toward the end of the year inherits an edge it did not
    earn. Comparing month by month and re-weighting by the variant's own month
    counts removes that.
    """
    num = den = 0.0
    by = {}
    for s in sig:
        m = month_of(s[1])
        w, n = by.get(m, (0, 0))
        by[m] = (w + (1 if s[3] else 0), n + 1)
    for m, (w, n) in by.items():
        bw, bn = base_by_month.get(m, (0, 0))
        if bn < 20:
            continue
        num += n * (w / n - bw / bn)
        den += n
    return num / den * 100 if den else float("nan")


def score(sig, name, group, desc, kind, days, base_by_month):
    st = engine.simulate(sig, base=BASE, rungs=RUNGS)
    lo, hi = engine.wilson(st["wins"], st["n"])
    tr, te = engine.split(sig)

    def half(x):
        s = engine.simulate(x, base=BASE, rungs=RUNGS)
        return {"n": s["n"], "acc": s["acc"], "busts": s["busts"],
                "z": engine.zscore(s["wins"], s["n"]) if s["n"] else float("nan")}

    return {
        "group": group, "desc": desc, "kind": kind,
        "n": st["n"], "wins": st["wins"], "acc": st["acc"], "lo": lo, "hi": hi,
        "z": engine.zscore(st["wins"], st["n"]) if st["n"] else float("nan"),
        "busts": st["busts"], "bust_rate": st["bust_rate"],
        "max_streak": st["max_streak"], "streaks": st["streaks"],
        "pnl": st["pnl"], "path_low": st["path_low"], "drawdown": st["drawdown"],
        "flat_pnl": engine.flat(sig)["pnl"], "per_day": st["n"] / days,
        "train": half(tr), "test": half(te),
        "block_lift": block_lift(sig, base_by_month),
        "sig": [(s[0], s[1], s[2], s[3]) for s in sig],
    }


# --------------------------------------------------------------------------
# selection filters (label-independent) and sequential filters (label-aware)
# --------------------------------------------------------------------------
def seq_skip_after_loss(sig, n_skip):
    """After a losing bet, ignore the next n_skip rule-1 signals."""
    out, skip = [], 0
    for s in sig:
        if skip:
            skip -= 1
            continue
        out.append(s)
        if not s[3]:
            skip = n_skip
    return out


def seq_cooldown_candles(sig, m):
    """After a losing bet, sit out m candles."""
    out, until = [], -1
    for s in sig:
        if s[0] < until:
            continue
        out.append(s)
        if not s[3]:
            until = s[0] + m
    return out


def seq_reenter_range(sig, nbreak):
    """
    After a loss, do not fire again until price has re-entered the 20-candle
    range: at least one candle strictly between the losing bet and the candidate
    must have closed back inside the range (i.e. rule 1 was silent on it).

    `nbreak` is a prefix count of break candles, so "was there a quiet candle in
    (a, b)?" is (b - 1 - a) > nbreak[b - 1] - nbreak[a].
    """
    out, last_loss = [], None
    for s in sig:
        if last_loss is not None:
            a, b = last_loss, s[0]
            gap = b - 1 - a
            quiet = gap - (nbreak[b - 1] - nbreak[a])
            if quiet <= 0:
                continue
            last_loss = None
        out.append(s)
        if not s[3]:
            last_loss = s[0]
    return out


def seq_pause_after_bust(sig):
    """After a full 3-rung bust, no more bets until the next calendar day."""
    out, rung, block_day = [], 0, None
    for s in sig:
        day = datetime.datetime.fromtimestamp(s[1], engine.TEHRAN).date()
        if block_day is not None:
            if day <= block_day:
                continue
            block_day = None
        out.append(s)
        if s[3]:
            rung = 0
        else:
            rung += 1
            if rung >= RUNGS:
                rung = 0
                block_day = day
    return out


def cluster_rank(break_idx_sides, gap=20):
    """
    Rank each break inside its cluster: 1 = first break of a fresh cluster.

    A cluster is the run of breaks that keeps happening while price stays out on
    the SAME side and never goes quiet for more than `gap` candles. Ranks are
    computed on the raw break stream (volatility filter off) so that the same
    "first / second / third" labels apply no matter which later filter is
    chained on top.
    """
    rank, prev_i, prev_side, k = {}, None, None, 0
    for i, side in break_idx_sides:
        if prev_i is None or i - prev_i > gap or side != prev_side:
            k = 1
        else:
            k += 1
        rank[i] = k
        prev_i, prev_side = i, side
    return rank


def sel_cluster(sig, which, rank):
    """which=1|2|3 -> take only the 1st / 2nd / 3rd break of each cluster."""
    return [s for s in sig if rank.get(s[0]) == which]


def sel_spaced(sig, gap):
    out, prev = [], None
    for s in sig:
        if prev is None or s[0] - prev >= gap:
            out.append(s)
            prev = s[0]
    return out


# --------------------------------------------------------------------------
def main():
    random.seed(SEED)
    np.random.seed(SEED)
    cand = engine.last_year(engine.load())
    days = len(cand) / 288.0
    d0 = datetime.datetime.fromtimestamp(cand[0]["t"], engine.UTC)
    d1 = datetime.datetime.fromtimestamp(cand[-1]["t"], engine.UTC)
    print(f"candles {len(cand):,}  {d0:%Y-%m-%d} .. {d1:%Y-%m-%d}  ({days:.0f}d)")

    # ---- sanity: the walk reproduces the engine exactly --------------------
    ref = engine.run_rule("rule1", cand)
    mine = [(s[0], s[1], s[2], s[3]) for s in walk(engine.rule1, cand)]
    assert ref == mine, "walk() disagrees with engine.run_rule"
    print("walk() == engine.run_rule('rule1')  ok")

    # ---- all breaks, vol filter off, with metadata -------------------------
    breaks = walk(rule1_meta, cand, lookback=20)
    BASE_SIG = [s for s in breaks if s[4]["ratio"] >= engine.VOL_TH]
    assert [(s[0], s[1], s[2], s[3]) for s in BASE_SIG] == ref, \
        "post-hoc vol filter != engine's vol filter"
    print(f"breaks(no vol filter)={len(breaks):,}  shipped rule1={len(BASE_SIG):,}")

    base_by_month = {}
    for s in BASE_SIG:
        m = month_of(s[1])
        w, n = base_by_month.get(m, (0, 0))
        base_by_month[m] = (w + (1 if s[3] else 0), n + 1)

    # ==================================================================
    # PART 1 — does rule 1 cause the pool's busts?
    # ==================================================================
    print("\n--- part 1: rule 1 inside the live pool ---")
    fired_all = engine.run_many(POOL_MEMBERS + ("golden",), cand)
    by_idx = {i: f for i, _, f, _ in fired_all}

    def build_pool(members):
        out = []
        for i, ts, f, nxt in fired_all:
            g = {k: v for k, v in f.items() if k in members}
            if not g or nxt == 0:
                continue
            sides = set(g.values())
            if len(sides) != 1:
                continue
            side = sides.pop()
            out.append((i, ts, side, (side == "up") == (nxt > 0), sorted(g)))
        return out

    pool = build_pool(POOL_MEMBERS)
    pool_no1 = build_pool(tuple(m for m in POOL_MEMBERS if m != "rule1"))
    pool_skip1 = [s for s in pool if "rule1" not in s[4]]

    st_pool = engine.simulate(pool, base=BASE, rungs=RUNGS)
    st_no1 = engine.simulate(pool_no1, base=BASE, rungs=RUNGS)
    st_skip1 = engine.simulate(pool_skip1, base=BASE, rungs=RUNGS)
    st_r1 = engine.simulate(BASE_SIG, base=BASE, rungs=RUNGS)
    for lab, st in (("pool (live)", st_pool), ("pool without rule1", st_no1),
                    ("pool, rule1 windows dropped", st_skip1),
                    ("rule1 alone", st_r1)):
        print(" ", engine.fmt(st, lab))

    # attribute each bust and each >=6 losing run
    busts_any1 = busts_all1 = busts_no1 = 0
    run6_tot = run6_any1 = run6_all1 = 0
    rung, cur = 0, []
    for s in pool:
        if s[3]:
            if len(cur) >= 6:
                run6_tot += 1
                has = [("rule1" in x[4]) for x in cur]
                run6_any1 += any(has)
                run6_all1 += all(has)
            cur = []
            rung = 0
        else:
            cur.append(s)
            rung += 1
            if rung >= RUNGS:
                three = cur[-RUNGS:]
                has = [("rule1" in x[4]) for x in three]
                busts_any1 += any(has)
                busts_all1 += all(has)
                busts_no1 += not any(has)
                rung = 0
    if len(cur) >= 6:
        run6_tot += 1
        has = [("rule1" in x[4]) for x in cur]
        run6_any1 += any(has)
        run6_all1 += all(has)

    n1 = sum(1 for s in pool if "rule1" in s[4])
    print(f"  pool windows containing rule1: {n1:,}/{len(pool):,} "
          f"({n1/len(pool)*100:.1f}%)")
    print(f"  busts {st_pool['busts']}: any-rule1={busts_any1} "
          f"all-rule1={busts_all1} no-rule1={busts_no1}")
    print(f"  losing runs >=6: {run6_tot}  any-rule1={run6_any1} "
          f"all-rule1={run6_all1}")

    part1 = {
        "pool": st_pool, "pool_no1": st_no1, "pool_skip1": st_skip1,
        "rule1_alone": st_r1, "pool_n_with_rule1": n1, "pool_n": len(pool),
        "busts_total": st_pool["busts"], "busts_any1": busts_any1,
        "busts_all1": busts_all1, "busts_no1": busts_no1,
        "streak6_total": run6_tot, "streak6_any1": run6_any1,
        "streak6_all1": run6_all1,
    }

    # ==================================================================
    # PART 2 — the variant sweep
    # ==================================================================
    print("\n--- part 2: variant sweep ---")
    # builders: name -> (group, desc, kind, fn(sig_with_meta) -> sig)
    # A "sel" builder never looks at s[3]; a "seq" builder does.
    B = {}

    def add(name, group, desc, kind, fn):
        B[name] = (group, desc, kind, fn)

    add("baseline", "0-baseline", "قانون ۱ همان‌طور که الان کار می‌کند",
        "sel", lambda s: s)

    # --- 2. the user's idea: stop after a loss -----------------------------
    for n in (1, 2, 3, 5):
        add(f"after_loss_skip{n}", "2-after-loss",
            f"بعد از هر باخت، {n} سیگنالِ بعدی را نگیر", "seq",
            (lambda n: lambda s: seq_skip_after_loss(s, n))(n))
    for m in (5, 10, 20, 60):
        add(f"after_loss_wait{m}c", "2-after-loss",
            f"بعد از هر باخت، {m} کندل صبر کن", "seq",
            (lambda m: lambda s: seq_cooldown_candles(s, m))(m))
    # Break candles, voids included — "did price re-enter the range?" is a
    # property of the chart, not of whether a bet happened to be settleable.
    cl_all = engine.closes_of(cand)
    raw_breaks = []
    for i in range(engine.WARMUP, len(cl_all)):
        s = engine.rule1(cl_all[i + 1 - engine.WARMUP:i + 1], vol_filter=False)
        if s:
            raw_breaks.append((i, s["side"]))
    is_break = set(i for i, _ in raw_breaks)
    nbreak = [0] * (len(cl_all) + 1)
    for i in range(len(cl_all)):
        nbreak[i] = nbreak[i - 1] + (1 if i in is_break else 0) if i else 0
    RANK = cluster_rank(raw_breaks)

    add("after_loss_reenter", "2-after-loss",
        "بعد از باخت تا وقتی قیمت به داخلِ بازهٔ ۲۰ کندلی برنگردد نگیر", "seq",
        lambda s: seq_reenter_range(s, nbreak))
    add("pause_day_after_bust", "2-after-loss",
        "بعد از هر انفجارِ کامل، تا روزِ بعد توقف", "seq", seq_pause_after_bust)

    # --- 3. cluster suppression -------------------------------------------
    for k in (1, 2, 3):
        add(f"cluster_{k}", "3-cluster",
            f"فقط شکستِ شمارهٔ {k} از هر خوشه", "sel",
            (lambda k: lambda s: sel_cluster(s, k, RANK))(k))
    for g in (3, 5, 10):
        add(f"spaced_{g}", "3-cluster",
            f"فقط شکست‌هایی که ≥{g} کندل از قبلی فاصله دارند", "sel",
            (lambda g: lambda s: sel_spaced(s, g))(g))

    # --- 4. lookback sweep -------------------------------------------------
    lb_sig = {}
    for lb in (10, 15, 20, 25, 30, 40, 50, 100):
        lb_sig[lb] = [s for s in walk(rule1_meta, cand, lookback=lb)
                      if s[4]["ratio"] >= engine.VOL_TH]
        add(f"lookback_{lb}", "4-lookback", f"پنجرهٔ سطح = {lb} کندل", "sel",
            (lambda lb: lambda s: lb_sig[lb])(lb))

    # --- 5. volatility filter ---------------------------------------------
    add("vol_off", "5-vol", "بدونِ فیلترِ نوسان", "sel", lambda s: breaks)
    for th in (0.7, 0.8, 0.8884, 1.0, 1.1, 1.2):
        add(f"vol_ge_{th}", "5-vol", f"نوسان ≥ {th} (انبساط)", "sel",
            (lambda th: lambda s: [x for x in breaks if x[4]["ratio"] >= th])(th))
        add(f"vol_lt_{th}", "5-vol", f"وارونه: نوسان < {th} (انقباض)", "sel",
            (lambda th: lambda s: [x for x in breaks if x[4]["ratio"] < th])(th))

    # --- 6. direction ------------------------------------------------------
    add("dir_up_only", "6-direction", "فقط شکستِ سقف (شرط: پایین)", "sel",
        lambda s: [x for x in s if x[4]["kind"] == "breakout-up"])
    add("dir_down_only", "6-direction", "فقط شکستِ کف (شرط: بالا)", "sel",
        lambda s: [x for x in s if x[4]["kind"] == "breakout-down"])

    # --- 7. depth of break -------------------------------------------------
    for x in (0.25, 0.5, 1.0, 2.0):
        add(f"depth_{x}", "7-depth",
            f"عبور از سطح ≥ {x}× حرکتِ میانه", "sel",
            (lambda x: lambda s: [q for q in s if q[4]["depth"] >= x])(x))

    # --- 8. confirmation ---------------------------------------------------
    def conf(other, same_side):
        def f(s):
            out = []
            for q in s:
                o = by_idx.get(q[0], {}).get(other)
                if o is None:
                    continue
                if same_side and o != q[2]:
                    continue
                out.append(q)
            return out
        return f

    for o in OTHERS:
        add(f"and_{o}", "8-confirm", f"قانون ۱ و {o} با هم", "sel", conf(o, False))
        add(f"and_{o}_side", "8-confirm", f"قانون ۱ و {o} هم‌جهت", "sel",
            conf(o, True))

    def conf2(k):
        def f(s):
            out = []
            for q in s:
                f_ = by_idx.get(q[0], {})
                agree = sum(1 for o in OTHERS if f_.get(o) == q[2])
                if agree >= k:
                    out.append(q)
            return out
        return f

    add("and_ge2_others", "8-confirm", "قانون ۱ + حداقل ۲ قانونِ هم‌جهتِ دیگر",
        "sel", conf2(2))
    add("and_ge3_others", "8-confirm", "قانون ۱ + حداقل ۳ قانونِ هم‌جهتِ دیگر",
        "sel", conf2(3))

    # --- 9. veto: rule 1 fires but another rule points the other way -------
    for o in OTHERS:
        add(f"veto_{o}", "9-veto", f"اگر {o} مخالف بود، نگیر", "sel",
            (lambda o: lambda s: [q for q in s
                                  if by_idx.get(q[0], {}).get(o) in (None, q[2])])(o))

    # --- 10. calendar ------------------------------------------------------
    def teh(ts):
        return datetime.datetime.fromtimestamp(ts, engine.TEHRAN)

    for h0 in range(0, 24, 4):
        add(f"tehran_{h0:02d}_{h0+4:02d}", "10-calendar",
            f"فقط ساعتِ {h0}:00–{h0+4}:00 تهران", "sel",
            (lambda h0: lambda s: [q for q in s
                                   if h0 <= teh(q[1]).hour < h0 + 4])(h0))
    for d in range(7):
        nm = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")[d]
        add(f"dow_{nm}", "10-calendar", f"فقط روزِ {nm} (تهران)", "sel",
            (lambda d: lambda s: [q for q in s if teh(q[1]).weekday() == d])(d))

    # --- 11. high/low levels ----------------------------------------------
    hl_hl = walk_hl(cand, trigger="hl")
    hl_cl = walk_hl(cand, trigger="close")
    add("hl_break_on_hl", "11-highlow",
        "سطح از های/لو و شکست با های/لوِ خودِ کندل", "sel", lambda s: hl_hl)
    add("hl_break_on_close", "11-highlow",
        "سطح از های/لو ولی شکست با کلوز", "sel", lambda s: hl_cl)

    # --- combined ----------------------------------------------------------
    def chain(*fns):
        def f(s):
            for fn in fns:
                s = fn(s)
            return s
        return f

    # (filled in after the first pass, see below)

    # ---- run every builder, saving after each family ----------------------
    results = {}
    snapshot = {"meta": {"candles": len(cand), "days": days,
                         "from": f"{d0:%Y-%m-%d}", "to": f"{d1:%Y-%m-%d}",
                         "base": BASE, "rungs": RUNGS, "seed": SEED,
                         "pool_members": POOL_MEMBERS, "min_n": MIN_N,
                         "complete": False},
                "part1": part1, "variants": results, "shuffle": None}
    engine.save(snapshot, "task_c.pkl")
    seen_group = None
    for name, (group, desc, kind, fn) in B.items():
        if group != seen_group:
            if seen_group is not None:
                engine.save(snapshot, "task_c.pkl")
            seen_group = group
            print(f"  [{group}]")
        sig = fn(BASE_SIG)
        results[name] = score(sig, name, group, desc, kind, days, base_by_month)
        r = results[name]
        print(f"  {name:24} n={r['n']:6d} acc={r['acc']:5.2f} "
              f"busts={r['busts']:4d} pnl={r['pnl']:+9,.0f}")
    engine.save(snapshot, "task_c.pkl")

    # ---- combined variants: built from what actually worked ---------------
    combos = {
        "combo_first_depth05": ("12-combo",
            "اولینِ خوشه + عبور ≥0.5× + هم‌جهتیِ حداقل یک قانونِ دیگر",
            chain(lambda s: sel_cluster(s, 1, RANK),
                  lambda s: [q for q in s if q[4]["depth"] >= 0.5],
                  conf2(1))),
        "combo_first_afterloss1": ("12-combo",
            "اولینِ خوشه + بعد از باخت یکی را رد کن",
            chain(lambda s: sel_cluster(s, 1, RANK),
                  lambda s: seq_skip_after_loss(s, 1))),
        "combo_depth1_ge2": ("12-combo",
            "عبور ≥1× + حداقل ۲ قانونِ هم‌جهت",
            chain(lambda s: [q for q in s if q[4]["depth"] >= 1.0], conf2(2))),
        "combo_spaced10_depth05": ("12-combo",
            "فاصلهٔ ≥10 کندل + عبور ≥0.5×",
            chain(lambda s: sel_spaced(s, 10),
                  lambda s: [q for q in s if q[4]["depth"] >= 0.5])),
        "combo_first_depth05_wait20": ("12-combo",
            "اولینِ خوشه + عبور ≥0.5× + بعد از باخت ۲۰ کندل صبر",
            chain(lambda s: sel_cluster(s, 1, RANK),
                  lambda s: [q for q in s if q[4]["depth"] >= 0.5],
                  lambda s: seq_cooldown_candles(s, 20))),
        "combo_ge2_first": ("12-combo",
            "حداقل ۲ قانونِ هم‌جهت + فقط اولینِ خوشه",
            chain(conf2(2), lambda s: sel_cluster(s, 1, RANK))),
        "combo_first_reenter": ("12-combo",
            "اولینِ خوشه + بعد از باخت تا بازگشت به بازه صبر کن",
            chain(lambda s: sel_cluster(s, 1, RANK),
                  lambda s: seq_reenter_range(s, nbreak))),
    }
    for name, (group, desc, fn) in combos.items():
        kind = "sel" if name in ("combo_first_depth05", "combo_depth1_ge2",
                                 "combo_spaced10_depth05", "combo_ge2_first") \
            else "seq"
        B[name] = (group, desc, kind, fn)
        sig = fn(BASE_SIG)
        results[name] = score(sig, name, group, desc, kind, days, base_by_month)
        r = results[name]
        print(f"  {name:24} n={r['n']:6d} acc={r['acc']:5.2f} "
              f"busts={r['busts']:4d} pnl={r['pnl']:+9,.0f}")
    engine.save(snapshot, "task_c.pkl")

    K = len(results)
    bz = engine.bonferroni_z(K)
    print(f"\nK = {K} variants  ->  Bonferroni z bar = {bz:.3f} "
          f"(vs 1.96 uncorrected)")

    # ==================================================================
    # shuffled-label control
    # ==================================================================
    print(f"\n--- shuffled-label control, {SHUFFLES} reps ---")
    cl = engine.closes_of(cand)
    nz = [i for i in range(len(cl) - 1) if cl[i + 1] != cl[i]]
    real = np.array([cl[i + 1] > cl[i] for i in nz], dtype=bool)
    pos = np.full(len(cl), -1, dtype=np.int64)
    pos[np.array(nz)] = np.arange(len(nz))

    # selection-only variants: index/side arrays are label-independent, so a
    # shuffle only re-scores them. Sequential variants must be re-run, because
    # which signals they take depends on the (now shuffled) outcomes.
    sel_arr, seq_names = {}, []
    for name, r in results.items():
        if B[name][2] == "sel" and r["n"] >= MIN_N:
            idx = np.array([pos[s[0]] for s in r["sig"]], dtype=np.int64)
            up = np.array([s[2] == "up" for s in r["sig"]], dtype=bool)
            sel_arr[name] = (idx, up)
        elif B[name][2] == "seq" and r["n"] >= MIN_N:
            seq_names.append(name)

    rng = np.random.default_rng(SEED)
    per = {n: [] for n in list(sel_arr) + seq_names}
    best_rows = []
    for rep in range(SHUFFLES):
        lab = real.copy()
        rng.shuffle(lab)
        best, bestn = -1.0, ""
        for name, (idx, up) in sel_arr.items():
            a = float(np.mean(lab[idx] == up)) * 100
            per[name].append(a)
            if a > best:
                best, bestn = a, name
        if seq_names:
            shuf = {s[0]: bool(lab[pos[s[0]]]) for s in breaks}
            resig = [(s[0], s[1], s[2], (s[2] == "up") == shuf[s[0]], s[4])
                     for s in BASE_SIG]
            for name in seq_names:
                sg = B[name][3](resig)
                if len(sg) < MIN_N:
                    per[name].append(float("nan"))
                    continue
                a = sum(1 for x in sg if x[3]) / len(sg) * 100
                per[name].append(a)
                if a > best:
                    best, bestn = a, name
        best_rows.append((best, bestn))
        if (rep + 1) % 50 == 0:
            print(f"  {rep+1}/{SHUFFLES} ... running best {max(b for b,_ in best_rows):.2f}%")

    bests = sorted(b for b, _ in best_rows)
    top = max(best_rows)
    shuffle = {
        "reps": SHUFFLES, "min_n": MIN_N,
        "best_acc": top[0], "best_variant": top[1],
        "mean": float(np.mean(bests)),
        "p95": bests[int(0.95 * len(bests))],
        "p99": bests[int(0.99 * len(bests)) - 1],
        "per_variant": {n: {"mean": float(np.nanmean(v)) if v else float("nan"),
                            "p95": float(np.nanpercentile(v, 95)) if v else float("nan"),
                            "max": float(np.nanmax(v)) if v else float("nan")}
                        for n, v in per.items()},
    }
    print(f"  best shuffled accuracy over {SHUFFLES} sweeps: "
          f"{top[0]:.2f}% ({top[1]})")
    print(f"  distribution of the per-sweep max: mean {shuffle['mean']:.2f}%  "
          f"p95 {shuffle['p95']:.2f}%  p99 {shuffle['p99']:.2f}%")

    snapshot["meta"].update({"K": K, "bonf_z": bz, "complete": True})
    snapshot["shuffle"] = shuffle
    p = engine.save(snapshot, "task_c.pkl")
    print(f"\nsaved {p}")
    return snapshot


if __name__ == "__main__":
    main()
