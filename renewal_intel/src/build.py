#!/usr/bin/env python3
"""Build Renewal Intelligence (single-file web app) from these sources.

    python3 renewal_intel/src/build.py            # writes renewal_intel/index.html
    python3 renewal_intel/src/build.py --site     # also writes renewal_intel/site/ (the phone app, as deployed)

Then serve the site for testing (PDF/photo reading needs http, not file://):
    cd renewal_intel/site && python3 -m http.server 8000   →  http://localhost:8000/
"""
import argparse, shutil
from pathlib import Path

SRC = Path(__file__).resolve().parent
APP = SRC.parent
CDN_XLSX = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"

# Order matters: later files use functions and constants from earlier ones.
ENGINE = ["engine.src.js", "samples.src.js", "tender.src.js", "tenders.src.js",
          "docread.src.js", "amount.js", "lexicon.src.js", "extract.src.js"]
UI = ["ai.src.js", "docs.ui.js", "claims.ui.js", "ui2.app.js"]

def read(name): return (SRC / name).read_text(encoding="utf-8")

def build():
    html = (read("ui2.shell.html")
            + f'\n<script src="{CDN_XLSX}"></script>\n'
            + '<script id="sample" type="application/json">' + read("sample.json").replace("</", "<\\/") + "</script>\n"
            + '<script id="engine">\n' + "\n".join(read(f) for f in ENGINE) + "\n</script>\n"
            + "<script>\n" + "\n".join(read(f) for f in UI) + "\n</script>\n")
    (APP / "index.html").write_text(html, encoding="utf-8")
    print("wrote", APP / "index.html", len(html), "chars")
    return html

def site(html):
    # Same steps as the «renewal» part of .github/workflows/pwa.yml
    out = APP / "site"; shutil.rmtree(out, ignore_errors=True); out.mkdir()
    page = (APP / "pwa" / "head.html").read_text(encoding="utf-8") + html.replace(CDN_XLSX, "vendor/xlsx.full.min.js")
    (out / "index.html").write_text(page, encoding="utf-8")
    for f in ["manifest.json", "sw.js"]: shutil.copy(APP / "pwa" / f, out / f)
    for d in ["icons", "vendor", "fonts"]: shutil.copytree(APP / "pwa" / d, out / d)
    print("wrote", out)

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--site", action="store_true"); a = ap.parse_args()
    h = build()
    if a.site: site(h)
