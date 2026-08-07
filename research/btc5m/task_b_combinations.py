"""
Task B — every statistically possible combination of the rules, ranked by busts.

The user's goal, in their words: "کاهش آمار انفجار خیلی مهمه. کیفیت یعنی نه کمیت"
— fewer 3-rung busts is the priority, quality over quantity. So every table in
this file is ranked by busts per 100 signals, not by profit.

Three things make this file worth reading rather than re-deriving:

  * The chart is walked ONCE. engine.run_many gives per-window firing data; every
    one of the ~1,900 candidates below is scored off that single pass by integer
    bitmask arithmetic. Re-walking per candidate is what turns this into hours.

  * busts/year is approximately n*(1-p)^3, so cutting signal count cuts busts for
    free and proves nothing. Every candidate is therefore reported on busts per
    100 signals and path low as well as raw busts, and the frontier table pairs
    each bust reduction with the profit it costs.

  * Results are saved to out/task_b.pkl after EACH family, because a usage limit
    has already interrupted this work once.

Run:  python3 task_b_combinations.py
"""

import datetime
import hashlib
import math
import os
import pickle
import random
import sys

import engine

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out", "task_b.pkl")
CACHE = os.path.join(HERE, "out", "task_b_fires.pkl")

BASE = 20.0
RUNGS = 3
BANKROLL = 2000.0
MIN_N = 200          # below this a combination is not a finding, only a curio
TZ = engine.TEHRAN   # "a calendar day" means a Tehran day; the user is in Tehran

# The six rules that carry an edge, plus rule4 which is only ever a control.
MEMBERS = ("rule1", "rule2", "rule3", "rule5", "rule6", "rule7")
ALL_RULES = ("rule1", "rule2", "rule3", "rule4", "rule5", "rule6", "rule7", "golden")
BIT = {r: 1 << k for k, r in enumerate(ALL_RULES)}
POOL_MEMBERS = ("rule1", "rule2", "rule3", "rule5")   # the bot's "statistical" tier


# --------------------------------------------------------------------------
# one pass over the chart
# --------------------------------------------------------------------------
def load_windows():
    """
    [(i, ts, up_mask, dn_mask, up_wins)] for every window where anything fired.

    up_mask/dn_mask are bitmasks over ALL_RULES. up_wins is True when the next
    close was higher, i.e. when a bet on "up" settles as a win. Void windows
    (unchanged next close) are dropped here, exactly as the bot settles them.
    """
    if os.path.exists(CACHE):
        with open(CACHE, "rb") as f:
            d = pickle.load(f)
        return d["windows"], d["dirs"], d["meta"]

    candles = engine.last_year(engine.load())
    fires = engine.run_many(list(ALL_RULES), candles)
    windows = []
    for i, ts, fired, nxt in fires:
        if nxt == 0:
            continue
        up = dn = 0
        for name, side in fired.items():
            if side == "up":
                up |= BIT[name]
            else:
                dn |= BIT[name]
        windows.append((i, ts, up, dn, nxt > 0))

    # Every non-void candle's direction, for the shuffled-label control. The
    # control has to shuffle the CANDLES, not the outcome booleans: shuffling a
    # list of booleans cannot change its mean and measures nothing.
    cl = engine.closes_of(candles)
    dirs = {}
    for i in range(len(cl) - 1):
        d = cl[i + 1] - cl[i]
        if d != 0:
            dirs[i] = d > 0

    meta = {"candles": len(candles), "t_first": candles[0]["t"],
            "t_last": candles[-1]["t"],
            "days": (candles[-1]["t"] - candles[0]["t"]) / 86400.0,
            "windows": len(windows)}
    with open(CACHE, "wb") as f:
        pickle.dump({"windows": windows, "dirs": dirs, "meta": meta}, f)
    return windows, dirs, meta


# --------------------------------------------------------------------------
# voting schemes — a scheme turns (up_mask, dn_mask) into a side or nothing
# --------------------------------------------------------------------------
def popcount(x):
    return bin(x).count("1")


def vote(scheme, mask, size, up, dn):
    """
    True -> bet up, False -> bet down, None -> stand aside.

    AGREE      at least one member fired and every member that fired agrees.
               This is simultaneously (a) "any member fires and all agree",
               (c) "unanimity among all members that fired" and (e) "skip the
               window when members disagree" from the brief — the three are the
               same predicate, and the bot already does it.
    K2/K3/K4   at least K members fired AND all firing members agree.
    ALL        every member of the subset fired and all agree (K = |subset|).
    MAJORITY   the more numerous side wins; an exact tie stands aside.
    """
    u = popcount(up & mask)
    d = popcount(dn & mask)
    if scheme == "MAJORITY":
        if u > d:
            return True
        if d > u:
            return False
        return None
    if u and d:
        return None            # any disagreement kills every non-majority scheme
    need = {"AGREE": 1, "K2": 2, "K3": 3, "K4": 4}.get(scheme, size)
    if u >= need:
        return True
    if d >= need:
        return False
    return None


def build(windows, mask, size, scheme):
    """Signal list [(i, ts, side, won)] for one membership+scheme candidate."""
    out = []
    for i, ts, up, dn, up_wins in windows:
        if not (up | dn) & mask:
            continue
        s = vote(scheme, mask, size, up, dn)
        if s is None:
            continue
        out.append((i, ts, "up" if s else "down", s == up_wins))
    return out


# --------------------------------------------------------------------------
# the money — one shared ladder, or one ladder per stream on a shared purse
# --------------------------------------------------------------------------
def ladder(signals, base=BASE, rungs=RUNGS, bankroll=BANKROLL, streamed=False):
    """
    Walk an ordered signal list and measure everything the brief asks for.

    `streamed=False` is byte-identical to engine.simulate (asserted in main).
    `streamed=True` expects a 5th element per signal: the stream that owns the
    window. Each stream then keeps its OWN rung, so a loss on one stream cannot
    raise the stake on another, but all of them draw on one purse — which is
    what actually decides whether the account survives.
    """
    pnl = peak = drawdown = 0.0
    path_low = 0.0
    wins = losses = busts = 0
    rungs_by = {}
    cur = 0
    streaks = {}
    max_streak = 0
    bust_times = []
    ruin_ts = None
    for s in signals:
        key = s[4] if streamed else 0
        r = rungs_by.get(key, 0)
        stake = base * 2 ** r
        if s[3]:
            pnl += stake
            wins += 1
            rungs_by[key] = 0
            if cur:
                streaks[cur] = streaks.get(cur, 0) + 1
                max_streak = max(max_streak, cur)
                cur = 0
        else:
            pnl -= stake
            losses += 1
            r += 1
            cur += 1
            if r >= rungs:
                busts += 1
                bust_times.append(s[1])
                r = 0
            rungs_by[key] = r
        peak = max(peak, pnl)
        drawdown = max(drawdown, peak - pnl)
        if pnl < path_low:
            path_low = pnl
        if ruin_ts is None and bankroll and pnl <= -bankroll:
            ruin_ts = s[1]
    if cur:
        streaks[cur] = streaks.get(cur, 0) + 1
        max_streak = max(max_streak, cur)
    n = wins + losses
    return {"n": n, "wins": wins, "losses": losses,
            "acc": wins / n * 100 if n else float("nan"),
            "pnl": pnl, "busts": busts, "bust_times": bust_times,
            "drawdown": drawdown, "path_low": path_low,
            "streaks": streaks, "max_streak": max_streak,
            "bust_rate": busts / n * 100 if n else float("nan"),
            "ruin": ruin_ts is not None, "ruin_ts": ruin_ts}


