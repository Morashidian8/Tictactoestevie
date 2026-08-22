"""
Watch the wallets that survived the screen, and shout when several of them take
the same side at the same time.

One wallet moving is an opinion. Several of them landing on one side inside the
same five-minute window is the only thing in this whole line of work that looks
like information rather than noise — so that, and nothing quieter, is what
raises an alarm.

    python whale_watch.py                 # run forever, one window at a time
    python whale_watch.py --once          # a single window, then stop
    python whale_watch.py --test          # replay a past window: proves the
                                          # whole path works without waiting
    python whale_watch.py --list          # who is being followed, and why
    python whale_watch.py --status        # is it running? has it ever fired?

Reads whale_follow.csv, which `whale_hunt.py --analyze` writes. Sends to the
same Telegram chat and the same ntfy topic the bot uses, and touches neither
the bot nor its files.

THE TIMING PROBLEM, STATED PLAINLY

These wallets enter at a median of 192 seconds into a 300-second window. By the
time an alert reaches a phone there is on the order of a minute and a half
left, and the price has already moved toward them — that is what their buying
does. This tool reports what they did; whether that is still tradeable when it
reaches you is a separate question, and the alert carries the seconds remaining
and the price they paid so the answer is visible rather than assumed.
"""

import csv
import os
import sys
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import requests

os.environ.setdefault("TELEGRAM_TOKEN", "x")
import polymarket_collector as pmc

HERE = os.path.dirname(os.path.abspath(__file__))
FOLLOW_FILE = os.environ.get("FOLLOW_FILE", "whale_follow.csv")
SEEN_FILE = os.environ.get("FOLLOW_SEEN", ".whale_watch_seen")
BEAT_FILE = os.environ.get("FOLLOW_BEAT", ".whale_watch_beat")
DATA = "https://data-api.polymarket.com"
UA = {"User-Agent": "btc-whale-watch/1.0"}
GRAN = 300
TEHRAN = timezone(timedelta(hours=3, minutes=30))

# How many followed wallets must land on one side before this is worth a noise.
MIN_AGREE = int(os.environ.get("FOLLOW_MIN_AGREE", "3"))
# And how much they must have put behind it, in dollars of cost.
MIN_SIZE = float(os.environ.get("FOLLOW_MIN_SIZE", "200"))
# Seconds between polls inside a window. The window is 300s and they arrive
# late, so this is the difference between an alert and a post-mortem.
POLL = int(os.environ.get("FOLLOW_POLL", "20"))
NTFY = os.environ.get("NTFY_TOPIC", "").strip()


def cred(name):
    """From the environment, else from .env — without executing .env."""
    v = os.environ.get(name, "").strip()
    if v and v != "x":
        return v
    try:
        with open(os.path.join(HERE, ".env")) as f:
            for line in f:
                if line.startswith(f"{name}="):
                    return line.split("=", 1)[1].strip().strip("'\"")
    except OSError:
        pass
    return ""


def tg(text):
    tok, chat = cred("TELEGRAM_TOKEN"), cred("TELEGRAM_CHAT_ID")
    if not tok or not chat:
        print("  (no telegram credentials — printing only)")
        return False
    try:
        r = requests.post(f"https://api.telegram.org/bot{tok}/sendMessage",
                          timeout=20,
                          data={"chat_id": chat, "text": text,
                                "parse_mode": "HTML",
                                "disable_web_page_preview": "true"})
        if not r.ok:
            print(f"  telegram said: {r.text[:200]}")
        return r.ok
    except Exception as exc:  # noqa: BLE001
        print(f"  telegram failed: {exc}")
        return False


def ntfy(title, body):
    topic = NTFY or cred("NTFY_TOPIC")
    if not topic:
        return
    try:
        requests.post(f"https://ntfy.sh/{topic}", timeout=10,
                      data=body.encode(),
                      headers={"Title": title, "Priority": "high",
                               "Tags": "whale"})
    except Exception:  # noqa: BLE001
        pass


# --------------------------------------------------------------------------- #
def load_follow():
    """The wallets to watch, with the numbers that earned them the place."""
    path = FOLLOW_FILE if os.path.isabs(FOLLOW_FILE) \
        else os.path.join(HERE, FOLLOW_FILE)
    if not os.path.exists(path):
        return {}
    out = {}
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            w = (r.get("wallet") or "").lower().strip()
            if w:
                out[w] = r
    return out


