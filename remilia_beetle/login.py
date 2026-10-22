"""One-time login helper — run on a computer, not in CI.

Opens a visible browser at remilia.net. Log in by hand, then press Enter in
the terminal. Writes storage_state.json and prints its base64, which goes
into the REMILIA_STATE GitHub secret.

    pip install playwright && playwright install chromium
    python login.py
"""

import base64

from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    ctx = browser.new_context()
    page = ctx.new_page()
    page.goto("https://remilia.net/home")
    input("Log in to Remilia in the browser window, then press Enter here... ")
    ctx.storage_state(path="storage_state.json")
    browser.close()

with open("storage_state.json", "rb") as f:
    print("\nREMILIA_STATE secret value:\n")
    print(base64.b64encode(f.read()).decode())
