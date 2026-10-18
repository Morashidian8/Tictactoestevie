#!/usr/bin/env node
// ابزار قفل اپ HSE — رمزنگاری کامل اپ و پادکست‌ها برای انتشار عمومی
//
// طرح کلید (Envelope):
//   یک کلید محتوای تصادفی ۲۵۶ بیتی (CK) همهٔ محتوا را با AES-256-GCM رمز می‌کند.
//   CK دو بار «پیچیده» (wrap) می‌شود: یک بار با کلید مشتق از رمز ورود و یک بار با کلید بازیابی
//   (هر دو با PBKDF2-SHA256، ۶۰۰٬۰۰۰ تکرار). فایل keystore.json فقط CKِ پیچیده‌شده را دارد
//   و بدون رمز یا کلید بازیابی بی‌فایده است، پس عمومی بودنش مشکلی ندارد.
//
// دستورها (رمز از متغیر محیطی HSE_PASS یا کلید بازیابی از HSE_RECOVERY خوانده می‌شود):
//   node hse_tools/hse-lock.mjs init                    کلید جدید + چاپ کلید بازیابی (فقط یک بار)
//   node hse_tools/hse-lock.mjs build  <plain.html>     ساخت manhole_pwa/index.html (صفحهٔ ورود + اپ رمزشده)
//   node hse_tools/hse-lock.mjs open   <out.html>       بازکردن اپ منتشرشده به HTML ساده برای ویرایش
//   node hse_tools/hse-lock.mjs audio  <in.mp3> <out.enc>   رمزنگاری یک قسمت پادکست
//   node hse_tools/hse-lock.mjs rekey                   تغییر رمز ورود (HSE_PASS یا HSE_RECOVERY → HSE_NEW_PASS)
//
// فایل HTML سادهٔ اپ هرگز نباید commit شود؛ فقط خروجی رمزشده منتشر می‌شود.
import { webcrypto as crypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const subtle = crypto.subtle;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const KEYSTORE = path.join(HERE, 'keystore.json');
const SHELL = path.join(HERE, 'shell.html');
const OUT_INDEX = path.join(ROOT, 'manhole_pwa', 'index.html');
const ITER = 600000;

const b64 = (u8) => Buffer.from(u8).toString('base64');
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
const die = (m) => { console.error('خطا: ' + m); process.exit(1); };

async function kek(secret, salt, iter) {
  const base = await subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function seal(key, data) { const iv = rand(12); const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, data)); return { iv: b64(iv), ct: b64(ct) }; }
async function unseal(key, box) { return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct))); }
async function wrapWith(secret, ck) { const salt = rand(16); const k = await kek(secret, salt, ITER); return { salt: b64(salt), iter: ITER, ...(await seal(k, ck)) }; }
async function unwrapWith(secret, w) {
  const k = await kek(secret, unb64(w.salt), w.iter);
  try { return await unseal(k, w); } catch { return null; }
}
function loadKeystore() { if (!fs.existsSync(KEYSTORE)) die('keystore.json پیدا نشد؛ اول init را اجرا کنید.'); return JSON.parse(fs.readFileSync(KEYSTORE, 'utf8')); }
async function contentKeyRaw() {
  const ks = loadKeystore();
  if (process.env.HSE_PASS) { const ck = await unwrapWith(process.env.HSE_PASS, ks.pass); if (ck) return ck; die('رمز ورود (HSE_PASS) نادرست است.'); }
  if (process.env.HSE_RECOVERY) { const ck = await unwrapWith(normRecovery(process.env.HSE_RECOVERY), ks.recovery); if (ck) return ck; die('کلید بازیابی نادرست است.'); }
  die('HSE_PASS یا HSE_RECOVERY را تنظیم کنید.');
}
const normRecovery = (s) => s.replace(/[\s-]/g, '').toUpperCase();
const aesKey = (raw) => subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
function checkPass(p) { if (!p || p.length < 12) die('رمز باید دست‌کم ۱۲ کاراکتر باشد.'); }

const cmd = process.argv[2];
if (cmd === 'init') {
  if (fs.existsSync(KEYSTORE) && !process.env.HSE_FORCE) die('keystore.json وجود دارد؛ init دوباره همهٔ محتوای قبلی را غیرقابل‌بازشدن می‌کند (برای اجبار HSE_FORCE=1).');
  checkPass(process.env.HSE_PASS);
  const ck = rand(32);
  const A = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const rec = Array.from(rand(32), (x) => A[x % 32]).join('');
  const ks = { v: 1, pass: await wrapWith(process.env.HSE_PASS, ck), recovery: await wrapWith(rec, ck) };
  fs.writeFileSync(KEYSTORE, JSON.stringify(ks, null, 2) + '\n');
  console.log('کلید بازیابی (فقط همین یک بار نمایش داده می‌شود):');
  console.log(rec.match(/.{4}/g).join('-'));
} else if (cmd === 'build') {
  const src = process.argv[3] || die('مسیر HTML سادهٔ اپ را بدهید.');
  const ks = loadKeystore(); const ck = await contentKeyRaw();
  if (!process.env.HSE_PASS) die('برای build رمز ورود (HSE_PASS) لازم است تا صفحهٔ ورود ساخته شود.');
  const html = fs.readFileSync(src);
  if (!/<html/i.test(html.slice(0, 2000).toString())) die('فایل ورودی HTML اپ نیست.');
  const payload = { v: 1, pass: ks.pass, app: await seal(await aesKey(ck), html) };
  const shell = fs.readFileSync(SHELL, 'utf8');
  if (!shell.includes('/*HSE_PAYLOAD*/')) die('shell.html نشانگر payload ندارد.');
  fs.writeFileSync(OUT_INDEX, shell.replace('/*HSE_PAYLOAD*/', () => JSON.stringify(payload)));
  console.log('ساخته شد: ' + path.relative(ROOT, OUT_INDEX) + ' (' + Math.round(fs.statSync(OUT_INDEX).size / 1024) + ' KB)');
} else if (cmd === 'open') {
  const out = process.argv[3] || die('مسیر خروجی HTML ساده را بدهید.');
  const m = fs.readFileSync(OUT_INDEX, 'utf8').match(/<script id="hse-payload" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) die('payload در index.html پیدا نشد.');
  const ck = await contentKeyRaw();
  fs.writeFileSync(out, await unseal(await aesKey(ck), JSON.parse(m[1]).app));
  console.log('باز شد: ' + out + '  (این فایل را commit نکنید)');
} else if (cmd === 'audio') {
  const [, , , inp, out] = process.argv; if (!inp || !out) die('audio <in.mp3> <out.enc>');
  const ck = await contentKeyRaw(); const iv = rand(12);
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(ck), fs.readFileSync(inp)));
  fs.writeFileSync(out, Buffer.concat([Buffer.from(iv), Buffer.from(ct)]));
  console.log('رمز شد: ' + out + ' (' + (fs.statSync(out).size / 1048576).toFixed(2) + ' MB)');
} else if (cmd === 'rekey') {
  checkPass(process.env.HSE_NEW_PASS);
  const ks = loadKeystore(); const ck = await contentKeyRaw();
  ks.pass = await wrapWith(process.env.HSE_NEW_PASS, ck);
  fs.writeFileSync(KEYSTORE, JSON.stringify(ks, null, 2) + '\n');
  console.log('رمز ورود عوض شد. حالا با HSE_PASS جدید، open و سپس build را اجرا کنید تا صفحهٔ ورود به‌روز شود.');
} else {
  console.log('دستورها: init | build <plain.html> | open <out.html> | audio <in> <out> | rekey');
}
