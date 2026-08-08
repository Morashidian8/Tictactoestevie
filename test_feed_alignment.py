"""
Regression tests for the feed-mixing bug that produced a fabricated $47 move.

The failure it guards against, in the user's own numbers:

    bot        64,974.23 -> 65,000.01  = +$25.78  "win"
    Polymarket 64,975.11 -> 64,956.21  = -$18.90   loss

The reference prices agreed to within $0.88, so the live feed was fine. The
SETTLING price came from a Binance kline spliced into a Chainlink series by the
small-gap backfill, and Binance BTCUSDT sits tens of dollars above Chainlink
BTC/USD because USDT is not a dollar. That same splice invented a $47 jump in
the close series, which rule 5 read as an 8.6x stretch and signalled on.

Run:  python3 test_feed_alignment.py
"""

import importlib.util
import json
import os
import sys
import tempfile
import time

TMP = tempfile.mkdtemp()
os.environ.update({"TELEGRAM_TOKEN": "x", "TELEGRAM_CHAT_ID": "1"})
_spec = importlib.util.spec_from_file_location("bot", "bot.py")
bot = importlib.util.module_from_spec(_spec)
sys.modules["bot"] = bot
_spec.loader.exec_module(bot)
bot.log.setLevel(50)
bot.BreakoutMonitor.STATE_FILE = os.path.join(TMP, "state.json")
bot.send_message = lambda c, t: True

G = bot.GRANULARITY
OFFSET = 45.78          # Binance BTCUSDT above Chainlink BTC/USD, as measured

PASS, FAIL = [], []


def check(name, ok, detail=""):
    (PASS if ok else FAIL).append(name)
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"   {detail}" if detail else ""))


def chainlink_series(n, start, step=4.0):
    """A calm Chainlink series: small moves, exactly like the night in question."""
    return [start + step * ((i % 5) - 2) * 0.5 for i in range(n)]


def fresh(closes, last_window, pending=None, feed="chainlink"):
    m = bot.BreakoutMonitor("1")
    m.closes = list(closes)
    m.last_window = last_window
    m.pending = pending
    m.feed_used = feed
    m.feed_offset = None
    m.align_pending = False
    return m


def klines_binance(times, chain_prices):
    """What Binance would return for the same instants: everything +OFFSET."""
    return [(t, c + OFFSET) for t, c in zip(times, chain_prices)]


# --------------------------------------------------------------------------- 1
print("\n1. the exact reported failure: 1-window gap, bet open, Binance backfill")
now = int(time.time()) // G * G
hist = chainlink_series(130, 64950.0)
times = [now - (130 - i) * G for i in range(130)]
last_w = times[-1]
pend = {"bet": "up", "ref": hist[-1], "window": last_w + G,
        "rules": ["۵) کشیدگیِ ۴ کندلی"], "feed": "chainlink"}
m = fresh(hist, last_w, dict(pend))
m.signals = [{"t": last_w + G, "bet": "up", "rules": ["۵"], "won": None,
              "told": True}]
# the next two windows, on Chainlink, move only a few dollars
future_chain = [hist[-1] + 3.0, hist[-1] + 1.0]
future_times = [last_w + G, last_w + 2 * G]
allt, allc = times + future_times, hist + future_chain
m._fetch_klines = lambda limit: klines_binance(allt, allc)[-limit:]

before_max_move = max(abs(hist[i] - hist[i - 1]) for i in range(1, len(hist)))
m._backfill(1, until=last_w + G)
moves = [abs(m.closes[i] - m.closes[i - 1]) for i in range(1, len(m.closes))]
check("no phantom jump in the close series",
      max(moves) < before_max_move * 3,
      f"largest move ${max(moves):.2f} (was ${before_max_move:.2f} before)")
settled = m.signals[0]
check("the open bet settled against the aligned price",
      settled["won"] is True and abs(settled["settle"] - (hist[-1] + 3.0)) < 0.01,
      f"settle={settled.get('settle'):.2f} expected={hist[-1] + 3.0:.2f}")
check("settlement is NOT off by the feed offset",
      abs(settled["settle"] - (hist[-1] + 3.0 + OFFSET)) > 1.0)

# --------------------------------------------------------------------------- 2
print("\n2. the same backfill without alignment would have been wrong")
m2 = fresh(hist, last_w, dict(pend))
m2.signals = [{"t": last_w + G, "bet": "up", "rules": ["۵"], "won": None,
               "told": True}]
