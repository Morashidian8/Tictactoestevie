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
    python whale_watch.py --doctor        # WHY is it silent? checks every link

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
import logging

import polymarket_collector as pmc

logging.getLogger().setLevel(logging.WARNING)

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
# And how much they must have put behind it, in dollars of cost. The first
# window the doctor ever read had SIX followed wallets on one side with $182
# between them — a clear consensus that a $200 floor would have swallowed. The
# floor exists to drop dust, not to outrank agreement, so it sits below that.
MIN_SIZE = float(os.environ.get("FOLLOW_MIN_SIZE", "100"))
# Seconds between polls inside a window. The window is 300s and they arrive
# late, so this is the difference between an alert and a post-mortem.
POLL = int(os.environ.get("FOLLOW_POLL", "20"))
NTFY = os.environ.get("NTFY_TOPIC", "").strip()


def cred(name):
    """
    From the environment, else from .env, else from the file the bot keeps.

    That last fallback is the one that matters. The bot does not require
    TELEGRAM_CHAT_ID to be configured at all — it learns the id from the first
    /start and writes it to .chat_id — so a working installation can have a
    token in .env and no chat id anywhere near it. Reading only .env reported
    "chat id: MISSING" on a phone that had been receiving the bot's messages
    all day.
    """
    v = os.environ.get(name, "").strip()
    if v and v != "x":
        return v
    try:
        with open(os.path.join(HERE, ".env")) as f:
            for line in f:
                if line.startswith(f"{name}="):
                    got = line.split("=", 1)[1].strip().strip("'\"")
                    if got:
                        return got
    except OSError:
        pass
    if name == "TELEGRAM_CHAT_ID":
        for path in (os.environ.get("CHAT_ID_FILE", ".chat_id"), ".chat_id"):
            try:
                with open(os.path.join(HERE, path)) as f:
                    got = f.read().strip()
                if got:
                    return got
            except OSError:
                continue
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


def doctor(windows=24):
    """
    Why no message arrived, answered link by link.

    Silence has many causes and they look identical from a phone: no follow
    list, no credentials, a blocked network, a watcher that was never started,
    or a threshold nothing ever reaches. Each is checked separately and a real
    test message is SENT, because "the credentials are present" and "Telegram
    accepted it" are different claims and only the second one matters.
    """
    ok = True
    print("=" * 70)
    print("1. the follow list")
    print("=" * 70)
    follow = load_follow()
    if not follow:
        print(f"  FAIL  {FOLLOW_FILE} missing or empty")
        print(f"        -> python whale_hunt.py --analyze")
        return
    print(f"  PASS  {len(follow)} wallets")

    print("\n" + "=" * 70)
    print("2. credentials, and whether Telegram actually accepts a message")
    print("=" * 70)
    tok, chat = cred("TELEGRAM_TOKEN"), cred("TELEGRAM_CHAT_ID")
    print(f"  token  : {'present' if tok else 'MISSING'}")
    print(f"  chat id: {'present' if chat else 'MISSING'}")
    if not tok or not chat:
        print("  FAIL  put TELEGRAM_TOKEN and TELEGRAM_CHAT_ID in .env")
        ok = False
    else:
        sent = tg("🩺 <b>تستِ دیده‌بانِ نهنگ</b>\n"
                  "اگر این را می‌بینید، مسیرِ تلگرام سالم است.")
        print(f"  {'PASS  test message sent — check Telegram now' if sent else 'FAIL  Telegram refused it (reason above)'}")
        ok = ok and sent
    topic = NTFY or cred("NTFY_TOPIC")
    print(f"  ntfy   : {topic or 'not configured (optional)'}")

    print("\n" + "=" * 70)
    print("3. can we reach Polymarket, and find the live market?")
    print("=" * 70)
    b = int(time.time()) // GRAN * GRAN
    try:
        m = pmc.market_for(b, deadline=time.time() + 25)
    except Exception as exc:  # noqa: BLE001
        m = None
        print(f"  FAIL  {type(exc).__name__}: {exc}")
    if not m:
        print("  FAIL  no live market found — VPN down, or the slug changed")
        ok = False
    else:
        print(f"  PASS  {m.get('slug')}")

    print("\n" + "=" * 70)
    print(f"4. is the threshold reachable? — last {windows} windows")
    print("=" * 70)
    print(f"  alert needs {MIN_AGREE}+ followed wallets on one side "
          f"with ${MIN_SIZE:,.0f}+ behind it\n")
    hist, best = defaultdict(int), 0
    checked = 0
    fire_at = []          # seconds into the window when the bar was first met
    for k in range(1, windows + 1):
        wb = b - k * GRAN
        mk = pmc.market_for(wb, deadline=time.time() + 15)
        if not mk:
            continue
        cid = mk.get("conditionId") or mk.get("condition_id") or ""
        rows = fills(cid, None)
        # Replay the window in the order the fills actually arrived. The count
        # at the end says whether the bar is reachable; WHEN it was first
        # reached says whether reaching it is any use, and those are different
        # questions. A consensus that only forms at +290s is a post-mortem.
        rows.sort(key=lambda t: int(t.get("timestamp") or 0))
        run_net = defaultdict(float)
        first = None
        for t in rows:
            w = str(t.get("proxyWallet", "")).lower()
            if w not in follow:
                continue
            try:
                sz, pr = float(t.get("size") or 0), float(t.get("price") or 0)
            except (TypeError, ValueError):
                continue
            if sz <= 0 or not 0 < pr < 1:
                continue
            out = str(t.get("outcome", "")).lower()
            sgn = -1.0 if str(t.get("side", "")).upper() == "SELL" else 1.0
            run_net[(w, out)] += sgn * sz
            if first is None:
                side_ct = defaultdict(int)
                for (w2, o2), sh in run_net.items():
                    if sh > 1e-6:
                        side_ct[o2] += 1
                if max(side_ct.values(), default=0) >= MIN_AGREE:
                    first = int(t.get("timestamp") or 0) - wb
        net, cost, _ = positions(rows, follow)
        sides = defaultdict(list)
        for (w, out), sh in net.items():
            if sh > 1e-6:
                sides[out].append(cost[(w, out)])
        top = max((len(v) for v in sides.values()), default=0)
        hist[top] += 1
        best = max(best, top)
        if first is not None:
            fire_at.append(first)
        checked += 1
        print(f"  reading {checked}/{windows} …", end="\r")
    print(" " * 40, end="\r")
    if not checked:
        print("  could not read any past window.")
        return
    print(f"  windows read: {checked}")
    print(f"  {'followed wallets on the busiest side':<44}{'windows':>9}")
    for n in sorted(hist):
        print(f"  {n:<44}{hist[n]:>9}  {'#' * min(40, hist[n] * 2)}")
    print(f"\n  most that ever agreed in one window: {best}")
    if best < MIN_AGREE:
        print(f"  -> THIS is why it is silent. The bar is {MIN_AGREE} and the")
        print(f"     busiest of {checked} windows reached {best}.")
        print(f"     Lower it: FOLLOW_MIN_AGREE={max(2, best)} in .env")
        ok = False
    else:
        print(f"  -> the bar is reachable in {len(fire_at)} of {checked} "
              f"windows ({len(fire_at) / checked * 100:.0f}%)")

    if fire_at:
        fire_at.sort()
        q = lambda f: fire_at[min(len(fire_at) - 1, int(len(fire_at) * f))]
        print(f"\n  WHEN the bar is first met, in seconds into the 300s window:")
        print(f"    earliest {fire_at[0]}   25% {q(.25)}   median {q(.5)}   "
              f"75% {q(.75)}   latest {fire_at[-1]}")
        usable = sum(1 for x in fire_at if x <= 240)
        print(f"    with 60s or more still left: {usable}/{len(fire_at)} "
              f"({usable / len(fire_at) * 100:.0f}%)")
        if usable / len(fire_at) < 0.3:
            print("    -> mostly too late to act on. This is a record of what")
            print("       they did, not a signal you can follow.")
        else:
            print("    -> often early enough to act on.")

    print("\n" + "=" * 70)
    print("5. is the watcher actually running?")
    print("=" * 70)
    status()
    print("\n" + ("everything checks out." if ok else
                  "fix the FAIL above and re-run --doctor."))


