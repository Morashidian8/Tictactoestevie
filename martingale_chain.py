"""
The "ride a winner, then double once" ladder, measured over the month.

The idea being tested, exactly as asked:

  * wait for a STRONG signal — the 20-candle break together with the golden
    tier, or three-plus rules agreeing;
  * if that signal WON, take whatever signal fires in the very next window at
    the base stake;
  * if THAT one loses, and the window after it also fires, take that one at
    double stake. One rung of martingale, then stop.

The trigger is a filter, not a bet — its own result is what opens the sequence,
so its profit and loss stay out of the ladder's books.

Two readings of the trigger were possible and both are computed, because the
sentence allows either and they are not the same set:

    C   (break AND golden) OR three-plus rules
    D    break AND (golden OR three-plus rules)

    python martingale_chain.py
    python martingale_chain.py --variant D      # headline on the other reading
    python martingale_chain.py --overlap        # allow sequences to overlap

Reads signals_month.csv. Writes martingale_chain.csv with every sequence.
Nothing here touches the bot or its records.
"""

import csv
import os
import re
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone

IN = os.environ.get("SIGNALS_FILE", "signals_month.csv")
OUT = os.environ.get("CHAIN_FILE", "martingale_chain.csv")
GRAN = 300
STAKE = float(os.environ.get("STAKE_BASE", "20"))
# Every calculation is priced at 50c: a win pays the stake, a loss costs it.
# The owner settled this — see CLAUDE.md. The parameter stays so an explicit
# request can be served, but nothing here offers another price unasked.
HEAD = float(os.environ.get("ENTRY_PRICE", "0.50"))
PRICES = (HEAD,)
FA = str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789")


# --------------------------------------------------------------------------- #
# reading the month
# --------------------------------------------------------------------------- #
def codes(rules, bare=False):
    """
    Rule numbers in a row, plus 'G' for the golden tier.

    Two shapes exist. The live bot writes full rule names, and there the digit
    must be anchored to its bracket — rule 7 is named "باندِ بولینگر + RSI",
    and a loose digit scan would also pick up the ۲۰ inside "شکستِ ۲۰ کندلی"
    and invent rules 2 and 0. The research export writes bare digits joined by
    Arabic commas, where there is no bracket to anchor to and every digit
    present is a rule.
    """
    text = rules or ""
    out = {"G"} if "🏆" in text else set()
    pattern = r"([۰-۹])" if bare else r"([۰-۹])\)"
    out |= {d.translate(FA) for d in re.findall(pattern, text)}
    return out


TEHRAN = timezone(timedelta(hours=3, minutes=30))   # Iran dropped DST in 2022


def _from_replay(r):
    """A row written by replay_month.py — graded against Polymarket payouts."""
    return {"t": int(r["window_epoch"]), "bet": r["bet"],
            "tehran": r.get("tehran", ""), "rules": r.get("rules", ""),
            "result": r["result"]}


def _from_research(r):
    """
    A row from docs/research/csv/8-last2months-signals.csv.

    Persian throughout, and the window is a Tehran wall-clock date and time
    rather than an epoch. The rule list is comma-separated bare digits here,
    not the numbered names the live bot writes, so the codes come out of it
    differently.
    """
    dt = datetime.strptime(f"{r['تاریخ تهران']} {r['ساعت تهران']}",
                           "%Y-%m-%d %H:%M").replace(tzinfo=TEHRAN)
    return {"t": int(dt.timestamp()),
            "bet": "up" if r["جهت"] == "بالا" else "down",
            "tehran": f"{r['تاریخ تهران'][5:]} {r['ساعت تهران']}",
            "rules": r["قانون‌ها"],
            "result": "WIN" if r["نتیجه"] == "برد" else "LOSS"}


def load():
    with open(IN, encoding="utf-8-sig", newline="") as f:
        raw = list(csv.DictReader(f))
    if not raw:
        return []
    research = "تاریخ تهران" in raw[0]
    conv = _from_research if research else _from_replay
    rows = []
    for r in raw:
        try:
            row = conv(r)
        except (KeyError, TypeError, ValueError):
            continue
        if row["result"] not in ("WIN", "LOSS"):
            continue
        row["codes"] = codes(row["rules"], research)
        row["nrules"] = len(row["codes"] - {"G"})
        row["short"] = ("G+" if "G" in row["codes"] else "") + "+".join(
            sorted(row["codes"] - {"G"}))
        rows.append(row)
    rows.sort(key=lambda r: r["t"])
    if rows:
        print(f"[{'research' if research else 'replay'} format, "
              f"graded on {'close-to-close' if research else 'Polymarket payouts'}]")
    return rows


