"""Build a time-limited, encrypted desktop copy of Renewal Intelligence for a USB stick.

The whole app (page, Excel reader, fonts) is encrypted with AES-256-GCM. The file on
the stick is useless without the activation code, which is sent to the customer
separately. The customer's name and the validity window are bound into the
encryption (AES-GCM associated data), so editing them in the file breaks decryption.
The loader refuses to open before the issue date, after the expiry date, and when the
computer clock has been moved back since the last run.

    python renewal_intel/desktop/build_usb.py --customer "کارگزاری نمونه" --days 15 \
        --contact "۰۹۱۲۰۰۰۰۰۰۰" --out /path/to/RenewalIntelligence

Prints the activation code. Never put the code on the same stick or commit it.

Limits: this runs in a browser on the customer's machine, so a skilled person who
already has the code can still extract the decrypted page. The protection stops anyone
without the code, makes the copy expire for normal use, and the visible name watermark
makes a leaked copy traceable.
"""

import argparse
import base64
import json
import os
import re
import secrets
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

HERE = Path(__file__).resolve().parent
APP = HERE.parent / "index.html"
PWA = HERE.parent / "pwa"
TEHRAN = timezone(timedelta(hours=3, minutes=30))
CDN_XLSX = '<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>'
B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
FA = "۰۱۲۳۴۵۶۷۸۹"


