"""
Can the new rule be sharpened by pairing it with something else?

The base rule — fade price when it sits more than k ATR from its 20-period
average — is 52.2% on the windows the live system misses. That is real but
thin, so the question is whether some second condition selects a better subset
of it without shrinking it to nothing.

Every filter is tried in both polarities where that makes sense, because
"require X" and "require not-X" are different hypotheses and assuming which one
helps is how a fitted curve gets mistaken for a finding. The count of filters
tried sets the significance bar.

Run:
    python3 research/btc5m/hunt_combine.py
"""

import math
import os
import pickle
import random

import engine as E
import hunt_lib as H
import hunt_rules as R
from hunt_money import live_signals, ladder, report, BASE, RISK

K_BASE = 1.5


def main():
    d = H.load(days=365)
    S = R.build(d)
    res = H.outcomes(d)
    split = int(d["n"] * H.TRAIN_FRAC)
    live = live_signals(d)
    c, o, h, l, v, n = d["c"], d["o"], d["h"], d["l"], d["v"], d["n"]
    sma20, atr, rsi7, rsi14 = S["sma20"], S["atr14"], S["rsi7"], S["rsi14"]
    vsma, rng20, body = S["vsma20"], S["rangesma20"], S["body"]
    atr_sma = H.sma([x if x else 0.0 for x in atr], 100)

    def base_pairs(k=K_BASE):
        out = {}
        for i in range(210, n - 1):
            if sma20[i] and atr[i] and abs(c[i] - sma20[i]) > k * atr[i]:
                out[i] = -1 if c[i] > sma20[i] else +1
        return {i: s for i, s in out.items() if i not in live}

    base = base_pairs()
    seq = [(res[i] == s) for i, s in sorted(base.items()) if res[i] != 0]
    print(f"پایه: n={len(seq):,}  دقت={sum(seq)/len(seq)*100:.2f}%\n")

    def gap_x(i):
        return abs(c[i] - sma20[i]) / atr[i]

    # (name, predicate) — every one tried in both polarities by the loop below
    filters = [
        ("RSI7 هم‌جهت اشباع", lambda i: (rsi7[i] is not None and
            ((c[i] > sma20[i] and rsi7[i] > 70) or (c[i] < sma20[i] and rsi7[i] < 30)))),
        ("RSI14 هم‌جهت اشباع", lambda i: (rsi14[i] is not None and
            ((c[i] > sma20[i] and rsi14[i] > 65) or (c[i] < sma20[i] and rsi14[i] < 35)))),
        ("کندلِ آخر هم‌جهتِ کشیدگی", lambda i:
            (c[i] > sma20[i]) == (c[i] > o[i]) and c[i] != o[i]),
        ("کندلِ آخر مخالفِ کشیدگی", lambda i:
            (c[i] > sma20[i]) != (c[i] > o[i]) and c[i] != o[i]),
        ("کشیدگی در حالِ رشد", lambda i: gap_x(i) > gap_x(i - 1)),
        ("کشیدگی در حالِ کم‌شدن", lambda i: gap_x(i) < gap_x(i - 1)),
        ("حجم بالای میانگین", lambda i: vsma[i] and v[i] > vsma[i]),
        ("حجم زیرِ میانگین", lambda i: vsma[i] and v[i] < vsma[i]),
        ("حجم > ۲ برابر", lambda i: vsma[i] and v[i] > 2 * vsma[i]),
        ("نوسانِ بالا (ATR>میانگین)", lambda i: atr_sma[i] and atr[i] > atr_sma[i]),
        ("نوسانِ پایین (ATR<میانگین)", lambda i: atr_sma[i] and atr[i] < atr_sma[i]),
        ("بدنهٔ بزرگ", lambda i: rng20[i] and body[i] > rng20[i]),
        ("بدنهٔ کوچک", lambda i: rng20[i] and body[i] < 0.5 * rng20[i]),
        ("بالای میانگین (فقط شرطِ پایین)", lambda i: c[i] > sma20[i]),
        ("زیرِ میانگین (فقط شرطِ بالا)", lambda i: c[i] < sma20[i]),
        ("کشیدگی ≥ ۲ برابر", lambda i: gap_x(i) >= 2.0),
        ("کشیدگی ≥ ۲٫۵ برابر", lambda i: gap_x(i) >= 2.5),
        ("۳ کندلِ هم‌رنگِ پیاپی", lambda i:
            all((c[i - j] > o[i - j]) == (c[i] > o[i]) for j in range(3)) and c[i] != o[i]),
        ("سایهٔ بلند در جهتِ کشیدگی", lambda i:
            (h[i] - max(o[i], c[i])) > body[i] if c[i] > sma20[i]
            else (min(o[i], c[i]) - l[i]) > body[i]),
    ]

    rows = []
    for name, pred in filters:
        for polarity, tag in ((True, ""), (False, " (نقیض)")):
            sub = {i: s for i, s in base.items()
                   if bool(pred(i)) == polarity}
            outs = [(res[i] == s) for i, s in sorted(sub.items()) if res[i] != 0]
            if len(outs) < H.MIN_N:
                continue
            nn, ww = len(outs), sum(outs)
            tr = [(res[i] == s) for i, s in sorted(sub.items())
                  if i < split and res[i] != 0]
            te = [(res[i] == s) for i, s in sorted(sub.items())
                  if i >= split and res[i] != 0]
            merged = dict(live); merged.update(sub)
            r = report("m", merged, res)
            rows.append((H.zscore(ww, nn), name + tag, nn, ww,
                         sum(tr) / len(tr) * 100 if tr else float("nan"),
                         sum(te) / len(te) * 100 if te else float("nan"),
                         r["pnl_eq"], r["busts"], r["dd"]))

    K = len(rows)
    bar = H.bonferroni_z(K)
    rows.sort(reverse=True)
    print("=" * 112)
    print(f"{K} فیلتر آزموده شد — مرزِ Bonferroni: z >= {bar:.2f}")
    print("=" * 112)
    print(f"{'z':>7}{'n':>8}{'دقت':>9}{'train':>8}{'test':>8}"
          f"{'سود@ریسکِ برابر':>18}{'انفجار':>8}   فیلتر")
    print("-" * 112)
    for z, name, nn, ww, tr, te, pnl, busts, dd in rows[:22]:
        star = " ***" if z >= bar else ""
        print(f"{z:>+7.2f}{nn:>8,}{ww/nn*100:>8.2f}%{tr:>7.1f}%{te:>7.1f}%"
              f"{pnl:>+18,.0f}{busts:>8,}   {name}{star}")

    print(f"\n{'=' * 112}")
    print("برای مقایسه — پایه بدونِ هیچ فیلتری، و سیستمِ فعلی")
    print("=" * 112)
    merged = dict(live); merged.update(base)
    rb = report("live + پایه", merged, res)
    rl = report("فقط سیستمِ فعلی", live, res)
    for r in (rl, rb):
        print(f"  {r['label']:<22} n={r['n']:>7,} acc={r['acc']:>5.2f}% "
              f"busts={r['busts']:>5,} dd={r['dd']:>6,.0f} "
              f"→ سود با ریسکِ برابر {r['pnl_eq']:>+10,.0f}")

    with open(os.path.join(H.HERE, "out", "hunt_combine.pkl"), "wb") as f:
        pickle.dump({"rows": rows, "bar": bar}, f)


if __name__ == "__main__":
    main()