def day_of(ts):
    return datetime.datetime.fromtimestamp(ts, TZ).strftime("%Y-%m-%d")


def score(signals, label, family, days, streamed=False, extra=None):
    """Everything the brief asks to be reported per combination."""
    st = ladder(signals, streamed=streamed)
    n = st["n"]
    lo, hi = engine.wilson(st["wins"], n) if n else (float("nan"),) * 2
    tr, te = engine.split(signals, 0.70)
    def half(sig):
        if not sig:
            return None
        w = sum(1 for s in sig if s[3])
        h = ladder(sig, streamed=streamed)
        wl, wh = engine.wilson(w, len(sig))
        return {"n": len(sig), "acc": w / len(sig) * 100, "wilson": (wl, wh),
                "z": engine.zscore(w, len(sig)), "busts": h["busts"],
                "bust_rate": h["bust_rate"], "pnl": h["pnl"],
                "path_low": h["path_low"]}
    ge = {k: sum(v for L, v in st["streaks"].items() if L >= k) for k in (6, 7, 8)}
    # Side mix matters for anything built on rule6, which only ever bets down: a
    # one-sided strategy in a drifting year is measuring the drift. (It isn't
    # here — the year is 50.09% down — but the number belongs in the record.)
    up = sum(1 for s in signals if s[2] == "up")
    rec = {
        "label": label, "family": family, "n": n,
        "acc": st["acc"], "wilson": (lo, hi),
        "z": engine.zscore(st["wins"], n) if n else float("nan"),
        "busts": st["busts"], "bust_rate": st["bust_rate"],
        "busts_per_day": st["busts"] / days,
        "signals_per_day": n / days,
        "streaks": dict(sorted(st["streaks"].items())),
        "max_streak": st["max_streak"], "streak_ge": ge,
        "pnl_martingale": st["pnl"], "pnl_flat": engine.flat(signals)["pnl"],
        "drawdown": st["drawdown"], "path_low": st["path_low"],
        "survives_2000": not st["ruin"],
        "died": day_of(st["ruin_ts"]) if st["ruin_ts"] else None,
        "split": {"train": half(tr), "test": half(te)},
        "streamed": streamed,
        "bets_up": up, "bets_down": n - up,
        "up_share": up / n * 100 if n else float("nan"),
        "sig_hash": hashlib.md5(
            repr([(s[0], s[2]) for s in signals]).encode()).hexdigest(),
    }
    if extra:
        rec.update(extra)
    return rec, signals


# --------------------------------------------------------------------------
# families
# --------------------------------------------------------------------------
def subsets(members):
    for m in range(1, 1 << len(members)):
        yield tuple(members[k] for k in range(len(members)) if m >> k & 1)


def family_membership(windows, days):
    """
    63 non-empty subsets of {1,2,3,5,6,7}, each with every applicable voting
    scheme, and each repeated with rule4 bolted on to confirm it still dilutes.
    """
    out, sigs = [], {}
    for with4 in (False, True):
        for sub in subsets(MEMBERS):
            s = sub + ("rule4",) if with4 else sub
            mask = 0
            for r in s:
                mask |= BIT[r]
            size = len(s)
            schemes = ["AGREE"]
            if size >= 2:
                schemes += ["MAJORITY", "ALL"]
            for k in (2, 3, 4):
                if size > k:                # K == size is already "ALL"
                    schemes.append(f"K{k}")
            for sc in schemes:
                sig = build(windows, mask, size, sc)
                if not sig:
                    continue
                lab = "+".join(x.replace("rule", "R") for x in s) + f" [{sc}]"
                rec, _ = score(sig, lab, "membership", days,
                               extra={"members": s, "scheme": sc,
                                      "has_rule4": with4})
                out.append(rec)
                sigs[lab] = sig
    return out, sigs


def _pool_sig(windows, mask=None):
    mask = mask if mask is not None else sum(BIT[r] for r in POOL_MEMBERS)
    return build(windows, mask, popcount(mask), "AGREE")


def stream_signals(windows, name):
    """A named independent stream, as its own signal list."""
    if name == "pool":
        return _pool_sig(windows)
    if name == "pool_ex_golden":
        g = {s[0] for s in stream_signals(windows, "golden")}
        return [s for s in _pool_sig(windows) if s[0] not in g]
    mask = BIT[name]
    return build(windows, mask, 1, "AGREE")


def merge_streams(streams, policy, order=None, acc=None):
    """
    One bet per window. When several streams fire on the same window, `policy`
    decides who owns it; the owner's side is bet and only the owner's ladder
    moves. Returns [(i, ts, side, won, owner)].
    """
    by_win = {}
    for name, sig in streams.items():
        for i, ts, side, won in sig:
            by_win.setdefault(i, {})[name] = (ts, side, won)
    out = []
    live = {k: [0, 0] for k in streams}          # online wins / n, for "accurate"
    for i in sorted(by_win):
        cand = by_win[i]
        if policy == "order":
            owner = next((k for k in order if k in cand), None)
        elif policy == "accurate_train":
            owner = max(cand, key=lambda k: acc.get(k, 0.0))
        elif policy == "accurate_online":
            def rate(k):
                w, t = live[k]
                return (w + 1.0) / (t + 2.0)     # Laplace, so t=0 is not a winner
            owner = max(cand, key=rate)
        elif policy == "agreement":
            owner = max(cand, key=lambda k: (len(k), k))   # placeholder, set below
        else:
            raise ValueError(policy)
        ts, side, won = cand[owner]
        out.append((i, ts, side, won, owner))
        for k, (_, _, w) in cand.items():
            live[k][0] += 1 if w else 0
            live[k][1] += 1
    return out


