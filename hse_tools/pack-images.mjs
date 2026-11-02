#!/usr/bin/env node
// بسته‌بندی عکس‌های «درس‌آموزی از حوادث» در یک فایل باینری، برای رمزنگاری با hse-lock.mjs
//
//   node hse_tools/pack-images.mjs <پوشهٔ عکس‌ها> <خروجی.bin>
//   HSE_PASS='…' node hse_tools/hse-lock.mjs audio <خروجی.bin> manhole_pwa/lessons/lessons.enc
//
// قالب فایل: ۴ بایت طول سرآیند (little-endian) + سرآیند JSON به شکل {"نام":[شروع، طول]} + بایت‌های پشت‌سرهم عکس‌ها.
// نام هر عکس همان نام فایل بدون پسوند است (مثل b10_0) و اپ با همین نام آن را پیدا می‌کند.
import fs from 'node:fs';
import path from 'node:path';

const [, , dir, out] = process.argv;
if (!dir || !out) { console.error('pack-images.mjs <پوشهٔ عکس‌ها> <خروجی.bin>'); process.exit(1); }
const files = fs.readdirSync(dir).filter((f) => /\.(webp|jpe?g|png)$/i.test(f)).sort();
if (!files.length) { console.error('عکسی پیدا نشد.'); process.exit(1); }

const index = {}, parts = [];
let off = 0;
for (const f of files) {
  const buf = fs.readFileSync(path.join(dir, f));
  index[f.replace(/\.[^.]+$/, '')] = [off, buf.length];
  parts.push(buf); off += buf.length;
}
const head = Buffer.from(JSON.stringify(index));
const len = Buffer.alloc(4); len.writeUInt32LE(head.length);
fs.writeFileSync(out, Buffer.concat([len, head, ...parts]));
console.log(files.length + ' عکس → ' + out + ' (' + (fs.statSync(out).size / 1048576).toFixed(2) + ' MB)');
