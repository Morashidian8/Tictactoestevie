"""
Why does RULE 1 lose in runs, and can the runs be avoided?

The complaint is specific and worth taking literally: the 20-candle break fires
seven times in a row and most of them lose. That is exactly what a trending
market looks like from the inside — price keeps making new extremes, the rule
keeps betting against it, and the fade only pays on the last one.

So: measure accuracy as a function of how crowded the recent signal history is,
and of whether this break repeats the previous one's direction.

Run:  python3 research/btc5m/rule1_clusters.py
"""
import gzip, csv, math, statistics as st
from collections import Counter


def load():
    rows = list(csv.DictReader(gzip.open('research/btc5m/btc5m.csv.gz', 'rt')))
    return [float(r['c']) for r in rows]


def z(w, n):
    return ((w / n) - 0.5) / (0.5 / math.sqrt(n)) if n else 0.0


def signals(c, lookback=20, vol_th=0.8884):
    """Every rule-1 firing: (index, side, won)."""
    out = []
    for i in range(101, len(c) - 1):
        w = c[i - lookback:i]
        if c[i] > max(w):
            side = "down"
        elif c[i] < min(w):
            side = "up"
        else:
            continue
        tail = c[i - 100:i + 1]
        rets = [(tail[k] - tail[k - 1]) / tail[k - 1] for k in range(1, 101)]
        slow = st.pstdev(rets)
        if slow <= 0 or st.pstdev(rets[-20:]) / slow < vol_th:
            continue
        if c[i + 1] == c[i]:
            continue
        won = (side == "up") == (c[i + 1] > c[i])
        out.append((i, side, won))
    return out


def report(title, rows):
    n = len(rows)
    if not n:
        print(f"  {title:44} —")
        return
    w = sum(1 for r in rows if r[2])
    print(f"  {title:44} {w/n*100:6.2f}%  n={n:6d}  z={z(w,n):+6.2f}")


def main():
    c = load()
    sig = signals(c)
    days = (len(c) - 101) / 288
    print(f"RULE 1: {len(sig)} سیگنال در {days:.0f} روز ({len(sig)/days:.1f} در روز)\n")
    report("همه", sig)

    # 1) how crowded is the recent past?
    print("\n۱) چند سیگنالِ دیگر در ۲۰ کندلِ گذشته بوده؟")
    idx = [s[0] for s in sig]
    pos = {v: k for k, v in enumerate(idx)}
    for lo, hi, lab in ((0, 0, "هیچ — اولین شکست"), (1, 1, "۱ تای دیگر"),
                        (2, 3, "۲ تا ۳ تا"), (4, 99, "۴ تا یا بیشتر")):
        sub = []
        for k, (i, side, won) in enumerate(sig):
            recent = sum(1 for j in idx[max(0, k - 12):k] if i - j <= 20)
            if lo <= recent <= hi:
                sub.append((i, side, won))
        report(lab, sub)

    # 2) does it repeat the previous signal's direction?
    print("\n۲) نسبت به سیگنالِ قبلیِ همین قانون:")
    first, same, opp = [], [], []
    for k, (i, side, won) in enumerate(sig):
        if k == 0 or i - sig[k - 1][0] > 20:
            first.append((i, side, won))
        elif side == sig[k - 1][1]:
            same.append((i, side, won))
        else:
            opp.append((i, side, won))
    report("اولینِ یک دسته (۲۰ کندل قبلش خبری نبوده)", first)
    report("تکرارِ همان جهت", same)
    report("جهتِ مخالفِ قبلی", opp)

    # 3) after a loss on this rule
    print("\n۳) بعد از باختِ قبلیِ همین قانون:")
    for k_losses, lab in ((1, "۱ باختِ پیاپی قبلش"), (2, "۲ باخت"), (3, "۳ باخت یا بیشتر")):
        sub = []
        streak = 0
        for i, side, won in sig:
            if (streak >= 3 if k_losses == 3 else streak == k_losses):
                sub.append((i, side, won))
            streak = 0 if won else streak + 1
        report(lab, sub)

    # 4) what a "first only" filter would cost and buy
    print("\n۴) اگر فقط «اولینِ هر دسته» را بگیریم:")
    n_all, w_all = len(sig), sum(1 for s in sig if s[2])
    n_f, w_f = len(first), sum(1 for s in first if s[2])
    print(f"  الان : {w_all}/{n_all} = {w_all/n_all*100:.2f}%   {n_all/days:.1f} سیگنال در روز")
    print(f"  بعد  : {w_f}/{n_f} = {w_f/n_f*100:.2f}%   {n_f/days:.1f} سیگنال در روز")
    print(f"  یعنی {100*(1-n_f/n_all):.0f}% سیگنال‌ها حذف می‌شوند و دقت "
          f"{(w_f/n_f - w_all/n_all)*100:+.2f} واحد عوض می‌شود.")

    # 5) longest losing runs, before and after
    def longest(rows):
        k = mx = 0
        runs = Counter()
        for _, _, won in rows:
            if won:
                if k:
                    runs[k] += 1
                k = 0
            else:
                k += 1
                mx = max(mx, k)
        return mx, sum(v for kk, v in runs.items() if kk >= 5)
    for lab, rows in (("همه", sig), ("فقط اولینِ هر دسته", first)):
        mx, five = longest(rows)
        print(f"  {lab:24} بلندترین رشتهٔ باخت {mx:>3}   ·  رشتهٔ ۵+ : {five} بار")


if __name__ == "__main__":
    main()