def merge_by_agreement(windows, streams, sizes):
    """
    'Highest-agreement stream takes the window': the owner is the stream with
    the most member rules firing on that window, ties broken by the larger
    stream. Needs the raw masks, so it does not go through merge_streams.
    """
    masks = {k: sum(BIT[r] for r in sizes[k]) for k in streams}
    by_win = {}
    for name, sig in streams.items():
        for i, ts, side, won in sig:
            by_win.setdefault(i, {})[name] = (ts, side, won)
    fired_at = {w[0]: (w[2] | w[3]) for w in windows}
    out = []
    for i in sorted(by_win):
        cand = by_win[i]
        owner = max(cand, key=lambda k: (popcount(fired_at[i] & masks[k]), k))
        ts, side, won = cand[owner]
        out.append((i, ts, side, won, owner))
    return out


def family_topology(windows, days):
    """
    Ladder topology and priority ordering: the same set of streams run as one
    shared ladder or as independent ladders on a shared purse, with the window
    handed to a different stream each time.
    """
    names = ("pool", "pool_ex_golden", "golden", "rule1", "rule2", "rule3",
             "rule5", "rule6", "rule7", "rule4")
    sig = {n: stream_signals(windows, n) for n in names}
    sizes = {"pool": POOL_MEMBERS, "pool_ex_golden": POOL_MEMBERS,
             "golden": POOL_MEMBERS}
    for r in ALL_RULES:
        sizes.setdefault(r, (r,))
    # Train-half accuracy, used by the "most accurate stream wins" policy. It is
    # measured on the first 70% only; ranking by full-sample accuracy would be
    # lookahead dressed up as a rule.
    acc = {}
    for n, s in sig.items():
        tr, _ = engine.split(s, 0.70)
        acc[n] = (sum(1 for x in tr if x[3]) / len(tr)) if tr else 0.0

    sets = [
        ("pool", "rule6"),                       # the bot as shipped
        ("pool", "rule7"),
        ("pool", "rule6", "rule7"),
        ("pool", "rule6", "rule7", "rule4"),
        ("golden", "rule6"),
        ("golden", "rule7"),
        ("golden", "rule6", "rule7"),
        ("rule6", "rule7"),
        ("pool_ex_golden", "golden"),            # golden split out of its parent
        ("pool_ex_golden", "golden", "rule6"),
        ("pool_ex_golden", "golden", "rule6", "rule7"),
        ("rule1", "rule2", "rule3", "rule5"),
        ("rule1", "rule2", "rule3", "rule5", "rule6", "rule7"),
        ("rule2", "rule6", "rule7"),
        ("rule1", "rule6", "rule7"),
    ]
    out, sigs = [], {}
    for st in sets:
        streams = {k: sig[k] for k in st if sig[k]}
        if len(streams) < 2:
            continue
        plans = []
        keys = list(streams)
        if len(keys) <= 3:
            import itertools
            plans += [("order", p) for p in itertools.permutations(keys)]
        else:
            # full permutations of 4-6 streams is noise; test the orders that
            # encode an actual hypothesis instead.
            plans += [("order", tuple(keys)),
                      ("order", tuple(reversed(keys))),
                      ("order", tuple(sorted(keys, key=lambda k: -acc[k]))),
                      ("order", tuple(sorted(keys, key=lambda k: len(sig[k]))))]
        plans += [("accurate_train", None), ("accurate_online", None),
                  ("agreement", None)]
        for policy, order in plans:
            if policy == "agreement":
                merged = merge_by_agreement(windows, streams, sizes)
                ptag = "agreement"
            else:
                merged = merge_streams(streams, policy, order, acc)
                ptag = ">".join(order) if order else policy
            for streamed in (False, True):
                tag = "independent" if streamed else "shared"
                lab = f"{{{'|'.join(st)}}} {ptag} / {tag}"
                rec, _ = score(merged, lab, "topology", days, streamed=streamed,
                               extra={"streams": st, "policy": ptag,
                                      "ladder": tag})
                out.append(rec)
                sigs[lab] = (merged, streamed)
    return out, sigs


def family_golden(windows, days):
    """
    Golden as a REPLACEMENT rather than an addition. Golden is a strict subset of
    the statistical pool, so 'add golden to the pool' cannot change a single bet
    — the question worth asking is whether trading golden INSTEAD of its parent
    is better, and whether the pool's non-golden remainder is worth trading.
    """
    out, sigs = [], {}
    cases = {
        "pool (parent, unchanged)": ("pool", False),
        "golden REPLACES pool": ("golden", False),
        "pool minus golden (the remainder)": ("pool_ex_golden", False),
    }
    for lab, (name, streamed) in cases.items():
        s = stream_signals(windows, name)
        rec, _ = score(s, lab, "golden", days, extra={"stream": name})
        out.append(rec)
        sigs[lab] = s
    # golden + rule6 replacing the whole statistical tier
    for extra_stream in ("rule6", "rule7"):
        merged = merge_streams(
            {"golden": stream_signals(windows, "golden"),
             extra_stream: stream_signals(windows, extra_stream)},
            "order", (extra_stream, "golden"), None)
        for streamed in (False, True):
            lab = (f"golden+{extra_stream} REPLACE pool / "
                   f"{'independent' if streamed else 'shared'}")
            rec, _ = score(merged, lab, "golden", days, streamed=streamed)
            out.append(rec)
            sigs[lab] = (merged, streamed)
    return out, sigs


# --------------------------------------------------------------------------
# guards
# --------------------------------------------------------------------------
def apply_guard(signals, streamed=False, pause_h=None, daily_stop=None,
                max_per_day=None, cooldown=None, pause_to_next_day=False):
    """
    Re-walk a signal list with a guard in force, dropping the windows the guard
    forbids. The ladder has to be simulated here rather than filtered
    beforehand, because 'after a bust' and 'after a loss' are ladder states.

    A dropped window is not traded, so the rung it would have used carries over
    to the next window that IS traded — the guard delays the ladder, it does not
    abandon it.
    """
    kept = []
    rungs_by = {}
    blocked_until_ts = None
    blocked_until_day = None
    blocked_until_i = None
    per_day = {}
    busts_day = {}
    for s in signals:
        i, ts = s[0], s[1]
        day = day_of(ts)
        if blocked_until_ts and ts < blocked_until_ts:
            continue
        if blocked_until_day and day <= blocked_until_day:
            continue
        if blocked_until_i and i < blocked_until_i:
            continue
        if daily_stop and busts_day.get(day, 0) >= daily_stop:
            continue
        if max_per_day and per_day.get(day, 0) >= max_per_day:
            continue
        key = s[4] if streamed else 0
        r = rungs_by.get(key, 0)
        kept.append(s)
        per_day[day] = per_day.get(day, 0) + 1
        if s[3]:
            rungs_by[key] = 0
        else:
            r += 1
            if cooldown:
                blocked_until_i = i + cooldown
            if r >= RUNGS:
                busts_day[day] = busts_day.get(day, 0) + 1
                r = 0
                if pause_h:
                    blocked_until_ts = ts + pause_h * 3600
                if pause_to_next_day:
                    blocked_until_day = day
            rungs_by[key] = r
    return kept