# The golden tier is a tier, not a rule, so it does not vote in "three-plus
# rules" — it is already defined as three-plus rules agreeing on an
# over-extended move, and letting it count again would make every golden entry
# trivially satisfy the other half of the test.
VARIANTS = {
    "A": ("break AND golden",
          lambda r: "1" in r["codes"] and "G" in r["codes"]),
    "B": ("three-plus rules",
          lambda r: r["nrules"] >= 3),
    "C": ("(break AND golden) OR three-plus",
          lambda r: ("1" in r["codes"] and "G" in r["codes"]) or r["nrules"] >= 3),
    "D": ("break AND (golden OR three-plus)",
          lambda r: "1" in r["codes"] and ("G" in r["codes"] or r["nrules"] >= 3)),
}


def wilson(w, n, z=1.96):
    if not n:
        return 0.0, 0.0
    p = w / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    m = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5)
    return max(0.0, (c - m) / d), min(1.0, (c + m) / d)


def payout(stake, price):
    """Profit on a winning binary bought at `price`. A loss costs the stake."""
    return stake * (1 - price) / price


def warn_forced(rows):
    """
    Say so, loudly, if the file records BETS rather than SIGNALS.

    A record of signals is blind to the previous result: whatever fraction of
    windows fire after a win should fire after a loss too. A file produced by a
    martingale is not blind — the ladder re-bets the next window after every
    loss, so a row almost always exists there, and it repeats the losing call
    rather than being a fresh read of the market. On such a file "the next
    window also fired" is not a fact about the market, and rung 2 is a forced
    re-bet, not a signal.
    """
    nxt = {r["t"] for r in rows}
    aw = [r for r in rows if r["result"] == "WIN"]
    al = [r for r in rows if r["result"] == "LOSS"]
    if not aw or not al:
        return
    fw = sum(1 for r in aw if r["t"] + GRAN in nxt) / len(aw)
    fl = sum(1 for r in al if r["t"] + GRAN in nxt) / len(al)
    pairs = [(a, b) for a, b in zip(rows, rows[1:]) if b["t"] == a["t"] + GRAN]
    lost = [(a, b) for a, b in pairs if a["result"] == "LOSS"]
    same = (sum(1 for a, b in lost if a["bet"] == b["bet"]) / len(lost)
            if lost else 0.0)
    if fl - fw < 0.25 and same < 0.9:
        return
    print(f"\n  !!  WARNING — this file records BETS, not SIGNALS.")
    print(f"      the next window has a row {fl * 100:.0f}% of the time after a "
          f"LOSS, but only {fw * 100:.0f}% after a WIN,")
    print(f"      and {same * 100:.0f}% of the rows after a loss repeat the "
          f"losing direction.")
    print(f"      That is an old martingale re-betting, not the market firing.")
    print(f"      Rung 1 below is still a real fresh signal — the ladder resets "
          f"after a win.")
    print(f"      Rung 2 is NOT: it is a forced same-direction re-bet, so its "
          f"win rate")
    print(f"      answers a different question than the one asked.")


# --------------------------------------------------------------------------- #
# the ladder
# --------------------------------------------------------------------------- #
def sequences(rows, ok, overlap=False):
    """
    Every sequence the rule opens, in order.

    Without --overlap a trigger inside an already-running sequence is skipped:
    a person cannot be on two rungs of the same ladder at once, and counting
    both would book the same window's capital twice.
    """
    by_t = {r["t"]: r for r in rows}
    out, skipped, busy_until = [], 0, -1
    for r in rows:
        if not ok(r) or r["result"] != "WIN":
            continue
        # The trigger's own window is never bet, so the clash to test is the
        # first RUNG's window, not the trigger's — testing the trigger threw
        # away one perfectly free sequence per collision.
        if not overlap and r["t"] + GRAN <= busy_until:
            skipped += 1
            continue
        s1 = by_t.get(r["t"] + GRAN)
        if s1 is None:
            continue                        # nothing fired next window
        seq = {"trigger": r, "s1": s1, "s2": None}
        if s1["result"] == "WIN":
            seq["level"] = 1
            busy_until = s1["t"]
        else:
            s2 = by_t.get(r["t"] + 2 * GRAN)
            seq["s2"] = s2
            seq["level"] = 2 if s2 is not None else 1
            busy_until = (s2 or s1)["t"]
        out.append(seq)
    return out, skipped