m2._fetch_klines = lambda limit: klines_binance(allt, allc)[-limit:]
m2._align_klines = lambda kl: (kl, 0.0)          # simulate the old behaviour
m2._backfill(1, until=last_w + G)
bad = m2.signals[0]
check("control: unaligned backfill DOES produce the reported error",
      abs(bad["delta"]) > 40,
      f"delta=${bad['delta']:+.2f} — this is the $25.78 the user saw")

# --------------------------------------------------------------------------- 3
print("\n3. no overlap to anchor on -> the bet is dropped, never mis-settled")
m3 = fresh(hist, last_w, dict(pend))
m3.signals = [{"t": last_w + G, "bet": "up", "rules": ["۵"], "won": None,
               "told": True}]
far = [(t + 10 ** 6, c + OFFSET) for t, c in zip(allt, allc)]
m3._fetch_klines = lambda limit: far[-limit:]
m3._backfill(1, until=last_w + G)
check("bet dropped rather than settled across feeds",
      m3.signals[0]["won"] is None and m3.pending is None)

# --------------------------------------------------------------------------- 4
print("\n4. a 6-hour outage aligns the whole rebuilt history")
gap = 72
big_times = [now - (200 - i) * G for i in range(200)]
big_chain = chainlink_series(200, 64950.0)
m4 = fresh(big_chain[:128], big_times[127])
m4._fetch_klines = lambda limit: klines_binance(big_times, big_chain)[-limit:]
m4.signals = []
m4._backfill(gap)
joins = [abs(m4.closes[i] - m4.closes[i - 1]) for i in range(1, len(m4.closes))]
check("rebuilt history has no seam", max(joins) < 25,
      f"largest move ${max(joins):.2f}")
check("rebuilt history sits at the live feed's level",
      abs(m4.closes[-1] - big_chain[-1]) < 0.01,
      f"{m4.closes[-1]:.2f} vs chainlink {big_chain[-1]:.2f}")

# --------------------------------------------------------------------------- 5
print("\n5. seeded (Binance) history is anchored by the first live sample")
m5 = bot.BreakoutMonitor("1")
m5.closes = [c + OFFSET for c in chainlink_series(130, 64950.0)]
m5.last_window = last_w - G
m5.align_pending = True
m5.feed_used = "chainlink"
m5.pending = None
m5.signals = []
live = chainlink_series(130, 64950.0)[-1] + 2.0
m5._fetch_klines = lambda limit: klines_binance(
    times + [last_w], chainlink_series(130, 64950.0) + [live])[-limit:]
m5._on_window_close(last_w, live)
seam = abs(m5.closes[-1] - m5.closes[-2])
check("no seam where the seed meets the live feed", seam < 25,
      f"seam ${seam:.2f} (would be ${OFFSET:.2f} unaligned)")
check("align_pending cleared", m5.align_pending is False)

# --------------------------------------------------------------------------- 6
print("\n6. a Binance FALLBACK sample is converted, not appended raw")
m6 = fresh(hist, last_w)
m6.signals = []
m6.feed_used = "binance-fallback"
m6._fetch_klines = lambda limit: klines_binance(allt, allc)[-limit:]
raw = hist[-1] + 3.0 + OFFSET            # what Binance would report
m6._on_window_close(last_w + G, raw)
check("fallback sample lands at the series' level",
      abs(m6.closes[-1] - (hist[-1] + 3.0)) < 0.5,
      f"stored {m6.closes[-1]:.2f}, chainlink truth {hist[-1] + 3.0:.2f}")
check("no phantom move from the fallback",
      abs(m6.closes[-1] - m6.closes[-2]) < 25)

# --------------------------------------------------------------------------- 7
print("\n7. an unconvertible fallback skips the window instead of corrupting it")
m7 = fresh(hist, last_w)
m7.signals = []
m7.feed_used = "binance-fallback"
m7._fetch_klines = lambda limit: []
n_before = len(m7.closes)
m7._on_window_close(last_w + G, hist[-1] + 3.0 + OFFSET)
check("window skipped, series untouched", len(m7.closes) == n_before)

# --------------------------------------------------------------------------- 8
print("\n8. the normal path is untouched when nothing foreign is involved")
m8 = fresh(hist, last_w)
m8.signals = []
m8._fetch_klines = lambda limit: klines_binance(allt, allc)[-limit:]
m8._on_window_close(last_w + G, hist[-1] + 3.0)
check("native sample stored verbatim",
      abs(m8.closes[-1] - (hist[-1] + 3.0)) < 1e-9)
