/**
 * صفحهٔ میزبانِ نسخهٔ نمایشی، برای انتشار به‌صورت Artifact.
 *
 * ── چرا اصلاً یک صفحهٔ جدا لازم است ─────────────────────────────
 *
 * `dist/index.html` که Vite می‌سازد، سرویس‌ورکرِ PWA را ثبت می‌کند و
 * `<html dir="rtl">` خودش را دارد. صفحهٔ منتشرشده داخل یک قاب می‌نشیند،
 * پس جهت را باید خودش بگذارد و سرویس‌ورکر آنجا فقط دردسر است.
 *
 * `demo/artifact-shell.html` همان صفحه است با دو جای خالی — نامِ
 * هش‌دارِ باندل و شیوه‌نامه — و این اسکریپت پرشان می‌کند. بی این،
 * هر بیلدِ تازه یعنی دستی عوض کردنِ دو هش، و یک بارِ فراموش کردن
 * یعنی صفحه‌ای که سفید بالا می‌آید.
 *
 * خروجی دوم، نقشهٔ فایل‌هاست: چه چیزی باید کنار صفحه منتشر شود.
 *
 *   BASE_PATH=./ VITE_DEMO=1 npm run build
 *   node scripts/build-artifact.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'

const assets = readdirSync('dist/assets')
const pick = (re) => {
  const found = assets.find((name) => re.test(name))
  if (!found) throw new Error(`فایلی با الگوی ${re} در dist/assets نیست`)
  return found
}

const css = pick(/^index-.*\.css$/)
const js = pick(/^index-.*\.js$/)

const page = readFileSync('demo/artifact-shell.html', 'utf8')
  .replace('assets/__CSS__', `assets/${css}`)
  .replace('assets/__JS__', `assets/${js}`)
writeFileSync('dist/artifact.html', page)

/*
 * هر چیزی که صفحه لازم دارد، و نه بیشتر.
 *
 * `sw.js` و `registerSW.js` عمداً نیستند: سرویس‌ورکر در قابِ منتشرشده
 * ثبت نمی‌شود و ماندنش فقط یک نسخهٔ کهنه را زنده نگه می‌دارد.
 */
const files = Object.fromEntries([
  ...assets.map((name) => [`assets/${name}`, `dist/assets/${name}`]),
  ['icon.svg', 'dist/icon.svg'],
  ['fonts/OFL-Vazirmatn.txt', 'dist/fonts/OFL-Vazirmatn.txt'],
])

console.log(JSON.stringify(files, null, 1))
