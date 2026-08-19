"""
After a winning golden entry or rule-1 break, is the very next signal better?

The question is specific and worth asking precisely: take every signal from the
golden tier or rule 1 that WON, look only at a signal fired in the immediately
following window, and ask how often that one won too. A signal two windows later
is a different situation and is not counted.

Three controls come with it, because the headline number alone cannot say what
caused it:

  * what follows the same rules when they LOSE — if the rate is the same, the
    win had nothing to do with it and the trigger is just "rule 1 fired";
  * what follows ANY signal — the honest baseline for "a signal came right
    after another signal";
  * every signal in the month — the flat baseline.

    python after_win.py
    python after_win.py --loss     # the mirror: after a LOSS instead

Reads signals_month.csv. Writes after_win.csv with the ordered pairs.
"""

import csv
import os
import re
import sys

IN = os.environ.get("SIGNALS_FILE", "signals_month.csv")
OUT = os.environ.get("AFTER_FILE", "after_win.csv")
GRAN = 300
FA = str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789")


def wilson(w, n, z=1.96):
    if not n:
        return 0.0, 0.0
    p = w / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    m = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5)
    return max(0.0, (c - m) / d), min(1.0, (c + m) / d)


def codes(rules):
    """Rule numbers in a row. Rule 7's own name contains ' + ', so no splitting."""
    out = {"G"} if "🏆" in (rules or "") else set()
    out |= {d.translate(FA) for d in re.findall(r"([۰-۹])\)", rules or "")}
    return out


def load():
    rows = []
    with open(IN, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            try:
                r["t"] = int(r["window_epoch"])
            except (KeyError, TypeError, ValueError):
                continue
            r["codes"] = codes(r.get("rules"))
            rows.append(r)
    rows.sort(key=lambda r: r["t"])
    return rows


def rate(pairs):
    n = len(pairs)
    if not n:
        return 0, 0, (0.0, 0.0)
    w = sum(1 for _, b in pairs if b["result"] == "WIN")
    return w, n, wilson(w, n)


def main():
    if not os.path.exists(IN):
        print(f"{IN} not found — run replay_month.py first.")
        return
    want_loss = "--loss" in sys.argv
    trigger_result = "LOSS" if want_loss else "WIN"
    rows = load()
    by_t = {r["t"]: r for r in rows}
    print(f"{len(rows):,} signals in {IN}\n")

    def follows(pred):
        out = []
        for r in rows:
            if not pred(r):
                continue
            nxt = by_t.get(r["t"] + GRAN)
            if nxt is not None:
                out.append((r, nxt))
        return out

    target = follows(lambda r: r["result"] == trigger_result
                     and ({"G"} | {"1"}) & r["codes"])
    mirror = follows(lambda r: r["result"] != trigger_result
                     and ({"G"} | {"1"}) & r["codes"])
    any_sig = follows(lambda r: True)
    allw = sum(1 for r in rows if r["result"] == "WIN")

    label = "باخته" if want_loss else "برده"
    print("=" * 70)
    print(f"سیگنالِ بعدی — وقتی «طلایی یا قانون ۱» {label} و بلافاصله "
          f"سیگنالِ بعدی آمده")
    print("=" * 70)
    print(f"{'وضعیت':<44}{'n':>6}{'برد':>6}{'درصد':>8}{'بازهٔ ۹۵٪':>16}")
    for name, pairs in ((f"بعد از «طلایی/قانون۱» که {label}", target),
                        (f"بعد از «طلایی/قانون۱» که {'برده' if want_loss else 'باخته'}",
                         mirror),
                        ("بعد از هر سیگنالی", any_sig)):
        w, n, (lo, hi) = rate(pairs)
        if not n:
            print(f"{name:<44}{'—':>6}")
            continue
        print(f"{name:<44}{n:>6,}{w:>6,}{w/n*100:>7.2f}%"
              f"   [{lo*100:>5.1f}–{hi*100:<5.1f}]")
    lo, hi = wilson(allw, len(rows))
    print(f"{'همهٔ سیگنال‌های ماه':<44}{len(rows):>6,}{allw:>6,}"
          f"{allw/len(rows)*100:>7.2f}%   [{lo*100:>5.1f}–{hi*100:<5.1f}]")

    w, n, (lo, hi) = rate(target)
    if n:
        base = allw / len(rows) * 100
        gap = w / n * 100 - base
        print(f"\nاختلاف با پایه: {gap:+.2f} واحد  ·  "
              f"{'معنادار نیست' if lo * 100 <= base <= hi * 100 else 'بیرونِ بازهٔ پایه'}")

    with open(OUT, "w", newline="", encoding="utf-8-sig") as f:
        wr = csv.writer(f)
        wr.writerow(["#", "trigger_time", "trigger_rules", "trigger_result",
                     "next_time", "next_rules", "next_bet", "next_result",
                     "same_side"])
        for i, (a, b) in enumerate(target, 1):
            wr.writerow([i, a["et"], a.get("rules_short") or a["rules"],
                         a["result"], b["et"],
                         b.get("rules_short") or b["rules"], b["bet"],
                         b["result"], "yes" if a["bet"] == b["bet"] else "no"])
    print(f"\n{len(target):,} جفت در {OUT} نوشته شد\n")

    print("=" * 70)
    print(f"{'#':>4}  {'سیگنالِ محرک':<26}  {'سیگنالِ بعدی':<26}  نتیجه")
    print("=" * 70)
    for i, (a, b) in enumerate(target, 1):
        ar = a.get("rules_short") or a["rules"][:14]
        br = b.get("rules_short") or b["rules"][:14]
        mark = "✅" if b["result"] == "WIN" else "❌"
        same = "هم‌جهت" if a["bet"] == b["bet"] else "برعکس"
        print(f"{i:>4}  {a['et']:<14} {ar:<10}  {b['et']:<14} {br:<10}  "
              f"{mark} {b['bet']:<5} {same}")


if __name__ == "__main__":
    main()
