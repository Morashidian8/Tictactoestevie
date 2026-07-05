"""Forensic per-position analysis of a Polymarket wallet's BTC Up/Down trading.

For EVERY position it determines, definitively:
  * how it was closed — early SELL, REDEEM at settlement, or never redeemed,
  * the market's REAL resolved outcome (from Polymarket Gamma) for the ones the
    wallet never redeemed, so unclaimed wins and abandoned losers are both booked,
  * the true PnL (settled cash from the FIFO engine for sold/redeemed positions;
    mark-to-resolution for the rest).

This reveals the thing naive on-chain PnL misses: a trader who redeems winners
but abandons losers looks wildly profitable until you value the abandoned losers.

Prints a summary + compact JSON between <<<JSON>>>/<<<END>>>. Runs in CI where
Polymarket is reachable.
"""

import os
import json
import time
from collections import defaultdict

import requests

from wallet_tracker.polymarket_client import PolymarketClient
from wallet_tracker.pnl import PnLEngine
from bot import GAMMA_URL, _poly_event_direction

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
    t = " ".join(str(row.get(k) or "") for k in ("title", "slug", "eventSlug")).lower()
    return "bitcoin" in t or "btc" in t


def resilient_get():
    session = requests.Session()

    def get(url, params):
        p = dict(params)
        if url.endswith("/activity"):
            p["sortDirection"] = "DESC"
        try:
            r = session.get(url, params=p, timeout=25,
                            headers={"User-Agent": "wallet-deep/1.0"})
            if r.status_code != 200:
                print(f"  (activity API {r.status_code} at offset={p.get('offset')}; stop)")
                return []
            return r.json()
        except requests.RequestException as exc:
            print("  (activity fetch error, stop:", exc, ")")
            return []

    return get


_res_cache = {}
_res_session = requests.Session()


def resolve_outcome(slug):
    """+1 Up / -1 Down / None (unresolved/unknown), cached by slug."""
    if not slug:
        return None
    if slug in _res_cache:
        return _res_cache[slug]
    out = None
    try:
        r = _res_session.get(GAMMA_URL, params={"slug": slug}, timeout=15,
                             headers={"User-Agent": "wallet-deep/1.0"})
        if r.status_code == 200:
            out = _poly_event_direction(r.json())
    except requests.RequestException:
        out = None
    _res_cache[slug] = out
    return out


