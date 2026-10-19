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
// دسترسی اختصاصی همکاران (رمز جدا + واترمارک نام، قابل قطع در هر زمان):
//   node hse_tools/hse-lock.mjs user-add <شناسه> "<نام>"   ساخت رمز شخصی (یا HSE_USER_PASS) — بعد build
//   node hse_tools/hse-lock.mjs user-list                  فهرست همکاران
//   node hse_tools/hse-lock.mjs user-revoke <شناسه>        قطع دسترسی (HSE_PASS و HSE_RECOVERY لازم) — بعد build
//   هر همکار یک جفت‌کلید RSA دارد: کلید خصوصی با رمز خود او قفل است و CK با کلید عمومی‌اش رمز
//   می‌شود. برای قطع دسترسی، CK عوض می‌شود و فقط برای بقیه دوباره رمز می‌شود (بدون نیاز به رمز آن‌ها)؛
//   پادکست‌ها هم با CK جدید دوباره رمز می‌شوند.
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
const ALPHA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const randCode = (n) => Array.from(rand(n), (x) => ALPHA[x % 32]).join('');
const RSA = { name: 'RSA-OAEP', hash: 'SHA-256' };
const enc = (s) => new TextEncoder().encode(s);
const dec = (u8) => new TextDecoder().decode(u8);
async function userSeal(pubB64, ck, name) {
  const pub = await subtle.importKey('spki', unb64(pubB64), RSA, false, ['encrypt']);
  return b64(new Uint8Array(await subtle.encrypt(RSA, pub, enc(JSON.stringify({ k: b64(ck), n: name })))));
}
function saveKeystore(ks) { fs.writeFileSync(KEYSTORE, JSON.stringify(ks, null, 2) + '\n'); }
// فقط بخش‌های لازم برای ورود در index.html می‌رود (شناسه و نام همکار نه)
const publicUsers = (u) => u && u.list.length ? { salt: u.salt, iter: u.iter, list: u.list.map((x) => ({ iv: x.iv, priv: x.priv, ck: x.ck })) } : undefined;

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
  const payload = { v: 1, pass: ks.pass, users: publicUsers(ks.users), app: await seal(await aesKey(ck), html) };
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
} else if (cmd === 'user-add') {
  const [, , , id, name] = process.argv;
  if (!id || !/^[a-z0-9_-]+$/i.test(id) || !name) die('user-add <شناسهٔ لاتین> "<نام برای واترمارک>"');
  const ks = loadKeystore(); const ck = await contentKeyRaw();
  ks.users = ks.users || { salt: b64(rand(16)), iter: ITER, list: [] };
  if (ks.users.list.some((u) => u.id === id)) die('این شناسه وجود دارد.');
  const pw = process.env.HSE_USER_PASS || ('HSE-' + randCode(16).match(/.{4}/g).join('-'));
  checkPass(pw);
  const kp = await subtle.generateKey({ ...RSA, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['encrypt', 'decrypt']);
  const pub = b64(new Uint8Array(await subtle.exportKey('spki', kp.publicKey)));
  const priv = await seal(await kek(pw, unb64(ks.users.salt), ks.users.iter), new Uint8Array(await subtle.exportKey('pkcs8', kp.privateKey)));
  ks.users.list.push({ id, label: await seal(await aesKey(ck), enc(name)), pub, iv: priv.iv, priv: priv.ct, ck: await userSeal(pub, ck, name) });
  saveKeystore(ks);
  console.log('همکار «' + name + '» (' + id + ') اضافه شد. رمز شخصی او:');
  console.log(pw);
  console.log('حالا build را اجرا کنید تا صفحهٔ ورود این رمز را بپذیرد.');
} else if (cmd === 'user-list') {
  const ks = loadKeystore(); const k = await aesKey(await contentKeyRaw());
  const list = (ks.users && ks.users.list) || [];
  if (!list.length) console.log('همکاری ثبت نشده است.');
  for (const u of list) console.log(u.id + '\t' + dec(await unseal(k, u.label)));
} else if (cmd === 'user-revoke') {
  const id = process.argv[3] || die('user-revoke <شناسه>');
  if (!process.env.HSE_PASS) die('برای قطع دسترسی، رمز ورود (HSE_PASS) لازم است.');
  const ks = loadKeystore(); const oldCk = await contentKeyRaw();
  const list = (ks.users && ks.users.list) || [];
  if (!list.some((u) => u.id === id)) die('همکاری با این شناسه نیست (user-list را ببینید).');
  // کلید بازیابی هم باید CK جدید را باز کند: یا کلید فعلی را بدهید، یا HSE_NEW_RECOVERY=1 برای ساخت کلید تازه
  let rec = null;
  if (process.env.HSE_RECOVERY) {
    rec = normRecovery(process.env.HSE_RECOVERY);
    if (!(await unwrapWith(rec, ks.recovery))) die('کلید بازیابی نادرست است.');
  } else if (process.env.HSE_NEW_RECOVERY) rec = randCode(32);
  else die('HSE_RECOVERY (کلید بازیابی فعلی) را بدهید، یا HSE_NEW_RECOVERY=1 برای ساخت کلید بازیابی تازه.');
  const newCk = rand(32), oldK = await aesKey(oldCk), newK = await aesKey(newCk);
  // همه‌چیز اول در حافظه آماده می‌شود و بعد یک‌جا نوشته می‌شود تا نیمه‌کاره نماند
  const podDir = path.join(ROOT, 'manhole_pwa', 'podcasts'), pods = [];
  for (const f of fs.existsSync(podDir) ? fs.readdirSync(podDir) : []) {
    if (!f.endsWith('.enc')) continue;
    const buf = fs.readFileSync(path.join(podDir, f));
    const plain = await subtle.decrypt({ name: 'AES-GCM', iv: buf.subarray(0, 12) }, oldK, buf.subarray(12));
    const iv = rand(12), ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, newK, plain));
    pods.push([path.join(podDir, f), Buffer.concat([Buffer.from(iv), Buffer.from(ct)])]);
  }
  const remain = [];
  for (const u of list) {
    if (u.id === id) continue;
    const name = dec(await unseal(oldK, u.label));
    remain.push({ ...u, label: await seal(newK, enc(name)), ck: await userSeal(u.pub, newCk, name) });
  }
  ks.users.list = remain;
  ks.pass = await wrapWith(process.env.HSE_PASS, newCk);
  ks.recovery = await wrapWith(rec, newCk);
  for (const [p, data] of pods) fs.writeFileSync(p, data);
  saveKeystore(ks);
  console.log('دسترسی «' + id + '» قطع شد؛ کلید محتوا عوض شد و ' + pods.length + ' پادکست دوباره رمز شد.');
  if (process.env.HSE_NEW_RECOVERY && !process.env.HSE_RECOVERY) console.log('کلید بازیابی تازه (کلید قبلی دیگر کار نمی‌کند):\n' + rec.match(/.{4}/g).join('-'));
  console.log('⚠️ حالا حتماً build را اجرا و منتشر کنید؛ تا آن موقع پادکست‌های منتشرشده با اپ منتشرشده نمی‌خوانند.');
} else {
  console.log('دستورها: init | build <plain.html> | open <out.html> | audio <in> <out> | rekey | user-add | user-list | user-revoke');
}