def beat(note):
    """
    Leave a mark every pass, so "is it running?" has an answer that does not
    depend on asking. Silence from this watcher is the normal state — whales
    rarely agree — and a silent process and a dead one look identical from the
    outside without this.
    """
    try:
        with open(os.path.join(HERE, BEAT_FILE), "w") as f:
            f.write(f"{int(time.time())}\n{note}\n")
    except OSError:
        pass


def status():
    follow = load_follow()
    print(f"followed wallets : {len(follow) or 'NONE — run whale_hunt.py --analyze'}")
    try:
        with open(os.path.join(HERE, BEAT_FILE)) as f:
            ts = int(f.readline().strip())
            note = f.readline().strip()
        age = int(time.time()) - ts
        alive = age < 120
        print(f"last check       : {age}s ago  "
              f"({datetime.fromtimestamp(ts, TEHRAN):%H:%M:%S} تهران)")
        print(f"                   {note}")
        verdict = "RUNNING" if alive else "STOPPED — nothing is watching"
        print(f"watcher          : {verdict}")
    except (OSError, ValueError):
        print("last check       : never — the watcher has not been started")
        print("watcher          : STOPPED")
    fired = seen_load()
    print(f"alerts sent      : {len(fired)}")
    if fired:
        for k in sorted(fired)[-5:]:
            b, side = k.split(":")
            print(f"                   "
                  f"{datetime.fromtimestamp(int(b), TEHRAN):%m-%d %H:%M} {side}")


def seen_load():
    try:
        with open(os.path.join(HERE, SEEN_FILE)) as f:
            return set(x.strip() for x in f if x.strip())
    except OSError:
        return set()


def seen_add(key):
    with open(os.path.join(HERE, SEEN_FILE), "a") as f:
        f.write(key + "\n")


def fills(market, tokens):
    """
    Every published fill for the live market.

    Per token when the ids are known — the cap is per query, so two queries
    return twice as much and split the sides for free. Falls back to the market
    id, which is all the older records carry.
    """
    rows, seen = [], set()
    targets = [("asset", t) for t in (tokens or [])] or [("market", market)]
    for key, val in targets:
        try:
            r = requests.get(f"{DATA}/trades", timeout=15, headers=UA,
                             params={key: val, "limit": 1000}).json()
        except Exception:  # noqa: BLE001
            continue
        if isinstance(r, dict):
            r = r.get("data") or r.get("trades") or []
        for t in r or []:
            k = (str(t.get("transactionHash", "")) + str(t.get("timestamp", ""))
                 + str(t.get("proxyWallet", "")) + str(t.get("size", "")))
            if k in seen:
                continue
            seen.add(k)
            rows.append(t)
    return rows


def positions(rows, follow):
    """Net shares and cost per followed wallet per outcome."""
    net = defaultdict(float)
    cost = defaultdict(float)
    names = {}
    for t in rows:
        w = str(t.get("proxyWallet", "")).lower()
        if w not in follow:
            continue
        try:
            sz = float(t.get("size") or 0)
            pr = float(t.get("price") or 0)
        except (TypeError, ValueError):
            continue
        if sz <= 0 or not 0 < pr < 1:
            continue
        out = str(t.get("outcome", "")).lower()
        sgn = -1.0 if str(t.get("side", "")).upper() == "SELL" else 1.0
        net[(w, out)] += sgn * sz
        cost[(w, out)] += sgn * sz * pr
        if t.get("pseudonym"):
            names[w] = t["pseudonym"]
    return net, cost, names


