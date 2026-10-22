"""Auto-claim the free hourly beetle in Remilia's BeetleBoy cartridge.

Opens remilia.net in headless Chromium with a saved login (Playwright
storage state), looks for the "CLAIM BEETLE" button and clicks it when it is
ready. While the button still shows "... TO NEXT CLAIM" it does nothing.

Env:
  REMILIA_STATE     base64 of the storage_state.json written by login.py (required)
  REMILIA_URL       page that shows BeetleBoy (default https://remilia.net/home)
  TELEGRAM_TOKEN / TELEGRAM_CHAT_ID   optional, report claims and errors
  SHOT_DIR          where debug screenshots go (default ./shots)
"""

import base64
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from playwright.sync_api import TimeoutError as PWTimeout
from playwright.sync_api import sync_playwright

URL = os.environ.get("REMILIA_URL", "https://remilia.net/home")
SHOT_DIR = Path(os.environ.get("SHOT_DIR", "shots"))
CLAIM_RE = re.compile(r"claim\s+beetle", re.I)
WAIT_RE = re.compile(r"to\s+next\s+claim", re.I)


def telegram(text):
    token, chat = os.environ.get("TELEGRAM_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if not (token and chat):
        return
    data = urllib.parse.urlencode({"chat_id": chat, "text": text}).encode()
    try:
        urllib.request.urlopen(f"https://api.telegram.org/bot{token}/sendMessage", data, timeout=15)
    except Exception as e:  # a failed notification must not fail the claim
        print("telegram failed:", e)


def load_state():
    raw = os.environ.get("REMILIA_STATE", "").strip()
    if not raw:
        sys.exit("REMILIA_STATE is not set — run login.py and save it as a secret")
    return json.loads(base64.b64decode(raw))


def find_claim_button(page):
    # The button may be split across child nodes ("CLAIM BEETLE" + timer line),
    # so match on the innermost clickable element whose text contains it.
    loc = page.locator("button, [role=button], a, div").filter(has_text=CLAIM_RE)
    if loc.count() == 0:
        return None
    return loc.last


def open_beetleboy(page):
    page.goto(URL, wait_until="domcontentloaded", timeout=60_000)
    page.wait_for_timeout(8_000)
    if find_claim_button(page):
        return
    # Fall back to switching to the BeetleBoy tab / beetle mode.
    for target in (page.get_by_text(re.compile("BeetleBoy", re.I)), page.get_by_text("🪲")):
        try:
            if target.count():
                target.first.click(timeout=5_000)
                page.wait_for_timeout(4_000)
                if find_claim_button(page):
                    return
        except PWTimeout:
            pass


def main():
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(
            storage_state=load_state(),
            viewport={"width": 450, "height": 1000},
            user_agent=(
                "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36"
            ),
        )
        page = ctx.new_page()
        try:
            open_beetleboy(page)
            page.screenshot(path=SHOT_DIR / "before.png")
            btn = find_claim_button(page)
            if btn is None:
                msg = "BeetleBoy: claim button not found (logged out or layout changed?)"
                print(msg)
                telegram(msg)
                return 1
            text = " ".join(btn.inner_text().split())
            print("button:", text)
            if WAIT_RE.search(text):
                print("not ready yet")
                return 0
            btn.click(timeout=10_000)
            page.wait_for_timeout(5_000)
            page.screenshot(path=SHOT_DIR / "after.png")
            print("claimed")
            telegram("🪲 BeetleBoy: beetle claimed")
            return 0
        finally:
            browser.close()


if __name__ == "__main__":
    sys.exit(main())