def seen_load():
    try:
        with open(os.path.join(HERE, SEEN_FILE)) as f:
            return set(x.strip() for x in f if x.strip())
    except OSError:
        return set()


def seen_add(key):
    with open(os.path.join(HERE, SEEN_FILE), "a") as f:
        f.write(key + "\n")


def fills(market, tokens, report=False):
    """
    Every published fill FOR THIS MARKET, and nothing else.

    The conditionId of every returned row is checked against the market asked
    for, rather than trusted. The first live alert this tool produced showed six
    wallets paying 0.83 four seconds into a fresh window — a price that cannot
    exist there — and both token queries had come back at exactly the 1,000 cap
    on a market minutes old. Either the `asset` filter is honoured or it is not;
    verifying costs one comparison per row and removes the question.
    """
    # `asset` is ignored by this endpoint — measured, not guessed: a live
    # window returned 2,000 rows of which 2,000 belonged to other markets. It
    # simply serves the most recent fills on the whole exchange. `market` is
    # honoured, so `market` is what is asked, and the conditionId check below
    # stays as the thing that would catch this the next time it changes.
    rows, seen, foreign = [], set(), 0
    for key, val in (("market", market),):
        try:
            r = requests.get(f"{DATA}/trades", timeout=15, headers=UA,
                             params={key: val, "limit": 1000}).json()
        except Exception:  # noqa: BLE001
            continue
        if isinstance(r, dict):
            r = r.get("data") or r.get("trades") or []
        for t in r or []:
            cid = str(t.get("conditionId", ""))
            if market and cid and cid != market:
                foreign += 1
                continue           # belongs to a different market: not ours
            k = (str(t.get("transactionHash", "")) + str(t.get("timestamp", ""))
                 + str(t.get("proxyWallet", "")) + str(t.get("size", "")))
            if k in seen:
                continue
            seen.add(k)
            rows.append(t)
    if report:
        total = len(rows) + foreign
        print(f"  {total:,} rows returned · {foreign:,} belonged to OTHER "
              f"markets and were dropped")
        if foreign and total:
            print(f"  -> the `asset` filter is NOT honoured "
                  f"({foreign / total * 100:.0f}% foreign). Filtering by "
                  f"conditionId is what makes this correct.")
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
    rows = fills(cid, toks, report=not quiet)
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
    if "--doctor" in argv:
        n = int(argv[argv.index("--windows") + 1]) if "--windows" in argv else 24
        doctor(n)
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
