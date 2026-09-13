/**
 * اندازه‌گیری زمان دو کار روزمره مربی — بخش ۱۷ سند.
 *
 *   npm run dev -- --port 5199
 *   node e2e/timing.spec.mjs
 *
 * روی مرورگر واقعی و روی همان جریان واقعی. هر ضربه با تأخیر انسانی
 * شبیه‌سازی می‌شود، وگرنه عددی به دست می‌آید که هیچ مربی‌ای تجربه‌اش
 * نمی‌کند. TAP_MS زمان بردن انگشت و زدن است، READ_MS مکث خواندن پیش از
 * هر تصمیم تازه.
 *
 * تعداد ضربه و اسکرول هم شمرده می‌شود، چون عدد ثانیه به سرعت دستگاه
 * بسته است ولی تعداد ضربه نیست.
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5199'
const EXECUTABLE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium'
const TAP_MS = Number(process.env.TAP_MS ?? 450)
const READ_MS = Number(process.env.READ_MS ?? 900)

const browser = await chromium.launch({ executablePath: EXECUTABLE })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

/*
 * ساعت ثابت روی یک روز کاری.
 *
 * صفحه حالا بازه‌محور است: شب هیچ کودکی در جلسه نیست و عدد اندازه‌گیری
 * بی‌معنا می‌شود. ۲۰۲۶-۰۳-۱۱ چهارشنبه است.
 */
const FIXED_DAY = '2026-03-11'
const setClock = (hour, minute = 0) =>
  page.clock.setFixedTime(
    new Date(
      `${FIXED_DAY}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`,
    ),
  )
await setClock(9)

let taps = 0
let scrolls = 0

const tap = async (locator) => {
  taps += 1
  await page.waitForTimeout(TAP_MS)
  await locator.click()
}
const read = () => page.waitForTimeout(READ_MS)
const scrollDown = async () => {
  scrolls += 1
  await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8))
  await page.waitForTimeout(250)
}

const signIn = async (phone) => {
  await page.goto(BASE)
  await page.evaluate(() => localStorage.clear())
  await page.goto(BASE)
  await page.waitForSelector('#phone')
  await page.fill('#phone', phone)
  await page.click('button:has-text("فرستادن کد")')
  await page.waitForSelector('#code')
  await page.fill('#code', '11111')
  await page.click('button:has-text("ورود")')
  await page.waitForSelector('text=ثبت گروهی امروز')
}

const seconds = (ms) => (ms / 1000).toFixed(1)
const results = []

// ── ۱. ثبت ورود یک کودک ────────────────────────────────────────
await signIn('09120000001')
const tallyText = () => page.locator('[class*="tally"]').first().innerText()

{
  taps = 0
  scrolls = 0
  const before = await tallyText()
  const cell = page.locator('button[aria-label^="ثبت ورود"] >> nth=0')
  await cell.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
  await page.waitForTimeout(300)

  // ساعت از لحظه‌ای شروع می‌شود که مربی کودک را دیده و تصمیم گرفته.
  const start = Date.now()
  await tap(cell)
  await page.waitForFunction(
    (was) => !document.querySelector('[class*="tally"]').innerText.includes(was),
    before.split('\n')[0],
    { timeout: 5000 },
  )
  const ms = Date.now() - start
  results.push({ label: 'ثبت ورود یک کودک', target: 3000, ms, taps, scrolls })
}

/*
 * ── ۲ و ۳. ثبت روز، حالا در دو بازه ─────────────────────────────
 *
 * بودجه سند (۹۰ ثانیه) برای یک پنجره طلایی است، و مهد واقعی دو پنجره
 * دارد: یکی پیش از ناهار و یکی پس از خواب. پس هر بازه جدا سنجیده
 * می‌شود، نه جمعشان — وگرنه عددی می‌ساختیم که با هیچ لحظه‌ای از روزِ
 * مربی نمی‌خواند.
 */
const bar = '[aria-label="ثبت یکجا برای کودکان این بازه"] '

const measureSession = async (label, { withNap }) => {
  taps = 0
  scrolls = 0
  const start = Date.now()

  await tap(page.locator('button:has-text("ثبت گروهی امروز")'))
  await page.waitForSelector('text=اعمال روی همه')
  await read()

  await tap(page.locator(`${bar}button:has-text("بیشترش")`))
  await tap(page.locator(`${bar}button:has-text("خوب")`))
  if (withNap) {
    // ساعت خواب فقط در بازه بعدازظهر پرسیده می‌شود.
    await page.fill('input[aria-label="ساعت شروع خواب"]', '13:00')
    taps += 1
  }
  await tap(page.locator('[class*="applyInline"]'))
  await page.waitForSelector('text=/اعمال شد/')
  await read()

  // چهار استثنا. هر کدام: پیدا کردن در فهرست، باز کردن، یک تغییر، ذخیره.
  let done = 0
  for (const name of ['امیر', 'آوا', 'کیان', 'هستی', 'سارا', 'رضا', 'مریم', 'هستی']) {
    if (done === 4) break
    const row = page.locator(`button:has([class*="itemName"]:text-is("${name}"))`)
    if ((await row.count()) === 0) continue
    const seen = await row.isVisible().catch(() => false)
    if (!seen) await scrollDown()
    await row.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
    await page.waitForTimeout(200)
    await tap(row)
    await page.waitForSelector('[role="dialog"]')
    await read()
    await tap(page.locator('[role="dialog"] button:has-text("کمی")'))
    await tap(page.locator('[role="dialog"] button:has-text("ذخیره استثنا")'))
    await page.waitForSelector('[role="dialog"]', { state: 'detached' })
    done += 1
  }

  await tap(page.locator('[class*="bar"] button:has-text("ذخیره و بازگشت")'))
  await page.waitForSelector('text=ثبت گروهی امروز')
  results.push({ label, target: 90_000, ms: Date.now() - start, taps, scrolls })
}

await signIn('09120000001')
const inSession = async () =>
  (await page.locator('[class*="periodCount"]').innerText()).trim()

console.log(`  بازه صبح: ${await inSession()}`)
await measureSession('بازه صبح، با ۴ استثنا', { withNap: false })

await setClock(14)
await page.reload()
await page.waitForSelector('text=ثبت گروهی امروز')
console.log(`  بازه بعدازظهر: ${await inSession()}`)
await measureSession('بازه بعدازظهر، با ۴ استثنا', { withNap: true })

await browser.close()

console.log('')
console.log(`تأخیر انسانی هر ضربه ${TAP_MS} میلی‌ثانیه، مکث خواندن ${READ_MS}.`)
console.log('')
let failed = 0
for (const r of results) {
  const ok = r.ms <= r.target
  if (!ok) failed += 1
  console.log(`${ok ? '  ✓' : '  ✗'} ${r.label}`)
  console.log(
    `      ${seconds(r.ms)} ثانیه (هدف: زیر ${seconds(r.target)}) · ` +
      `${r.taps} ضربه · ${r.scrolls} اسکرول`,
  )
}
console.log('')
console.log(failed ? `${failed} مورد از هدف عقب ماند` : 'هر دو زیر هدف سند.')
process.exit(failed ? 1 : 0)
