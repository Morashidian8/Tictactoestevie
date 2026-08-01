"""
Can the AABA pattern (RULE 4) be filtered into something usable?

The pattern itself is 48.8% out-of-sample — no edge. The open question the user
keeps coming back to is whether some CONDITION picks out a subset of AABA
occurrences that does work: volume, support/resistance, indicators.

Protocol, unchanged from the rest of this research and non-negotiable:
  * chronological 70/30 split — the filter is chosen on train only
  * a minimum occurrence count, so a 40-sample fluke cannot win
  * Bonferroni: with K conditions the bar is z >= sqrt(2*ln K), not 1.96
  * both directions count: a condition significantly BELOW 50% is also an edge
    (bet the reversal instead), so |z| is what is ranked
Run:  python3 research/btc5m/rule4_filters.py
"""
import gzip, csv, math, statistics as st

MIN_N = 300          # per side, on train


def load():
    rows = list(csv.DictReader(gzip.open('research/btc5m/btc5m.csv.gz', 'rt')))
    return ([float(r['o']) for r in rows], [float(r['h']) for r in rows],
            [float(r['l']) for r in rows], [float(r['c']) for r in rows],
            [float(r['v']) for r in rows])


def med(x):
    s = sorted(x)
    return s[len(s) // 2]


def rsi(c, n=14):
    out = [None] * len(c)
    gains = losses = 0.0
    for i in range(1, len(c)):
        d = c[i] - c[i - 1]
        g, l = max(d, 0.0), max(-d, 0.0)
        if i <= n:
            gains += g; losses += l
            if i == n:
                ag, al = gains / n, losses / n
                out[i] = 100 - 100 / (1 + ag / al) if al else 100.0
        else:
            ag = (ag * (n - 1) + g) / n
            al = (al * (n - 1) + l) / n
            out[i] = 100 - 100 / (1 + ag / al) if al else 100.0
    return out


def atr(h, l, c, n=14):
    out = [None] * len(c)
    trs = []
    for i in range(1, len(c)):
        trs.append(max(h[i] - l[i], abs(h[i] - c[i - 1]), abs(l[i] - c[i - 1])))
        if len(trs) >= n:
            out[i] = sum(trs[-n:]) / n
    return out


def occurrences(c, h, l, v, rs, at):
    """Every AABA window, with the features a filter could use."""
    out = []
    for i in range(120, len(c) - 1):
        m = [c[k] - c[k - 1] for k in range(i - 3, i + 1)]
        if any(x == 0 for x in m):
            continue
        a = m[0] > 0
        if not ((m[1] > 0) == a and (m[2] > 0) != a and (m[3] > 0) == a):
            continue
        vmed = med(v[i - 100:i]) or 1e-9
        amed = at[i] or 1e-9
        hi20, lo20 = max(h[i - 20:i]), min(l[i - 20:i])
        hi50, lo50 = max(h[i - 50:i]), min(l[i - 50:i])
        rets = [(c[k] - c[k - 1]) / c[k - 1] for k in range(i - 99, i + 1)]
        slow = st.pstdev(rets) or 1e-9
        out.append({
            "i": i,
            "up": a,
            # did the direction continue on the next candle?
            "win": (c[i + 1] - c[i] > 0) == a,
            "vol_ratio": v[i] / vmed,                       # volume of the A candle
            "vol4": sum(v[i - 3:i + 1]) / (4 * vmed),        # volume over the pattern
            "rsi": rs[i],
            "atr_ratio": abs(m[3]) / amed,                   # size of the last leg
            "stretch": abs(c[i] - c[i - 4]) / (med([abs(c[k] - c[k - 1])
                                                    for k in range(i - 99, i + 1)]) or 1e-9),
            # room to the nearest barrier, in ATR: small = right at resistance
            "room": ((hi20 - c[i]) if a else (c[i] - lo20)) / amed,
            "room50": ((hi50 - c[i]) if a else (c[i] - lo50)) / amed,
            "vol_regime": st.pstdev(rets[-20:]) / slow,
            "body": abs(m[3]) / max(h[i] - l[i], 1e-9),
        })
    return out


def z_of(rows):
    n = len(rows)
    if not n:
        return 0.0, 0.0, 0
    w = sum(1 for r in rows if r["win"])
    p = w / n
    return (p - 0.5) / (0.5 / math.sqrt(n)), p * 100, n


def conditions():
    """The grid. Every entry is (label, predicate)."""
    out = []
    for lo, hi in [(0, .7), (.7, 1.0), (1.0, 1.5), (1.5, 2.5), (2.5, 99)]:
        out.append((f"volume {lo}-{hi}x", lambda r, lo=lo, hi=hi: lo <= r["vol_ratio"] < hi))
        out.append((f"volume4 {lo}-{hi}x", lambda r, lo=lo, hi=hi: lo <= r["vol4"] < hi))
    for lo, hi in [(0, 30), (30, 45), (45, 55), (55, 70), (70, 101)]:
        out.append((f"RSI {lo}-{hi}", lambda r, lo=lo, hi=hi: r["rsi"] is not None and lo <= r["rsi"] < hi))
    for lo, hi in [(0, .5), (.5, 1.5), (1.5, 3), (3, 99)]:
        out.append((f"room to level {lo}-{hi} ATR", lambda r, lo=lo, hi=hi: lo <= r["room"] < hi))
        out.append((f"room50 {lo}-{hi} ATR", lambda r, lo=lo, hi=hi: lo <= r["room50"] < hi))
    for lo, hi in [(0, .5), (.5, 1), (1, 2), (2, 99)]:
        out.append((f"last leg {lo}-{hi} ATR", lambda r, lo=lo, hi=hi: lo <= r["atr_ratio"] < hi))
    for lo, hi in [(0, 2), (2, 4), (4, 6), (6, 99)]:
        out.append((f"stretch {lo}-{hi}x", lambda r, lo=lo, hi=hi: lo <= r["stretch"] < hi))
    for lo, hi in [(0, .8), (.8, 1.0), (1.0, 1.3), (1.3, 99)]:
        out.append((f"vol regime {lo}-{hi}", lambda r, lo=lo, hi=hi: lo <= r["vol_regime"] < hi))
    for lo, hi in [(0, .4), (.4, .7), (.7, 1.01)]:
        out.append((f"body/range {lo}-{hi}", lambda r, lo=lo, hi=hi: lo <= r["body"] < hi))
    # direction splits of everything above
    base = list(out)
    for lab, fn in base:
        out.append((lab + " · فقط صعودی", lambda r, fn=fn: fn(r) and r["up"]))
        out.append((lab + " · فقط نزولی", lambda r, fn=fn: fn(r) and not r["up"]))
    return out


def main():
    o, h, l, c, v = load()
    rs, at = rsi(c), atr(h, l, c)
    occ = occurrences(c, h, l, v, rs, at)
    split = int(len(occ) * 0.7)
    tr, te = occ[:split], occ[split:]
    zt, pt, nt = z_of(tr)
    ze, pe, ne = z_of(te)
    print(f"AABA occurrences: {len(occ)}  (train {nt}, test {ne})")
    print(f"unfiltered — train {pt:.2f}% (z={zt:+.2f})   test {pe:.2f}% (z={ze:+.2f})\n")

    conds = conditions()
    bar = math.sqrt(2 * math.log(len(conds)))
    print(f"{len(conds)} conditions tested -> Bonferroni bar |z| >= {bar:.2f}\n")

    scored = []
    for lab, fn in conds:
        sub = [r for r in tr if fn(r)]
        if len(sub) < MIN_N:
            continue
        z, p, n = z_of(sub)
        scored.append((abs(z), z, p, n, lab, fn))
    scored.sort(reverse=True)

    print(f"{'filter':38} {'train':>16}   {'test':>16}   verdict")
    print("-" * 92)
    for az, z, p, n, lab, fn in scored[:12]:
        sub = [r for r in te if fn(r)]
        ze2, pe2, ne2 = z_of(sub)
        # a filter is only interesting if train and test agree in SIGN
        ok = az >= bar and ne2 >= 100 and (z > 0) == (ze2 > 0) and abs(ze2) >= 1.96
        print(f"{lab:38} {p:6.2f}% n={n:5d} z={z:+5.2f}   "
              f"{pe2:6.2f}% n={ne2:5d} z={ze2:+5.2f}   "
              f"{'✅ survives' if ok else ('passes train only' if az >= bar else '—')}")
    survivors = [s for s in scored if s[0] >= bar]
    print(f"\n{len(survivors)} of {len(scored)} filters cleared the train bar.")
    kept = 0
    for az, z, p, n, lab, fn in survivors:
        sub = [r for r in te if fn(r)]
        ze2, pe2, ne2 = z_of(sub)
        if ne2 >= 100 and (z > 0) == (ze2 > 0) and abs(ze2) >= 1.96:
            kept += 1
    print(f"{kept} of those still held out-of-sample.")


if __name__ == "__main__":
    main()
