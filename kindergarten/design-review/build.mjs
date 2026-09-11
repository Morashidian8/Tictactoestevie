/** صفحه بازبینی طراح را از shots/index.json می‌سازد. */
import { readFileSync, writeFileSync } from 'node:fs'

const here = new URL('./', import.meta.url).pathname
const shots = JSON.parse(readFileSync(here + 'shots/index.json', 'utf8'))

const GROUPS = [
  ['ورود', 'یک شماره می‌تواند چند نقش داشته باشد. نقش‌ها هرگز با هم ترکیب نمی‌شوند.'],
  ['مربی — امروز', 'صفحه‌ای که مربی بیشترین وقت روزش را در آن می‌گذراند.'],
  ['مربی — ورود', 'ورود هم مثل خروج پرسیده می‌شود: چه کسی آورد، در چه وضعیتی، با چه دارویی.'],
  ['مربی — خروج', 'کودک فقط به فهرست مجاز یا با کد تحویل داده می‌شود. استثنا ندارد.'],
  ['مربی — رویداد', 'شدت رویداد مسیرش را تعیین می‌کند: جزئی به خانواده، جدی اول به مدیر.'],
  ['مربی — ثبت گروهی', 'مهم‌ترین صفحه سامانه: یک بار برای کل کلاس، بعد فقط استثناها.'],
  ['مربی — عکس', 'عکس بدون تگ هرگز منتشر نمی‌شود، و رضایت هر خانواده جدا بررسی می‌شود.'],
  ['مربی — بستن روز', 'گزارش تا وقتی فرستاده نشده به خانواده نمی‌رسد. پس از ارسال قفل است.'],
  ['والد', 'دفترچه روزانه، نه داشبورد. بدون درصد، نمودار، و مقایسه با کودکان دیگر.'],
  ['مدیر', 'داشبورد صبح، صف تأیید رویداد، و اطلاع‌رسانی با تأیید دو مرحله‌ای.'],
  ['کف کیفیت', 'همان صفحه‌ها در باریک‌ترین و پهن‌ترین حالت پشتیبانی‌شده.'],
]

const SECTION = /بخش ([۰-۹]+\.[۰-۹]+)|پیوست ([ابج])/
const chipOf = (caption) => {
  const m = caption.match(SECTION)
  if (!m) return ''
  return m[1] ? `بخش ${m[1]}` : `پیوست ${m[2]}`
}
const stripChip = (caption) =>
  caption.replace(/\s*[—-]\s*(بخش [۰-۹]+\.[۰-۹]+|پیوست [ابج])\s*$/, '')

const fa = (n) => String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const plate = (s, i) => `
        <figure class="plate${s.full ? ' plate--tall' : ''}">
          <button class="frame" type="button" data-i="${i}" aria-label="بزرگ‌نمایی: ${esc(stripChip(s.caption))}">
            <img src="shots/${s.file}" alt="${esc(stripChip(s.caption))}" loading="lazy" width="390" />
          </button>
          <figcaption>
            <p class="cap">${esc(stripChip(s.caption))}</p>
            <p class="meta"><span class="file">${s.file}</span>${
              chipOf(s.caption) ? `<span class="spec">${chipOf(s.caption)}</span>` : ''
            }${s.full ? '<span class="tall">تمام صفحه</span>' : ''}</p>
          </figcaption>
        </figure>`

const sections = GROUPS.map(([name, blurb]) => {
  const items = shots
    .map((s, i) => [s, i])
    .filter(([s]) => s.group === name)
  if (items.length === 0) return ''
  return `
      <section class="group" id="g-${GROUPS.findIndex((g) => g[0] === name)}">
        <header class="group-head">
          <h2>${esc(name)}</h2>
          <span class="count">${fa(items.length)}</span>
          <p>${esc(blurb)}</p>
        </header>
        <div class="grid">${items.map(([s, i]) => plate(s, i)).join('')}
        </div>
      </section>`
}).join('')

