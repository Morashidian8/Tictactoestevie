"""
Re-fetch the BTC 5-minute candle dataset used by docs/research/btc-5m-patterns.md.

Why this source: every exchange API (Binance, Coinbase, Kraken, OKX, Bybit,
CryptoCompare) is blocked by the agent sandbox's egress policy (403 on CONNECT),
but raw.githubusercontent.com is reachable. ff137/bitstamp-btcusd-minute-data
publishes daily-updated Bitstamp BTC/USD 1-minute OHLC data, which we aggregate
to 5-minute candles.

Output: btc5m.csv (t, iso, o, h, l, c, v) next to this script, unless --out is given.

    python3 research/btc5m/fetch_data.py [--out PATH]
"""

import argparse
import csv
import datetime
import os
import sys
import urllib.request

SRC = ("https://raw.githubusercontent.com/ff137/bitstamp-btcusd-minute-data/"
       "main/data/updates/btcusd_bitstamp_1min_latest.csv")
HERE = os.path.dirname(os.path.abspath(__file__))


def fetch_1m(url=SRC):
    """Download the 1-minute CSV and return rows as (ts, o, h, l, c, v)."""
    print(f"downloading {url} ...", file=sys.stderr)
    with urllib.request.urlopen(url, timeout=300) as r:
        text = r.read().decode()
    rows = []
    for x in csv.DictReader(text.splitlines()):
        rows.append((int(float(x["timestamp"])), float(x["open"]), float(x["high"]),
                     float(x["low"]), float(x["close"]), float(x["volume"])))
    rows.sort()
    print(f"  {len(rows):,} one-minute candles", file=sys.stderr)
    return rows


def to_5m(rows):
    """Aggregate 1-minute rows into 5-minute candles keyed on floor(ts/300)."""
    buck = {}
    for ts, o, h, l, c, v in rows:
        k = ts // 300 * 300
        b = buck.get(k)
        if b is None:
            buck[k] = [o, h, l, c, v, ts, ts]
        else:
            b[1] = max(b[1], h)
            b[2] = min(b[2], l)
            b[4] += v
            if ts < b[5]:
                b[5], b[0] = ts, o
            if ts > b[6]:
                b[6], b[3] = ts, c
    out = []
    for k in sorted(buck):
        o, h, l, c, v, _, _ = buck[k]
        out.append({"t": k, "o": o, "h": h, "l": l, "c": c, "v": v})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(HERE, "btc5m.csv"))
    args = ap.parse_args()

    c5 = to_5m(fetch_1m())
    gaps = sum(1 for i in range(1, len(c5)) if c5[i]["t"] - c5[i - 1]["t"] != 300)
    up = sum(1 for x in c5 if x["c"] > x["o"])
    dn = sum(1 for x in c5 if x["c"] < x["o"])
    fl = len(c5) - up - dn
    first = datetime.datetime.utcfromtimestamp(c5[0]["t"]).isoformat()
    last = datetime.datetime.utcfromtimestamp(c5[-1]["t"]).isoformat()

    with open(args.out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["t", "iso", "o", "h", "l", "c", "v"])
        for x in c5:
            w.writerow([x["t"], datetime.datetime.utcfromtimestamp(x["t"]).isoformat(),
                        x["o"], x["h"], x["l"], x["c"], x["v"]])

    print(f"5m candles : {len(c5):,}")
    print(f"range      : {first} -> {last}")
    print(f"gaps       : {gaps}")
    print(f"up/down/flat: {up/len(c5)*100:.2f}% / {dn/len(c5)*100:.2f}% / {fl/len(c5)*100:.3f}%")
    print(f"wrote      : {args.out}")


if __name__ == "__main__":
    main()
