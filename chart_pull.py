"""
Pull the complete 5-minute Polymarket BTC chart for the last N days.

The collector that already exists asks Polymarket for one window at a time,
which is right for keeping up with the present and hopeless for a month: 8,640
windows is 8,640 round trips. Gamma will answer a date RANGE in one request,
so a month comes back in a couple of hundred calls instead.

What it writes is the series the market actually settles on — each window's own
`startPrice` (the "price to beat") and `endPrice` (the "final price"). Every
accuracy figure in this project so far was computed on Binance or Chainlink
data; this is the only series that pays.

    python chart_pull.py 30           # last 30 days
    python chart_pull.py 30 --check   # report coverage, fetch nothing

Safe to interrupt and re-run: windows already in the file are never re-fetched.
"""

import csv
import os
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import polymarket_collector as pmc

OUT = os.environ.get("CHART_FILE", "polymarket_chart.csv")
COLS = ("window_epoch", "utc", "et", "beat", "final", "moved", "slug")
GRAN = pmc.GRAN
# Six hours is 72 of our markets. Small enough that paging rarely goes past the
# first page, large enough that a month is a couple of hundred requests.
CHUNK = 6 * 3600
PAGE = 500


def load_existing():
    have = {}
    if not os.path.exists(OUT):
        return have
    with open(OUT, newline="") as f:
        for r in csv.DictReader(f):
            try:
                have[int(r["window_epoch"])] = r
            except (KeyError, TypeError, ValueError):
                continue
    return have


def fetch_range(lo, hi, seen_keys=[]):
    """Every market whose window ENDS in [lo, hi), paged until exhausted."""
    out, offset = [], 0
    while True:
        try:
            rows = pmc.get(f"{pmc.GAMMA}/markets", limit=PAGE, offset=offset,
                           order="endDate", ascending="true",
                           end_date_min=pmc._iso(lo), end_date_max=pmc._iso(hi))
        except Exception as exc:
            print(f"    ! request failed at offset {offset}: {exc}")
            return out
        if not rows:
            break
        if not seen_keys:
            # Printed once so a renamed field is caught by evidence rather than
            # discovered as a month of empty rows.
            seen_keys.append(1)
            print(f"    (market fields: {sorted(rows[0])[:12]} …)")
        out.extend(rows)
        if len(rows) < PAGE:
            break
        offset += PAGE
        if offset > 20 * PAGE:            # a range this dense is not ours
            break
    return out


def window_of(m):
    """
    The five-minute window this market belongs to, or None.

    Checked by rebuilding the slug from the candidate window and demanding it
    match. That single test rejects the 15-minute markets, the hourly ones and
    anything merely adjacent in time — the alternative, trusting endDate minus
    300, would happily accept a 15-minute market's last five minutes.
    """
    end = m.get("endDate") or m.get("end_date_iso")
    if not end:
        return None
    try:
        ts = datetime.fromisoformat(str(end).replace("Z", "+00:00")).timestamp()
    except (ValueError, TypeError):
        return None
    w = int(ts) // GRAN * GRAN - GRAN
    slug = (m.get("slug") or "").lower()
    return w if slug and slug == pmc._slug_for(w) else None


def main():
    days = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 30
    check_only = "--check" in sys.argv
    now = int(time.time()) // GRAN * GRAN
    start = now - days * 86400
    want = list(range(start, now, GRAN))
    have = load_existing()

    print(f"range   : {datetime.fromtimestamp(start, timezone.utc):%Y-%m-%d %H:%M} "
          f"→ {datetime.fromtimestamp(now, timezone.utc):%Y-%m-%d %H:%M} UTC")
    print(f"windows : {len(want):,} expected · {len(have):,} already on disk")

    if check_only:
        report(want, have)
        return

    new = not os.path.exists(OUT) or os.path.getsize(OUT) == 0
    f = open(OUT, "a", newline="")
    w = csv.DictWriter(f, fieldnames=COLS, extrasaction="ignore")
    if new:
        w.writeheader()

    added = skipped = 0
    chunks = list(range(start, now, CHUNK))
    for i, lo in enumerate(chunks, 1):
        hi = min(lo + CHUNK, now)
        if all(t in have for t in range(lo, hi, GRAN)):
            skipped += 1
            continue
        rows = fetch_range(lo + GRAN, hi + GRAN)   # ranges are on END times
        got = 0
        for m in rows:
            t = window_of(m)
            if t is None or t in have or not (start <= t < now):
                continue
            beat, final = m.get("startPrice"), m.get("endPrice")
            try:
                b, fl = float(beat), float(final)
            except (TypeError, ValueError):
                continue
            if b <= 0 or fl <= 0:
                continue
            have[t] = 1
            w.writerow({"window_epoch": t,
                        "utc": datetime.fromtimestamp(t, timezone.utc)
                                       .strftime("%Y-%m-%d %H:%M"),
                        "et": datetime.fromtimestamp(t, pmc.ET)
                                      .strftime("%Y-%m-%d %I:%M%p"),
                        "beat": f"{b:.2f}", "final": f"{fl:.2f}",
                        "moved": f"{fl - b:+.2f}", "slug": m.get("slug", "")[:60]})
            got += 1
            added += 1
        f.flush()
        print(f"[{i:>3}/{len(chunks)}] "
              f"{datetime.fromtimestamp(lo, timezone.utc):%m-%d %H:%M}  "
              f"{len(rows):>4} markets → {got:>3} windows   (total {added:,})")
    f.close()
    print(f"\ndone: {added:,} new windows, {skipped} chunks already complete")
    report(want, load_existing())


def report(want, have):
    got = [t for t in want if t in have]
    miss = [t for t in want if t not in have]
    print(f"\ncoverage: {len(got):,}/{len(want):,} = {len(got)/len(want)*100:.2f}%")
    if not miss:
        print("NO GAPS — every 5-minute window is present.")
        return
    runs, s, p = [], miss[0], miss[0]
    for t in miss[1:]:
        if t - p == GRAN:
            p = t
        else:
            runs.append((s, p)); s = p = t
    runs.append((s, p))
    runs.sort(key=lambda r: r[1] - r[0], reverse=True)
    print(f"missing : {len(miss):,} windows in {len(runs):,} gaps")
    for a, b in runs[:10]:
        n = (b - a) // GRAN + 1
        print(f"  {datetime.fromtimestamp(a, timezone.utc):%m-%d %H:%M} → "
              f"{datetime.fromtimestamp(b + GRAN, timezone.utc):%m-%d %H:%M} UTC"
              f"   {n} window(s)")
    if len(runs) > 10:
        print(f"  … and {len(runs)-10} more gaps")
    print("\nRe-run this script to retry the gaps; nothing already saved is refetched.")


if __name__ == "__main__":
    main()
