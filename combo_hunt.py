"""
Search every combination of conditions for one that actually predicts.

With 3,300 signals and a few thousand candidate rules, some combination will
show 60% by luck alone — reliably, every time, on any data. This project has
already proved that the hard way: 114,003 rules once topped out at 65.3% on the
test set, and shuffled random labels produced *better* in-sample patterns than
the real data did. A ranked list of winners is not a finding; it is what a
search returns whether or not anything is there.

So three things stand between a candidate and being called a discovery:

  * a chronological split — found on the first 70% of the month, checked on the
    last 30%, never the same rows twice;
  * a Bonferroni bar set by how many candidates were actually tried;
  * an empirical null — the whole search re-run on shuffled outcomes, twenty
    times, to see how good the best "winner" looks when nothing is there. That
    bar is usually stricter than Bonferroni, and it is the one that decides.

    python combo_hunt.py
    python combo_hunt.py --depth 3      # three-way too (weaker, more noise)

Reads signals_month.csv. Writes combo_hunt.csv with every candidate.
"""

import csv
import itertools
import math
import os
import random
import re
import sys
from datetime import datetime, timezone
from statistics import NormalDist

IN = os.environ.get("SIGNALS_FILE", "signals_month.csv")
OUT = os.environ.get("COMBO_FILE", "combo_hunt.csv")
GRAN = 300
TRAIN_FRAC = 0.70
MIN_N = int(os.environ.get("MIN_N", "120"))
SHUFFLES = int(os.environ.get("SHUFFLES", "20"))
FA = str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789")
TEHRAN_OFFSET = 3.5 * 3600


def wilson(w, n, z=1.96):
    if not n:
        return 0.0, 0.0
    p = w / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    m = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5)
    return max(0.0, (c - m) / d), min(1.0, (c + m) / d)


def zscore(w, n):
    """How many standard errors above a coin. The search's only ranking key."""
    return (w / n - 0.5) / math.sqrt(0.25 / n) if n else 0.0


def codes(rules):
    out = {"G"} if "🏆" in (rules or "") else set()
    out |= {d.translate(FA) for d in re.findall(r"([۰-۹])\)", rules or "")}
    return out


