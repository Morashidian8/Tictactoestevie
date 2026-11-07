#!/usr/bin/env python3
"""Smoke test: build the site, open every page on phone and desktop widths, run the claims flow with a
made-up claims file and issue a policy draft. Fails on any JavaScript error or sideways scrolling.

    pip install playwright openpyxl && python3 -m playwright install chromium
    python3 renewal_intel/src/smoke_test.py
"""
import subprocess, sys, time, tempfile, os
from pathlib import Path
from playwright.sync_api import sync_playwright
import openpyxl

SRC = Path(__file__).resolve().parent; APP = SRC.parent
subprocess.run([sys.executable, str(SRC / "build.py"), "--site"], check=True)

# a small, invented claims report in the insurer-system layout (no real data)
tmp = Path(tempfile.mkdtemp()); claims = tmp / "claims.xlsx"
wb = openpyxl.Workbook(); ws = wb.active
ws.append(["ردیف", "گروه بیماری:", "نام بیماری", "نوع ثبت", "تعداد پرونده ها", "تعداد مورد خسارت", "تعداد افراد مصرف کننده", "مبلغ خسارت"])
rows = [("خدمات دندانپزشکی", "ترمیمی", 300, 900, 250, 2_500_000_000_0), ("هزینه ویزیت", "ویزیت عمومی", 900, 4000, 700, 1_200_000_000_0),
        ("جبران هزینه دارو", "داروی مصرفی", 300, 3000, 750, 1_100_000_000_0), ("بستری در بیمارستان و مراکز جراحی محدود", "عمل جراحی", 60, 60, 12, 1_000_000_000_0),
        ("هزینه  مربوط به خرید عینک طبی", "عینک", 80, 90, 70, 300_000_000_0), ("جبران هزینه های نازایی وناباروری", "نازایی", 2, 2, 2, 20_000_000_0)]
for i, r in enumerate(rows, 1): ws.append([i, r[0], r[1], "WebApi", r[2], r[3], r[4], r[5]])
wb.save(claims)

srv = subprocess.Popen([sys.executable, "-m", "http.server", "8799"], cwd=APP / "site", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
bad = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=os.environ.get("CHROME") or None)
        for W in (390, 1280):
            pg = b.new_page(viewport={"width": W, "height": 900}); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto("http://localhost:8799/index.html"); pg.wait_for_timeout(1200)
            for page in ["home", "renewal", "tender", "docs", "claims", "settings", "reminders", "admin"]:
                pg.evaluate(f"go({page!r})"); pg.wait_for_timeout(200)
                if pg.evaluate("document.documentElement.scrollWidth > innerWidth"): bad.append(f"{W}px {page}: sideways scroll")
            # claims flow with a policy saved as a contract (as if read and confirmed)
            pg.evaluate("""()=>{state.contracts.push({id:"t4",src:"t",org:"شرکت آزمایشی",insurer:"بیمه نمونه",year:1404,premium:11,insured:1000,franchise:10,
              caps:{hosp:80,special:160,delivery:12,para:10,lab:10,rehab:10,dental:10,visit:5,drug:5,glasses:2,infert:12,combo:160,total:229}})}""")
            pg.evaluate("go(\"claims\")"); pg.wait_for_timeout(200)
            pg.set_input_files("#clmIn", [str(claims)]); pg.wait_for_timeout(800)
            n = pg.evaluate("state.lastClaims && state.lastClaims.K ? state.lastClaims.K.P.length : 0")
            if not n: bad.append(f"{W}px claims: no packages")
            pg.click('[data-issue="real"]'); pg.wait_for_timeout(400)
            if pg.locator(".pd-t2 tbody tr").count() < 5: bad.append(f"{W}px draft: commitments table too short")
            if pg.evaluate("document.documentElement.scrollWidth > innerWidth"): bad.append(f"{W}px draft: sideways scroll")
            bad += [f"{W}px JS error: {e}" for e in errs]
        b.close()
finally:
    srv.kill()
print("OK" if not bad else "FAILED:\n" + "\n".join(bad)); sys.exit(1 if bad else 0)
