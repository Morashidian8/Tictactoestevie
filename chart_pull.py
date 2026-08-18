"""
Pull the complete 5-minute Polymarket BTC chart for the last N days.

The collector that already exists asks Polymarket for one window at a time,
which is right for keeping up with the present and hopeless for a month: 8,640
windows is 8,640 round trips. Gamma will answer a date RANGE in one request,
so a month comes back in a couple of hundred calls instead.

What it writes is the OUTCOME of every window — which side Polymarket actually
paid. It no longer publishes the settlement prices themselves (`startPrice` and
`endPrice` came back empty on every market checked), so the price series still
has to come from an exchange feed. The outcome is the more valuable half
anyway: it is the ground truth any rule can be scored against, straight from
the venue that paid.

    python chart_pull.py 30           # last 30 days
    python chart_pull.py 30 --check   # report coverage, fetch nothing

Safe to interrupt and re-run: windows already in the file are never re-fetched.
"""

import csv
import os
import re
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import polymarket_collector as pmc

OUT = os.environ.get("CHART_FILE", "polymarket_chart.csv")
COLS = ("window_epoch", "utc", "et", "winner", "asset", "slug", "question")
GRAN = pmc.GRAN
# Six hours is 72 of our markets. Small enough that paging rarely goes past the
# first page, large enough that a month is a couple of hundred requests.
CHUNK = 6 * 3600
# Gamma caps a page at 100 whatever you ask for. Requesting 500 and then
# stopping because "fewer than 500 came back" meant the first page was always
# also the last: every chunk silently returned at most 100 of its markets.
PAGE = 100


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
            # closed=true is not optional: without it this range returns 100
            # markets and none of ours, because every past window is closed.
            rows = pmc.get(f"{pmc.GAMMA}/markets", limit=PAGE, offset=offset,
                           order="endDate", ascending="true", closed="true",
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


_SLUG = re.compile(r"^([a-z0-9]+)-updown-5m-(\d{9,11})$")
ASSET = os.environ.get("ASSET", "btc").lower()


def parse_market(m):
    """
    (window_start, asset, winner) for a 5-minute up/down market, else None.

    Polymarket renamed these: the slug is now "<asset>-updown-5m-<epoch>" and
    the epoch IS the window's opening second, which makes the alignment exact
    and the old title-parsing unnecessary. Confirmed against a live market —
    slug hype-updown-5m-1786901700 carries the title "1:35PM-1:40PM ET", and
    1786901700 is 1:35PM ET to the second.

    The winner comes from outcomePrices, which settles to ["1","0"] or ["0","1"]
    once resolved. An unresolved market has neither and is skipped rather than
    guessed at.
    """
    hit = _SLUG.match((m.get("slug") or "").lower())
    if not hit:
        return None
    asset, epoch = hit.group(1), int(hit.group(2))
    if epoch % GRAN:
        return None
    outs = [str(o).lower() for o in pmc._jload(m.get("outcomes"), [])]
    try:
        prices = [float(p) for p in pmc._jload(m.get("outcomePrices"), [])]
    except (TypeError, ValueError):
        return None
    if len(prices) != len(outs) or not prices or max(prices) < 0.99:
        return None                       # not resolved yet
    return epoch, asset, outs[prices.index(max(prices))]


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
    shown = []
    chunks = list(range(start, now, CHUNK))
    for i, lo in enumerate(chunks, 1):
        hi = min(lo + CHUNK, now)
        if all(t in have for t in range(lo, hi, GRAN)):
            skipped += 1
            continue
        rows = fetch_range(lo, hi + GRAN)
        got = 0
        for m in rows:
            p = parse_market(m)
            if not p:
                continue
            t, asset, winner = p
            if asset != ASSET or t in have or not (start <= t < now):
                continue
            have[t] = 1
            w.writerow({"window_epoch": t,
                        "utc": datetime.fromtimestamp(t, timezone.utc)
                                       .strftime("%Y-%m-%d %H:%M"),
                        "et": datetime.fromtimestamp(t, pmc.ET)
                                      .strftime("%Y-%m-%d %I:%M%p"),
                        "winner": winner, "asset": asset,
                        "slug": (m.get("slug") or "")[:40],
                        "question": (m.get("question") or "")[:70]})
            got += 1
            added += 1
        f.flush()
        if rows and not got and not shown:
            # A chunk with markets but no matches means the shape moved again.
            # Print the evidence once, here, rather than making someone run the
            # whole thing a second time to find out why it produced nothing.
            shown.append(1)
            print(f"    ! nothing matched ASSET={ASSET!r}. what came back:")
            seen = {}
            for m in rows:
                hit = _SLUG.match((m.get("slug") or "").lower())
                if hit:
                    seen[hit.group(1)] = seen.get(hit.group(1), 0) + 1
            print(f"      5m up/down assets present: {seen or 'none at all'}")
            for m in rows[:2]:
                print(f"      e.g. slug={m.get('slug')!r}")
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




def probe():
    """
    Ask one known window four different ways and report which answers.

    Written because two rounds of guessing produced two rounds of zeros. The
    bulk range query returns markets — wildly varying counts of them — but none
    of ours, and from the outside there is no way to tell whether the range
    filter excludes closed markets, whether it means something other than the
    settlement time, or whether the title test is at fault. Each hypothesis is
    one request, so all of them get asked at once.
    """
    import json
    w = int(time.time()) // GRAN * GRAN - 2 * 86400
    end = w + GRAN
    slug = pmc._slug_for(w)
    print(f"probe window : {datetime.fromtimestamp(w, timezone.utc):%Y-%m-%d %H:%M} UTC")
    print(f"expected slug: {slug}\n")

    tries = [
        ("A  slug exact",
         dict(slug=slug)),
        ("B  narrow range (what the live collector uses)",
         dict(limit=100, order="endDate", ascending="true",
              end_date_min=pmc._iso(end - 90), end_date_max=pmc._iso(end + 90))),
        ("C  narrow range + closed=true",
         dict(limit=100, order="endDate", ascending="true", closed="true",
              end_date_min=pmc._iso(end - 90), end_date_max=pmc._iso(end + 90))),
        ("D  six-hour range (what the bulk pull uses)",
         dict(limit=100, order="endDate", ascending="true",
              end_date_min=pmc._iso(end), end_date_max=pmc._iso(end + 6 * 3600))),
        ("E  six-hour range + closed=true",
         dict(limit=100, order="endDate", ascending="true", closed="true",
              end_date_min=pmc._iso(end), end_date_max=pmc._iso(end + 6 * 3600))),
    ]
    for label, params in tries:
        try:
            rows = pmc.get(f"{pmc.GAMMA}/markets", **params)
        except Exception as exc:
            print(f"{label}: request failed — {exc}")
            continue
        rows = rows if isinstance(rows, list) else []
        ours = [m for m in rows if window_of(m) is not None]
        print(f"{label}: {len(rows)} markets, {len(ours)} of ours")
        if rows and not ours:
            m = rows[0]
            print(f"      e.g. slug={m.get('slug')!r}")
            print(f"           title={(m.get('question') or m.get('title'))!r}")
            print(f"           endDate={m.get('endDate')!r} "
                  f"startPrice={m.get('startPrice')!r} endPrice={m.get('endPrice')!r}")
        if ours:
            m = ours[0]
            print(f"      ✅ {m.get('slug')}  "
                  f"start={m.get('startPrice')} end={m.get('endPrice')}")

    # C and E proved the shape moved: closed=true is required, and the slug is
    # now "<asset>-updown-5m-<epoch>". What is still unknown is which asset
    # prefix is Bitcoin's and where the settlement prices went, so dump one
    # whole market rather than guess at field names a third time.
    print("\n" + "=" * 60)
    try:
        rows = pmc.get(f"{pmc.GAMMA}/markets", limit=100, order="endDate",
                       ascending="true", closed="true",
                       end_date_min=pmc._iso(end - 90),
                       end_date_max=pmc._iso(end + 90))
    except Exception as exc:
        rows = []
        print(f"listing failed: {exc}")
    fives = [m for m in rows if "updown-5m" in (m.get("slug") or "")]
    print(f"5-minute markets ending at this instant: {len(fives)}")
    for m in fives:
        print(f"  {m.get('slug')}   |  {(m.get('question') or '')[:60]}")
    if fives:
        pick = next((m for m in fives
                     if "btc" in (m.get("slug") or "").lower()
                     or "bitcoin" in (m.get("question") or "").lower()), fives[0])
        print(f"\nfull object for {pick.get('slug')}:")
        for k in sorted(pick):
            v = pick[k]
            v = v if len(str(v)) < 90 else str(v)[:87] + "..."
            print(f"  {k:<26} = {v!r}")

    # And the one the live path actually uses, end to end.
    m = pmc.market_for(w)
    print(f"\nF  pmc.market_for(): {'found' if m else 'nothing'}")
    if m:
        print(f"      slug={m.get('slug')!r}")
        print(f"      title={(m.get('question') or '')!r}")
        print(f"      endDate={m.get('endDate')!r}")
        print(f"      startPrice={m.get('startPrice')!r} endPrice={m.get('endPrice')!r}")
        print(f"      window_of() -> {window_of(m)}  (expected {w})")
        print(f"      all keys: {sorted(m)}")


if __name__ == "__main__":
    if "--probe" in sys.argv:
        probe()
    else:
        main()
