"""
Is the martingale worth it, or does one bad run undo a month of being right?

The question came from a real run: seven losses in a row, then a win on the
eighth. With a three-rung ladder that is two busts and part of a third cycle,
and every winning cycle only pays back one base — so the recovery takes far
longer than the damage took. This measures that instead of arguing about it,
and puts flat staking next to it on exactly the same signals.

Run:  python3 research/btc5m/flat_vs_martingale.py
"""
import gzip, csv, sys, collections
sys.path.insert(0, '.')
from strategies import evaluate

DAYS = 365


def load():
    rows = list(csv.DictReader(gzip.open('research/btc5m/btc5m.csv.gz', 'rt')))
    return ([int(r['t']) for r in rows], [float(r['c']) for r in rows])


def streams(t, c, want=("rule6", "golden", "statistical")):
    cut = t[-1] - DAYS * 86400
    out = collections.defaultdict(list)
    for i in range(140, len(c) - 1):
        if t[i] < cut:
            continue
        o = "up" if c[i + 1] > c[i] else ("down" if c[i + 1] < c[i] else None)
        if o is None:
            continue
        for s in evaluate(c[i - 135:i + 1], streams=want):
            out[s.stream].append(s.side == o)
    return out


def martingale(bets, base, rungs=3):
    pnl = peak = dd = 0.0
    rung = busts = 0
    under = worst_under = 0        # bets spent below the previous high-water mark
    for won in bets:
        stake = base * 2 ** rung
        if won:
            pnl += stake
            rung = 0
        else:
            pnl -= stake
            rung += 1
            if rung >= rungs:
                busts += 1
                rung = 0
        if pnl >= peak:
            peak, under = pnl, 0
        else:
            under += 1
            worst_under = max(worst_under, under)
        dd = max(dd, peak - pnl)
    return pnl, dd, busts, worst_under


def flat(bets, stake):
    pnl = peak = dd = 0.0
    under = worst_under = 0
    for won in bets:
        pnl += stake if won else -stake
        if pnl >= peak:
            peak, under = pnl, 0
        else:
            under += 1
            worst_under = max(worst_under, under)
        dd = max(dd, peak - pnl)
    return pnl, dd, worst_under


def streaks(bets):
    runs = collections.Counter()
    k = 0
    for won in bets:
        if won:
            if k:
                runs[k] += 1
            k = 0
        else:
            k += 1
    if k:
        runs[k] += 1
    return runs


def main():
    t, c = load()
    data = streams(t, c)
    for name in ("rule6", "golden", "statistical"):
        bets = data.get(name)
        if not bets:
            continue
        acc = sum(bets) / len(bets) * 100
        base = 50 if name == "rule6" else 20
        mp, mdd, busts, munder = martingale(bets, base)
        # Flat stake chosen so the WORST case of one cycle is comparable:
        # a three-rung ladder risks 7x base, so 7x base flat is the honest
        # like-for-like on capital at risk... but nobody bets that, so show the
        # same base and also the same average stake.
        fp, fdd, funder = flat(bets, base)
        avg = mp and None
        print(f"\n=== {name}  ({len(bets)} شرط، دقت {acc:.2f}%) ===")
        print(f"  مارتینگلِ ۳ پله (پایه {base}$): سود {mp:>+9,.0f}$  "
              f"بدترین افت {mdd:>7,.0f}$  انفجار {busts:>5}  "
              f"طولانی‌ترین دورهٔ زیرِ قله {munder:>5} شرط")
        print(f"  حجمِ ثابت ({base}$ هر شرط):     سود {fp:>+9,.0f}$  "
              f"بدترین افت {fdd:>7,.0f}$  {'':>15}"
              f"طولانی‌ترین دورهٔ زیرِ قله {funder:>5} شرط")
        r = streaks(bets)
        tot = sum(r.values())
        long_ = {k: v for k, v in r.items() if k >= 5}
        print(f"  رشته‌های باخت: " +
              "  ".join(f"{k}تایی×{v}" for k, v in sorted(r.items()) if k <= 6) +
              (f"   ... و {sum(long_.values())} رشتهٔ ۵ تایی یا بلندتر "
               f"(بلندترین {max(r)})" if long_ else ""))
        # what one bust costs, and how many wins pay for it
        print(f"  یک انفجار = {7 * base}$ ضرر؛ هر چرخهٔ برنده فقط {base}$ سود "
              f"→ {7} چرخهٔ برنده لازم است تا جبران شود.")


if __name__ == "__main__":
    main()