def book(seq, price):
    """Profit and loss of one sequence at a given entry price."""
    s1, s2 = seq["s1"], seq["s2"]
    if s1["result"] == "WIN":
        return payout(STAKE, price)
    pnl = -STAKE
    if s2 is not None:
        pnl += (payout(2 * STAKE, price) if s2["result"] == "WIN"
                else -2 * STAKE)
    return pnl


def outcome(seq):
    s1, s2 = seq["s1"], seq["s2"]
    if s1["result"] == "WIN":
        return "won on rung 1"
    if s2 is None:
        return "lost rung 1, no rung 2"
    return "recovered on rung 2" if s2["result"] == "WIN" else "busted both rungs"


def stats(seqs):
    w1 = sum(1 for s in seqs if s["s1"]["result"] == "WIN")
    r2 = [s for s in seqs if s["s2"] is not None]
    w2 = sum(1 for s in r2 if s["s2"]["result"] == "WIN")
    dead = sum(1 for s in seqs
               if s["s1"]["result"] == "LOSS" and s["s2"] is None)
    bust = sum(1 for s in r2 if s["s2"]["result"] == "LOSS")
    return w1, len(seqs), w2, len(r2), dead, bust


# --------------------------------------------------------------------------- #
# report
# --------------------------------------------------------------------------- #
def main():
    if not os.path.exists(IN):
        print(f"{IN} not found — run replay_month.py first.")
        return
    overlap = "--overlap" in sys.argv
    pick = "C"
    if "--variant" in sys.argv:
        i = sys.argv.index("--variant")
        if i + 1 < len(sys.argv) and sys.argv[i + 1].upper() in VARIANTS:
            pick = sys.argv[i + 1].upper()

    rows = load()
    if not rows:
        print(f"{IN} has no graded rows.")
        return
    span = (max(r["t"] for r in rows) - min(r["t"] for r in rows)) / 86400
    print(f"{len(rows):,} graded signals over {span:.1f} days in {IN}")
    print(f"base stake ${STAKE:,.0f}  ·  rung 2 is ${2 * STAKE:,.0f}  ·  "
          f"sequences {'MAY overlap' if overlap else 'do not overlap'}")
    warn_forced(rows)
    print()

    # ---- every reading of the trigger, side by side ---------------------- #
    print("=" * 78)
    print("THE TRIGGER, READ FOUR WAYS")
    print("=" * 78)
    print(f"{'':2} {'definition':<34}{'fired':>7}{'won':>6}"
          f"{'seq':>6}{'rung1':>13}{'P&L':>12}")
    for key in ("A", "B", "C", "D"):
        label, ok = VARIANTS[key]
        fired = [r for r in rows if ok(r)]
        won = sum(1 for r in fired if r["result"] == "WIN")
        seqs, _ = sequences(rows, ok, overlap)
        if not seqs:
            print(f"{key:<2} {label:<34}{len(fired):>7,}{won:>6,}{0:>6}"
                  f"{'—':>13}{'—':>12}")
            continue
        w1, n1, *_ = stats(seqs)
        pnl = sum(book(s, HEAD) for s in seqs)
        star = " <" if key == pick else ""
        print(f"{key:<2} {label:<34}{len(fired):>7,}{won:>6,}{len(seqs):>6}"
              f"{f'{w1}/{n1} {w1/n1*100:.0f}%':>13}{pnl:>+11,.0f}{star}")

    label, ok = VARIANTS[pick]
    seqs, skipped = sequences(rows, ok, overlap)
    if not seqs:
        print(f"\nvariant {pick} opened no sequence at all.")
        return

    # ---- the headline reading, in detail ---------------------------------- #
    w1, n1, w2, n2, dead, bust = stats(seqs)
    print(f"\n{'=' * 78}")
    print(f"VARIANT {pick} — {label}")
    print("=" * 78)
    if skipped:
        print(f"{skipped} trigger(s) skipped: a sequence was already running.\n")

    print(f"{'what happened':<32}{'count':>7}{'share':>9}")
    won1 = w1
    rec = w2
    for name, c in ((f"won on rung 1 (${STAKE:.0f} risked)", won1),
                    ("lost rung 1, rung 2 never fired", dead),
                    (f"recovered on rung 2 (${3 * STAKE:.0f} risked)", rec),
                    (f"busted both rungs (-${3 * STAKE:.0f})", bust)):
        print(f"{name:<34}{c:>7,}{c / len(seqs) * 100:>8.1f}%")
    print(f"{'total sequences':<34}{len(seqs):>7,}{100.0:>8.1f}%")

    lo, hi = wilson(w1, n1)
    print(f"\nrung 1 won {w1}/{n1} = {w1 / n1 * 100:.2f}%   "
          f"[{lo * 100:.1f}–{hi * 100:.1f}]")
    if n2:
        a, b = wilson(w2, n2)
        print(f"rung 2 won {w2}/{n2} = {w2 / n2 * 100:.2f}%   "
              f"[{a * 100:.1f}–{b * 100:.1f}]")
    allw = sum(1 for r in rows if r["result"] == "WIN")
    print(f"every signal   {allw}/{len(rows)} = {allw / len(rows) * 100:.2f}%"
          "   <- the flat baseline both rungs are drawn from")
    print(f"\nbreak-even at {HEAD * 100:.0f} cents is {HEAD * 100:.2f}% — the "
          "price sets the bar, not the ladder.")
    print("Doubling changes WHEN the money moves, never the rate it moves at.")

    # ---- what it pays, and at what price ---------------------------------- #
    print(f"\n{'=' * 78}")
    print(f"MONEY — at {HEAD * 100:.0f}c")
    print("=" * 78)
    print(f"{'entry price':<14}{'staked':>11}{'returned':>11}{'P&L':>11}"
          f"{'per seq':>10}{'worst dip':>12}")
    for p in PRICES:
        pnls = [book(s, p) for s in seqs]
        staked = sum(STAKE + (2 * STAKE if s["s2"] is not None else 0)
                     for s in seqs)
        run = peak = dip = 0.0
        for x in pnls:
            run += x
            peak = max(peak, run)
            dip = min(dip, run - peak)
        tot = sum(pnls)
        mark = "  <" if abs(p - HEAD) < 1e-9 else ""
        print(f"{f'{p * 100:.0f} cents':<14}{staked:>10,.0f}"
              f"{staked + tot:>11,.0f}{tot:>+10,.0f}"
              f"{tot / len(seqs):>+10.2f}{dip:>11,.0f}{mark}")

    pnls = [book(s, HEAD) for s in seqs]
    tot = sum(pnls)

    def zof(xs):
        if len(xs) < 2:
            return 0.0, 0.0, 0.0
        m = sum(xs) / len(xs)
        v = sum((x - m) ** 2 for x in xs) / (len(xs) - 1)
        s = (v / len(xs)) ** 0.5
        return m, s, (m / s if s else 0.0)

    mean, se, z = zof(pnls)
    print(f"\nat {HEAD * 100:.0f} cents: ${mean:+,.2f} per sequence, "
          f"standard error ${se:,.2f}  ->  z = {z:+.2f}")
    print("a real result needs |z| >= 1.96; anything under that is luck, in "
          "either direction.")
    lo95, hi95 = tot - 1.96 * se * len(pnls), tot + 1.96 * se * len(pnls)
    print(f"P&L 95% range over this span: ${lo95:+,.0f} to ${hi95:+,.0f}")

    # ---- does it survive being cut in half? -------------------------------- #
    # The single most useful check there is. Every number above was measured on
    # the same data the strategy was described against, and a shape that only
    # holds in one half of the span is a shape the data suggested, not one the
    # market has.
    half = len(pnls) // 2
    cut = seqs[half]["s1"]["tehran"][:5]
    (m1, _, z1), (m2, _, z2) = zof(pnls[:half]), zof(pnls[half:])
    print(f"\n{'-' * 78}")
    print(f"CUT IN HALF at {cut} — the same ladder, measured twice")
    print(f"{'-' * 78}")
    print(f"{'half':<22}{'seq':>6}{'P&L':>10}{'per seq':>10}{'z':>8}")
    print(f"{'first (proposes)':<22}{half:>6}{sum(pnls[:half]):>+9,.0f}"
          f"{m1:>+10.2f}{z1:>+8.2f}")
    print(f"{'second (checks)':<22}{len(pnls) - half:>6}"
          f"{sum(pnls[half:]):>+9,.0f}{m2:>+10.2f}{z2:>+8.2f}")
    if m1 * m2 <= 0:
        print("\n  ** the two halves DISAGREE IN SIGN. One month made the money,")
        print("     the other gave it back. That is what noise looks like.")
    elif abs(z2) < 1.96:
        print("\n  ** the second half points the same way but is not significant")
        print("     on its own. Suggestive, not established.")
    else:
        print("\n  ** both halves agree and the second one stands on its own.")

    # ---- flat betting, for comparison ------------------------------------- #
    flat = sum(payout(STAKE, HEAD) if r["result"] == "WIN" else -STAKE
               for r in rows)
    trg = [r for r in rows if ok(r)]
    flat_trg = sum(payout(STAKE, HEAD) if r["result"] == "WIN" else -STAKE
                   for r in trg)
    print(f"\n{'=' * 78}")
    print(f"FOR COMPARISON, at {HEAD * 100:.0f} cents")
    print("=" * 78)
    print(f"{'strategy':<44}{'bets':>7}{'P&L':>12}")
    print(f"{'the ladder above (follow-ups only)':<44}{len(seqs):>7,}"
          f"{tot:>+11,.0f}")
    print(f"{'the ladder PLUS flat $' + f'{STAKE:.0f}' + ' on the triggers':<44}"
          f"{len(seqs) + len(trg):>7,}{tot + flat_trg:>+11,.0f}")
    print(f"{'flat $' + f'{STAKE:.0f}' + ' on the trigger signals only':<44}"
          f"{len(trg):>7,}{flat_trg:>+11,.0f}")
    print(f"{'flat $' + f'{STAKE:.0f}' + ' on every signal in the month':<44}"
          f"{len(rows):>7,}{flat:>+11,.0f}")

    # ---- day by day -------------------------------------------------------- #
    per = defaultdict(lambda: [0, 0.0])
    for s, x in zip(seqs, pnls):
        day = (s["s1"].get("tehran") or s["s1"].get("et") or "")[:5]
        per[day][0] += 1
        per[day][1] += x
    print(f"\n{'=' * 78}")
    print(f"DAY BY DAY (Tehran dates, at {HEAD * 100:.0f} cents)")
    print("=" * 78)
    print(f"{'date':<9}{'seq':>5}{'P&L':>10}{'running':>10}   bar")
    run = 0.0
    for day in sorted(per):
        n, x = per[day]
        run += x
        bar = ("+" if x >= 0 else "-") * min(28, int(abs(x) / 5) + 1)
        print(f"{day:<9}{n:>5}{x:>+9,.0f}{run:>+10,.0f}   {bar}")
    green = sum(1 for d in per if per[d][1] > 0)
    print(f"\n{green} of {len(per)} days green")

    # ---- the full list ----------------------------------------------------- #
    with open(OUT, "w", newline="", encoding="utf-8-sig") as f:
        wr = csv.writer(f)
        wr.writerow(["#", "trigger_time", "trigger_rules", "trigger_bet",
                     "rung1_time", "rung1_rules", "rung1_bet", "rung1_result",
                     "rung2_time", "rung2_rules", "rung2_bet", "rung2_result",
                     "outcome", f"pnl_at_{HEAD * 100:.0f}c", "running"])
        run = 0.0
        for i, (s, x) in enumerate(zip(seqs, pnls), 1):
            run += x
            a, b, c = s["trigger"], s["s1"], s["s2"]
            wr.writerow([i, a["tehran"], a["short"], a["bet"],
                         b["tehran"], b["short"], b["bet"], b["result"],
                         c["tehran"] if c else "", c["short"] if c else "",
                         c["bet"] if c else "", c["result"] if c else "",
                         outcome(s), f"{x:.2f}", f"{run:.2f}"])
    print(f"\nall {len(seqs)} sequences written to {OUT}")

    print(f"\n{'=' * 78}")
    print(f"EVERY SEQUENCE (at {HEAD * 100:.0f} cents)")
    print("=" * 78)
    print(f"{'#':>4}  {'trigger':<12}{'rules':<8}  {'rung1':<12}{'r':<2}"
          f"  {'rung2':<12}{'r':<2}  {'P&L':>8}{'run':>9}")
    run = 0.0
    for i, (s, x) in enumerate(zip(seqs, pnls), 1):
        run += x
        a, b, c = s["trigger"], s["s1"], s["s2"]
        m1 = "W" if b["result"] == "WIN" else "L"
        m2 = "" if c is None else ("W" if c["result"] == "WIN" else "L")
        print(f"{i:>4}  {a['tehran']:<12}{a['short'][:7]:<8}  "
              f"{b['tehran']:<12}{m1:<2}  {(c['tehran'] if c else '-'):<12}"
              f"{m2:<2}  {x:>+8.0f}{run:>+9.0f}")

    print(f"\nNOTE  rung 1 fires at the close of the trigger's window, which is")
    print("      the same instant the trigger settles. On Polymarket the")
    print("      settlement is a 60-second average, so in real trading you")
    print("      learn the trigger's result about a minute into rung 1's")
    print("      window, at whatever price the book has moved to by then.")
    print("      The 55-cent row above is the honest version of that cost.")


if __name__ == "__main__":
    main()