def g2j(gy, gm, gd):
    gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
    jy = 0 if gy <= 1600 else 979
    gy -= 621 if gy <= 1600 else 1600
    gy2 = gy + 1 if gm > 2 else gy
    days = 365 * gy + (gy2 + 3) // 4 - (gy2 + 99) // 100 + (gy2 + 399) // 400 - 80 + gd + gdm[gm - 1]
    jy += 33 * (days // 12053); days %= 12053
    jy += 4 * (days // 1461); days %= 1461
    if days > 365:
        jy += (days - 1) // 365; days = (days - 1) % 365
    jm = 1 + days // 31 if days < 186 else 7 + (days - 186) // 30
    jd = 1 + (days % 31 if days < 186 else (days - 186) % 30)
    return jy, jm, jd


def fa_date(dt):
    y, m, d = g2j(dt.year, dt.month, dt.day)
    return "".join(FA[int(c)] if c.isdigit() else c for c in f"{y}/{m:02d}/{d:02d}")


def b64(b):
    return base64.b64encode(b).decode()


def b32(b):
    bits = "".join(f"{x:08b}" for x in b)
    bits += "0" * (-len(bits) % 5)
    s = "".join(B32[int(bits[i:i + 5], 2)] for i in range(0, len(bits), 5))
    return "-".join([s[0:5], s[5:10], s[10:15], s[15:20], s[20:]])  # 26 chars: 5-5-5-5-6


def unb32(code):
    clean = re.sub(r"[^A-Z2-7]", "", code.upper())
    if len(clean) != 26:
        raise SystemExit("--code must have 26 letters/digits (A-Z, 2-7)")
    bits = "".join(f"{B32.index(c):05b}" for c in clean)
    return bytes(int(bits[i:i + 8], 2) for i in range(0, 128, 8))


def font_faces():
    out = []
    for name, weight in (("Regular", "400"), ("Medium", "500"), ("Bold", "700 800")):
        data = b64((PWA / "fonts" / f"Vazirmatn-{name}.woff2").read_bytes())
        out.append(f'@font-face{{font-family:"Vazirmatn";src:url(data:font/woff2;base64,{data}) format("woff2");font-weight:{weight}}}')
    return "".join(out)


def app_document(customer, expiry_ms, expiry_label, total_days):
    page = APP.read_text(encoding="utf-8")
    if CDN_XLSX not in page:
        raise SystemExit("Excel library tag not found in index.html; update CDN_XLSX.")
    xlsx = (PWA / "vendor" / "xlsx.full.min.js").read_text(encoding="utf-8").replace("</script", "<\\/script")
    page = page.replace(CDN_XLSX, f"<script>{xlsx}</script>")
    # Offline copy: no Google Fonts; Vazirmatn is embedded below.
    page = re.sub(r'<link rel="(?:preconnect|stylesheet)" href="https://fonts\.g[^"]*"[^>]*>\n?', "", page)
    who = json.dumps(customer, ensure_ascii=False)
    # License card in the sidebar; days left are counted on the customer's clock.
    lic = f"""<script>window.RI_LICENSE = {{ name: {who}, until: {json.dumps(expiry_label, ensure_ascii=False)}, total: {total_days},
  days: Math.min({total_days}, Math.max(0, Math.ceil(({expiry_ms} - Date.now()) / 86400000))) }};</script>
<style>@media (max-width:860px){{#ri-mark{{left:auto!important;right:12px;bottom:calc(72px + env(safe-area-inset-bottom,0px))!important}}}}</style>
"""
    guard = f"""
<div id="ri-mark" style="position:fixed;left:12px;bottom:12px;z-index:50;font:500 12px Vazirmatn,Tahoma,sans-serif;background:rgba(14,106,91,.92);color:#fff;padding:4px 12px;border-radius:999px;pointer-events:none">مجوز: {customer} · معتبر تا {expiry_label}</div>
<script>
// Lock again if the window stays open past the expiry.
setInterval(() => {{ if (Date.now() > {expiry_ms}) location.reload(); }}, 60000);
console.info("Renewal Intelligence — licensed to " + {who});
</script>"""
    return ("<!DOCTYPE html><html lang=\"fa\" dir=\"rtl\"><head><meta charset=\"utf-8\">"
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
            f"<style>{font_faces()}body{{margin:0}}[hidden]{{display:none!important}}</style></head><body>"
            + lic + page + guard + "</body></html>")


LOADER = r"""<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Renewal Intelligence</title>
<style>
__FONT__
:root{--paper:#f2f5f4;--surface:#fff;--ink:#14211f;--muted:#5a6a66;--line:#d3dcd9;--accent:#0e6a5b;--bad:#b0281f;--bad-bg:#fbe4e2}
@media (prefers-color-scheme: dark){:root{--paper:#0e1514;--surface:#151f1d;--ink:#e2eae7;--muted:#93a39f;--line:#2a3734;--accent:#52b9a4;--bad:#f28b82;--bad-bg:#3a1a18;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--paper);color:var(--ink);font:15px/1.7 Vazirmatn,Tahoma,"Segoe UI",sans-serif;direction:rtl;padding:24px}
.card{width:100%;max-width:440px;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:28px;display:flex;flex-direction:column;gap:14px}
h1{margin:0;font-size:1.5rem;color:var(--accent)}
.meta{color:var(--muted);font-size:.9rem;display:flex;flex-direction:column;gap:2px}
label{font-weight:700;font-size:.9rem}
input[type=text]{width:100%;font:600 1.05rem ui-monospace,Consolas,monospace;letter-spacing:1px;direction:ltr;text-align:center;padding:10px;border:1.5px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);text-transform:uppercase}
input:focus-visible,button:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.row{display:flex;gap:8px;align-items:center;font-size:.88rem;color:var(--muted)}
button{font:inherit;font-weight:700;padding:10px;border-radius:8px;border:0;background:var(--accent);color:var(--surface);cursor:pointer}
button:disabled{opacity:.6;cursor:wait}
.msg{background:var(--bad-bg);color:var(--bad);border-radius:8px;padding:10px 12px;font-weight:500}
.foot{font-size:.8rem;color:var(--muted)}
</style>
</head>
<body>
<main class="card">
  <h1>Renewal Intelligence</h1>
  <div class="meta"><span id="who"></span><span id="until"></span></div>
  <form id="f" autocomplete="off">
    <div style="display:flex;flex-direction:column;gap:10px">
      <label for="code">کد فعال‌سازی</label>
      <input type="text" id="code" placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXXX" spellcheck="false">
      <label class="row" for="remember"><input type="checkbox" id="remember" checked> روی این کامپیوتر به خاطر بسپار</label>
      <button id="go" type="submit">باز کردن برنامه</button>
    </div>
  </form>
  <div id="msg" class="msg" hidden></div>
  <div class="foot">فایل‌های اکسل فقط روی همین کامپیوتر خوانده می‌شوند و جایی ارسال نمی‌شوند.</div>
</main>
<script id="lock" type="application/json">__LOCK__</script>
<script>
// Everything stays inside this function: document.write() keeps the window, and the app declares its own globals.
(() => {
const L = JSON.parse(document.getElementById("lock").textContent);
const $ = id => document.getElementById(id);
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const say = t => { $("msg").textContent = t; $("msg").hidden = false; };
const contact = L.contact ? " برای تمدید: " + L.contact : "";
$("who").textContent = "مجوز برای: " + L.name;
$("until").textContent = "معتبر تا: " + L.untilLabel;

// Clock check: the last time this copy ran on this computer is remembered, so moving the clock back is caught.
function clockState(){
  const t = Date.now(); let back = false;
  try {
    const k = "ri-seen-" + L.id, seen = +localStorage.getItem(k) || 0;
    if (seen > t + 10 * 60000) back = true; else localStorage.setItem(k, String(Math.max(seen, t)));
  } catch (e) {}
  if (back) return "ساعت این کامپیوتر به عقب برگشته است. ساعت و تاریخ سیستم را درست کنید.";
  if (t < L.issue - 86400000) return "تاریخ این کامپیوتر قبل از تاریخ صدور مجوز است. ساعت و تاریخ سیستم را درست کنید.";
  if (t > L.expiry) return "مهلت استفاده از این نسخه تمام شده است." + contact;
  return null;
}
function lockAll(text){ say(text); $("f").hidden = true; }

function codeBytes(s){
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  if (clean.length !== 26) return null;
  let bits = ""; for (const ch of clean) bits += A.indexOf(ch).toString(2).padStart(5, "0");
  const out = new Uint8Array(16); for (let i = 0; i < 16; i++) out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  return out;
}
async function unlock(code, remember){
  const secret = codeBytes(code);
  if (!secret) throw new Error("bad");
  const base = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: unb64(L.salt), info: new TextEncoder().encode("renewal-intel-usb") },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const aad = new TextEncoder().encode(L.name + "|" + L.issue + "|" + L.expiry);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(L.iv), additionalData: aad }, key, unb64(L.ct));
  try { if (remember) localStorage.setItem("ri-code-" + L.id, code); else localStorage.removeItem("ri-code-" + L.id); } catch (e) {}
  const html = new TextDecoder().decode(plain);
  document.open(); document.write(html); document.close();
}

const problem = clockState();
if (!window.crypto || !crypto.subtle) lockAll("این مرورگر رمزگشایی را پشتیبانی نمی‌کند. فایل را با Edge یا Chrome باز کنید.");
else if (problem) lockAll(problem);
else {
  let saved = null; try { saved = localStorage.getItem("ri-code-" + L.id); } catch (e) {}
  if (saved){ $("code").value = saved; unlock(saved, true).catch(() => { try { localStorage.removeItem("ri-code-" + L.id); } catch (e) {} }); }
  $("f").addEventListener("submit", async e => {
    e.preventDefault(); $("msg").hidden = true; $("go").disabled = true;
    const p = clockState(); if (p){ lockAll(p); return; }
    try { await unlock($("code").value, $("remember").checked); }
    catch (err){ say("کد فعال‌سازی درست نیست. کد را دقیقاً همان‌طور که دریافت کرده‌اید وارد کنید."); $("go").disabled = false; }
  });
  $("code").focus();
}
})();
</script>
</body>
</html>
"""

BAT = r"""@echo off
rem Opens Renewal Intelligence as a desktop window (Edge app mode); falls back to the default browser.
set "F=%~dp0RenewalIntelligence.html"
where msedge >nul 2>nul && (start "" msedge --app="file:///%F%" & exit /b)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app="file:///%F%" & exit /b)
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app="file:///%F%" & exit /b)
start "" "%F%"
"""

COMMAND = """#!/bin/bash
# Opens Renewal Intelligence as a desktop window in Chrome; falls back to the default browser.
F="$(cd "$(dirname "$0")" && pwd)/RenewalIntelligence.html"
open -na "Google Chrome" --args --app="file://$F" 2>/dev/null || open "$F"
"""


def readme(customer, until, contact):
    return f"""Renewal Intelligence — نسخهٔ دسکتاپ

مجوز برای: {customer}
معتبر تا: {until}

اجرا:
  ویندوز: روی Run-Windows.bat دوبار کلیک کنید (در پنجرهٔ Edge باز می‌شود).
  مک: روی Run-Mac.command دوبار کلیک کنید، یا RenewalIntelligence.html را با Chrome باز کنید.
  یا: فایل RenewalIntelligence.html را با Edge یا Chrome باز کنید.

بار اول کد فعال‌سازی را وارد کنید. کد جداگانه برای شما ارسال شده است.
برنامه بدون اینترنت کار می‌کند و فایل‌های اکسل فقط روی همین کامپیوتر خوانده می‌شوند.
بعد از تاریخ اعتبار، برنامه باز نمی‌شود.{(" برای تمدید: " + contact) if contact else ""}
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--customer", required=True, help="name shown on the copy and bound into the encryption")
    ap.add_argument("--days", type=int, default=15)
    ap.add_argument("--contact", default="", help="shown when the copy has expired")
    ap.add_argument("--out", required=True, help="folder to create; copy it to the USB stick as is")
    ap.add_argument("--code-file", help="where to write the activation code (keep it off the stick)")
    ap.add_argument("--code", help="reuse an existing activation code instead of making a new one")
    a = ap.parse_args()

    now = datetime.now(TEHRAN)
    issue_ms = int(now.timestamp() * 1000)
    end = (now + timedelta(days=a.days)).replace(hour=23, minute=59, second=59, microsecond=0)
    expiry_ms = int(end.timestamp() * 1000)
    until = fa_date(end)

    secret = unb32(a.code) if a.code else secrets.token_bytes(16)
    salt, iv = secrets.token_bytes(16), secrets.token_bytes(12)
    key = HKDF(algorithm=hashes.SHA256(), length=32, salt=salt, info=b"renewal-intel-usb").derive(secret)
    aad = f"{a.customer}|{issue_ms}|{expiry_ms}".encode()
    ct = AESGCM(key).encrypt(iv, app_document(a.customer, expiry_ms, until, a.days).encode(), aad)

    lock = {"id": secrets.token_hex(6), "name": a.customer, "issue": issue_ms, "expiry": expiry_ms,
            "untilLabel": until, "contact": a.contact, "salt": b64(salt), "iv": b64(iv), "ct": b64(ct)}
    regular = b64((PWA / "fonts" / "Vazirmatn-Regular.woff2").read_bytes())
    loader = (LOADER.replace("__FONT__", f'@font-face{{font-family:"Vazirmatn";src:url(data:font/woff2;base64,{regular}) format("woff2")}}')
              .replace("__LOCK__", json.dumps(lock, ensure_ascii=False).replace("</", "<\\/")))

    out = Path(a.out)
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    (out / "RenewalIntelligence.html").write_text(loader, encoding="utf-8")
    (out / "Run-Windows.bat").write_text(BAT.replace("\n", "\r\n"), encoding="ascii")
    cmd = out / "Run-Mac.command"
    cmd.write_text(COMMAND, encoding="utf-8")
    os.chmod(cmd, 0o755)
    (out / "راهنما.txt").write_text(readme(a.customer, until, a.contact).replace("\n", "\r\n"), encoding="utf-8-sig")

    code = b32(secret)
    if a.code_file:
        Path(a.code_file).write_text(f"{a.customer}\nکد فعال‌سازی: {code}\nمعتبر تا: {until}\n", encoding="utf-8-sig")
    print(f"customer: {a.customer}\nvalid until: {until} ({end.isoformat()})\nactivation code: {code}")


if __name__ == "__main__":
    main()