const nav = GROUPS.map(
  (g, i) => `<a href="#g-${i}">${esc(g[0])}</a>`,
).join('')

const TOKENS = [
  ['ink', '#13272F', 'متن اصلی'],
  ['ink-muted', '#5A6E76', 'متن ثانویه'],
  ['paper', '#F5F7F4', 'پس‌زمینه صفحه'],
  ['surface', '#FFFFFF', 'سطح کارت'],
  ['border', '#DDE4E0', 'خط جدا'],
  ['turquoise', '#0F8C86', 'کنش اصلی، یکی در هر صفحه'],
  ['turquoise-dark', '#0A6B66', 'حالت فشرده'],
  ['turquoise-tint', '#E4F2F0', 'پس‌زمینه ملایم'],
  ['saffron', '#DDA02C', 'توجه، در انتظار'],
  ['brick', '#B0402C', 'خطر، ایمنی، رویداد'],
  ['sage', '#4C8B6B', 'موفقیت، تکمیل'],
  ['neutral-fill', '#E8EDEA', 'آواتار کودک نیامده'],
]

const swatches = TOKENS.map(
  ([name, hex, use]) => `
          <li>
            <span class="sw" style="background:${hex}"></span>
            <span class="sw-name">--${name}</span>
            <span class="sw-hex">${hex}</span>
            <span class="sw-use">${esc(use)}</span>
          </li>`,
).join('')