check("no network call needed on the native path", m8.feed_offset is None)

# --------------------------------------------------------------------------- 9
print("\n9. BREAKOUT_FEED=binance: everything is one feed, nothing is shifted")
m9 = fresh([c + OFFSET for c in hist], last_w, feed="binance")
m9.signals = []
old_feed = bot.BREAKOUT_FEED
bot.BREAKOUT_FEED = "binance"
try:
    m9._fetch_klines = lambda limit: klines_binance(allt, allc)[-limit:]
    m9._on_window_close(last_w + G, hist[-1] + 3.0 + OFFSET)
    check("binance-native sample stored verbatim",
          abs(m9.closes[-1] - (hist[-1] + 3.0 + OFFSET)) < 1e-9)
finally:
    bot.BREAKOUT_FEED = old_feed

# ---------------------------------------------------------------------------



# =========================================================================== #
# Findings from the adversarial review, each with the repro that found it.
# =========================================================================== #
print("\n10. a failed anchor fetch must NOT let a native sample in unshifted")
m10 = bot.BreakoutMonitor("1")
chain = chainlink_series(130, 64950.0)
m10.closes = [c + OFFSET for c in chain]
m10.last_window = times[-1]
m10.align_pending = True
m10.feed_used = "chainlink"
m10.pending = None
m10.signals = []
m10._fetch_klines = lambda limit: []            # the fetch fails this window
n_before = len(m10.closes)
live1 = chain[-1] + 2.0
m10._on_window_close(times[-1] + G, live1)
check("window skipped while the anchor is unavailable",
      len(m10.closes) == n_before and m10.align_pending is True)

# now the fetch works, on the NEXT window
allt2 = times + [times[-1] + G, times[-1] + 2 * G]
allc2 = chain + [live1, chain[-1] + 4.0]
m10._fetch_klines = lambda limit: klines_binance(allt2, allc2)[-limit:]
m10._on_window_close(times[-1] + 2 * G, chain[-1] + 4.0)
mv10 = [abs(m10.closes[i] - m10.closes[i - 1]) for i in range(1, len(m10.closes))]
true_max = max(abs(chain[i] - chain[i - 1]) for i in range(1, len(chain)))
check("no double-shift once the anchor arrives",
      max(mv10) < true_max * 3,
      f"largest move ${max(mv10):.2f} (true max ${true_max:.2f})")
check("series ends at the live feed's level",
      abs(m10.closes[-1] - (chain[-1] + 4.0)) < 0.01,
      f"{m10.closes[-1]:.2f} vs truth {chain[-1] + 4.0:.2f}")

print("\n11. the fallback basis is re-measured, never reused from hours ago")
m11 = fresh(hist, last_w)
m11.signals = []
m11.feed_used = "binance-fallback"
m11.feed_offset = 26.00                          # a stale basis from hours ago
drifted = 46.00                                  # what it really is now
m11._fetch_klines = lambda limit: [(t, c + drifted) for t, c in zip(allt, allc)][-limit:]
m11._on_window_close(last_w + G, hist[-1] + 3.0 + drifted)
check("stale cached basis was not used",
      abs(m11.feed_offset - drifted) < 0.01,
      f"offset now {m11.feed_offset:.2f}, was 26.00")
check("converted sample lands at the live level",
      abs(m11.closes[-1] - (hist[-1] + 3.0)) < 0.5,
      f"{m11.closes[-1]:.2f} vs truth {hist[-1] + 3.0:.2f}")
check("no phantom move from a drifted basis",
      abs(m11.closes[-1] - m11.closes[-2]) < 25)

print("\n12. a fallback sample while the seed is still unanchored is refused")
m12 = bot.BreakoutMonitor("1")
m12.closes = [c + OFFSET for c in chain]
m12.last_window = times[-1]
m12.align_pending = True
m12.feed_used = "binance-fallback"
m12.pending = None
m12.signals = []
m12._fetch_klines = lambda limit: klines_binance(allt2, allc2)[-limit:]
n12 = len(m12.closes)
m12._on_window_close(times[-1] + G, chain[-1] + 2.0 + OFFSET)
check("window skipped, nothing appended", len(m12.closes) == n12)

print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
if FAIL:
    for f in FAIL:
        print("  FAILED:", f)
    sys.exit(1)
print("all green")
