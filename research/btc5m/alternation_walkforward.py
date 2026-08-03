"""
The alternation strategy the way it is actually meant to be played.

Three things that were wrong in the first run and are fixed here:

  * The two windows are re-picked EVERY DAY, from everything known up to that
    morning. A slot that blew its ceiling yesterday is no longer the calmest
    one today, and the ranking has to notice that.
  * After a bust the ladder does not restart inside the same window. Trading
    stops until the next scheduled window — later the same day if there is one,
    otherwise tomorrow's.
  * Each entry begins at $10; the ladder only exists to recover a loss.

Run:  ALT_PKL=... python3 research/btc5m/alternation_walkforward.py
"""
import os, pickle, statistics as st
from collections import defaultdict
from datetime import datetime, timezone, timedelta

TEH = timezone(timedelta(hours=3, minutes=30))
WIN_MIN, SLOTS, TEST_DAYS = 120, 12, 30
LADDER = [10 * 2 ** k for k in range(7)]     # 10 .. 640
ACCOUNT = sum(LADDER)                        # 1,270
PKL = os.environ.get("ALT_PKL", "/tmp/two_years.pkl")


def colours(kl):
    out = [None]
    for a, b in zip(kl, kl[1:]):
        out.append(b[1] > a[1] if b[1] != a[1] else None)
    return out


def run_len(col, i):
    n, j = 0, i
    while j + 1 < len(col) and col[j] is not None and col[j + 1] is not None \
            and col[j + 1] != col[j]:
        n += 1; j += 1
    return n


def slot_of(ts):
    d = datetime.fromtimestamp(ts, TEH)
    return (d.hour * 60 + d.minute) // WIN_MIN


def label(s):
    a = s * WIN_MIN
    return f"{a//60:02d}:{a%60:02d}–{(a+WIN_MIN)//60%24:02d}:{(a+WIN_MIN)%60:02d}"


def build_index(kl, col):
    """Every alternation run, as (timestamp, slot, length), oldest first."""
    out = []
    for i, (ts, _) in enumerate(kl):
        if col[i] is None:
            continue
        if i > 0 and col[i - 1] is not None and col[i] != col[i - 1]:
            continue                       # mid-run
        r = run_len(col, i)
        if r:
            out.append((ts, slot_of(ts), r))
    return out


def rank_at(index, upto):
    """Slots by all-time max alternation strictly before `upto`, then by mean."""
    mx = defaultdict(int); vals = defaultdict(list)
    for ts, s, r in index:
        if ts >= upto:
            break                          # index is sorted
        mx[s] = max(mx[s], r); vals[s].append(r)
    order = sorted(range(SLOTS),
                   key=lambda s: (mx[s] or 99, st.mean(vals[s]) if vals[s] else 99))
    return order, mx


def main(carry=True):
    kl = pickle.load(open(PKL, "rb"))
    col = colours(kl)
    index = build_index(kl, col)
    split = kl[-1][0] - TEST_DAYS * 86400

    rung = 0
    pnl = 0.0
    bets = wins = busts = 0
    halted_slot = None                     # window we stopped in after a bust
    cur_day = None
    chosen = set()
    day = defaultdict(lambda: {"b": 0, "w": 0, "busts": 0, "pnl": 0.0,
                               "slots": set(), "halt": 0})
    picks = {}
    bust_log = []

    for i, (ts, _) in enumerate(kl):
        if ts < split or col[i] is None or col[i - 1] is None:
            continue
        d = datetime.fromtimestamp(ts, TEH)
        key = d.strftime("%Y-%m-%d")
        if key != cur_day:
            cur_day = key
            midnight = d.replace(hour=0, minute=0, second=0,
                                 microsecond=0).timestamp()
            order, mx = rank_at(index, midnight)
            chosen = set(order[:2])
            picks[key] = [(label(s), mx[s]) for s in sorted(chosen)]
            halted_slot = None             # a new day clears the halt
        s = slot_of(ts)
        if s not in chosen:
            continue
        if s == halted_slot:               # blown up here; wait for the next window
            day[key]["halt"] += 1
            continue
        halted_slot = None
        day[key]["slots"].add(label(s))
        stake = LADDER[rung]
        bets += 1; day[key]["b"] += 1
        if col[i] == col[i - 1]:
            pnl += stake; day[key]["pnl"] += stake
            wins += 1; day[key]["w"] += 1
            rung = 0
        else:
            pnl -= stake; day[key]["pnl"] -= stake
            rung += 1
            if rung >= len(LADDER):
                busts += 1; day[key]["busts"] += 1
                bust_log.append((d, label(s)))
                rung = 0
                halted_slot = s            # stop here until the next window
        if not carry and (i + 1 >= len(kl) or slot_of(kl[i + 1][0]) != s):
            rung = 0                       # variant:每 window starts fresh

    print(f"دورهٔ تست: {datetime.fromtimestamp(split, TEH):%Y-%m-%d} تا "
          f"{datetime.fromtimestamp(kl[-1][0], TEH):%Y-%m-%d} (تهران)")
    print(f"نردبان: {'/'.join(str(x) for x in LADDER)}  ·  هر حساب {ACCOUNT:,}$")
    print(f"بعد از انفجار تا بازهٔ بعدی دست نگه داشته می‌شود.\n")
    print(f"  {'روز':>11} {'بازه‌های انتخابی (بیشینه)':>34} {'شرط':>5} {'برد':>5} "
          f"{'انفجار':>7} {'رد‌شده':>7} {'سود روز':>10} {'تراز':>10}")
    bal = 0.0
    for k in sorted(day):
        r = day[k]; bal += r["pnl"]
        pk = "  ".join(f"{a}({b})" for a, b in picks[k])
        flag = " 💥" if r["busts"] else ""
        print(f"  {k:>11} {pk:>34} {r['b']:>5} {r['w']:>5} {r['busts']:>7}{flag} "
              f"{r['halt']:>7} {r['pnl']:>+9,.0f}$ {bal:>+9,.0f}$")

    print(f"\n  شرط‌ها: {bets:,}  ·  برد: {wins:,} ({wins/bets*100:.2f}%)  ·  "
          f"انفجار: {busts}")
    print(f"  سود/زیانِ خالص: {pnl:+,.0f}$")
    print(f"  سرمایهٔ لازم: {(busts+1):,} حساب × {ACCOUNT:,}$ = "
          f"{(busts+1)*ACCOUNT:,}$")
    if busts:
        print(f"\n  انفجارها:")
        for d, lab in bust_log:
            print(f"    {d:%Y-%m-%d %H:%M} تهران  در بازهٔ {lab}")

    # which slots got picked, and how often
    cnt = defaultdict(int)
    for v in picks.values():
        for a, _ in v:
            cnt[a] += 1
    print(f"\n  بازه‌ها چند روز انتخاب شدند:")
    for a, c in sorted(cnt.items(), key=lambda x: -x[1]):
        print(f"    {a:>14}  {c:>3} روز از {len(picks)}")


if __name__ == "__main__":
    main()