def check(boundary, follow, quiet=False):
    """One look at one window. Returns True if it fired."""
    m = pmc.market_for(boundary, deadline=time.time() + 25)
    if not m:
        if not quiet:
            print("  no market for this window yet")
        return False
    cid = m.get("conditionId") or m.get("condition_id") or ""
    toks = m.get("clobTokenIds")
    if isinstance(toks, str):
        try:
            import json
            toks = json.loads(toks)
        except Exception:  # noqa: BLE001
            toks = None
    rows = fills(cid, toks)
    net, cost, names = positions(rows, follow)

    by_side = defaultdict(list)
    for (w, out), sh in net.items():
        if sh > 1e-6:
            by_side[out].append((w, sh, cost[(w, out)]))
    if not quiet:
        tot = len({w for (w, _) in net})
        print(f"  {len(rows):,} fills · {tot} followed wallet(s) active · "
              + ", ".join(f"{k}:{len(v)}" for k, v in by_side.items()))

    for out, group in by_side.items():
        if len(group) < MIN_AGREE:
            continue
        spent = sum(c for _, _, c in group)
        if spent < MIN_SIZE:
            continue
        key = f"{boundary}:{out}"
        if key in seen_load():
            continue
        left = max(0, boundary + GRAN - int(time.time()))
        avg = spent / sum(sh for _, sh, _ in group)
        side = "بالا ⬆️" if out.startswith("up") else "پایین ⬇️"
        lines = [f"🐋 <b>{len(group)} نهنگ هم‌جهت شدند — {side}</b>", ""]
        for w, sh, c in sorted(group, key=lambda x: -x[2]):
            nm = names.get(w) or (follow.get(w, {}).get("name") or "")
            row = follow.get(w, {})
            hist = (f" · سابقه {row.get('win_rate', '?')} در "
                    f"{row.get('paid', '?')}" if row.get("win_rate") else "")
            lines.append(f"  {nm or w[:10]} — ${c:,.0f} در {c / sh:.3f}{hist}")
        lines += [
            "",
            f"میانگینِ قیمتِ ورودشان: <b>{avg:.3f}</b>",
            f"جمعِ پولشان: <b>${spent:,.0f}</b>",
            f"⏱ <b>{left} ثانیه</b> تا بسته شدنِ پنجره",
            f"پنجره: {datetime.fromtimestamp(boundary, TEHRAN):%H:%M} تهران",
            "",
            "<i>این گزارشِ کاری است که آن‌ها کردند، نه توصیه. تا این پیام "
            "برسد قیمت به سمتشان حرکت کرده — خریدِ خودشان همین کار را می‌کند.</i>",
        ]
        text = "\n".join(lines)
        print("\n" + text.replace("<b>", "").replace("</b>", "")
              .replace("<i>", "").replace("</i>", ""))
        tg(text)
        ntfy(f"{len(group)} whales {out.upper()}",
             f"${spent:,.0f} at {avg:.3f} · {left}s left")
        seen_add(key)
        return True
    return False


def main():
    argv = sys.argv[1:]
    if "--status" in argv:
        status()
        return
    follow = load_follow()
    if "--list" in argv:
        if not follow:
            print(f"{FOLLOW_FILE} not found — run "
                  f"`python whale_hunt.py --analyze` first.")
            return
        print(f"{len(follow)} wallets followed:\n")
        print(f"  {'wallet':<44}{'name':<24}{'win%':>7}{'paid':>7}{'ROI':>8}")
        for w, r in follow.items():
            print(f"  {w:<44}{(r.get('name') or '')[:22]:<24}"
                  f"{r.get('win_rate', ''):>7}{r.get('paid', ''):>7}"
                  f"{r.get('roi', ''):>8}")
        return
    if not follow:
        print(f"{FOLLOW_FILE} not found. Run:")
        print("  python whale_hunt.py --analyze")
        print("which writes it from the wallets that survived every test.")
        return
    print(f"watching {len(follow)} wallets · alert when {MIN_AGREE}+ agree "
          f"with ${MIN_SIZE:,.0f}+ behind it")
    print(f"telegram: {'yes' if cred('TELEGRAM_TOKEN') else 'NO'} · "
          f"ntfy: {NTFY or cred('NTFY_TOPIC') or 'off'}")

    if "--test" in argv:
        # A past window, so the whole path can be proved without waiting for
        # whales to agree about anything.
        b = (int(time.time()) - 3600) // GRAN * GRAN
        print(f"\ntest on the window at "
              f"{datetime.fromtimestamp(b, TEHRAN):%H:%M} Tehran")
        check(b, follow)
        print("\n(no alert above means no 3 followed wallets agreed in that "
              "window — the path itself ran)")
        return

    once = "--once" in argv
    while True:
        now = int(time.time())
        b = now // GRAN * GRAN
        left = b + GRAN - now
        print(f"\n{datetime.fromtimestamp(b, TEHRAN):%H:%M} · {left}s left")
        beat(f"window {datetime.fromtimestamp(b, TEHRAN):%H:%M}")
        # They arrive late, so look repeatedly rather than once at the open.
        while int(time.time()) < b + GRAN - 5:
            if check(b, follow, quiet=False):
                break
            beat(f"window {datetime.fromtimestamp(b, TEHRAN):%H:%M}, "
                 f"{b + GRAN - int(time.time())}s left")
            time.sleep(POLL)
        if once:
            return
        time.sleep(max(2, b + GRAN - int(time.time()) + 2))


if __name__ == "__main__":
    main()
