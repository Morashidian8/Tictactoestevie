"""Analyze one Polymarket wallet's Bitcoin Up/Down trading.

Fetches the wallet's full activity, keeps only Bitcoin markets, groups trades
into positions (one per market/asset), replays everything through the FIFO PnL
engine for realized profit, then studies the wallet's habit of stacking several
positions on the SAME side (Up or Down) in a row:

  * chronological table of positions (side, stake, entry, result, PnL),
  * streaks (runs of consecutive same-side positions) with each streak's PnL,
  * alternation count, max streak, streak-length distribution,
  * totals: win rate, PnL by side, average per position.

Prints a human summary AND a single compact JSON line between
<<<JSON>>> ... <<<END>>> markers so the caller can render a full report.

Runs where Polymarket is reachable (GitHub Actions), not the dev sandbox.
"""

import os
import json
import time
from collections import Counter

from wallet_tracker.polymarket_client import PolymarketClient
from wallet_tracker.pnl import PnLEngine

ADDRESS = os.environ.get(
    "WATCH_ADDRESS", "0xb8ea51bd3b55e7105cd6ff351eeaf70d68f36240"
).strip().lower()


def _f(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _i(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def is_btc(row):
    t = " ".join(
        str(row.get(k) or "") for k in ("title", "slug", "eventSlug")
    ).lower()
    return "bitcoin" in t or "btc" in t


def _resilient_http_get():
    """HTTP getter that pages newest-first and stops gracefully instead of
    crashing when the Data API rejects a deep offset (400) — very active wallets
    exceed the /activity offset cap, so we take the most recent rows available.
    Returns [] on any non-200 / error, which makes the client's loop stop."""
    import requests
    session = requests.Session()

    def get(url, params):
        p = dict(params)
        if url.endswith("/activity"):
            p["sortDirection"] = "DESC"  # newest first, so a cap keeps recent data
        try:
            r = session.get(
                url, params=p, timeout=25,
                headers={"User-Agent": "wallet-analysis/1.0"},
            )
            if r.status_code != 200:
                print(f"  (API {r.status_code} at offset={p.get('offset')}; stopping pagination)")
                return []
            return r.json()
        except requests.RequestException as exc:
            print("  (fetch error, stopping pagination:", exc, ")")
            return []

    return get


def main():
    client = PolymarketClient(http_get=_resilient_http_get())
    activity = client.activity(ADDRESS)
    print(f"آدرس: {ADDRESS}")
    print(f"کل ردیف‌های فعالیت واکشی‌شده: {len(activity)}")

    # Realized PnL from the FIFO engine, keyed by the closing event's key —
    # which is the conditionId for REDEEM closes and the token asset for
    # SELL/MERGE closes (see PnLEngine). Both are looked up per position.
    realized_by_key = {}
    engine = PnLEngine().load(activity)
    for ev in engine.closing_events:
        if ev.kind == "REWARD":
            continue
        k = realized_by_key.setdefault(ev.asset, {"realized": 0.0, "last_ts": 0})
        k["realized"] += ev.realized
        k["last_ts"] = max(k["last_ts"], ev.timestamp)

    # BUY entries on Bitcoin markets, grouped into one position per market
    # (conditionId; falls back to the token asset when a row lacks it).
    positions = {}
    btc_rows = non_btc = 0
    for r in activity:
        if str(r.get("type", "")).upper() != "TRADE":
            continue
        if not is_btc(r):
            non_btc += 1
            continue
        if str(r.get("side", "")).upper() != "BUY":
            continue
        btc_rows += 1
        asset = str(r.get("asset") or "")
        cond = str(r.get("conditionId") or "") or asset
        ts = _i(r.get("timestamp"))
        p = positions.setdefault(cond, {
            "cond": cond, "assets": set(),
            "title": r.get("title") or r.get("slug") or "?",
            "side": r.get("outcome") or "?",
            "slug": r.get("eventSlug") or r.get("slug") or "",
            "staked": 0.0, "shares": 0.0, "first_ts": ts, "buys": 0,
        })
        if asset:
            p["assets"].add(asset)
        p["staked"] += abs(_f(r.get("usdcSize")))
        p["shares"] += abs(_f(r.get("size")))
        p["first_ts"] = min(p["first_ts"] or ts, ts)
        p["buys"] += 1

    pos = list(positions.values())
    for p in pos:
        keys = {p["cond"]} | p["assets"]
        p["realized"] = round(sum(realized_by_key.get(k, {}).get("realized", 0.0) for k in keys), 2)
        p["last_ts"] = max((realized_by_key.get(k, {}).get("last_ts", 0) for k in keys), default=0) or p["first_ts"]
        p["staked"] = round(p["staked"], 2)
        p["avg_price"] = round(p["staked"] / p["shares"], 4) if p["shares"] else None
        p["win"] = p["realized"] > 0
        del p["assets"]  # not JSON-serializable and not needed downstream
    pos.sort(key=lambda x: x["first_ts"])

    print(f"ترید BUY روی بیت‌کوین: {btc_rows} | پوزیشن‌های بیت‌کوینی (بازار مجزا): {len(pos)}")
    print(f"(تریدهای غیربیت‌کوین که رد شدند: {non_btc})")

    # --- Streaks of same-side positions (the stacking habit) ---
    streaks = []
    for p in pos:
        s = str(p["side"])
        if streaks and streaks[-1]["side"] == s:
            streaks[-1]["n"] += 1
            streaks[-1]["staked"] += p["staked"]
            streaks[-1]["realized"] += p["realized"]
            streaks[-1]["end_ts"] = p["last_ts"]
        else:
            streaks.append({"side": s, "n": 1, "staked": p["staked"],
                            "realized": p["realized"],
                            "start_ts": p["first_ts"], "end_ts": p["last_ts"]})
    for s in streaks:
        s["staked"] = round(s["staked"], 2)
        s["realized"] = round(s["realized"], 2)

    n = len(pos)
    wins = sum(1 for p in pos if p["win"])
    total_staked = round(sum(p["staked"] for p in pos), 2)
    total_realized = round(sum(p["realized"] for p in pos), 2)
    by_side = {}
    for p in pos:
        b = by_side.setdefault(str(p["side"]), {"n": 0, "staked": 0.0, "realized": 0.0, "wins": 0})
        b["n"] += 1
        b["staked"] += p["staked"]
        b["realized"] += p["realized"]
        b["wins"] += 1 if p["win"] else 0
    for b in by_side.values():
        b["staked"] = round(b["staked"], 2)
        b["realized"] = round(b["realized"], 2)

    streak_lens = Counter(s["n"] for s in streaks)
    max_streak = max((s["n"] for s in streaks), default=0)
    alternations = max(len(streaks) - 1, 0)

    summary = {
        "address": ADDRESS,
        "positions": n,
        "total_staked": total_staked,
        "total_realized": total_realized,
        "roi_pct": round(100 * total_realized / total_staked, 2) if total_staked else 0,
        "wins": wins,
        "win_rate_pct": round(100 * wins / n, 1) if n else 0,
        "by_side": by_side,
        "streaks_count": len(streaks),
        "alternations": alternations,
        "max_streak": max_streak,
        "streak_len_dist": sorted(streak_lens.items()),
    }

    print("\n===== خلاصه =====")
    print(json.dumps(summary, ensure_ascii=False, indent=2))

    print("\n===== رگه‌های هم‌جهت (به‌ترتیب زمان) =====")
    for i, s in enumerate(streaks, 1):
        print(f"{i:>3}. {s['side']:<5} × {s['n']:>2} | واریز {s['staked']:>9}$ | سود {s['realized']:>9}$")

    # Compact JSON for the caller to render a full report/table.
    payload = {"summary": summary, "streaks": streaks, "positions": [
        {"t": p["first_ts"], "title": p["title"], "side": p["side"],
         "staked": p["staked"], "avg": p["avg_price"], "realized": p["realized"],
         "win": p["win"], "slug": p["slug"]}
        for p in pos
    ]}
    print("\n<<<JSON>>>")
    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    print("<<<END>>>")


if __name__ == "__main__":
    main()