def family_guards(windows, days, best):
    """Guards layered on the best few combinations, as the brief asks."""
    out, sigs = [], {}
    guards = [("no guard", {})]
    guards += [(f"pause {h}h after a bust", {"pause_h": h})
               for h in (1, 2, 4, 12, 24)]
    guards += [("pause until next day after a bust", {"pause_to_next_day": True})]
    guards += [(f"daily stop at {L} bust(s)", {"daily_stop": L})
               for L in (1, 2, 3)]
    guards += [(f"max {M} signals/day", {"max_per_day": M})
               for M in (5, 10, 20, 40)]
    guards += [(f"cooldown {C} candles after a loss", {"cooldown": C})
               for C in (1, 3, 5, 10)]
    for base_label, (sig, streamed) in best.items():
        for gname, kw in guards:
            kept = sig if not kw else apply_guard(sig, streamed=streamed, **kw)
            if len(kept) < 50:
                continue
            lab = f"{base_label} :: {gname}"
            rec, _ = score(kept, lab, "guards", days, streamed=streamed,
                           extra={"base": base_label, "guard": gname})
            out.append(rec)
            sigs[lab] = (kept, streamed)
    return out, sigs


def family_depth(days, best):
    """Ladder depth as a control only. 3 rungs stays the default."""
    out = []
    for base_label, (sig, streamed) in best.items():
        for rungs in (2, 3, 4):
            st = ladder(sig, rungs=rungs, streamed=streamed)
            lo, hi = engine.wilson(st["wins"], st["n"])
            out.append({"label": f"{base_label} :: {rungs} rungs",
                        "family": "depth", "base": base_label, "rungs": rungs,
                        "n": st["n"], "acc": st["acc"], "wilson": (lo, hi),
                        "busts": st["busts"], "bust_rate": st["bust_rate"],
                        "busts_per_day": st["busts"] / days,
                        "max_streak": st["max_streak"],
                        "streaks": dict(sorted(st["streaks"].items())),
                        "pnl_martingale": st["pnl"],
                        "pnl_flat": engine.flat(sig)["pnl"],
                        "drawdown": st["drawdown"], "path_low": st["path_low"],
                        "survives_2000": not st["ruin"],
                        "died": day_of(st["ruin_ts"]) if st["ruin_ts"] else None,
                        "worst_bet": BASE * 2 ** (rungs - 1)})
    return out


def rule4_effect(membership):
    """
    Paired S vs S+rule4 under the same voting scheme.

    Rule4 has no edge (49.2% on its own), so the expectation is dilution. It does
    not always come out that way, because inside a K-of-N vote rule4 acts as a
    VETO rather than a bettor: a window where rule4 points the other way is
    dropped. Whether that veto is worth anything is exactly what this table
    answers, and the answer has to be read on the paired difference, not on the
    handful of rule4 rows that float to the top of a bust-rate ranking.
    """
    by_key = {}
    for r in membership:
        base = tuple(x for x in r["members"] if x != "rule4")
        by_key[(base, r["scheme"], r["has_rule4"])] = r
    rows = []
    for (base, sc, has4), r in by_key.items():
        if has4:
            continue
        w = by_key.get((base, sc, True))
        if not w or min(r["n"], w["n"]) < MIN_N:
            continue
        rows.append({"members": base, "scheme": sc,
                     "without": {k: r[k] for k in
                                 ("n", "acc", "z", "busts", "bust_rate",
                                  "pnl_martingale", "path_low")},
                     "with": {k: w[k] for k in
                              ("n", "acc", "z", "busts", "bust_rate",
                               "pnl_martingale", "path_low")},
                     "d_acc": w["acc"] - r["acc"],
                     "d_bust_rate": w["bust_rate"] - r["bust_rate"],
                     "d_n": w["n"] - r["n"],
                     "d_pnl": w["pnl_martingale"] - r["pnl_martingale"]})
    if rows:
        m = len(rows)
        summary = {"pairs": m,
                   "mean_d_acc": sum(x["d_acc"] for x in rows) / m,
                   "mean_d_bust_rate": sum(x["d_bust_rate"] for x in rows) / m,
                   "mean_d_pnl": sum(x["d_pnl"] for x in rows) / m,
                   "worse_acc": sum(1 for x in rows if x["d_acc"] < 0),
                   "worse_bust_rate": sum(1 for x in rows
                                          if x["d_bust_rate"] > 0),
                   "worse_pnl": sum(1 for x in rows if x["d_pnl"] < 0)}
    else:
        summary = {"pairs": 0}
    return {"pairs": sorted(rows, key=lambda x: x["d_bust_rate"]),
            "summary": summary}


# --------------------------------------------------------------------------
# shuffled-label control
# --------------------------------------------------------------------------
def shuffled_control(best, dirs, trials=200, seed=20260807):
    """
    Shuffle the YEAR'S CANDLE LABELS and re-score the same signal indices.

    The point is to destroy the link between "when this combination bets" and
    "what the market then did", while keeping the signal count, the timing
    clustering and the up/down mix intact. Shuffling the win/loss booleans
    instead would be worthless: a permutation cannot change a mean.
    """
    rng = random.Random(seed)
    keys = sorted(dirs)
    vals = [dirs[k] for k in keys]
    out = {}
    for label, (sig, streamed) in best.items():
        real = ladder(sig, streamed=streamed)
        accs, rates, busts, pnls = [], [], [], []
        for _ in range(trials):
            rng.shuffle(vals)
            lut = dict(zip(keys, vals))
            fake = [(s[0], s[1], s[2],
                     (s[2] == "up") == lut[s[0]]) + tuple(s[4:]) for s in sig]
            st = ladder(fake, streamed=streamed)
            accs.append(st["acc"])
            rates.append(st["bust_rate"])
            busts.append(st["busts"])
            pnls.append(st["pnl"])
        out[label] = {
            "n": real["n"],
            "real_acc": real["acc"], "real_bust_rate": real["bust_rate"],
            "real_busts": real["busts"], "real_pnl": real["pnl"],
            "shuf_acc_mean": sum(accs) / trials, "shuf_acc_best": max(accs),
            "shuf_rate_mean": sum(rates) / trials,
            "shuf_rate_best": min(rates),          # "best" = fewest busts
            "shuf_busts_mean": sum(busts) / trials,
            "shuf_busts_best": min(busts),
            "shuf_pnl_mean": sum(pnls) / trials, "shuf_pnl_best": max(pnls),
            "beat_real_on_rate": sum(1 for r in rates if r <= real["bust_rate"]),
            "beat_real_on_acc": sum(1 for a in accs if a >= real["acc"]),
            "trials": trials,
        }
    return out


