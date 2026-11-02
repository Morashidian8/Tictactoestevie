/**
 * عکس‌برداری از همه صفحه‌ها برای بازبینی طراح.
 *
 *   npm run dev -- --port 5199
 *   node design-review/capture.mjs
 *
 * خروجی: design-review/shots/NN-*.png و design-review/shots/index.json
 * این فایل بخشی از محصول نیست؛ ابزار بازبینی است.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5199'
const EXECUTABLE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium'
const OUT = new URL('./shots/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: EXECUTABLE })
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
})

const shots = []
let n = 0
const shot = async (slug, caption, group, opts = {}) => {
  n += 1
  const file = `${String(n).padStart(2, '0')}-${slug}.png`
  await page.waitForTimeout(350)
  await page.screenshot({ path: OUT + file, fullPage: opts.full === true })
  shots.push({ file, caption, group, full: opts.full === true })
  console.log(`  ${file}  ${caption}`)
}

const D = '[role="dialog"] '
const signIn = async (phone, { fresh = true } = {}) => {
  await page.goto(BASE)
  if (fresh) {
    await page.evaluate(() => localStorage.clear())
    await page.goto(BASE)
  }
  await page.waitForSelector('#phone')
  await page.fill('#phone', phone)
  await page.click('button:has-text("فرستادن کد")')
  await page.waitForSelector('#code')
  await page.fill('#code', '11111')
  await page.click('button:has-text("ورود")')
}

const signOutAny = async () => {
  const teacher = page.locator('header [class*="accountButton"]')
  const parent = page.locator('header [class*="account"]')
  if (await teacher.count()) await teacher.first().click()
  else await parent.first().click()
  await page.waitForTimeout(350)
  await page.click('button:has-text("خروج")')
  await page.waitForSelector('#phone')
}

// ── ۱. ورود ────────────────────────────────────────────────────────
console.log('▸ ورود و انتخاب حساب')
await page.goto(BASE)
await page.evaluate(() => localStorage.clear())
await page.goto(BASE)
await page.waitForSelector('#phone')
await shot('signin-phone', 'ورود: شماره موبایل — بخش ۳.۲', 'ورود', { full: true })

await page.fill('#phone', '09120000002')
await page.click('button:has-text("فرستادن کد")')
await page.waitForSelector('#code')
await shot('signin-code', 'ورود: کد پنج‌رقمی پیامکی', 'ورود', { full: true })

await page.fill('#code', '11111')
await page.click('button:has-text("ورود")')
await page.waitForSelector('text=با کدام حساب وارد می‌شوید؟')
await shot('account-picker', 'انتخاب حساب: یک شماره، چند نقش. نقش‌ها هرگز با هم ترکیب نمی‌شوند', 'ورود', { full: true })

await page.click('button:has-text("مریم رضایی") >> nth=0')
await page.waitForSelector('text=ثبت گروهی امروز')

// ── ۲. امروز، آغاز روز ─────────────────────────────────────────────
console.log('▸ پنل مربی: امروز')
await shot('today-start', 'امروز، آغاز روز: همه هنوز نیامده‌اند — بخش ۵.۱', 'مربی — امروز')
await shot('today-start-full', 'امروز، تمام صفحه', 'مربی — امروز', { full: true })

// ── ۳. شیت ورود ────────────────────────────────────────────────────
await page.click('button[aria-label^="ثبت ورود"] >> nth=0')
await page.waitForSelector('[role="dialog"]')
await shot('arrival-normal', 'شیت ورود: چه کسی آورد، وضعیت، دارو. همه از پیش انتخاب‌شده تا تأیید یک ضربه بماند', 'مربی — ورود')

await page.click(D + 'button:has-text("خراش یا کبودی")')
await page.fill('input[aria-label="نام دارو"]', 'شربت سرماخوردگی')
await page.waitForTimeout(200)
await shot('arrival-exception', 'شیت ورود، حالت استثنا: با وضعیت غیرعادی دکمه عکس برجسته می‌شود و دارو ساعت می‌گیرد', 'مربی — ورود', { full: true })

await page.click(D + '[class*="primary"]')
await page.waitForTimeout(700)

// چند ورود دیگر تا حالت‌های آواتار دیده شود
for (let i = 0; i < 4; i += 1) {
  const btn = page.locator('button[aria-label^="ثبت ورود"] >> nth=0')
  if ((await btn.count()) === 0) break
  await btn.click()
  await page.waitForSelector('[role="dialog"]')
  await page.click(D + '[class*="primary"]')
  await page.waitForTimeout(500)
}
await shot('today-mixed', 'امروز با حالت‌های مختلف: حاضر، نیامده، غایبِ باخبر', 'مربی — امروز')

// ── ۴. تراشه بی‌خبر ────────────────────────────────────────────────
const chip = page.locator('[class*="tallyAction"]:not(:disabled)')
if ((await chip.count()) > 0) {
  await chip.first().click()
  await page.waitForTimeout(350)
  await shot('today-outstanding', 'تراشه «بی‌خبر» فهرست نام‌ها را باز می‌کند. بنر قرمز جدا حذف شد', 'مربی — امروز', { full: true })
  await chip.first().click()
  await page.waitForTimeout(250)
}

// ── ۵. خروج ────────────────────────────────────────────────────────
console.log('▸ پنل مربی: خروج و تحویل')
const present = await page.locator('button[aria-label^="ثبت خروج"] >> nth=0').getAttribute('aria-label')
await page.click(`button[aria-label="${present}"]`)
await page.waitForSelector('[role="dialog"]')
await shot('checkout-allowed', 'شیت خروج: فقط فهرست مجاز تحویل‌گیرندگان — بخش ۵.۸', 'مربی — خروج', { full: true })

await page.click(D + 'button:has-text("کسی غیر از این‌ها آمده")')
await page.fill('input[aria-label="کد تحویل"]', '9999')
await page.waitForTimeout(400)
await shot('checkout-badcode', 'کد تحویل نامعتبر: ثبت باز نمی‌شود و دلیلش نوشته می‌شود', 'مربی — خروج', { full: true })

await page.click(D + 'button:has-text("بازگشت به فهرست مجاز")')
await page.click(D + '[class*="person"] >> nth=0')
await page.waitForTimeout(250)
await shot('checkout-ready', 'با انتخاب فرد مجاز، دکمه ساعت تحویل را نشان می‌دهد', 'مربی — خروج')
await page.click(D + '[class*="primary"]')
await page.waitForTimeout(700)
await shot('today-left', 'کودک به حالت «رفته» رفت. نوار پایین: کنش اصلی + ثبت رویداد', 'مربی — امروز')

// ── ۶. رویداد ──────────────────────────────────────────────────────
console.log('▸ پنل مربی: ثبت رویداد')
await page.click('button:has-text("ثبت رویداد")')
await page.waitForSelector('[role="dialog"]')
await shot('incident-who', 'ثبت رویداد: اول کودک و نوع رویداد — بخش ۵.۶', 'مربی — رویداد', { full: true })

await page.click(D + '[class*="childCell"] >> nth=1')
await page.click(D + 'button:has-text("زمین خوردن")')
await page.waitForTimeout(300)
await shot('incident-severity', 'شدت رویداد: پیامد هر شدت همان‌جا نوشته شده', 'مربی — رویداد', { full: true })

await page.click(D + '[class*="severity"]:has-text("جزئی")')
await page.waitForTimeout(250)
await shot('incident-minor-kinds', 'دسته‌های رویداد جزئی بسته و از پیش تعریف‌شده‌اند', 'مربی — رویداد', { full: true })

await page.click(D + 'button:has-text("خراش سطحی")')
await page.click(D + '[class*="primary"]:has-text("ادامه")')
await page.click(D + 'button:has-text("کلاس")')
await page.fill('textarea[aria-label="توضیح رویداد"]', 'به لبه میز خورد.')
await page.waitForTimeout(250)
await shot('incident-detail', 'جزئیات: مکان، توضیح، و پرچم ناحیه سر', 'مربی — رویداد', { full: true })

await page.click(D + 'button:has-text("ناحیه سر یا صورت بود")')
await page.waitForTimeout(300)
await shot('incident-escalation', 'هشدار ارتقای خودکار شدت، پیش از ثبت — بخش ۳.۳', 'مربی — رویداد', { full: true })

await page.click(D + '[class*="primary"]:has-text("ثبت رویداد")')
await page.waitForSelector('[class*="doneTitle"]')
await shot('incident-to-manager', 'رویداد ارتقایافته اول برای مدیر می‌رود، نه خانواده', 'مربی — رویداد')
await page.click(D + '[class*="primary"]:has-text("بستن")')
await page.waitForTimeout(400)

// رویداد جزئیِ سارا، چون سرپرست نمونه سرپرست اوست
await page.click('button:has-text("ثبت رویداد")')
await page.click(D + '[class*="childCell"]:has-text("سارا")')
await page.click(D + 'button:has-text("زمین خوردن")')
await page.click(D + '[class*="severity"]:has-text("جزئی")')
await page.click(D + 'button:has-text("خراش سطحی")')
await page.click(D + '[class*="primary"]:has-text("ادامه")')
await page.click(D + 'button:has-text("حیاط")')
await page.fill('textarea[aria-label="توضیح رویداد"]', 'هنگام دویدن زمین خورد.')
await page.click(D + '[class*="primary"]:has-text("ثبت رویداد")')
await page.waitForSelector('[class*="doneTitle"]')
await shot('incident-to-family', 'رویداد جزئی مستقیم به خانواده می‌رود', 'مربی — رویداد')
await page.click(D + '[class*="primary"]:has-text("بستن")')
await page.waitForTimeout(400)

// ── ۷. جابه‌جایی حساب ──────────────────────────────────────────────
await page.click('header [class*="accountButton"]')
await page.waitForTimeout(350)
await shot('account-switch', 'جابه‌جایی حساب بدون خروج و کد دوباره — بخش ۳.۲', 'مربی — امروز', { full: true })
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// ── ۸. ثبت گروهی ───────────────────────────────────────────────────
console.log('▸ پنل مربی: ثبت گروهی')
await page.click('button:has-text("ثبت گروهی امروز")')
await page.waitForSelector('text=اعمال روی همه')
await shot('bulk-top', 'ثبت گروهی: یک بار برای کل کلاس — مهم‌ترین صفحه سامانه، بخش ۵.۵', 'مربی — ثبت گروهی')
await shot('bulk-full', 'ثبت گروهی، تمام صفحه', 'مربی — ثبت گروهی', { full: true })

await page.click('[aria-label="ثبت یکجا برای کل کلاس"] button:has-text("بیشترش")')
await page.click('[aria-label="ثبت یکجا برای کل کلاس"] button:has-text("خوب")')
await page.fill('input[aria-label="ساعت شروع خواب"]', '13:00')
await page.waitForTimeout(250)
await shot('bulk-ready', 'با پر شدن نوار، دکمه اعمال باز می‌شود', 'مربی — ثبت گروهی')
await page.click('[class*="applyInline"]')
await page.waitForSelector('text=/اعمال شد/')
await shot('bulk-applied', 'پس از اعمال: همه گرفتند، و استثناها جدا ثبت می‌شوند', 'مربی — ثبت گروهی', { full: true })

// استثنای یک کودک
await page.click('button:has([class*="itemName"]:text-is("امیر"))')
await page.waitForSelector('[role="dialog"]')
await shot('child-exception', 'شیت استثنای کودک: فقط همان چیزی که با کلاس فرق دارد', 'مربی — ثبت گروهی', { full: true })
await page.click(D + 'button:has-text("کمی")')
await page.fill('textarea[aria-label="یادداشت مربی"]', 'امروز خیلی پرخاشگر بود')
await page.waitForTimeout(350)
await shot('banned-word', 'هشدار واژه برچسب‌زننده — پیوست ب. هشدار است، نه مانع', 'مربی — ثبت گروهی', { full: true })
await page.fill('textarea[aria-label="یادداشت مربی"]', 'دو بار اسباب‌بازی را از دیگری گرفت.')
await page.waitForTimeout(300)
await shot('note-observational', 'همان متن، مشاهده‌ای نوشته شده: هشدار می‌رود', 'مربی — ثبت گروهی', { full: true })
await page.click(D + 'button:has-text("ذخیره استثنا")')
await page.waitForTimeout(600)

// ── ۹. عکس با تگ ───────────────────────────────────────────────────
console.log('▸ پنل مربی: عکس و تگ')
const dataUrl = await page.evaluate(() => {
  const c = document.createElement('canvas')
  c.width = 900; c.height = 600
  const x = c.getContext('2d')
  const g = x.createLinearGradient(0, 0, 900, 600)
  g.addColorStop(0, '#E4F2F0'); g.addColorStop(1, '#F7E9CF')
  x.fillStyle = g; x.fillRect(0, 0, 900, 600)
  x.fillStyle = '#0F8C86'; x.beginPath(); x.arc(330, 340, 120, 0, Math.PI * 2); x.fill()
  x.fillStyle = '#C75B39'; x.beginPath(); x.arc(580, 300, 95, 0, Math.PI * 2); x.fill()
  x.fillStyle = '#13272F'; x.fillRect(0, 520, 900, 80)
  return c.toDataURL('image/png')
})
writeFileSync('/tmp/kg-shot-sample.png', Buffer.from(dataUrl.split(',')[1], 'base64'))
await page.setInputFiles('input[type="file"]', '/tmp/kg-shot-sample.png')
await page.waitForSelector('[role="dialog"]', { timeout: 10000 })
await shot('photo-untagged', 'عکس بدون تگ ثبت نمی‌شود و دلیلش نوشته شده — بخش ۵.۵', 'مربی — عکس', { full: true })
await page.click(D + '[class*="cell"] >> nth=0')
await page.click(D + '[class*="cell"] >> nth=1')
await page.waitForTimeout(250)
await shot('photo-tagged', 'با تگ خوردن، ثبت باز می‌شود. رضایت هر خانواده جدا بررسی می‌شود', 'مربی — عکس', { full: true })
await page.click(D + '[class*="primary"]')
await page.waitForTimeout(900)
await shot('photo-strip', 'نوار عکس‌های امروز', 'مربی — عکس')

// ── ۱۰. بستن روز ───────────────────────────────────────────────────
console.log('▸ پنل مربی: بستن روز')
await page.click('[aria-label="بازگشت به امروز"]')
await page.waitForSelector('text=ثبت گروهی امروز')
await page.click('button:has-text("بستن روز")')
await page.waitForSelector('text=ارسال گزارش‌های امروز')
await shot('closeday-before', 'بستن روز: شمار کامل و ناقص، پیش از ارسال — بخش ۵.۹', 'مربی — بستن روز', { full: true })

// ── ۱۱. والد، پیش از ارسال ─────────────────────────────────────────
console.log('▸ پنل والد: پیش از ارسال')
await page.click('[aria-label="بازگشت به امروز"]')
await page.waitForSelector('text=ثبت گروهی امروز')
await signOutAny()
await signIn('09120000003', { fresh: false })
await page.waitForSelector('[class*="dateLine"]', { timeout: 8000 })
await shot('parent-pending', 'والد پیش از ارسال: گزارش تا وقتی مربی نفرستاده به خانواده نمی‌رسد', 'والد', { full: true })

// ── ۱۲. مربی می‌فرستد ──────────────────────────────────────────────
await signOutAny()
await signIn('09120000001', { fresh: false })
await page.waitForSelector('text=ثبت گروهی امروز')
await page.click('button:has-text("بستن روز")')
await page.waitForSelector('text=ارسال گزارش‌های امروز')
await page.click('[class*="bar"] button:has-text("ارسال گزارش‌های امروز")')
await page.waitForSelector('[class*="sentTitle"]')
await shot('closeday-sent', 'پس از ارسال: گزارش قفل است و از این پس فقط اصلاحیه ثبت می‌شود', 'مربی — بستن روز', { full: true })

// ── ۱۳. والد، پس از ارسال ──────────────────────────────────────────
console.log('▸ پنل والد: پس از ارسال')
await page.click('[aria-label="بازگشت به امروز"]')
await page.waitForSelector('text=ثبت گروهی امروز')
await signOutAny()
await signIn('09120000003', { fresh: false })
await page.waitForSelector('[class*="dateLine"]', { timeout: 8000 })
await shot('parent-top', 'والد، امروز: عکس اول صفحه است. تنها چیزی که والد واقعاً برایش می‌آید — بخش ۶.۳', 'والد')
await shot('parent-full', 'والد، تمام صفحه: عکس، ورود و خروج، ناهار و خواب و خلق، یادداشت، رویداد، از خانه. بدون درصد و نمودار و مقایسه', 'والد', { full: true })

const second = page.locator('[class*="switcher"] button')
if ((await second.count()) > 1) {
  await second.nth(1).click()
  await page.waitForTimeout(600)
  await shot('parent-second-child', 'خانواده با بیش از یک کودک: جابه‌جایی بالای صفحه', 'والد', { full: true })
  await second.nth(0).click()
  await page.waitForTimeout(400)
}

// ── ۱۴. پنل مدیر، هنوز ساخته نشده ──────────────────────────────────
console.log('▸ پنل مدیر')
await signOutAny()
await signIn('09120000002')
await page.waitForSelector('text=با کدام حساب وارد می‌شوید؟')
const managerBtn = page.locator('button:has-text("مدیر")').first()
if ((await managerBtn.count()) > 0) {
  await managerBtn.click()
  await page.waitForTimeout(600)
  await shot('manager-placeholder', 'پنل مدیر هنوز ساخته نشده — صف تأیید رویداد، مالی و اعلام تعطیلی باقی مانده', 'مدیر', { full: true })
}

// ── ۱۵. عرض ۳۲۰ ────────────────────────────────────────────────────
console.log('▸ کف کیفیت')
await signIn('09120000001')
await page.waitForSelector('text=ثبت گروهی امروز')
await page.setViewportSize({ width: 320, height: 700 })
await page.waitForTimeout(500)
await shot('narrow-320', 'باریک‌ترین حالت پشتیبانی‌شده، ۳۲۰ پیکسل: بدون لغزش افقی — بخش ۱۲.۷', 'کف کیفیت', { full: true })

await page.setViewportSize({ width: 820, height: 1180 })
await page.waitForTimeout(500)
await shot('tablet-820', 'تبلت ۸۲۰ پیکسل', 'کف کیفیت', { full: true })

writeFileSync(OUT + 'index.json', JSON.stringify(shots, null, 2))
await browser.close()
console.log(`\n${shots.length} عکس در design-review/shots/`)