def main():
    client = PolymarketClient(http_get=resilient_get())
    activity = client.activity(ADDRESS)
    print(f"آدرس: {ADDRESS} | ردیف فعالیت: {len(activity)}")

    engine = PnLEngine().load(activity)
    realized_by_key = defaultdict(float)
    for ev in engine.closing_events:
        if ev.kind != "REWARD":
            realized_by_key[ev.asset] += ev.realized

    # Pass 1: BTC BUY trades -> positions (per conditionId). Build asset+cond
    # indexes so the closing rows (which often lack a title) can be matched.
    P = {}
    asset2cond = {}
    for r in activity:
        if str(r.get("type", "")).upper() != "TRADE":
            continue
        if str(r.get("side", "")).upper() != "BUY":
            continue
        if not is_btc(r):
            continue
        asset = str(r.get("asset") or "")
        cond = str(r.get("conditionId") or "") or asset
        p = P.setdefault(cond, _blank(cond, r))
        if asset:
            p["assets"].add(asset)
            asset2cond[asset] = cond
        p["staked"] += abs(_f(r.get("usdcSize")))
        p["shares"] += abs(_f(r.get("size")))
        p["first_ts"] = min(p["first_ts"] or _i(r.get("timestamp")), _i(r.get("timestamp")))

    # Pass 2: match SELL / REDEEM to a known position by conditionId or asset —
    # NOT by title (redeem rows carry neither title nor a usable asset).
    for r in activity:
        typ = str(r.get("type", "")).upper()
        side = str(r.get("side", "")).upper()
        asset = str(r.get("asset") or "")
        cond = str(r.get("conditionId") or "")
        p = P.get(cond) or P.get(asset2cond.get(asset, ""))
        if not p:
            continue
        if typ == "TRADE" and side == "SELL":
            p["sold_usd"] += abs(_f(r.get("usdcSize")))
            p["has_sell"] = True
        elif typ == "REDEEM":
            p["redeem_usd"] += abs(_f(r.get("usdcSize")))
            p["has_redeem"] = True

    positions = sorted(P.values(), key=lambda x: x["first_ts"])
    maxt = max((p["first_ts"] for p in positions), default=0)
    open_cut = maxt - 900  # last 15 min may be unresolved

    need = [p for p in positions if not p["has_sell"] and not p["has_redeem"]]
    print(f"پوزیشن‌ها: {len(positions)} | نیازمندِ resolve از Gamma: {len(need)}")

    resolved_n = 0
    for i, p in enumerate(positions):
        keys = {p["cond"]} | p["assets"]
        p["settled_pnl"] = round(sum(realized_by_key.get(k, 0.0) for k in keys), 2)
        won = None
        if p["has_sell"] and not p["has_redeem"]:
            p["close"] = "فروش زودهنگام"
            p["true_pnl"] = p["settled_pnl"]
            won = p["settled_pnl"] > 0
        elif p["has_redeem"]:
            p["close"] = "برداشت"
            p["true_pnl"] = p["settled_pnl"]
            won = p["redeem_usd"] > 0.0001
        else:
            # Never sold, never redeemed -> use the real market resolution.
            if p["first_ts"] >= open_cut:
                p["close"] = "باز"
                p["true_pnl"] = 0.0
                p["status"] = "open"
                p["outcome"] = None
                continue
            oc = resolve_outcome(p["slug"])
            resolved_n += 1
            if resolved_n % 200 == 0:
                print(f"  ...resolve {resolved_n}/{len(need)}")
            time.sleep(0.04)
            p["outcome"] = {1: "Up", -1: "Down"}.get(oc)
            if oc is None:
                p["close"] = "باز/نامشخص"
                p["true_pnl"] = 0.0
                p["status"] = "open"
                continue
            won = (p["side"] == "Up" and oc == 1) or (p["side"] == "Down" and oc == -1)
            if won:
                p["close"] = "برداشت‌نشده (برنده)"
                p["true_pnl"] = round(p["shares"] - p["staked"], 2)  # unclaimed $1/share
            else:
                p["close"] = "برداشت‌نشده (بازنده)"
                p["true_pnl"] = round(-p["staked"], 2)
        p["status"] = "win" if won else "loss"
        if "outcome" not in p:
            p["outcome"] = None

    # ---- aggregates ----
    agg = defaultdict(lambda: {"n": 0, "pnl": 0.0, "win": 0, "staked": 0.0})
    tot_true = tot_staked = 0.0
    n_win = n_loss = n_open = 0
    for p in positions:
        st = p.get("status")
        a = agg[p["close"]]
        a["n"] += 1
        a["pnl"] += p["true_pnl"]
        a["staked"] += p["staked"]
        a["win"] += 1 if st == "win" else 0
        tot_staked += p["staked"]
        if st == "open":
            n_open += 1
        else:
            tot_true += p["true_pnl"]
            if st == "win":
                n_win += 1
            else:
                n_loss += 1

    # naive on-chain PnL = only what the engine settled (sold + redeemed)
    naive = round(sum(p["settled_pnl"] for p in positions
                      if p["close"] in ("برداشت", "فروش زودهنگام")), 2)
    unclaimed_win = agg["برداشت‌نشده (برنده)"]
    abandoned_loss = agg["برداشت‌نشده (بازنده)"]

    summary = {
        "address": ADDRESS, "positions": len(positions),
        "win": n_win, "loss": n_loss, "open": n_open,
        "win_rate_pct": round(100 * n_win / max(n_win + n_loss, 1), 1),
        "total_staked": round(tot_staked, 2),
        "true_net_pnl": round(tot_true, 2),
        "true_roi_pct": round(100 * tot_true / tot_staked, 2) if tot_staked else 0,
        "naive_settled_pnl": naive,
        "unclaimed_wins": {"n": unclaimed_win["n"], "left_on_table": round(unclaimed_win["pnl"], 2)},
        "abandoned_losses": {"n": abandoned_loss["n"], "total": round(abandoned_loss["pnl"], 2)},
        "by_close": {k: {"n": v["n"], "pnl": round(v["pnl"], 2),
                         "win_rate": round(100 * v["win"] / v["n"]) if v["n"] else 0}
                     for k, v in agg.items()},
    }

    print("\n===== خلاصهٔ فارنزیک =====")
    print(json.dumps(summary, ensure_ascii=False, indent=2))

    payload = {"summary": summary, "positions": [
        {"t": p["first_ts"], "side": p["side"], "staked": round(p["staked"], 2),
         "shares": round(p["shares"], 2), "avg": round(p["staked"] / p["shares"], 4) if p["shares"] else None,
         "close": p["close"], "outcome": p.get("outcome"), "status": p.get("status"),
         "settled": p["settled_pnl"], "true": p["true_pnl"],
         "title": p["title"], "slug": p["slug"]}
        for p in positions]}
    print("\n<<<JSON>>>")
    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    print("<<<END>>>")


def _blank(cond, r):
    return {"cond": cond, "assets": set(),
            "title": r.get("title") or r.get("slug") or "?",
            "side": r.get("outcome") or "?",
            "slug": r.get("eventSlug") or r.get("slug") or "",
            "staked": 0.0, "shares": 0.0, "first_ts": _i(r.get("timestamp")),
            "sold_usd": 0.0, "redeem_usd": 0.0, "has_sell": False, "has_redeem": False}


if __name__ == "__main__":
    main()
