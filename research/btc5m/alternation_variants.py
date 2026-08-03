"""
Four readings of the same strategy, because two details were ambiguous.

  * When does the ladder bust? Seven rungs means seven bets, so seven straight
    losses — which is seven COLOUR CHANGES across eight candles. Read as "eight
    changes" instead, the ladder would need an eighth rung. Both are run.
  * Are the two windows chosen once, a month ago, or re-chosen every day from
    everything known up to that morning? Both are run.

Everything else follows the app: 5-minute candles, 2-hour Tehran windows, rank
by the all-time MAXIMUM alternation, bet with the last candle, 10/20/40/...

Run:  ALT_PKL=... python3 research/btc5m/alternation_variants.py
"""
import os, pickle, statistics as st
from collections import defaultdict
from datetime import datetime, timezone, timedelta

TEH = timezone(timedelta(hours=3, minutes=30))
WIN_MIN, SLOTS, TEST_DAYS = 120, 12, 30
PKL = os.environ.get("ALT_PKL", "/tmp/two_years.pkl")


def colours(kl):
    out = [None]
    for a, b in zip(kl, kl[1:]):
        out.append(b[1] > a[1] if b[1] != a[1] else None)
    return out


def run_len(col, i):
    n, j = 0, i
    while j + 1 < len(col):
        if col[j] is None or col[j + 1] is None or col[j + 1] == col[j]:
            break
        n += 1; j += 1
    return n


def slot_of(ts):
    d = datetime.fromtimestamp(ts, TEH)
    return (d.hour * 60 + d.minute) // WIN_MIN


def label(s):
    a = s * WIN_MIN
    return f"{a//60:02d}:{a%60:02d}–{(a+WIN_MIN)//60%24:02d}:{(a+WIN_MIN)%60:02d}"


def rank_upto(kl, col, cutoff):
    """Slots ordered by all-time max alternation strictly before `cutoff`."""
    mx = defaultdict(int); avg = defaultdict(list)
    for i, (ts, _) in enumerate(kl):
        if ts >= cutoff or col[i] is None:
            continue
        if i > 0 and col[i - 1] is not None and col[i] != col[i - 1]:
            continue
        r = run_len(col, i)
        if r:
            s = slot_of(ts)
            mx[s] = max(mx[s], r); avg[s].append(r)
    return sorted(range(SLOTS), key=lambda s: (mx[s], st.mean(avg[s]) if avg[s] else 9)), mx


def play(kl, col, split, rungs, daily_rerank):
    ladder = [10 * 2 ** k for k in range(rungs)]
    account = sum(ladder)
    rung = pnl = 0
    wins = bets = busts = 0
    used = defaultdict(int)
    chosen = None
    cur_day = None
    if not daily_rerank:
        chosen = set(rank_upto(kl, col, split)[0][:2])
    for i, (ts, _) in enumerate(kl):
        if ts < split or col[i] is None or col[i - 1] is None:
            continue
        d = datetime.fromtimestamp(ts, TEH)
        key = d.strftime("%Y-%m-%d")
        if daily_rerank and key != cur_day:
            cur_day = key
            midnight = d.replace(hour=0, minute=0, second=0).timestamp()
            chosen = set(rank_upto(kl, col, midnight)[0][:2])
        if slot_of(ts) not in chosen:
            continue
        used[label(slot_of(ts))] += 1
        stake = ladder[rung]
        bets += 1
        if col[i] == col[i - 1]:
            pnl += stake; wins += 1; rung = 0
        else:
            pnl -= stake; rung += 1
            if rung >= rungs:
                busts += 1; rung = 0
    return {"bets": bets, "wins": wins, "busts": busts, "pnl": pnl,
            "account": account, "used": used}


def main():
    kl = pickle.load(open(PKL, "rb"))
    col = colours(kl)
    split = kl[-1][0] - TEST_DAYS * 86400
    print(f"دورهٔ تست: {datetime.fromtimestamp(split, TEH):%Y-%m-%d} تا "
          f"{datetime.fromtimestamp(kl[-1][0], TEH):%Y-%m-%d} (تهران)\n")

    print(f"  {'حالت':44} {'شرط':>6} {'دقت':>7} {'انفجار':>8} "
          f"{'هر حساب':>9} {'سود/زیان':>11}")
    for rungs, rname in ((7, "بست در ۷ تغییرِ رنگ (۸ کندل)"),
                         (8, "بست در ۸ تغییرِ رنگ (۹ کندل)")):
        for rerank, cname in ((False, "انتخابِ یک‌باره، یک ماه پیش"),
                              (True, "انتخابِ مجدد هر روز")):
            r = play(kl, col, split, rungs, rerank)
            print(f"  {rname + ' · ' + cname:44} {r['bets']:>6,} "
                  f"{r['wins']/r['bets']*100:>6.1f}% {r['busts']:>8} "
                  f"{r['account']:>8,}$ {r['pnl']:>+10,.0f}$")

    print("\n\nبازه‌هایی که در حالتِ «انتخابِ مجدد هر روز» واقعاً معامله شدند:")
    r = play(kl, col, split, 7, True)
    for k, v in sorted(r["used"].items(), key=lambda x: -x[1]):
        print(f"    {k:>14}  {v:>4} شرط")

    print("\n\nنقطهٔ سربه‌سر — با نردبانِ n پله، چند برد به‌ازای هر انفجار لازم است:")
    for n in (5, 6, 7, 8, 9):
        acc = sum(10 * 2 ** k for k in range(n))
        p = 1 - (1 / acc * 10) ** 0
        print(f"    {n} پله: حساب {acc:>6,}$  ·  هر انفجار {acc//10:>4} برد را می‌خورد "
              f"·  نرخِ باختِ سربه‌سر {(1/(acc/10+1))**(1/n)*100:>5.1f}%")


if __name__ == "__main__":
    main()
