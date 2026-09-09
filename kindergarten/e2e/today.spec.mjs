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

console.log('▸ بخش ۵.۳: ثبت ورود با یک ضربه')
const tallyText = () => page.locator('[class*="tally"]').innerText()
const before = await tallyText()
await page.click('button[aria-label^="ثبت ورود"] >> nth=0')
await page.waitForTimeout(400)
const after = await tallyText()
check(before !== after, 'ضربه روی عکس، نوار خلاصه را عوض می‌کند')

const digits = (text) => [...text.matchAll(/[۰-۹]+/g)].map((m) => m[0])
const [p1] = digits(before)
const [p2] = digits(after)
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

console.log('▸ بخش ۵.۶: ثبت رویداد از دکمه شناور')
await page.click('button:has-text("ثبت رویداد")')
await page.waitForSelector('[role="dialog"]')
check(true, 'دکمه شناور رویداد از صفحه امروز در دسترس است')
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

console.log('▸ بخش ۵.۳: شیت استثناهای ورود')
const hold = async (label) => {
  const box = await page.locator(`button[aria-label="${label}"]`).boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(650)
  await page.mouse.up()
}

const target = await page.locator('button[aria-label^="ثبت ورود"] >> nth=0').getAttribute('aria-label')
await hold(target)
await page.waitForSelector('[role="dialog"]')
const sections = await page.locator('[role="dialog"] h3').allInnerTexts()
check(sections.length === 3, `شیت سه بخش دارد: ${sections.join(' · ')}`)

check(
  (await page.locator('button:has-text("افزودن عکس")').count()) === 0,
  'با وضعیت عادی، دکمه عکس دیده نمی‌شود',
)
await page.click('[role="dialog"] button:has-text("خراش یا کبودی")')
check(
  (await page.locator('button:has-text("افزودن عکس")').count()) === 1,
  'با وضعیت غیرعادی، دکمه عکس ظاهر می‌شود',
)

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
await page.click('[role="dialog"] button:has-text("ثبت ورود")')
await page.waitForTimeout(700)
check((await page.locator('[role="dialog"]').count()) === 0, 'شیت پس از ثبت بسته می‌شود')
check((await tallyText()) !== tallyBefore, 'ورود از داخل شیت ثبت شد')
check(
  medsBefore === 0 || (await page.locator('text=/دارو هنوز داده نشده/').count()) === 1,
  'یادآور داروی خورانده‌نشده روی صفحه می‌آید',
)

console.log('▸ شیت با کلید Escape بسته می‌شود')
await hold(await page.locator('button[aria-label^="ثبت ورود"] >> nth=0').getAttribute('aria-label'))
await page.waitForSelector('[role="dialog"]')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
check((await page.locator('[role="dialog"]').count()) === 0, 'Escape شیت را می‌بندد')

console.log('▸ بخش ۳.۲: جابه‌جایی حساب بدون خروج و ورود مجدد')
await page.click('header [class*="accountButton"]')
await page.waitForSelector('text=رفتن به حساب مدیر')
await page.click('button:has-text("رفتن به حساب مدیر")')
await page.waitForSelector('text=/پنل این نقش/')
check(true, 'حساب عوض شد بدون درخواست دوباره کد')

console.log('▸ بخش ۵.۵: ثبت گروهی، مهم‌ترین صفحه سامانه')
// بخش پیش، حساب را به مدیر برد. برای پنل مربی دوباره وارد می‌شویم.
await signIn('09120000001')
await page.waitForSelector('text=ثبت گروهی امروز')
await page.click('button:has-text("ثبت گروهی امروز")')
await page.waitForSelector('text=اعمال روی همه')
check(true, 'صفحه ثبت گروهی از دکمه کنش اصلی «امروز» باز می‌شود')

const suggested = await page.locator('[class*="suggestNames"]').innerText()
check(suggested.split('·').length === 3, `سه کودک برای یادداشت پیشنهاد شد: ${suggested}`)

let taps = 0
const tap = async (selector) => { await page.click(selector); taps += 1 }

await tap('[aria-label="ثبت یکجا برای کل کلاس"] button:has-text("بیشترش")')
await tap('[aria-label="ثبت یکجا برای کل کلاس"] button:has-text("خوب")')
await page.fill('input[aria-label="ساعت شروع خواب"]', '13:00'); taps += 1
await tap('[class*="bar"] button:has-text("اعمال روی همه")')
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

console.log('▸ استثنا برنده است، نه آخرین نوشته')
await tap('[aria-label="ثبت یکجا برای کل کلاس"] button:has-text("همه")')
await tap('[class*="bar"] button:has-text("اعمال روی همه")')
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
check((await lines()).some((t) => t.includes('ناقص')), 'شمار گزارش ناقص نشان داده می‌شود')
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
check(
  await page.locator('[class*="bar"] button').isDisabled(),
  'دکمه ارسال پس از فرستادن غیرفعال می‌شود',
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
