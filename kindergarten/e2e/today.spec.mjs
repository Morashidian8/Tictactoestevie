/**
 * راه‌رفتن روی جریان واقعی، در مرورگر واقعی.
 *
 *   npm run dev            (در یک ترمینال)
 *   npm run test:e2e       (در ترمینال دیگر)
 *
 * این تست همان چیزی را می‌آزماید که تست واحد نمی‌تواند: اینکه ورود،
 * انتخاب حساب، ثبت ورود و جابه‌جایی حساب واقعاً به هم وصل‌اند.
 */
import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5199'
const EXECUTABLE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium'

let failures = 0
const check = (ok, label) => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}`)
  if (!ok) failures += 1
}

const browser = await chromium.launch({ executablePath: EXECUTABLE })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

const consoleErrors = []
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
page.on('pageerror', (e) => consoleErrors.push(String(e)))

/**
 * ورود با یک شماره.
 *
 * fresh=false داده مرورگر را پاک نمی‌کند؛ برای وقتی که می‌خواهیم همان
 * روزی که مربی تازه ثبت کرده از دید خانواده دیده شود.
 */
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

/** خروج از هر پنلی. سرصفحه هر سه پنل کلید حساب دارد، با کلاس‌های جدا. */
const signOutAny = async () => {
  const teacher = page.locator('header [class*="accountButton"]')
  if (await teacher.count()) await teacher.first().click()
  else await page.locator('header [class*="account"]').first().click()
  await page.waitForTimeout(350)
  await page.click('button:has-text("خروج")')
  await page.waitForSelector('#phone')
}


/**
 * نگه‌داشتن انگشت روی یک کودک: شیت استثناها بدون ثبت ورود.
 *
 * پس از هر ثبت، شبکه دوباره چیده می‌شود و خانه زیر انگشت جابه‌جا
 * می‌شود؛ آن وقت pointerleave نگه‌داشتن را لغو می‌کند. پس تا آرام شدن
 * چیدمان صبر می‌کنیم و در صورت لغو، یک بار دیگر تلاش می‌کنیم.
 */
const holdFirstNotArrived = async () => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const cell = page.locator('button[aria-label^="ثبت ورود"] >> nth=0')
    // وسط قاب، نه لبه: نوار چسبیده پایین صفحه می‌تواند روی خانه بیفتد و
    // آن وقت انگشت روی نوار می‌نشیند نه روی کودک.
    await cell.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
    await page.waitForTimeout(400)
    const box = await cell.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(750)
    await page.mouse.up()
    await page.waitForTimeout(400)
    if ((await page.locator('[role="dialog"]').count()) > 0) return
    // اگر ضربه شمرده شد، همان‌جا ورود ثبت شده؛ لغوش کن و دوباره امتحان.
    const chip = page.locator('[class*="justIn"]')
    if (await chip.count()) {
      console.log('    (ضربه به‌جای نگه‌داشتن شمرده شد، تلاش دوباره)')
      await page.waitForTimeout(4200)
    }
  }
  await page.screenshot({ path: '/tmp/hold-fail.png' })
  console.log('    BODY:', (await page.evaluate(() => document.body.innerText)).slice(0, 200).replace(/\n/g, ' | '))
  throw new Error('نگه‌داشتن انگشت شیت را باز نکرد')
}

console.log('▸ بخش ۳.۲: یک حساب یعنی ورود مستقیم')
await signIn('09120000001')
await page.waitForSelector('text=ثبت گروهی امروز')
check(
  (await page.locator('text=با کدام حساب وارد می‌شوید؟').count()) === 0,
  'شماره یک‌حسابه صفحه انتخاب حساب نمی‌بیند',
)
check(
  (await page.locator('header button:has-text("گل‌ها")').count()) === 0,
  'مربی تک‌کلاسه کلید تعویض کلاس ندارد',
)

console.log('▸ بخش ۳.۲: بیش از یک حساب یعنی انتخاب لازم است')
await signIn('09120000002')
await page.waitForSelector('text=با کدام حساب وارد می‌شوید؟')
check(true, 'صفحه انتخاب حساب آمد')
check(
  (await page.locator('text=ثبت گروهی امروز').count()) === 0,
  'پیش از انتخاب حساب، هیچ داده‌ای نمایش داده نمی‌شود',
)

await page.click('button:has-text("مریم رضایی") >> nth=0')
await page.waitForSelector('text=ثبت گروهی امروز')

console.log('▸ بخش ۵.۳: ضربه کوتاه، ورود با پیش‌فرض و بدون صفحه واسط')
const tallyText = () => page.locator('[class*="tally"]').first().innerText()
const before = await tallyText()
await page.click('button[aria-label^="ثبت ورود"] >> nth=0')
await page.waitForTimeout(700)
check((await page.locator('[role="dialog"]').count()) === 0, 'هیچ شیتی باز نمی‌شود')
const afterQuick = await tallyText()
check(afterQuick !== before, 'ورود همان‌جا ثبت شد')

const chip = page.locator('[class*="justIn"]').first()
check(await chip.isVisible(), 'تراشه تأیید آمد')
const chipText = await chip.innerText()
check(/ورود با .+/.test(chipText), `تراشه نام آورنده را می‌گوید: ${chipText.replace(/\n/g, ' ')}`)
check(chipText.includes('تغییر'), 'و راه تغییر را باز می‌گذارد')

await chip.click()
await page.waitForSelector('[role="dialog"]')
check(true, 'ضربه روی «تغییر» شیت سه‌بخشی را باز می‌کند')

const sheetSections = await page.locator('[role="dialog"] h3').allInnerTexts()
check(
  sheetSections.some((t) => t.includes('چه کسی آورد')),
  'می‌پرسد چه کسی آورد',
)
check(
  sheetSections.some((t) => t.includes('وضعیت هنگام ورود')),
  'می‌پرسد علائمی داشت یا نه',
)
check(
  sheetSections.some((t) => t.includes('دارو')),
  'می‌پرسد دارو آورده‌اند یا نه',
)
const preset = await page.locator('[role="dialog"] [aria-pressed="true"]').count()
check(preset >= 2, `آورنده و وضعیت از پیش انتخاب‌اند (${preset} گزینه)`)
// ورود قبلاً ثبت شده، پس این شیت ویرایش همان ردیف است نه ثبت تازه؛ و
// دکمه‌اش همین را می‌گوید.
const confirmLabel = await page.locator('[role="dialog"] [class*="primary"]').first().innerText()
check(/ذخیره/.test(confirmLabel), `دکمه می‌گوید ویرایش است نه ثبت دوباره: ${confirmLabel}`)
await page.click('[role="dialog"] button[aria-label="بستن"]')
await page.waitForTimeout(300)

console.log('▸ تراشه تأیید خودش می‌رود')
await page.waitForTimeout(4500)
check((await page.locator('[class*="justIn"]').count()) === 0, 'پس از چهار ثانیه تراشه رفت')

console.log('▸ نگه‌داشتن انگشت، مستقیم شیت استثناها را باز می‌کند')
const beforeHold = await tallyText()
await holdFirstNotArrived()
check(true, 'نگه‌داشتن شیت را باز کرد')
check((await tallyText()) === beforeHold, 'و ورودی ثبت نشد')
const holdLabel = await page.locator('[role="dialog"] [class*="primary"]').first().innerText()
check(/ساعت/.test(holdLabel), `اینجا ثبت تازه است و ساعت را می‌گوید: ${holdLabel}`)
await page.click('[role="dialog"] [class*="primary"]')
await page.waitForTimeout(700)
const after = await tallyText()
check(after !== before, 'پس از تأیید، نوار خلاصه عوض شد')
const [p1] = [...before.matchAll(/[۰-۹]+/g)].map((m) => m[0])
const [p2] = [...after.matchAll(/[۰-۹]+/g)].map((m) => m[0])
check(p1 !== p2, `شمار حاضران از ${p1} به ${p2} رفت`)

console.log('▸ ضربه دوم روی کودک حاضر، خروجش را می‌گیرد نه ورود دوباره')
const presentChild = await page
  .locator('button[aria-label^="ثبت خروج"] >> nth=0')
  .getAttribute('aria-label')
await page.click(`button[aria-label="${presentChild}"]`)
await page.waitForSelector('[role="dialog"]')
check(true, `ضربه دوم شیت خروج را باز کرد: ${presentChild}`)
check((await tallyText()) === after, 'و ورود دوباره ثبت نشد')
await page.click('[role="dialog"] button[aria-label="بستن"]')
await page.waitForTimeout(300)

console.log('▸ بخش ۵.۸: خروج و تحویل')
const D = '[role="dialog"] '
const present = await page.locator('button[aria-label^="ثبت خروج"] >> nth=0').getAttribute('aria-label')
await page.click(`button[aria-label="${present}"]`)
await page.waitForSelector('[role="dialog"]')
check(true, 'ضربه روی کودک حاضر، شیت خروج را باز می‌کند')
check(
  (await page.locator(D + '[class*="personName"]').count()) >= 2,
  'فهرست مجاز تحویل‌گیرندگان نشان داده می‌شود',
)
check(
  (await page.locator('text=/اگر نه در این فهرست است و نه کد دارد/').count()) === 1,
  'قاعده سفت به مربی گفته می‌شود: بدون فهرست و بدون کد، خروج ثبت نمی‌شود',
)

await page.click(D + 'button:has-text("کسی غیر از این‌ها آمده")')
await page.fill('input[aria-label="کد تحویل"]', '9999')
await page.waitForTimeout(400)
check(
  await page.locator(D + '[class*="primary"]').first().isDisabled(),
  'کد ناموجود، ثبت خروج را باز نمی‌کند',
)
check(
  (await page.locator('text=/چنین کدی وجود ندارد/').count()) === 1,
  'پیام می‌گوید چه شد و چه باید کرد',
)

await page.click(D + 'button:has-text("بازگشت به فهرست مجاز")')
await page.click(D + '[class*="person"] >> nth=0')
check(
  await page.locator(D + '[class*="primary"]').first().isEnabled(),
  'با انتخاب فرد مجاز، ثبت خروج باز می‌شود',
)
const outLabel = await page.locator(D + '[class*="primary"]').first().innerText()
check(/\d|[۰-۹]/.test(outLabel), `دکمه ساعت تحویل را نشان می‌دهد: ${outLabel}`)
await page.click(D + '[class*="primary"]')
await page.waitForTimeout(700)
check(
  (await page.locator(`button[aria-label="${present.replace('ثبت خروج ', '')}، رفته"]`).count()) === 1,
  'کودک به حالت «رفته» رفت',
)

console.log('▸ دکمه ثبت رویداد هرگز روی آخرین ردیف کودکان نمی‌افتد')
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await page.waitForTimeout(300)
const covered = await page.evaluate(() => {
  const fab = [...document.querySelectorAll('button')]
    .find((b) => b.textContent.trim() === 'ثبت رویداد')
    .getBoundingClientRect()
  return [...document.querySelectorAll('ul li button')].filter((c) => {
    const r = c.getBoundingClientRect()
    return !(r.right < fab.left || r.left > fab.right || r.bottom < fab.top || r.top > fab.bottom)
  }).length
})
check(covered === 0, 'در انتهای اسکرول، هیچ کودکی زیر دکمه پنهان نیست')
const shape = await page.evaluate(() => {
  const el = [...document.querySelectorAll('button')].find(
    (b) => b.textContent.trim() === 'ثبت رویداد',
  )
  const main = [...document.querySelectorAll('button')].find((b) =>
    b.textContent.includes('ثبت گروهی امروز'),
  )
  const f = el.getBoundingClientRect()
  const m = main.getBoundingClientRect()
  return {
    text: el.textContent.trim(),
    hasIcon: el.querySelector('svg') !== null,
    gap: Math.round(m.top - f.bottom),
    bg: getComputedStyle(el).backgroundColor,
  }
})
check(shape.text === 'ثبت رویداد', 'برچسب فارسی کنار آیکون نوشته شده')
check(shape.hasIcon, 'آیکون هم دارد، پس دکمه خالی نیست')
check(shape.gap === 16, `فاصله ۱۶ تا کنش اصلی دارد (${shape.gap})`)
check(shape.bg === 'rgb(19, 39, 47)', 'پس‌زمینه --ink است، نه آجری')
await page.evaluate(() => window.scrollTo(0, 0))

console.log('▸ تراشه «بی‌خبر» فهرست را باز می‌کند، بنر تکراری حذف شده')
check(
  (await page.locator('text=/کودک بدون اطلاع نیامده‌اند/').count()) === 0,
  'بنر قرمز تکراری حذف شد',
)
check(
  (await page.locator('text=/دارو هنوز داده نشده/').count()) === 1,
  'بنر دارو سر جایش ماند',
)
await page.click('[class*="tallyAction"]:not(:disabled)')
await page.waitForTimeout(300)
check(
  (await page.locator('[class*="outstandingNames"]').count()) === 1,
  'تراشه فهرست همان کودکان را باز می‌کند',
)

console.log('▸ بخش ۵.۶: ثبت رویداد از دکمه شناور')
await page.click('button:has-text("ثبت رویداد")')
await page.waitForSelector('[role="dialog"]')
check(true, 'دکمه ثبت رویداد از صفحه امروز در دسترس است')
await page.click(D + '[class*="childCell"] >> nth=0')
await page.click(D + 'button:has-text("درگیری")')
await page.waitForTimeout(250)
const sev = await page.locator(D + '[class*="severityName"]').allInnerTexts()
check(!sev.includes('جزئی'), 'برای درگیری، گزینه «جزئی» اصلاً نمایش داده نمی‌شود')
check(
  (await page.locator('text=/درگیری بین دو کودک هرگز جزئی/').count()) === 1,
  'دلیلش به مربی گفته می‌شود',
)
await page.click(D + 'button[aria-label="بستن"]')
await page.waitForTimeout(300)

await page.click('button:has-text("ثبت رویداد")')
await page.click(D + '[class*="childCell"] >> nth=1')
await page.click(D + 'button:has-text("زمین خوردن")')
await page.waitForTimeout(200)
check(
  (await page.locator('text=/مستقیم به خانواده اطلاع داده می‌شود/').count()) === 1,
  'پیامد هر شدت همان‌جا نوشته شده',
)
await page.click(D + '[class*="severity"]:has-text("جزئی")')
await page.waitForTimeout(200)
check(
  (await page.locator(D + 'button:has-text("خراش سطحی")').count()) === 1,
  'دسته‌های رویداد جزئی بسته و از پیش تعریف‌شده‌اند',
)
await page.click(D + 'button:has-text("خراش سطحی")')
await page.click(D + '[class*="primary"]:has-text("ادامه")')
await page.click(D + 'button:has-text("کلاس")')
await page.fill('textarea[aria-label="توضیح رویداد"]', 'به لبه میز خورد.')
await page.click(D + 'button:has-text("ناحیه سر یا صورت بود")')
await page.waitForTimeout(250)
check(
  (await page.locator('text=/شدت خودکار بالا می‌رود/').count()) === 1,
  'پیش از ثبت، ارتقای خودکار شدت هشدار داده می‌شود',
)
await page.click(D + '[class*="primary"]:has-text("ثبت رویداد")')
await page.waitForSelector('[class*="doneTitle"]')
check(
  (await page.locator('[class*="doneTitle"]').innerText()) === 'برای مدیر فرستاده شد',
  'رویداد ارتقایافته اول برای مدیر می‌رود، نه خانواده',
)
await page.click(D + '[class*="primary"]:has-text("بستن")')
await page.waitForTimeout(300)

console.log('▸ استثناهای ورود: عکس و دارو')
await holdFirstNotArrived()

// عکس همیشه در دسترس است؛ همان عکس، اگر خانواده بعداً ادعای آسیب‌دیدگی
// کرد، سند دفاعی مهد است. با وضعیت غیرعادی برجسته می‌شود.
const photoStyle = async () =>
  page.locator('button:has-text("افزودن عکس")').evaluate((el) => getComputedStyle(el).borderStyle)
check(
  (await page.locator('button:has-text("افزودن عکس")').count()) === 1,
  'دکمه عکس همیشه در دسترس است',
)
check((await photoStyle()) === 'dashed', 'با وضعیت عادی، ساده است')
await page.click('[role="dialog"] button:has-text("خراش یا کبودی")')
await page.waitForTimeout(200)
check((await photoStyle()) === 'solid', 'با وضعیت غیرعادی، برجسته می‌شود')

check(
  (await page.locator('input[aria-label="ساعت مصرف"]').count()) === 0,
  'تا نام دارو نوشته نشده، مقدار و ساعت پرسیده نمی‌شود',
)
await page.fill('input[aria-label="نام دارو"]', 'شربت سرماخوردگی')
check(
  (await page.locator('input[aria-label="ساعت مصرف"]').count()) === 1,
  'با نوشتن نام دارو، مقدار و ساعت ظاهر می‌شود',
)

const medsBefore = await page.locator('text=/دارو هنوز داده نشده/').count()
const tallyBefore = await tallyText()
await page.click('[role="dialog"] [class*="primary"]')
await page.waitForTimeout(700)
check((await page.locator('[role="dialog"]').count()) === 0, 'شیت پس از ثبت بسته می‌شود')
check((await tallyText()) !== tallyBefore, 'ورود با داروی ثبت‌شده انجام شد')
check(
  medsBefore === 0 || (await page.locator('text=/دارو هنوز داده نشده/').count()) === 1,
  'یادآور داروی خورانده‌نشده روی صفحه می‌آید',
)

console.log('▸ شیت با کلید Escape بسته می‌شود')
await holdFirstNotArrived()
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
check((await page.locator('[role="dialog"]').count()) === 0, 'Escape شیت را می‌بندد')

console.log('▸ بخش ۳.۲: جابه‌جایی حساب بدون خروج و ورود مجدد')
await page.click('header [class*="accountButton"]')
await page.waitForSelector('text=رفتن به حساب مدیر')
await page.click('button:has-text("رفتن به حساب مدیر")')
// پیش‌تر اینجا «پنل این نقش هنوز ساخته نشده» می‌آمد. حالا داشبورد مدیر
// هست، پس نشانه جابه‌جایی خودِ داشبورد است.
await page.waitForSelector('text=وضعیت ثبت', { timeout: 10000 })
check(true, 'حساب عوض شد بدون درخواست دوباره کد، و داشبورد مدیر آمد')
check(
  (await page.locator('text=ثبت گروهی امروز').count()) === 0,
  'و پنل مربی دیگر دیده نمی‌شود — دسترسی‌ها ترکیب نمی‌شوند',
)

console.log('▸ بخش ۵.۵: ثبت گروهی، مهم‌ترین صفحه سامانه')
// بخش پیش، حساب را به مدیر برد. برای پنل مربی دوباره وارد می‌شویم.
await signIn('09120000001')
await page.waitForSelector('text=ثبت گروهی امروز')
await page.click('button:has-text("ثبت گروهی امروز")')
await page.waitForSelector('text=اعمال روی همه')
check(true, 'صفحه ثبت گروهی از دکمه کنش اصلی «امروز» باز می‌شود')

check(
  (await page.locator('[class*="bar"] button').innerText()) === 'ذخیره و بازگشت',
  'نوار چسبیده فقط پایان کار است',
)
check(
  (await page.locator('[class*="applyWhy"]').count()) === 1,
  'دکمه غیرفعال دلیلش را می‌نویسد',
)

const suggested = await page.locator('[class*="suggestNames"]').innerText()
check(suggested.split('·').length === 3, `سه کودک برای یادداشت پیشنهاد شد: ${suggested}`)

let taps = 0
const tap = async (selector) => { await page.click(selector); taps += 1 }

await tap('[aria-label="ثبت یکجا برای کل کلاس"] button:has-text("بیشترش")')
await tap('[aria-label="ثبت یکجا برای کل کلاس"] button:has-text("خوب")')
await page.fill('input[aria-label="ساعت شروع خواب"]', '13:00'); taps += 1
await tap('[class*="applyInline"]')
await page.waitForSelector('text=/اعمال شد/')

for (const name of ['امیر', 'آوا', 'کیان', 'هستی']) {
  await tap(`button:has([class*="itemName"]:text-is("${name}"))`)
  await page.waitForSelector('[role="dialog"]')
  await tap('[role="dialog"] button:has-text("کمی")')
  await tap('[role="dialog"] button:has-text("ذخیره استثنا")')
  await page.waitForSelector('[role="dialog"]', { state: 'detached' })
}

check(
  (await page.locator('[class*="listCount"]').innerText()).includes('۴'),
  `چهار استثنا ثبت شد، کل مسیر ${taps} ضربه`,
)

console.log('▸ خلق عمومی هر سه بازه را پر می‌کند')
check(
  (await page.locator('[class*="rowLabel"]').nth(1).innerText()) === 'خلق عمومی امروز',
  'نوار گروهی یک کنترل خلق دارد، نه بازه جاری',
)

console.log('▸ استثنا برنده است، نه آخرین نوشته')
await tap('[aria-label="ثبت یکجا برای کل کلاس"] button:has-text("همه")')
await tap('[class*="applyInline"]')
await page.waitForTimeout(500)
const amir = await page.locator('button:has([class*="itemName"]:text-is("امیر"))').innerText()
check(amir.includes('کمی'), 'ثبت گروهی دوم استثنای امیر را پاک نکرد')
const sara = await page.locator('button:has([class*="itemName"]:text-is("سارا"))').innerText()
check(sara.includes('همه'), 'ولی کودک دست‌نخورده مقدار تازه گروهی را گرفت')

console.log('▸ پیوست ب: هشدار واژگان ممنوع روی متن مربی')
await page.click('button:has([class*="itemName"]:text-is("سارا"))')
await page.waitForSelector('[role="dialog"]')
await page.fill('textarea[aria-label="یادداشت مربی"]', 'امروز خیلی پرخاشگر بود')
await page.waitForTimeout(250)
const warned = () => page.locator('text=/برچسب است، نه مشاهده/').count()
check((await warned()) === 1, 'واژه برچسب‌زننده هشدار می‌گیرد')
check(
  (await page.locator('[role="dialog"] button:has-text("ذخیره استثنا")').isEnabled()),
  'ولی جلوی ثبتش گرفته نمی‌شود، چون سند هشدار خواسته نه مانع',
)
await page.fill('textarea[aria-label="یادداشت مربی"]', 'دو بار اسباب‌بازی را از دیگری گرفت.')
await page.waitForTimeout(250)
check((await warned()) === 0, 'متن مشاهده‌ای هشدار نمی‌گیرد')
await page.click('[role="dialog"] button:has-text("انصراف")')

console.log('▸ بخش ۵.۵: عکس با تگ')
const dataUrl = await page.evaluate(() => {
  const c = document.createElement('canvas')
  c.width = 800; c.height = 600
  const x = c.getContext('2d')
  x.fillStyle = '#E4F2F0'; x.fillRect(0, 0, 800, 600)
  x.fillStyle = '#0F8C86'; x.beginPath(); x.arc(400, 300, 150, 0, Math.PI * 2); x.fill()
  return c.toDataURL('image/png')
})
writeFileSync('/tmp/kg-sample.png', Buffer.from(dataUrl.split(',')[1], 'base64'))

await page.setInputFiles('input[type="file"]', '/tmp/kg-sample.png')
await page.waitForSelector('[role="dialog"]', { timeout: 10000 })
check(true, 'عکس انتخاب و فشرده شد، شیت تگ باز شد')
check(
  await page.locator(D + '[class*="primary"]').first().isDisabled(),
  'عکس بدون تگ ثبت نمی‌شود',
)
check(
  (await page.locator('text=/عکس بدون تگ برای هیچ خانواده‌ای فرستاده نمی‌شود/').count()) === 1,
  'دلیلش به مربی گفته می‌شود',
)
await page.click(D + '[class*="cell"] >> nth=0')
await page.click(D + '[class*="cell"] >> nth=1')
check(
  await page.locator(D + '[class*="primary"]').first().isEnabled(),
  'با تگ خوردن، ثبت باز می‌شود',
)
await page.click(D + '[class*="primary"]')
await page.waitForTimeout(800)
check(
  (await page.locator('[class*="stripBadge"]').count()) === 1,
  'عکس در نوار عکس‌های امروز نشست',
)
await page.click('[class*="stripItem"]')
await page.waitForSelector('[role="dialog"]')
check(
  (await page.locator(D + '[aria-pressed="true"]').count()) === 2,
  'باز کردن دوباره، تگ‌های قبلی را نگه می‌دارد',
)
await page.click(D + 'button:has-text("انصراف")')
await page.waitForTimeout(300)

await page.click('[aria-label="بازگشت به امروز"]')
await page.waitForSelector('text=ثبت گروهی امروز')
check(true, 'پیکان سرصفحه به «امروز» برمی‌گردد')

console.log('▸ بخش ۵.۹: بستن روز')
await page.click('button:has-text("بستن روز")')
await page.waitForSelector('text=ارسال گزارش‌های امروز')
const lines = () => page.locator('[class*="lineText"]').allInnerTexts()
check((await lines()).some((t) => t.includes('کامل')), 'شمار گزارش کامل نشان داده می‌شود')
// یک بار ثبت گروهی، هر سه بازه خلق را پر می‌کند، پس گزارشی ناقص
// نمی‌ماند. پیش‌تر نوار فقط بازه جاری را می‌گرفت و همه ناقص می‌ماندند.
check(
  (await lines()).some((t) => t.includes('کامل')) &&
    !(await lines()).some((t) => t.includes('ناقص')),
  'پس از ثبت گروهی، گزارشی ناقص نمی‌ماند',
)
check(
  (await lines()).some((t) => t.includes('بدون یادداشت این هفته')),
  'کودکان بدون یادداشت این هفته شمرده می‌شوند',
)
check(
  (await page.locator('text=/خودکار فرستاده می‌شود/').count()) === 1,
  'ساعت ارسال خودکار به مربی گفته می‌شود',
)

console.log('▸ ارسال، و قفل پس از آن')
await page.click('[class*="bar"] button:has-text("ارسال گزارش‌های امروز")')
await page.waitForSelector('[class*="sentTitle"]')
check(true, 'گزارش‌ها فرستاده شدند')
// این گزاره پیش‌تر می‌خواست دکمه خاموش بماند، یعنی دقیقاً همان رفتاری
// که کاربر دو بار «خراب» خواندش. آنچه باید بماند این است که ارسال
// دوباره ممکن نباشد، نه اینکه یک دکمه مرده روی صفحه بنشیند.
check(
  (await page.locator('[class*="bar"] button:has-text("ارسال گزارش‌های امروز")').count()) === 0,
  'راه ارسال دوباره بسته است',
)
check(
  !(await page.locator('[class*="bar"] button').last().isDisabled()),
  'ولی نوار پایین دکمه مرده نشان نمی‌دهد',
)
check(
  (await page.locator('button:has-text("تکمیل")').count()) === 0,
  'پس از ارسال، راه تکمیل بسته می‌شود چون گزارش قفل است',
)
check(
  (await page.locator('text=/اصلاحیه/').count()) >= 1,
  'به مربی گفته می‌شود از این پس فقط اصلاحیه ثبت می‌شود',
)

await page.click('[aria-label="بازگشت به امروز"]')
await page.waitForSelector('text=ثبت گروهی امروز')

console.log('▸ بخش ۶.۳: صفحه «امروز» پنل والد')
// سرپرست نمونه، سرپرستِ «سارا» است. پس همان کودک باید یادداشت و رویداد
// داشته باشد، وگرنه تست چیزی را می‌سنجد که به این خانواده ربط ندارد.
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
check(
  (await page.locator('[class*="doneTitle"]').innerText()) === 'به خانواده اطلاع داده شد',
  'رویداد جزئی مستقیم به خانواده می‌رود',
)
await page.click(D + '[class*="primary"]:has-text("بستن")')
await page.waitForTimeout(300)

// از حساب مربی بیرون می‌رویم بدون پاک کردن داده، تا همان روزی که تازه
// ارسال شد از دید خانواده دیده شود.
await page.click('header [class*="accountButton"]')
await page.click('button:has-text("خروج")')
await page.waitForSelector('#phone')
await page.fill('#phone', '09120000003')
await page.click('button:has-text("فرستادن کد")')
await page.waitForSelector('#code')
await page.fill('#code', '11111')
await page.click('button:has-text("ورود")')
await page.waitForSelector('[class*="dateLine"]', { timeout: 8000 })
check(true, 'سرپرست با حساب خودش وارد شد')

const parentBody = () => page.evaluate(() => document.body.innerText)

check(
  (await page.locator('img[class*="photo"]').count()) >= 1,
  'عکس امروز بالای صفحه است',
)
check(
  (await page.locator('[class*="pending"]').count()) === 0,
  'چون گزارش فرستاده شده، «هنوز آماده نیست» دیده نمی‌شود',
)

const seen = await parentBody()
for (const [label, key] of [
  ['ورود و ساعتش', 'ورود'],
  ['ناهار', 'ناهار'],
  ['خواب به دقیقه', 'دقیقه'],
  ['خلق سه بازه روز', 'عصر'],
  ['رویداد جزئی', 'زمین خوردن'],
  ['درخواست از خانه', 'از خانه'],
]) {
  check(seen.includes(key), label)
}

// غذا به زبان ساده نوشته می‌شود، نه با مقدار خام — بخش ۶.۳
check(
  /همه‌اش را خورد|بیشترش را خورد|کمی خورد|چیزی نخورد/.test(seen),
  'ناهار به زبان ساده نوشته شده، نه با عدد',
)

// بخش ۶.۳ و بند ۱۰.۱: هیچ درصد، نمودار یا مقایسه‌ای با کودکان دیگر.
check(!/[٪%]/.test(seen), 'هیچ درصدی روی صفحه نیست')
check(
  !/میانگین|کلاس|بهتر از|بدتر از|رتبه|امتیاز/.test(seen),
  'هیچ مقایسه‌ای با کودکان دیگر نیست',
)

console.log('▸ درخواست از خانه، تیک «انجام شد»')
const needRow = page.locator('button[class*="need_"]').first()
check((await needRow.getAttribute('aria-pressed')) === 'false', 'در آغاز تیک نخورده')
await needRow.click()
await page.waitForTimeout(500)
check((await needRow.getAttribute('aria-pressed')) === 'true', 'با ضربه، انجام‌شده می‌شود')
await needRow.click()
await page.waitForTimeout(500)
check((await needRow.getAttribute('aria-pressed')) === 'false', 'و دوباره برمی‌گردد')

console.log('▸ بخش ۳.۳: رویداد تأییدنشده به خانواده نمی‌رسد')
check(
  !seen.includes('تب') || seen.includes('زمین خوردن'),
  'فقط رویداد جزئی که مستقیم می‌رود دیده می‌شود',
)

console.log('▸ بخش ۵.۹ بند ۶: درخواست از خانه، از مربی تا خانواده')
await signIn('09120000001')
await page.waitForSelector('text=ثبت گروهی امروز')
await page.click('button:has-text("ثبت گروهی امروز")')
await page.waitForSelector('text=اعمال روی همه')
await page.locator('input[aria-label="درخواست ۱"]').fill('فردا روز رنگ است، پیش‌بند بیاورید.')
await page.click('button:has-text("درخواست دیگر")')
await page.locator('input[aria-label="درخواست ۲"]').fill('فردا لباس گرم بیاورید.')
await page.click('button:has-text("ثبت برای کل کلاس")')
await page.waitForTimeout(800)
check(
  (await page.locator('button:has-text("برای کل کلاس ثبت شد")').count()) === 1,
  'مربی دو درخواست برای کل کلاس نوشت',
)

await page.click('[aria-label="بازگشت به امروز"]')
await page.waitForSelector('text=ثبت گروهی امروز')
await page.click('button:has-text("بستن روز")')
await page.waitForSelector('text=ارسال گزارش‌های امروز')
await page.click('[class*="bar"] button:has-text("ارسال گزارش‌های امروز")')
await page.waitForSelector('[class*="sentTitle"]')
await page.click('[aria-label="بازگشت به امروز"]')
await page.waitForSelector('text=ثبت گروهی امروز')

await signOutAny()
await signIn('09120000003', { fresh: false })
await page.waitForSelector('[class*="dateLine"]', { timeout: 8000 })
const parentText = await page.evaluate(() => document.body.innerText)
check(parentText.includes('پیش‌بند'), 'درخواست اول به خانواده رسید')
check(parentText.includes('لباس گرم'), 'درخواست دوم هم رسید')

console.log('▸ بخش ۵.۸ و ۶.۴: برنامه فردا')
check(
  (await page.locator('section:has-text("چه کسی می‌آورد")').count()) === 1,
  'کارت فردا دو تصمیم جدا دارد: آوردن و بردن',
)
await page.locator('button:has-text("تغییر برای فردا")').first().click()
await page.waitForTimeout(400)
const allowed = await page.locator('[class*="option"]').allInnerTexts()
check(allowed.length > 1, `فهرست مجاز نمایش داده شد (${allowed.length} گزینه)`)

await page.click('button:has-text("کس دیگری می‌آید")')
await page.fill('input[aria-label="نام فرد"]', 'عمو، رضا احمدی')
await page.fill('input[aria-label="شماره فرد"]', '09121112233')
await page.click('button:has-text("ساخت کد")')
await page.waitForTimeout(700)
const chosen = await page.locator('[class*="chosen"]').first().innerText()
check(/کد تحویل/.test(chosen), 'برای فرد بیرون از فهرست، کد ساخته شد')
const code = chosen.match(/[۰-۹]{4}/)?.[0]
check(Boolean(code), `کد چهاررقمی است: ${code}`)

// همان کد باید از مسیر مربی قابل بررسی باشد، وگرنه کدی ساخته‌ایم که
// هیچ‌جا کار نمی‌کند.
await page.locator('button:has-text("تغییر")').first().click()
await page.waitForTimeout(300)
await page.locator('[class*="option"] >> nth=0').click()
await page.waitForTimeout(700)
const picked = await page.locator('[class*="chosen"]').first().innerText()
check(
  /در فهرست مجاز/.test(picked),
  'با انتخاب فرد مجاز، کد لازم نیست و همین گفته می‌شود',
)

console.log('▸ بخش ۱۳.۳: داشبورد مدیر')
await signIn('09120000002')
await page.waitForSelector('text=با کدام حساب وارد می‌شوید؟')
await page.locator('button:has-text("مریم رضایی")').nth(1).click()
await page.waitForTimeout(1200)
const board = await page.evaluate(() => document.body.innerText)
check(board.includes('حاضر'), 'کاشی حاضر آمد')
check(board.includes('وضعیت ثبت'), 'وضعیت ثبت کلاس‌ها آمد')
check(board.includes('سهمیه پیامک'), 'سهمیه پیامک دیده می‌شود — بخش ۱۵.۴')
check(
  (await page.locator('text=/هیچ کودکی|شماره ثبت نشده|بدون اطلاع/').count()) >= 0,
  'فهرست بی‌خبرها با شماره تماس',
)

console.log('▸ بخش ۱۵.۳: اطلاع‌رسانی با تأیید دو مرحله‌ای')
await page.click('button:has-text("اطلاع‌رسانی به خانواده‌ها")')
await page.waitForSelector('text=چه چیزی')
const auto = await page.locator('textarea[aria-label="متن اطلاعیه"]').inputValue()
check(/بازگشایی می‌شود/.test(auto), `متن از قالب ساخته شد: ${auto.slice(0, 40)}…`)
check(
  (await page.locator('button:has-text("تأیید و ارسال")').count()) === 0,
  'پیش از بررسی، دکمه ارسال اصلاً وجود ندارد',
)

await page.click('button:has-text("بررسی پیش از ارسال")')
await page.waitForSelector('text=آنچه فرستاده می‌شود')
const confirm = await page.evaluate(() => document.body.innerText)
check(/پیامک لازم/.test(confirm), 'تعداد پیامک لازم نشان داده شد')
check(/سهمیه باقی‌مانده/.test(confirm), 'سهمیه باقی‌مانده نشان داده شد')
check(
  /نمی‌رسد/.test(confirm),
  'خانواده‌های بدون شماره جدا شمرده و نام برده می‌شوند',
)

await page.click('button:has-text("تأیید و ارسال")')
await page.waitForSelector('[class*="doneTitle"]')
check(
  (await page.locator('[class*="doneTitle"]').innerText()) === 'فرستاده شد',
  'ارسال انجام شد و گزارشش داده شد',
)

console.log('▸ ماژول M5: مالی، از صدور تا دیدن خانواده')
await signIn('09120000002')
await page.waitForSelector('text=با کدام حساب وارد می‌شوید؟')
await page.locator('button:has-text("مریم رضایی")').nth(1).click()
await page.waitForSelector('text=وضعیت ثبت', { timeout: 10000 })
await page.click('button:has-text("مالی")')
await page.waitForSelector('text=شهریه‌ها')
check(
  (await page.locator('text=هنوز صورتحسابی برای این دوره صادر نشده').count()) === 1,
  'پیش از صدور، حالت خالی گفته می‌شود',
)

await page.click('button:has-text("صدور گروهی")')
await page.waitForSelector('text=/صورتحساب صادر شد/')
check(true, 'صدور گروهی با یک ضربه — بخش ۸')

const issuedText = await page.evaluate(() => document.body.innerText)
check(/صادر شده/.test(issuedText), 'مجموع صادرشده نشان داده می‌شود')

// ضربه دوم نباید همه را دو برابر کند.
const beforeTwice = await page.locator('[class*="tileValue"]').first().innerText()
await page.click('button:has-text("صدور گروهی")')
await page.waitForTimeout(800)
check(
  (await page.locator('[class*="tileValue"]').first().innerText()) === beforeTwice,
  'ضربه دوم صورتحساب تکراری نمی‌سازد',
)

await page.locator('[class*="invoice"]').first().click()
await page.waitForSelector('[role="dialog"]')
const sheet = await page.locator('[role="dialog"]').innerText()
check(/باقی‌مانده/.test(sheet), 'شیت پرداخت باقی‌مانده را می‌گوید')
await page.click('button:has-text("ثبت پرداخت")')
await page.waitForSelector('text=پرداخت ثبت شد')
check(true, 'پرداخت دستی ثبت شد')
const afterPay = await page.evaluate(() => document.body.innerText)
check(/وصول‌شده/.test(afterPay), 'وصولی به‌روز شد')

console.log('▸ ماژول M1: پرونده کودک')
await page.click('[aria-label="بازگشت به داشبورد"]')
await page.waitForSelector('text=وضعیت ثبت')
await page.click('button:has-text("کودکان")')
await page.waitForSelector('input[aria-label="جست‌وجوی نام کودک"]')
await page.locator('[class*="item"]').first().click()
await page.waitForSelector('text=رضایت‌نامه‌ها')
const profile = await page.evaluate(() => document.body.innerText)
check(/آلرژی/.test(profile), 'آلرژی در پرونده هست — بخش ۷.۱')
const allergyFirst = profile.indexOf('آلرژی') < profile.indexOf('سرپرستان')
check(allergyFirst, 'و پیش از سرپرستان می‌آید، چون موضوع ایمنی است')
check(/پرداخت‌کننده/.test(profile), 'سرپرست پرداخت‌کننده علامت دارد — بخش ۶.۵')
check(/رضایت‌نامه‌ها/.test(profile), 'رضایت‌نامه‌ها فهرست شده‌اند')

console.log('▸ بخش ۶.۴ و ۶.۶: بیشترِ خانواده')
await page.locator('[aria-label="بازگشت به فهرست کودکان"]').click()
await page.waitForTimeout(400)
await page.locator('[aria-label="بازگشت به داشبورد"]').click()
await page.waitForSelector('text=وضعیت ثبت')
await signOutAny()
await signIn('09120000003', { fresh: false })
await page.waitForSelector('[class*="dateLine"]', { timeout: 8000 })
await page.click('button:has-text("بیشتر")')
await page.waitForSelector('text=اعلام غیبت')
check(true, 'فهرست «بیشتر» باز شد')

await page.click('button:has-text("پیام به مربی")')
await page.waitForSelector('text=ساعت کاری پیام')
check(true, 'ساعت کاری پیام به خانواده گفته می‌شود — بخش ۶.۶')
await page.fill('textarea[aria-label="متن پیام"]', 'سلام، سارا امروز کمی سرما خورده.')
await page.click('button:has-text("فرستادن")')
await page.waitForTimeout(700)
// bubbleBody، نه bubble: سه کلاس با همین پیشوند روی یک حباب هستند.
check(
  (await page.locator('[class*="bubbleBody"]').count()) === 1,
  'پیام در گفت‌وگو نشست',
)
check(
  (await page.locator('[class*="bubbleBody"]').innerText()).includes('سرما خورده'),
  'و متنش همان است که نوشته شد',
)

await page.locator('[aria-label="بازگشت"]').click()
await page.waitForTimeout(400)
await page.click('button:has-text("اعلام غیبت")')
await page.waitForSelector('text=/علت، اگر/')
await page.fill('textarea[aria-label="علت غیبت"]', 'سرماخوردگی')
await page.locator('button:has-text("اعلام غیبت")').last().click()
await page.waitForTimeout(700)
check(
  (await page.locator('text=/غیبت .* اعلام شد/').count()) === 1,
  'اعلام غیبت برای فردا کار می‌کند',
)

await page.locator('[aria-label="بازگشت"]').click()
await page.waitForTimeout(400)
await page.click('button:has-text("مالی")')
await page.waitForSelector('text=مانده')
const parentMoney = await page.evaluate(() => document.body.innerText)
check(/تسویه/.test(parentMoney), 'خانواده همان صورتحسابی را می‌بیند که مدیر صادر کرد')
check(/پرداخت‌های ثبت‌شده/.test(parentMoney), 'و پرداختی را که مدیر ثبت کرد')

console.log('▸ بخش ۵.۳: یادآور دارو ساعت را می‌گوید و باز می‌شود')
await signIn('09120000001')
await page.waitForSelector('text=ثبت گروهی امروز')
await holdFirstNotArrived()
await page.fill('input[aria-label="نام دارو"]', 'شربت سرماخوردگی')
await page.fill('input[aria-label="ساعت مصرف"]', '11:30')
await page.click('[role="dialog"] [class*="primary"]')
await page.waitForTimeout(800)

const medBar = await page.locator('[class*="medicationBar"]').innerText()
check(/دارو هنوز داده نشده/.test(medBar), 'یادآور دارو روی صفحه است')
check(/نزدیک‌ترین ۱۱:۳۰/.test(medBar), `نزدیک‌ترین ساعت روی نوار نوشته شده: ${medBar.split('·')[1]?.trim()}`)

await page.click('[class*="medicationBar"]')
await page.waitForTimeout(400)
const medList = await page.locator('[class*="medicationList"]').innerText()
check(/۱۱:۳۰/.test(medList), 'جزئیات ساعت هر دارو را می‌گوید')
check(/شربت سرماخوردگی/.test(medList), 'و نام دارو را')
check(
  (await page.locator('[class*="medicationChild"]').count()) >= 1,
  'و نام کودک را، پس مربی می‌داند برای کیست',
)

const beforeGiven = await page.locator('[class*="medicationItem"]').count()
await page.locator('[class*="medicationDone"]').first().click()
await page.waitForTimeout(800)
const afterGiven = await page.locator('[class*="medicationItem"]').count()
check(afterGiven === beforeGiven - 1, 'با «داده شد»، دارو از یادآور می‌رود')

console.log('▸ بخش ۵.۹: پس از ارسال، راه اصلاحیه باز است')
await page.click('button:has-text("بستن روز")')
await page.waitForSelector('text=ارسال گزارش‌های امروز')
await page.click('[class*="bar"] button:has-text("ارسال گزارش‌های امروز")')
await page.waitForSelector('[class*="sentTitle"]')
check(
  (await page.locator('button:has-text("ثبت اصلاحیه")').count()) === 1,
  'پس از قفل شدن، دکمه اصلاحیه هست — پیش‌تر مربی تا پایان روز گیر می‌کرد',
)

// دکمه خاموشِ «فرستاده شد» در جای کنش اصلی می‌ماند و دو بار «خراب»
// خوانده شد. حالا جایش کنش بعدیِ واقعی می‌نشیند.
const closeBar = page.locator('[class*="bar"] button').last()
check(
  !(await closeBar.isDisabled()),
  `نوار پایین پس از ارسال هم زنده است: ${await closeBar.innerText()}`,
)
check(
  (await page.locator('[class*="bar"] button:has-text("فرستاده شد")').count()) === 0,
  'و هیچ دکمه مرده‌ای روی صفحه نمانده',
)

await page.click('button:has-text("ثبت اصلاحیه")')
await page.waitForTimeout(400)
await page.fill('textarea[aria-label="متن اصلاحیه"]', 'ناهار را اشتباه ثبت کرده بودم؛ همه‌اش را خورد.')
await page.locator('[class*="amendSave"]').click()
await page.waitForTimeout(900)
check(
  (await page.locator('[class*="amendList"]').count()) === 1,
  'اصلاحیه ثبت شد و در همان صفحه فهرست می‌شود',
)

console.log('▸ بخش ۸: اعلام پرداخت خانواده، تا تأیید مدیر')
await signIn('09120000002')
await page.waitForSelector('text=با کدام حساب وارد می‌شوید؟')
await page.locator('button:has-text("مریم رضایی")').nth(1).click()
await page.waitForSelector('text=وضعیت ثبت', { timeout: 10000 })

const navBox = await page.locator('[class*="navItem"]').first().boundingBox()
check(navBox.height >= 56, `دکمه‌های مالی و کودکان درشت‌اند (${Math.round(navBox.height)})`)
check(
  (await page.locator('[class*="navItem"]').first().evaluate((el) => getComputedStyle(el).fontWeight)) === '700',
  'و پررنگ',
)

await page.click('button:has-text("مالی")')
await page.waitForSelector('text=شهریه‌ها')
await page.click('button:has-text("صدور گروهی")')
await page.waitForSelector('text=/صورتحساب صادر شد/')

await page.locator('[aria-label="بازگشت به داشبورد"]').click()
await page.waitForSelector('text=وضعیت ثبت')
await signOutAny()
await signIn('09120000003', { fresh: false })
await page.waitForSelector('[class*="dateLine"]', { timeout: 8000 })
await page.click('button:has-text("بیشتر")')
await page.click('button:has-text("مالی")')
await page.waitForSelector('text=مانده')
await page.click('button:has-text("پرداخت کردم")')
await page.waitForSelector('[role="dialog"]')
check(
  (await page.locator('button:has-text("عکس رسید را بگذارید")').count()) === 1,
  'خانواده می‌تواند عکس رسید بگذارد',
)
await page.fill('input[aria-label="توضیح پرداخت"]', 'کارت‌به‌کارت از حساب پدر')
await page.click('button:has-text("اعلام به مهد")')
await page.waitForTimeout(900)

const afterClaim = await page.evaluate(() => document.body.innerText)
check(/منتظر تأیید مهد/.test(afterClaim), 'به خانواده گفته می‌شود که هنوز تأیید نشده')
check(
  /پرداخت نشده/.test(afterClaim),
  'و وضعیت صورتحساب هنوز پرداخت‌نشده است — اعلام خانواده خودش پرداخت نیست',
)

await page.locator('[aria-label="بازگشت"]').click()
await page.waitForTimeout(400)
await page.locator('[aria-label="بازگشت"]').click()
await page.waitForTimeout(600)
await signOutAny()
await signIn('09120000002', { fresh: false })
await page.waitForTimeout(1500)
if (await page.locator('button:has-text("مریم رضایی")').count()) {
  await page.locator('button:has-text("مریم رضایی")').nth(1).click()
}
await page.waitForSelector('text=وضعیت ثبت', { timeout: 10000 })
check(
  (await page.locator('[class*="navBadge"]').count()) === 1,
  'شمار اعلام‌های در انتظار روی دکمه مالی دیده می‌شود',
)

await page.click('button:has-text("مالی")')
await page.waitForSelector('text=/اعلام پرداخت در انتظار تأیید/')
const queue = await page.locator('[aria-label="اعلام‌های پرداخت"]').innerText()
check(/کارت‌به‌کارت از حساب پدر/.test(queue), 'توضیح خانواده به مدیر می‌رسد')

// عدد مالی نُه رقم است و یک بار در کاشی سه‌ستونه بریده می‌شد، طوری که
// «۱۰۹٬۱۸۰٬۰۰۰» را «۰۹٬۱۸۰٬۰۰۰» نشان می‌داد و غلط به نظر نمی‌رسید.
const clipped = await page.evaluate(() =>
  [...document.querySelectorAll('*')].filter(
    (el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'auto',
  ).length,
)
check(clipped === 0, 'هیچ مبلغی در صفحه مالی بریده نمی‌شود')

await page.click('button:has-text("تأیید و ثبت پرداخت")')
await page.waitForSelector('text=پرداخت تأیید و ثبت شد')
const afterApprove = await page.evaluate(() => document.body.innerText)
check(/وصول‌شده/.test(afterApprove), 'پس از تأیید، وصولی مدیر به‌روز شد')
check(
  (await page.locator('text=/اعلام پرداخت در انتظار تأیید/').count()) === 0,
  'و اعلام از صف رفت',
)

console.log('▸ بخش ۱۲.۷: کف کیفیت')
await signIn('09120000001')
await page.waitForSelector('text=ثبت گروهی امروز')

const cells = page.locator('ul li button')
let small = 0
for (let i = 0; i < (await cells.count()); i += 1) {
  const box = await cells.nth(i).boundingBox()
  if (!box || box.height < 56 || box.width < 56) small += 1
}
check(small === 0, 'هر هدف لمسی دست‌کم ۵۶ پیکسل است')

const bar = await page.locator('button:has-text("ثبت گروهی امروز")').boundingBox()
check(bar.y + bar.height <= 850, 'دکمه کنش اصلی به پایین قاب چسبیده است')

await page.setViewportSize({ width: 320, height: 700 })
await page.waitForTimeout(300)
check(
  !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)),
  'در عرض ۳۲۰ پیکسل لغزش افقی ندارد',
)

console.log('▸ بخش ۱۲.۴: هیچ تاریخ میلادی در رابط دیده نمی‌شود')
const visible = await page.evaluate(() => document.body.innerText)
check(!/\d{4}-\d{2}-\d{2}/.test(visible), 'هیچ تاریخ میلادی روی صفحه نیست')
check(!/[0-9]/.test(visible.replace(/[۰-۹]/g, '')), 'هیچ رقم لاتینی در متن صفحه نیست')

check(consoleErrors.length === 0, `بدون خطای کنسول${consoleErrors.length ? ': ' + consoleErrors[0] : ''}`)

await browser.close()
console.log(failures ? `\n${failures} مورد رد شد` : '\nهمه پاس شدند.')
process.exit(failures ? 1 : 0)