const html = `<title>بازبینی طراحی مهد</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap" />
<style>
:root {
  --ground: #eff1ef;
  --surface: #ffffff;
  --sunken: #e6EAE8;
  --ink: #17262b;
  --muted: #66787d;
  --rule: #d9e0dd;
  --accent: #0f8c86;
  --accent-soft: #e2efed;
  --flag: #b0402c;
  --flag-soft: #f6e6e2;
  --shadow: 0 1px 2px rgba(23, 38, 43, .06), 0 10px 28px rgba(23, 38, 43, .05);
  --fa: 'Vazirmatn', system-ui, sans-serif;
  --mono: 'IBM Plex Mono', ui-monospace, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ground: #12181a;
    --surface: #1a2225;
    --sunken: #151c1f;
    --ink: #e6ecea;
    --muted: #8da0a4;
    --rule: #283235;
    --accent: #3cb3ac;
    --accent-soft: #16302f;
    --flag: #e08268;
    --flag-soft: #2e1d19;
    --shadow: 0 1px 2px rgba(0, 0, 0, .4), 0 10px 28px rgba(0, 0, 0, .35);
  }
}
:root[data-theme="dark"] {
  --ground: #12181a;
  --surface: #1a2225;
  --sunken: #151c1f;
  --ink: #e6ecea;
  --muted: #8da0a4;
  --rule: #283235;
  --accent: #3cb3ac;
  --accent-soft: #16302f;
  --flag: #e08268;
  --flag-soft: #2e1d19;
  --shadow: 0 1px 2px rgba(0, 0, 0, .4), 0 10px 28px rgba(0, 0, 0, .35);
}

* { box-sizing: border-box; }
html { direction: rtl; }
body {
  margin: 0;
  background: var(--ground);
  color: var(--ink);
  font-family: var(--fa);
  font-size: 16px;
  line-height: 1.75;
  -webkit-font-smoothing: antialiased;
}
.wrap {
  max-width: 1140px;
  margin-inline: auto;
  padding-inline: 20px;
  padding-block: 0 72px;
}
h1, h2, h3 { text-wrap: balance; margin: 0; font-weight: 800; letter-spacing: -.01em; }

/* ── سربرگ ─────────────────────────────────────────────── */
.top { padding-block: 56px 32px; border-block-end: 1px solid var(--rule); }
.eyebrow {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: .14em;
  color: var(--muted);
  margin: 0 0 14px;
  direction: ltr;
  text-align: right;
}
h1 { font-size: clamp(30px, 5vw, 44px); line-height: 1.25; }
.lede { max-width: 62ch; color: var(--muted); margin: 14px 0 0; font-size: 17px; }
.facts { display: flex; flex-wrap: wrap; gap: 10px; margin-block-start: 26px; }
.fact {
  display: flex; align-items: baseline; gap: 8px;
  background: var(--surface); border: 1px solid var(--rule);
  border-radius: 999px; padding: 7px 16px; font-size: 14px;
}
.fact b { font-weight: 500; }
.fact .num { font-family: var(--mono); font-size: 13px; color: var(--muted); direction: ltr; }
.live { color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 3px; }

/* ── ناوبری ────────────────────────────────────────────── */
nav {
  position: sticky; inset-block-start: 0; z-index: 5;
  background: color-mix(in srgb, var(--ground) 92%, transparent);
  backdrop-filter: blur(8px);
  border-block-end: 1px solid var(--rule);
  margin-block-end: 8px;
}
nav .inner {
  max-width: 1140px; margin-inline: auto; padding: 10px 20px;
  display: flex; gap: 6px; overflow-x: auto; scrollbar-width: thin;
}
nav a {
  flex: none; font-size: 13.5px; color: var(--muted); text-decoration: none;
  padding: 5px 12px; border-radius: 999px; white-space: nowrap;
}
nav a:hover { color: var(--ink); background: var(--sunken); }

/* ── گروه ──────────────────────────────────────────────── */
.group { padding-block-start: 52px; scroll-margin-block-start: 64px; }
.group-head {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: baseline;
  gap: 4px 16px;
  padding-block-end: 18px;
  border-block-end: 1px solid var(--rule);
  margin-block-end: 26px;
}
.group-head h2 { font-size: 23px; }
.group-head p { grid-column: 1 / -1; margin: 0; color: var(--muted); font-size: 15px; max-width: 64ch; }
.count { font-family: var(--mono); font-size: 13px; color: var(--muted); }

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(228px, 1fr));
  gap: 28px 22px;
  align-items: start;
}
.plate { margin: 0; display: flex; flex-direction: column; gap: 12px; }
.frame {
  display: block; padding: 0; border: 1px solid var(--rule);
  background: var(--surface); border-radius: 16px; overflow: hidden;
  cursor: zoom-in; inline-size: 100%; box-shadow: var(--shadow);
  transition: transform .16s cubic-bezier(.2,0,.2,1), border-color .16s;
}
.frame:hover { transform: translateY(-2px); border-color: var(--accent); }
.frame:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.frame img { display: block; inline-size: 100%; block-size: auto; }
.plate--tall .frame { max-block-size: 420px; overflow: hidden; position: relative; }
.plate--tall .frame::after {
  content: ''; position: absolute; inset-inline: 0; inset-block-end: 0; block-size: 64px;
  background: linear-gradient(to top, var(--surface), transparent);
}
figcaption { display: flex; flex-direction: column; gap: 6px; }
.cap { margin: 0; font-size: 14px; line-height: 1.6; }
.meta { margin: 0; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.file {
  font-family: var(--mono); font-size: 11px; color: var(--muted);
  direction: ltr; unicode-bidi: embed;
}
.spec, .tall {
  font-size: 11px; padding: 2px 8px; border-radius: 999px; line-height: 1.6;
}
.spec { background: var(--accent-soft); color: var(--accent); }
.tall { background: var(--sunken); color: var(--muted); }

/* ── توکن‌ها ───────────────────────────────────────────── */
.tokens { margin-block-start: 64px; }
.sw-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; background: var(--rule); border: 1px solid var(--rule); border-radius: 14px; overflow: hidden; }
.sw-list li {
  display: grid; grid-template-columns: 28px minmax(130px, auto) auto 1fr;
  align-items: center; gap: 14px; background: var(--surface); padding: 11px 16px;
}
.sw { inline-size: 22px; block-size: 22px; border-radius: 6px; border: 1px solid rgba(23,38,43,.14); }
.sw-name, .sw-hex { font-family: var(--mono); font-size: 12.5px; direction: ltr; unicode-bidi: embed; }
.sw-hex { color: var(--muted); font-variant-numeric: tabular-nums; }
.sw-use { font-size: 14px; color: var(--muted); }
@media (max-width: 560px) {
  .sw-list li { grid-template-columns: 22px 1fr auto; }
  .sw-use { grid-column: 2 / -1; }
}

/* ── یادداشت‌ها ────────────────────────────────────────── */
.notes { display: grid; gap: 22px; margin-block-start: 64px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
.note { background: var(--surface); border: 1px solid var(--rule); border-radius: 16px; padding: 22px 24px; }
.note.warn { background: var(--flag-soft); border-color: color-mix(in srgb, var(--flag) 28%, transparent); }
.note h3 { font-size: 17px; margin-block-end: 10px; }
.note.warn h3 { color: var(--flag); }
.note ul { margin: 0; padding-inline-start: 1.1em; display: grid; gap: 7px; }
.note li { font-size: 14.5px; line-height: 1.7; }
.note p { margin: 0; font-size: 14.5px; color: var(--muted); }

/* ── بزرگ‌نمایی ────────────────────────────────────────── */
dialog {
  border: none; padding: 0; background: transparent; max-inline-size: 100vw; max-block-size: 100vh;
  inline-size: 100%; block-size: 100%; margin: 0;
}
dialog::backdrop { background: rgba(10, 18, 21, .86); }
.lb { block-size: 100%; display: grid; grid-template-rows: auto 1fr; gap: 12px; padding: 14px; }
.lb-bar { display: flex; align-items: center; gap: 10px; color: #e6ecea; }
.lb-bar .cap { flex: 1; font-size: 14px; }
.lb button {
  font-family: var(--fa); font-size: 14px; color: #e6ecea; background: rgba(255,255,255,.12);
  border: none; border-radius: 999px; padding: 7px 15px; cursor: pointer; line-height: 1.6;
}
.lb button:hover { background: rgba(255,255,255,.22); }
.lb button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.lb-img { overflow: auto; display: flex; justify-content: center; align-items: flex-start; }
.lb-img img { max-inline-size: min(420px, 100%); block-size: auto; border-radius: 12px; }

@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>

<nav><div class="inner">${nav}</div></nav>

<div class="wrap">
  <header class="top">
    <p class="eyebrow">DESIGN REVIEW · 40 SCREENS · 390×844 @2x</p>
    <h1>سامانه مدیریت مهدکودک</h1>
    <p class="lede">
      هر صفحه‌ای که تا امروز ساخته شده، در مرورگر واقعی و روی داده نمونه یک کلاس
      ۲۵ نفره. عکس‌ها با راه رفتن روی همان جریانی گرفته شده‌اند که مربی و خانواده
      طی می‌کنند، نه با ساختن حالت‌های دستی.
    </p>
    <div class="facts">
      <span class="fact"><b>مربی</b><span class="num">09120000001</span></span>
      <span class="fact"><b>مربی و مدیر</b><span class="num">09120000002</span></span>
      <span class="fact"><b>سرپرست</b><span class="num">09120000003</span></span>
      <span class="fact"><b>کد تأیید</b><span class="num">11111</span></span>
      <span class="fact"><a class="live" href="https://morashidian8.github.io/Tictactoestevie/kindergarten/" target="_blank" rel="noopener">نسخه زنده</a></span>
    </div>
  </header>
${sections}

  <section class="tokens">
    <div class="group-head">
      <h2>رنگ‌های نظام طراحی</h2>
      <span class="count">${fa(TOKENS.length)}</span>
      <p>بخش ۱۲.۲ سند. هیچ جزئی حق ندارد مقدار خام بنویسد؛ همه رنگ‌ها از این توکن‌ها می‌آیند. حالت تاریک طبق پیوست ج ساخته نمی‌شود.</p>
    </div>
    <ul class="sw-list">${swatches}
    </ul>
  </section>

  <div class="notes">
    <div class="note">
      <h3>قاعده‌هایی که در طراحی شکسته نمی‌شوند</h3>
      <ul>
        <li>تاریخ میلادی هیچ‌جای رابط دیده نمی‌شود. همه ارقام فارسی‌اند.</li>
        <li>هر صفحه فقط یک کنش اصلی دارد، چسبیده به پایین قاب.</li>
        <li>هدف لمسی مربی دست‌کم ۵۶ پیکسل، والد ۴۸، مدیر ۴۴.</li>
        <li>در عرض ۳۲۰ پیکسل هیچ لغزش افقی نیست.</li>
        <li>نسبت کنتراست هر متن دست‌کم ۴٫۵، با تست خودکار روی خود توکن‌ها.</li>
        <li>هفته از شنبه شروع می‌شود.</li>
      </ul>
    </div>
    <div class="note">
      <h3>ساخته نمی‌شود — پیوست ج</h3>
      <ul>
        <li>حالت تاریک.</li>
        <li>نمودار، درصد و امتیاز در خروجی خانواده.</li>
        <li>مقایسه کودک با کودکان دیگر، در هر شکلی.</li>
        <li>گزارش ماهانه و پیام‌رسان دوطرفه در این مرحله.</li>
      </ul>
    </div>
    <div class="note warn">
      <h3>هنوز ساخته نشده</h3>
      <ul>
        <li>پنل مدیر: صف تأیید رویداد، مالی، اعلام تعطیلی.</li>
        <li>آپلود واقعی عکس. Supabase هنوز وصل نیست، پس عکس جایی نمی‌رود.</li>
        <li>فونت استعداد و مربع. تا رسیدن فایل، وزیرمتن می‌نشیند که خود سند
            جایگزینش نامیده — یعنی وزن تیترها هنوز آن چیزی نیست که باید باشد.</li>
        <li>داده نمونه در مرورگر خود بیننده ذخیره می‌شود، پس روی دستگاه دیگر دیده نمی‌شود.</li>
      </ul>
    </div>
  </div>
</div>

<dialog id="lb">
  <div class="lb">
    <div class="lb-bar">
      <button type="button" id="prev">قبلی</button>
      <button type="button" id="next">بعدی</button>
      <p class="cap" id="lbcap"></p>
      <button type="button" id="close">بستن</button>
    </div>
    <div class="lb-img"><img id="lbimg" alt="" /></div>
  </div>
</dialog>

<script>
  const SHOTS = ${JSON.stringify(
    shots.map((s) => ({ file: s.file, caption: stripChip(s.caption) })),
  )};
  const dlg = document.getElementById('lb');
  const img = document.getElementById('lbimg');
  const cap = document.getElementById('lbcap');
  let at = 0;
  const show = (i) => {
    at = (i + SHOTS.length) % SHOTS.length;
    img.src = 'shots/' + SHOTS[at].file;
    img.alt = SHOTS[at].caption;
    cap.textContent = SHOTS[at].caption;
  };
  document.querySelectorAll('.frame').forEach((b) => {
    b.addEventListener('click', () => { show(Number(b.dataset.i)); dlg.showModal(); });
  });
  document.getElementById('close').addEventListener('click', () => dlg.close());
  document.getElementById('prev').addEventListener('click', () => show(at - 1));
  document.getElementById('next').addEventListener('click', () => show(at + 1));
  // راست‌چین: پیکان چپ جلو می‌رود، پیکان راست عقب.
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(at + 1);
    if (e.key === 'ArrowRight') show(at - 1);
  });
</script>
`

writeFileSync(here + 'index.html', html)
console.log('design-review/index.html نوشته شد،', shots.length, 'عکس')
