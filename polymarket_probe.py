#!/usr/bin/env python3
"""
Find out how to read the BTC "Up or Down 5m" market price from a phone.

Why this exists: every accuracy number in this project is measured against a
50-50 baseline, because no Polymarket order-book data has ever been collected.
That makes "would betting the favourite work?" unanswerable — and it is the
single biggest hole in the whole body of work. Filling it needs one thing: a
way to read the quoted price for the window that is about to open.

Polymarket is unreachable from the machine this was written on, so instead of
guessing an endpoint and shipping code that cannot work, this probes several
and prints exactly what came back. Run it on the phone, paste the output back,
and the collector gets written against reality instead of a guess.

    python polymarket_probe.py

Nothing is sent anywhere and nothing is stored; it only reads public endpoints.
"""

import json
import sys
import time

try:
    import requests
except ImportError:
    sys.exit("requests is missing:  pip install requests")

TIMEOUT = 20
UA = {"User-Agent": "Mozilla/5.0 (Android) btc-probe/1.0"}


def show(title, ok, detail):
    mark = "✅" if ok else "❌"
    print(f"\n{mark} {title}\n   {detail}")


def get(url, **kw):
    r = requests.get(url, timeout=TIMEOUT, headers=UA, **kw)
    r.raise_for_status()
    return r.json()


def probe_gamma_search():
    """The public Gamma API — the one the website itself reads."""
    url = "https://gamma-api.polymarket.com/events"
    params = {"closed": "false", "limit": 200, "order": "endDate",
              "ascending": "true"}
    try:
        data = get(url, params=params)
    except Exception as exc:
        show("gamma-api /events", False, f"{type(exc).__name__}: {str(exc)[:200]}")
        return None
    hits = [e for e in data
            if "up or down" in (e.get("title") or "").lower()
            and "bitcoin" in (e.get("title") or "").lower()]
    show("gamma-api /events", True,
         f"{len(data)} رویداد برگشت، {len(hits)} تای آن «Bitcoin Up or Down» است")
    for e in hits[:4]:
        print(f"     • title : {e.get('title')}")
        print(f"       slug  : {e.get('slug')}")
        print(f"       end   : {e.get('endDate')}")
        for m in (e.get("markets") or [])[:1]:
            print(f"       market: id={m.get('id')} question={m.get('question')}")
            print(f"       tokens: {str(m.get('clobTokenIds'))[:120]}")
            print(f"       prices: outcomes={m.get('outcomes')} "
                  f"prices={m.get('outcomePrices')}")
    return hits


def probe_clob_price(token_id):
    """Live best bid/ask for one outcome token."""
    for path, params in (("price", {"token_id": token_id, "side": "buy"}),
                         ("book", {"token_id": token_id})):
        try:
            data = get(f"https://clob.polymarket.com/{path}", params=params)
            show(f"clob /{path}", True, json.dumps(data)[:300])
        except Exception as exc:
            show(f"clob /{path}", False,
                 f"{type(exc).__name__}: {str(exc)[:200]}")


def main():
    print("=" * 64)
    print("بررسیِ دسترسی به قیمت‌های پلی‌مارکت")
    print(f"زمانِ اجرا: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 64)

    try:
        get("https://gamma-api.polymarket.com/events", params={"limit": 1})
        show("اتصالِ پایه به پلی‌مارکت", True, "برقرار است")
    except Exception as exc:
        show("اتصالِ پایه به پلی‌مارکت", False,
             f"{type(exc).__name__}: {str(exc)[:200]}")
        print("\n⚠️  اگر اینجا شکست خورد، یعنی فیلترینگ یا شبکه اجازه نمی‌دهد.")
        print("    با VPN دوباره امتحان کن — بدونِ این دسترسی، جمع‌آوریِ قیمت")
        print("    از روی گوشی ممکن نیست و باید راهِ دیگری پیدا کنیم.")
        return

    hits = probe_gamma_search()
    if hits:
        toks = None
        for e in hits:
            for m in (e.get("markets") or []):
                raw = m.get("clobTokenIds")
                if raw:
                    toks = json.loads(raw) if isinstance(raw, str) else raw
                    break
            if toks:
                break
        if toks:
            print(f"\n--- قیمتِ زندهٔ توکنِ اول ({toks[0][:20]}…) ---")
            probe_clob_price(toks[0])
    else:
        print("\n⚠️  هیچ بازارِ «Bitcoin Up or Down» در فهرست نبود.")
        print("    لینکِ کاملِ یکی از بازارها را از مرورگر کپی کن و بفرست —")
        print("    از روی slug می‌شود مستقیم آدرس‌دهی کرد.")

    print("\n" + "=" * 64)
    print("کلِ خروجیِ بالا را کپی کن و بفرست.")
    print("=" * 64)


if __name__ == "__main__":
    main()