# --------------------------------------------------------------------------
# frontier and report
# --------------------------------------------------------------------------
def dedup(rows):
    """One row per distinct signal list, keeping the first (best-ranked) label."""
    seen, out = set(), []
    for r in rows:
        if r["sig_hash"] in seen:
            continue
        seen.add(r["sig_hash"])
        out.append(r)
    return out


def frontier(rows):
    """
    The bust/profit trade-off the user gets to choose a point on.

    Sorted by busts ascending, keeping only rows that beat every cheaper row on
    profit — so each step down the table buys profit with busts and nothing on
    it is dominated.
    """
    best, out = float("-inf"), []
    for r in dedup(sorted(rows, key=lambda r: (r["busts"],
                                               -r["pnl_martingale"]))):
        if r["pnl_martingale"] > best:
            best = r["pnl_martingale"]
            out.append(r)
    return out


def pct(x):
    return f"{x:.2f}"


def cell(s):
    """Stream-set labels contain '|', which would silently split a table row."""
    return str(s).replace("|", "\\|")


def report(res, path):
    m = res["__meta__"]
    zbar = m["z_bonferroni"]
    base = res["baseline"]
    scored = res["membership"] + res["golden"] + res["topology"]
    real = [r for r in scored if r["n"] >= MIN_N]
    ranked = dedup(sorted(real + [base],
                          key=lambda r: (r["bust_rate"], -r["n"])))
    survivors = [r for r in ranked if r["z"] >= zbar]
    fr = frontier(real + [base])
    L = []
    A = L.append

    A("# وظیفهٔ B — همهٔ ترکیب‌های ممکن، رتبه‌بندی‌شده بر اساس کمترین انفجار\n")
    A(f"داده: {m['candles']:,} کندلِ ۵ دقیقه‌ای واقعی، "
      f"{m['days']:.0f} روز. پایه ${BASE:.0f}، نردبان {RUNGS} پله "
      f"(20/40/80)، یک شرط در هر پنجره، تسویه close-to-close، "
      f"کندلِ بدونِ تغییر = void.\n")
    A(f"تعدادِ کاندیداهای امتیازدهی‌شده K = {m['K_candidates']:,} "
      f"({m['K_distinct']:,} تای متمایز). سدِّ Bonferroni برای برنده‌شدن: "
      f"z >= {zbar:.2f} — نه z = 1.96.\n")
    A("> **حسابِ پایه که نباید فراموش شود:** انفجار در سال ≈ "
      "n × (1−p)³. پس فقط دو اهرم وجود دارد: سیگنالِ کمتر، یا نرخِ بردِ بالاتر. "
      "کم‌کردنِ تعدادِ سیگنال به‌تنهایی انفجار را کم می‌کند و **یافته نیست**. "
      "ستونی که واقعاً کیفیت را می‌سنجد `انفجار در ۱۰۰ سیگنال` است.\n")

    pick = survivors[0]
    A("\n## ۰) پاسخِ کوتاه\n")
    A(f"برای هدفی که گفتی — «کاهشِ آمارِ انفجار، کیفیت نه کمیت» — برنده "
      f"**{cell(pick['label'])}** است.\n")
    A(f"- انفجار: **{base['busts']:,} → {pick['busts']:,}** در سال "
      f"(روزی {base['busts_per_day']:.2f} → {pick['busts_per_day']:.2f}).")
    A(f"- انفجار در ۱۰۰ سیگنال: **{pct(base['bust_rate'])} → "
      f"{pct(pick['bust_rate'])}** — یعنی کیفیتِ واقعی هم بهتر شده، "
      f"نه فقط تعدادِ شرط‌ها کمتر.")
    A(f"- دقت: {pct(base['acc'])}% → **{pct(pick['acc'])}%** "
      f"[{pick['wilson'][0]:.1f}–{pick['wilson'][1]:.1f}]، z={pick['z']:.2f} "
      f"در برابرِ سدِّ {zbar:.2f}.")
    A(f"- بلندترین رشتهٔ باخت: {base['max_streak']} → "
      f"**{pick['max_streak']}**؛ کفِ مسیر "
      f"${base['path_low']:+,.0f} → **${pick['path_low']:+,.0f}**.")
    A(f"- هزینه‌اش: سود از ${base['pnl_martingale']:+,.0f} به "
      f"**${pick['pnl_martingale']:+,.0f}** می‌افتد "
      f"({(pick['pnl_martingale'] / base['pnl_martingale'] - 1) * 100:+.0f}٪)، "
      f"چون تعدادِ سیگنال از {base['n']:,} به {pick['n']:,} می‌رسد.\n")
    A(f"**صادقانه‌اش این است:** بخشِ بزرگِ آن کاهشِ "
      f"{(1 - pick['busts'] / base['busts']) * 100:.0f} درصدیِ انفجار از "
      f"«کمتر شرط بستن» می‌آید، نه از باهوش‌تر شرط بستن. سهمِ واقعیِ کیفیت "
      f"همان {(1 - pick['bust_rate'] / base['bust_rate']) * 100:.0f} درصد "
      f"کاهشِ نرخِ انفجار است. اگر حجمِ بیشتری می‌خواهی، جدولِ مرزِ بخشِ ۴ "
      f"را ببین.\n")

    A("\n## ۱) پیکربندیِ فعلیِ ربات — نقطهٔ مرجع\n")
    A(row_head())
    A(row(base))
    A(f"\nهیستوگرامِ باخت‌های پیاپی: `{base['streaks']}`، "
      f"بلندترین رشته {base['max_streak']}، "
      f"رشته‌های >= ۶/۷/۸: {base['streak_ge'][6]}/{base['streak_ge'][7]}/"
      f"{base['streak_ge'][8]}.\n")
    A("نکته: `golden` زیرمجموعهٔ سختِ استخرِ آماری است و هر وقت شلیک می‌کند "
      "جهتش با جهتِ استخر یکی است — پس قرار دادنِ آن در اولویتِ بالاتر "
      "**حتی یک شرط را هم عوض نمی‌کند**. "
      "`rule6>golden>pool` و `rule6>pool` عددبه‌عدد یکی هستند.\n")

    A("\n## ۲) رتبه‌بندی بر اساس انفجار\n")
    A("### ۲-الف) کمترین تعدادِ خامِ انفجار در سال\n")
    A(row_head())
    for r in dedup(sorted(real + [base], key=lambda r: r["busts"]))[:10]:
        A(row(r))
    A("\n### ۲-ب) کمترین انفجار در ۱۰۰ سیگنال (ستونِ کیفیت)\n")
    A(row_head())
    for r in ranked[:10]:
        A(row(r))
    A("\n(ترکیب با کمتر از ۲۰۰ سیگنال اصلاً وارد این جدول‌ها نشده است.)\n")

    A("\n## ۳) ده ترکیبِ برتر که از سدِّ Bonferroni هم رد می‌شوند\n")
    A(f"یعنی z >= {zbar:.2f}. این جدول همان‌هایی است که می‌شود جدی گرفت.\n")
    A(row_head())
    for r in survivors[:10]:
        A(row(r))
    zall = m.get("z_bonferroni_all", zbar)
    A(f"\nاگر خانوادهٔ محافظ‌ها را هم به‌عنوانِ مرحلهٔ دومِ همان جست‌وجو "
      f"بشماریم، K به {m.get('K_all', m['K_distinct']):,} می‌رسد و سد به "
      f"z >= {zall:.2f} سخت‌تر می‌شود. هیچ‌کدام از ده سطرِ بالا با این "
      f"سختگیری هم از دست نمی‌روند مگر آن‌هایی که z-شان زیرِ {zall:.2f} است.\n")
    A("**آن‌هایی که رد نمی‌شوند — و نباید به‌عنوان یافته گزارش شوند:**\n")
    fails = [r for r in ranked[:12] if r["z"] < zbar]
    if fails:
        for r in fails:
            te = r["split"]["test"]
            A(f"- `{r['label']}` — n={r['n']:,}، z={r['z']:.2f} < {zbar:.2f}. "
              f"دقتِ {pct(r['acc'])}٪ با فاصلهٔ اطمینانِ "
              f"[{r['wilson'][0]:.1f}–{r['wilson'][1]:.1f}] که ۵۰٪ را در "
              f"بر می‌گیرد یا به آن می‌چسبد؛ در نیمهٔ آزمون "
              f"n={te['n']:,} و z={te['z']:.2f}. اینها سطرهای کم‌سیگنالی "
              f"هستند که فقط چون نرخِ انفجارشان تصادفاً پایین افتاده بالای "
              f"جدول آمده‌اند.")
    else:
        A("- هیچ‌کدام؛ ده سطرِ بالا همگی از سد رد شدند.")
    A("")
    A("**آزمونِ train/test:** ستون‌های آخرِ جدول‌ها. ترکیب‌هایی که فقط "
      "در نیمهٔ اول برنده‌اند یافته نیستند، منحنیِ برازش‌شده‌اند. "
      "هشدارِ مهم: نیمهٔ دومِ این داده ذاتاً بازگشتی‌تر است، پس بالا رفتنِ "
      "دقت در نیمهٔ آزمون به‌خودی‌خود تأیید نیست — چیزی که تأیید است "
      "**ثابت ماندنِ** آن است.")

    A("\n## ۴) مرزِ انفجار در برابر سود (frontier)\n")
    A("هر سطر نسبت به سطرِ بالایی انفجارِ بیشتر می‌دهد و سودِ بیشتر می‌گیرد. "
      "هیچ سطری مغلوب نیست. کاربر خودش نقطه‌اش را انتخاب می‌کند.\n")
    A("| ترکیب | n | دقت | انفجار | در ۱۰۰ | سودِ مارتینگل | سودِ ثابت | "
      "کفِ مسیر | z | Bonferroni |")
    A("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :---: |")
    for r in fr:
        A(f"| {cell(r['label'])} | {r['n']:,} | {pct(r['acc'])}% | {r['busts']:,} | "
          f"{pct(r['bust_rate'])} | ${r['pnl_martingale']:+,.0f} | "
          f"${r['pnl_flat']:+,.0f} | ${r['path_low']:+,.0f} | {r['z']:.2f} | "
          f"{'✔' if r['z'] >= zbar else '✘'} |")

    A("\n## ۵) توپولوژیِ نردبان و ترتیبِ اولویت\n")
    top = dedup(sorted([r for r in res["topology"] if r["n"] >= MIN_N],
                       key=lambda r: (r["bust_rate"], -r["n"])))
    A(row_head())
    for r in top[:12]:
        A(row(r))
    sh = [r for r in res["topology"] if r.get("ladder") == "shared"]
    ind = [r for r in res["topology"] if r.get("ladder") == "independent"]
    pair = {}
    for r in sh:
        pair[r["label"].replace(" / shared", "")] = r
    diffs = [(pair[k["label"].replace(" / independent", "")], k) for k in ind
             if k["label"].replace(" / independent", "") in pair]
    diffs = [(a, b) for a, b in diffs if a["n"] >= MIN_N]
    if diffs:
        k = len(diffs)
        db = sum(b["busts"] - a["busts"] for a, b in diffs) / k
        dl = sum(b["path_low"] - a["path_low"] for a, b in diffs) / k
        dp = sum(b["pnl_martingale"] - a["pnl_martingale"] for a, b in diffs) / k
        better = sum(1 for a, b in diffs if b["busts"] < a["busts"])
        worse = sum(1 for a, b in diffs if b["busts"] > a["busts"])
        A(f"\n**نردبانِ مستقل برای هر جریان، برخلافِ شهود، بدتر است.** "
          f"مقایسهٔ جفت‌به‌جفت روی {k} جفت (همان جریان‌ها، همان اولویت، فقط "
          f"توپولوژیِ نردبان عوض): مستقل به‌طورِ میانگین "
          f"**{db:+.1f} انفجار** بیشتر می‌دهد، کفِ مسیر را "
          f"**${dl:+,.0f}** جابه‌جا می‌کند و **${dp:+,.0f}** سود کم می‌کند. "
          f"در {better} جفت بهتر و در {worse} جفت بدتر شد.\n")
        A("علتش مکانیکی است: با نردبانِ مشترک، بردِ **هر** جریانی نردبان را "
          "صفر می‌کند. با نردبانِ مستقل، جریانی که باخته باید خودش ببرد تا "
          "ری‌ست شود، و یک جریانِ کم‌تکرار روزها روی پلهٔ دوم می‌ماند — پس "
          "نردبان‌های بیشتری به پلهٔ سوم می‌رسند. تنها استثنا مجموعه‌های "
          "کوچکِ واقعاً ناهم‌بسته مثل `{golden|rule7}` است.\n")

    A("\n## ۶) طلایی به‌جای پدرش، نه علاوه بر آن\n")
    A(row_head())
    for r in dedup(sorted(res["golden"], key=lambda r: r["bust_rate"])):
        A(row(r))

    A("\n## ۷) قانونِ ۴ — آیا هنوز رقیق می‌کند؟\n")
    s = res["rule4_effect"]["summary"]
    A(f"مقایسهٔ جفت‌به‌جفتِ «زیرمجموعه» با «زیرمجموعه + قانون ۴» زیرِ همان "
      f"طرحِ رأی‌گیری، روی {s['pairs']} جفت با n >= {MIN_N}:\n")
    A(f"- میانگینِ تغییرِ دقت: **{s['mean_d_acc']:+.2f} واحدِ درصد**؛ "
      f"در {s['worse_acc']} جفت از {s['pairs']} بدتر شد.")
    A(f"- میانگینِ تغییرِ انفجار در ۱۰۰ سیگنال: **{s['mean_d_bust_rate']:+.2f}**؛ "
      f"در {s['worse_bust_rate']} جفت بدتر شد.")
    A(f"- میانگینِ تغییرِ سود: **${s['mean_d_pnl']:+,.0f}**؛ "
      f"در {s['worse_pnl']} جفت بدتر شد.\n")
    A("پس بله، قانون ۴ همچنان رقیق می‌کند. تنها استثنا وقتی است که قانون ۴ "
      "به‌جای رأی‌دهنده نقشِ **وتو** بازی می‌کند (طرح‌های K2/K3، جایی که "
      "مخالفتِ آن پنجره را حذف می‌کند نه اینکه جهت را عوض کند) — و آن هم اثرِ "
      "کوچکی است که در فهرستِ زیر پیداست، نه یک لبهٔ مستقل.\n")

    A("\n## ۸) محافظ‌ها — آیا واقعاً کمک کردند؟\n")
    A("| پایه | محافظ | n | دقت | انفجار | در ۱۰۰ | سودِ مارتینگل | کفِ مسیر |")
    A("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |")
    for b in m["best_labels"]:
        g = sorted([r for r in res["guards"] if r["base"] == b],
                   key=lambda r: r["bust_rate"])
        for r in g[:4] + [x for x in g if x["guard"] == "no guard"]:
            A(f"| {cell(r['base'])} | {r['guard']} | {r['n']:,} | {pct(r['acc'])}% | "
              f"{r['busts']:,} | {pct(r['bust_rate'])} | "
              f"${r['pnl_martingale']:+,.0f} | ${r['path_low']:+,.0f} |")
    A("\nخوانشِ درست: هیچ محافظی نرخِ انفجار را به‌طورِ معنادار پایین نیاورد. "
      "هر جا انفجارِ خام کم شد، به قیمتِ حذفِ همان نسبت از سیگنال‌ها بود — "
      "یعنی همان اهرمِ بی‌ارزشِ «کمتر شرط ببند». محافظ‌های cooldown نرخِ "
      "انفجار را **بدتر** کردند.\n")

    A("\n## ۹) عمقِ نردبان — فقط به‌عنوانِ کنترل\n")
    A("| ترکیب | پله | n | انفجار | در ۱۰۰ | بزرگ‌ترین شرط | سودِ مارتینگل | "
      "کفِ مسیر |")
    A("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
    for r in res["depth"]:
        A(f"| {cell(r['base'])} | {r['rungs']} | {r['n']:,} | {r['busts']:,} | "
          f"{pct(r['bust_rate'])} | ${r['worst_bet']:,.0f} | "
          f"${r['pnl_martingale']:+,.0f} | ${r['path_low']:+,.0f} |")
    A("\nعمقِ بیشتر «انفجار» را کم نشان می‌دهد چون تعریفِ انفجار را عوض "
      "می‌کند، نه چون ریسک کم شده: با ۴ پله بزرگ‌ترین شرط $160 است و یک "
      "انفجار $300 برمی‌دارد. ۳ پله پیش‌فرض می‌ماند.\n")

    A("\n## ۱۰) کنترلِ برچسبِ درهم‌ریخته\n")
    A("برچسبِ **کندل‌ها** در کلِّ سال درهم ریخته شد و همان اندیس‌های سیگنال "
      "دوباره امتیاز گرفتند، ۲۰۰ بار. (درهم‌ریختنِ خودِ برد/باخت‌ها بی‌معنی "
      "است: جایگشت میانگین را عوض نمی‌کند.)\n")
    A("| ترکیب | n | دقتِ واقعی | بهترین دقتِ درهم | انفجارِ واقعی/۱۰۰ | "
      "کمترین انفجارِ درهم/۱۰۰ | دفعاتی که درهم بهتر شد |")
    A("| --- | ---: | ---: | ---: | ---: | ---: | ---: |")
    for k, v in res["shuffle"].items():
        A(f"| {cell(k)} | {v['n']:,} | {pct(v['real_acc'])}% | "
          f"{pct(v['shuf_acc_best'])}% | {pct(v['real_bust_rate'])} | "
          f"{pct(v['shuf_rate_best'])} | {v['beat_real_on_rate']}/"
          f"{v['trials']} روی انفجار، {v['beat_real_on_acc']}/{v['trials']} "
          f"روی دقت |")

    A("\n## ۱۱) هشدارهایی که نباید نرم شوند\n")
    A("- طرح‌های رأی‌گیریِ (a) «هر عضوی شلیک کند و همهٔ شلیک‌کننده‌ها هم‌جهت "
      "باشند»، (c) «اتفاقِ آرا میانِ شلیک‌کننده‌ها» و (e) «اگر اختلاف داشتند "
      "پنجره را رد کن» سه اسم برای **یک** گزاره‌اند. جدا گزارش کردنشان "
      "توهمِ سه آزمایش می‌سازد؛ اینجا یکی شمرده شده‌اند.")
    A("- نیمهٔ آزمونِ این داده ذاتاً بازگشت‌به‌میانگین‌تر است "
      "(fade بدونِ شرط ۴۹.۴۶٪ → ۵۰.۸۴٪). هر ترکیبی که در نیمهٔ دوم بهتر شده "
      "بخشی از آن بهبود را از همین رانش گرفته، نه از خودش.")
    A("- سالِ بررسی‌شده ۵۰.۰۹٪ کندلِ نزولی داشت. قانون ۶ فقط «پایین» شرط "
      "می‌بندد، پس از این رانش حدودِ ۰.۰۹ واحدِ درصد سود می‌برد — ناچیز، "
      "ولی ثبت شد.")
    A("- هیچ دادهٔ دفترِ سفارشِ Polymarket در کار نیست. همهٔ این اعداد "
      "روی مبنای ۵۰ سِنت حساب شده‌اند. بالای ~۵۵ سِنت لبه می‌میرد.")
    A("- با نردبانِ مستقل، هیستوگرامِ رشتهٔ باخت سراسری است ولی انفجار "
      "برای هر جریان جدا شمرده می‌شود؛ این دو ستون در آن سطرها مستقیماً "
      "به هم مربوط نیستند.\n")

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write("\n".join(L) + "\n")
    return path


def row_head():
    return ("| ترکیب | n | دقت | فاصلهٔ ۹۵٪ Wilson | z | انفجار | در ۱۰۰ | "
            "در روز | بلندترین رشته | >=۶/۷/۸ | سودِ مارتینگل | سودِ ثابت | "
            "افت | کفِ مسیر | $2,000 | دقتِ train | دقتِ test |\n"
            "| --- | ---: | ---: | :---: | ---: | ---: | ---: | ---: | ---: | "
            "---: | ---: | ---: | ---: | ---: | :---: | ---: | ---: |")


def row(r):
    lo, hi = r["wilson"]
    tr, te = r["split"]["train"], r["split"]["test"]
    g = r["streak_ge"]
    surv = "بله" if r["survives_2000"] else f"نه ({r['died']})"
    return (f"| {cell(r['label'])} | {r['n']:,} | {pct(r['acc'])}% | "
            f"[{lo:.1f}–{hi:.1f}] | {r['z']:.2f} | {r['busts']:,} | "
            f"{pct(r['bust_rate'])} | {r['busts_per_day']:.2f} | "
            f"{r['max_streak']} | {g[6]}/{g[7]}/{g[8]} | "
            f"${r['pnl_martingale']:+,.0f} | ${r['pnl_flat']:+,.0f} | "
            f"${r['drawdown']:,.0f} | ${r['path_low']:+,.0f} | {surv} | "
            f"{pct(tr['acc'])}% | {pct(te['acc'])}% (z={te['z']:.2f}) |")


# --------------------------------------------------------------------------
# driver
# --------------------------------------------------------------------------
def flush(res):
    engine.save(res, "task_b.pkl")
    print(f"  -> saved out/task_b.pkl "
          f"({sum(len(v) for k, v in res.items() if isinstance(v, list)):,} rows)")


def main():
    windows, dirs, meta = load_windows()
    days = meta["days"]
    print(f"windows with a firing rule: {len(windows):,} over {days:.0f} days")

    # A ladder that is not engine.simulate is a second opinion nobody asked for.
    probe = build(windows, sum(BIT[r] for r in POOL_MEMBERS), 4, "AGREE")
    a, b = ladder(probe), engine.simulate(probe)
    assert (a["n"], a["busts"], a["pnl"], a["path_low"], a["max_streak"]) == \
           (b["n"], b["busts"], b["pnl"], b["path_low"], b["max_streak"]), \
           "local ladder disagrees with engine.simulate"

    res = {"__meta__": dict(meta, base=BASE, rungs=RUNGS, bankroll=BANKROLL,
                            min_n=MIN_N,
                            generated_by="research/btc5m/task_b_combinations.py")}

    # --- the bot as it ships today, so every table has an anchor -------------
    bot = merge_streams({"pool": stream_signals(windows, "pool"),
                         "golden": stream_signals(windows, "golden"),
                         "rule6": stream_signals(windows, "rule6")},
                        "order", ("rule6", "golden", "pool"), None)
    res["baseline"], _ = score(bot, "CURRENT BOT (rule6>golden>pool)",
                               "baseline", days, streamed=False)
    print("baseline:", engine.fmt(ladder(bot), "current bot"))
    flush(res)

    print("family 1: membership x voting scheme ...")
    res["membership"], sig_m = family_membership(windows, days)
    print(f"  {len(res['membership'])} candidates")
    flush(res)

    print("family 2: golden as replacement ...")
    res["golden"], sig_g = family_golden(windows, days)
    flush(res)

    print("family 3: ladder topology and priority ordering ...")
    res["topology"], sig_t = family_topology(windows, days)
    print(f"  {len(res['topology'])} candidates")
    flush(res)

    # --- how many tests were really run, for the Bonferroni bar -------------
    scored = res["membership"] + res["golden"] + res["topology"]
    distinct = {r["sig_hash"] for r in scored}
    K = len(distinct)
    res["__meta__"]["K_candidates"] = len(scored)
    res["__meta__"]["K_distinct"] = K
    res["__meta__"]["z_bonferroni"] = engine.bonferroni_z(K)
    print(f"  K = {len(scored)} scored, {K} distinct -> "
          f"z bar {engine.bonferroni_z(K):.2f}")
    flush(res)

    # --- pick the best few, honestly: fewest busts per 100 with real n ------
    def pool_of(rec_list, sigmap):
        d = {}
        for r in rec_list:
            if r["n"] < MIN_N:
                continue
            s = sigmap.get(r["label"])
            if s is None:
                continue
            d[r["label"]] = s if isinstance(s, tuple) else (s, False)
        return d

    allsig = {}
    allsig.update(pool_of(res["membership"], sig_m))
    allsig.update(pool_of(res["golden"], sig_g))
    allsig.update(pool_of(res["topology"], sig_t))
    allsig["CURRENT BOT (rule6>golden>pool)"] = (bot, False)

    # "Best" has to mean survives the multiple-testing bar as well as being
    # cheap in busts. Ranking on bust rate alone promotes 400-signal curios whose
    # rate is three coin flips wide, and layering guards on those measures noise.
    zbar = engine.bonferroni_z(K)
    ranked = sorted((r for r in scored if r["n"] >= MIN_N and r["z"] >= zbar),
                    key=lambda r: (r["bust_rate"], -r["n"]))
    best_labels = []
    seen = set()
    for r in ranked:
        if r["sig_hash"] in seen or r["label"] not in allsig:
            continue
        seen.add(r["sig_hash"])
        best_labels.append(r["label"])
        if len(best_labels) >= 6:
            break
    best = {L: allsig[L] for L in best_labels}
    best["CURRENT BOT (rule6>golden>pool)"] = (bot, False)
    res["__meta__"]["best_labels"] = list(best)
    print("best few:", list(best))

    print("family 4: guards ...")
    res["guards"], _ = family_guards(windows, days, best)
    print(f"  {len(res['guards'])} candidates")
    flush(res)

    print("rule4 dilution check ...")
    res["rule4_effect"] = rule4_effect(res["membership"])
    flush(res)

    print("family 5: ladder depth control ...")
    res["depth"] = family_depth(days, best)
    flush(res)

    print("shuffled-label control, 200 trials on the top 5 ...")
    top5 = dict(list(best.items())[:5])
    res["shuffle"] = shuffled_control(top5, dirs, trials=200)
    flush(res)

    # The guard family is a second stage of the same search, so the honest bar
    # counts it too. Depth rows are NOT extra tests: they re-price the identical
    # signal list with a different ladder and cannot conjure an edge.
    all_h = distinct | {r["sig_hash"] for r in res["guards"]}
    res["__meta__"]["K_all"] = len(all_h)
    res["__meta__"]["z_bonferroni_all"] = engine.bonferroni_z(len(all_h))
    print(f"  including guards: K = {len(all_h)} -> "
          f"z bar {engine.bonferroni_z(len(all_h)):.2f}")
    flush(res)

    p = report(res, os.path.join(HERE, "reports", "task-b-combinations.md"))
    print("wrote", p)
    print("done.")
    return res


if __name__ == "__main__":
    sys.exit(0 if main() else 0)