def load():
    rows = []
    with open(IN, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            try:
                t = int(r["window_epoch"])
            except (KeyError, TypeError, ValueError):
                continue
            rows.append({"t": t, "bet": r["bet"],
                         "won": r["result"] == "WIN",
                         "codes": codes(r.get("rules"))})
    rows.sort(key=lambda r: r["t"])
    # Context that only exists relative to the signal before it.
    for i, r in enumerate(rows):
        p = rows[i - 1] if i else None
        r["prev_win"] = bool(p and p["won"])
        r["prev_loss"] = bool(p and not p["won"])
        r["adjacent"] = bool(p and r["t"] - p["t"] == GRAN)
        r["same_bet"] = bool(p and p["bet"] == r["bet"])
        r["prev_g1"] = bool(p and ({"G", "1"} & p["codes"]))
        r["hour"] = datetime.fromtimestamp(r["t"] + TEHRAN_OFFSET,
                                           timezone.utc).hour
    return rows


def conditions():
    """
    The atoms every combination is built from.

    Deliberately plain: rule presence, how many agreed, direction, time of day,
    and what the previous signal did. Anything cleverer would be a hypothesis
    smuggled in as a feature, and the search is meant to test hypotheses, not
    contain them.
    """
    C = []
    for c in ("1", "2", "3", "5", "6", "7", "8", "G"):
        C.append((f"قانون {c}", lambda r, c=c: c in r["codes"]))
        C.append((f"بدونِ قانون {c}", lambda r, c=c: c not in r["codes"]))
    C += [
        ("۱ قانون تنها", lambda r: len(r["codes"] - {"G"}) == 1),
        ("۲ قانون یا بیشتر", lambda r: len(r["codes"] - {"G"}) >= 2),
        ("۳ قانون یا بیشتر", lambda r: len(r["codes"] - {"G"}) >= 3),
        ("شرطِ بالا", lambda r: r["bet"] == "up"),
        ("شرطِ پایین", lambda r: r["bet"] == "down"),
        ("قبلی برد", lambda r: r["prev_win"]),
        ("قبلی باخت", lambda r: r["prev_loss"]),
        ("قبلی چسبیده (کندلِ قبل)", lambda r: r["adjacent"]),
        ("قبلی هم‌جهت", lambda r: r["same_bet"]),
        ("قبلی مخالف", lambda r: not r["same_bet"]),
        ("قبلی طلایی یا ۱", lambda r: r["prev_g1"]),
        ("شب (۰۰–۰۶ تهران)", lambda r: 0 <= r["hour"] < 6),
        ("صبح (۰۶–۱۲)", lambda r: 6 <= r["hour"] < 12),
        ("بعدازظهر (۱۲–۱۸)", lambda r: 12 <= r["hour"] < 18),
        ("شب‌هنگام (۱۸–۲۴)", lambda r: 18 <= r["hour"] < 24),
    ]
    return C


def candidates(C, depth):
    for k in range(1, depth + 1):
        for combo in itertools.combinations(range(len(C)), k):
            yield combo


def popcount(x):
    """int.bit_count() where it exists, and a working fallback where it does not."""
    try:
        return x.bit_count()
    except AttributeError:
        return bin(x).count("1")


def main():
    if not os.path.exists(IN):
        print(f"{IN} not found — run replay_month.py first.")
        return
    depth = 2
    if "--depth" in sys.argv:
        try:
            depth = int(sys.argv[sys.argv.index("--depth") + 1])
        except (IndexError, ValueError):
            pass

    rows = load()
    if len(rows) < 400:
        print(f"only {len(rows)} signals — too few to search honestly.")
        return
    split = int(len(rows) * TRAIN_FRAC)
    C = conditions()
    print(f"{len(rows):,} signals · train {split:,} / test {len(rows)-split:,}")
    print(f"{len(C)} atomic conditions, combinations up to {depth} deep\n")

    # Each atom becomes one integer with a bit per signal, so intersecting a
    # combination is a single `&` and counting it is a popcount. The list-based
    # version rebuilt a 3,300-element list for every candidate and every shuffle
    # — a hundred million operations to answer a question that bitwise ops
    # settle in milliseconds, which is the difference between this finishing on
    # a phone and not.
    def bits(pred):
        v = 0
        for i, r in enumerate(rows):
            if pred(r):
                v |= 1 << i
        return v

    atoms = [bits(fn) for _, fn in C]
    n_rows = len(rows)
    train_mask = (1 << split) - 1
    test_mask = ((1 << n_rows) - 1) ^ train_mask
    truth = [r["won"] for r in rows]
    truth_bits = 0
    for i, w in enumerate(truth):
        if w:
            truth_bits |= 1 << i

    combos = list(candidates(C, depth))
    print(f"testing {len(combos):,} candidates …")

    # The mask for each combination never changes; only the outcomes do.
    masks = []
    for combo in combos:
        m = atoms[combo[0]]
        for j in combo[1:]:
            m &= atoms[j]
        masks.append((combo, m))

    def run(wins_bits, region, want_rows=False):
        best, out = 0.0, []
        for combo, m in masks:
            sel = m & region
            n = popcount(sel)
            if n < MIN_N:
                continue
            w = popcount(sel & wins_bits)
            z = abs(zscore(w, n))
            if z > best:
                best = z
            if want_rows:
                out.append((combo, w, n, m))
        return best, out

    _, train_rows = run(truth_bits, train_mask, want_rows=True)
    print(f"{len(train_rows):,} cleared the {MIN_N}-signal floor on train")
    K = max(1, len(train_rows))
    bonf = math.sqrt(2 * math.log(K))

    rng = random.Random(20260819)
    nulls = []
    for i in range(SHUFFLES):
        order = list(range(n_rows))
        rng.shuffle(order)
        sh = 0
        for pos, src in enumerate(order):
            if truth[src]:
                sh |= 1 << pos
        b, _ = run(sh, train_mask)
        nulls.append(b)
        print(f"  shuffle {i+1}/{SHUFFLES}: best |z| = {b:.2f}", end="\r")
    nulls.sort()
    p95 = nulls[int(len(nulls) * 0.95) - 1]
    bar = max(bonf, p95)
    print(f"\nBonferroni bar   : {bonf:.2f}")
    print(f"shuffled null    : median {nulls[len(nulls)//2]:.2f}, "
          f"95th {p95:.2f}, worst {nulls[-1]:.2f}")
    print(f"a real finding must clear: |z| >= {bar:.2f}")

    # What that bar can and cannot see. A search that reports nothing is only
    # informative if the reader knows what size of edge would have shown up —
    # otherwise "nothing found" and "nothing findable" look identical, and the
    # second is a fact about the sample, not about the market.
    print("\nکمترین لبه‌ای که با این تعداد نمونه قابلِ کشف است:")
    for n_ in (150, 300, 600, 1200):
        need = 50 + bar * math.sqrt(0.25 / n_) * 100
        print(f"  روی زیرمجموعهٔ {n_:>5,} تایی → باید بالای {need:.1f}% باشد "
              f"({need - 50:+.1f} واحد)")
    print("  هر لبه‌ای کوچک‌تر از این، با این حجمِ داده اصلاً دیده نمی‌شود.\n")

    # The train half PROPOSES, the held-out third DECIDES. Applying the full
    # multiple-testing bar to the train side and then demanding significance on
    # test as well corrects twice for the same search and leaves no power at
    # all: a planted 62% edge sat at z=2.93 against a 3.0 noise ceiling and was
    # thrown away. Only the hypotheses actually carried forward need correcting,
    # so the top few are named in advance and judged once, on rows the search
    # has never seen.
    CARRY = 10
    ranked = sorted(train_rows, key=lambda x: -abs(zscore(x[1], x[2])))
    # Bonferroni proper, not sqrt(2 ln K). That expression is the EXPECTED
    # maximum of K normals, so using it as a threshold passes the median noise
    # run — measured: one false positive in five random datasets. The bar that
    # actually holds the family-wise error at 5% across the carried hypotheses
    # is the two-sided 0.05/CARRY quantile.
    test_bar = NormalDist().inv_cdf(1 - 0.05 / (2 * CARRY))
    print("=" * 96)
    print(f"TOP {CARRY} ON TRAIN — carried forward, then judged on the held-out third")
    print(f"(a survivor must reach |z| >= {test_bar:.2f} on test, corrected for "
          f"the {CARRY} carried)")
    print("=" * 96)
    print(f"{'z train':>8}{'train':>16}{'test':>16}{'z test':>8}   شرط")
    keepers, out_rows = [], []
    for combo, w, n, mask in ranked[:400]:
        sel = mask & test_mask
        tn = popcount(sel)
        tw = popcount(sel & truth_bits)
        z = zscore(w, n)
        name = " و ".join(C[j][0] for j in combo)
        out_rows.append((z, name, w, n, tw, tn))
    for i, (z, name, w, n, tw, tn) in enumerate(out_rows[:CARRY]):
        tz = zscore(tw, tn) if tn else 0.0
        ok = tn >= 40 and (z > 0) == (tz > 0) and abs(tz) >= test_bar
        t = f"{tw}/{tn} = {tw/tn*100:.1f}%" if tn else "—"
        print(f"{z:>+8.2f}{f'{w}/{n} = {w/n*100:.1f}%':>16}{t:>16}"
              f"{tz:>+8.2f}   {name}{'  ✅' if ok else ''}")
        if ok:
            keepers.append((z, name, w, n, tw, tn, tz))

    with open(OUT, "w", newline="", encoding="utf-8-sig") as f:
        wr = csv.writer(f)
        wr.writerow(["z_train", "condition", "train_won", "train_n",
                     "test_won", "test_n"])
        wr.writerows([(f"{z:+.3f}", nm, w, n, tw, tn)
                      for z, nm, w, n, tw, tn in out_rows])

    print(f"\n{'=' * 96}")
    if keepers:
        print(f"{len(keepers)} candidate(s) survived on data the search never saw:")
        for z, name, w, n, tw, tn, tz in keepers:
            lo, hi = wilson(tw, tn)
            print(f"\n  {name}")
            print(f"    train {w}/{n} = {w/n*100:.1f}%  (z={z:+.2f})")
            print(f"    test  {tw}/{tn} = {tw/tn*100:.1f}%  (z={tz:+.2f})  "
                  f"[{lo*100:.0f}–{hi*100:.0f}]")
        print("\n  Worth one more month of live data before trading it: a")
        print("  held-out third is a real check, not a guarantee.")
    else:
        print("NOTHING survived on the held-out third.")
        print("The high train numbers above are what a search of this size")
        print("returns from noise — the shuffled runs reached the same heights")
        print("with the outcomes randomised.")
    print(f"\nall {len(out_rows):,} candidates written to {OUT}")


if __name__ == "__main__":
    main()
