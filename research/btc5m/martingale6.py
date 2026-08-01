"""
Three-rung martingale on RULE 6 (AABA + RSI>=70 -> down), alone and blended.

Assumptions, all of them the user's own:
  * settlement is close-to-close, exactly as Polymarket settles the 5m market
  * pricing is treated as 50-50 — a win pays +stake, a loss costs -stake
  * ladder is base, 2x, 4x; any win ends the cycle and nets +base
  * three losses in a row = a bust: -7x base, then the ladder resets
Two bust policies are reported: keep betting immediately, and sit out 6 hours.

Run:  python3 research/btc5m/martingale6.py
"""
import gzip, csv, math, statistics as st

SPLIT_DAYS = 365          # the "last year" headline; full period also printed


def med(x):
    s = sorted(x)
    return s[len(s) // 2]


def rsi_series(c, n=14):
    out = [None] * len(c)
    ag = al = 0.0
    for i in range(1, len(c)):
        d = c[i] - c[i - 1]
        g, l = max(d, 0.0), max(-d, 0.0)
        if i <= n:
            ag += g; al += l
            if i == n:
                ag, al = ag / n, al / n
                out[i] = 100 - 100 / (1 + ag / al) if al else 100.0
        else:
            ag = (ag * (n - 1) + g) / n
            al = (al * (n - 1) + l) / n
            out[i] = 100 - 100 / (1 + ag / al) if al else 100.0
    return out


def signals(t, c, rs):
    """Every window's fired rules as {rule: 'up'|'down'}, bot definitions."""
    out = []
    for i in range(120, len(c) - 1):
        mv = [c[k] - c[k - 1] for k in range(i - 103, i + 1)]
        fire = {}
        w20 = c[i - 20:i]
        rets = [(c[k] - c[k - 1]) / c[k - 1] for k in range(i - 99, i + 1)]
        slow = st.pstdev(rets) or 1e-9
        if c[i] > max(w20) and st.pstdev(rets[-20:]) / slow >= 0.8884:
            fire[1] = "down"
        elif c[i] < min(w20) and st.pstdev(rets[-20:]) / slow >= 0.8884:
            fire[1] = "up"
        m100 = med([abs(x) for x in mv[-101:-1]]) or 1e-9
        l3 = mv[-3:]
        if all(l3) and (l3[0] > 0) == (l3[1] > 0) == (l3[2] > 0) and abs(l3[-1]) > 2.0 * m100:
            fire[2] = "down" if l3[-1] > 0 else "up"
        if all(mv[-6:]) and len({x > 0 for x in mv[-6:]}) == 1:
            fire[3] = "down" if mv[-1] > 0 else "up"
        m101 = med([abs(x) for x in mv[-100:]]) or 1e-9
        net = c[i] - c[i - 4]
        if net and abs(net) >= 5.7 * m101:
            fire[5] = "down" if net > 0 else "up"
        m4 = mv[-4:]
        if all(m4):
            a = m4[0] > 0
            if (m4[1] > 0) == a and (m4[2] > 0) != a and (m4[3] > 0) == a:
                fire[4] = "up" if a else "down"
                if rs[i] and rs[i] >= 70:
                    fire[6] = "down"
        if fire:
            out.append((t[i], i, fire, "up" if c[i + 1] > c[i] else
                        ("down" if c[i + 1] < c[i] else None)))
    return out


def stream(sig, rules):
    """Chronological bets from a set of rules; unanimous only, pushes dropped."""
    bets = []
    for ts, i, fire, outcome in sig:
        sides = {v for k, v in fire.items() if k in rules}
        if len(sides) != 1 or outcome is None:
            continue
        bets.append((ts, sides.pop() == outcome))
    return bets


def martingale(bets, base, rungs=3, cooldown_s=0):
    """Returns a dict of the numbers that actually matter."""
    ladder = [base * 2 ** k for k in range(rungs)]
    pnl = peak = 0.0
    dd = 0.0
    rung = 0
    busts = 0
    cycles = 0
    wins = 0
    until = 0
    path_min = 0.0
    for ts, won in bets:
        if ts < until:
            continue
        stake = ladder[rung]
        if won:
            pnl += stake
            wins += 1
            cycles += 1
            rung = 0
        else:
            pnl -= stake
            rung += 1
            if rung >= rungs:
                busts += 1
                cycles += 1
                rung = 0
                if cooldown_s:
                    until = ts + cooldown_s
        peak = max(peak, pnl)
        dd = max(dd, peak - pnl)
        path_min = min(path_min, pnl)
    return {"pnl": pnl, "dd": dd, "busts": busts, "cycles": cycles,
            "bets": wins + sum(1 for _ in ()) , "n": len(bets),
            "low": path_min, "hit": wins}


def show(title, bets, days):
    if not bets:
        print(f"\n{title}: هیچ شرطی نیست."); return
    acc = sum(1 for _, w in bets if w) / len(bets) * 100
    print(f"\n{title}")
    print(f"  {len(bets)} شرط در {days:.0f} روز ({len(bets)/days:.1f} در روز)  ·  دقت {acc:.2f}%")
    print(f"  {'پایه':>6} {'حالت':>8} {'سود/زیان':>12} {'انفجار':>7} {'بدترین افت':>12} {'کف مسیر':>11}")
    for base in (20, 50):
        for label, cd in (("پیوسته", 0), ("۶ ساعت استراحت", 6 * 3600)):
            r = martingale(bets, base, 3, cd)
            print(f"  {base:>6} {label:>16} {r['pnl']:>+11,.0f}$ {r['busts']:>7} "
                  f"{r['dd']:>11,.0f}$ {r['low']:>10,.0f}$")


def main():
    rows = list(csv.DictReader(gzip.open('research/btc5m/btc5m.csv.gz', 'rt')))
    t = [int(r['t']) for r in rows]
    c = [float(r['c']) for r in rows]
    rs = rsi_series(c)
    sig = signals(t, c, rs)
    cutoff = t[-1] - SPLIT_DAYS * 86400
    for period, keep in (("۱۲ ماهِ اخیر", lambda s: s[0] >= cutoff),
                         ("کلِ دورهٔ داده (۱۸٫۵ ماه)", lambda s: True)):
        sub = [s for s in sig if keep(s)]
        days = (sub[-1][0] - sub[0][0]) / 86400
        print("\n" + "=" * 78)
        print(f"### {period}")
        print("=" * 78)
        show("قانون ۶ تنها (AABA + RSI≥۷۰ ← پایین)", stream(sub, {6}), days)
        show("آماری‌ها بدون قانون ۶ (۱،۲،۳،۵)", stream(sub, {1, 2, 3, 5}), days)
        show("ترکیبی: ۱،۲،۳،۵ + ۶", stream(sub, {1, 2, 3, 5, 6}), days)
        show("قانون ۴ تنها (برای مقایسه)", stream(sub, {4}), days)


if __name__ == "__main__":
    main()
