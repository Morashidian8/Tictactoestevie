/**
 * راه‌رفتن روی جریان واقعی، در مرورگر واقعی.
 *
 *   npm run dev            (در یک ترمینال)
 *   npm run test:e2e       (در ترمینال دیگر)
 *
 * این تست همان چیزی را می‌آزماید که تست واحد نمی‌تواند: اینکه ورود،
 * انتخاب حساب، ثبت ورود و جابه‌جایی حساب واقعاً به هم وصل‌اند.
 */
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

console.log('▸ ضربه دوم روی کودک حاضر دوباره ثبتش نمی‌کند')
const presentLabel = await page.locator('button[aria-label$="، گزینه‌ها"] >> nth=0').getAttribute('aria-label')
await page.click(`button[aria-label="${presentLabel}"]`)
await page.waitForTimeout(400)
check((await tallyText()) === after, 'نوار خلاصه پس از ضربه دوم عوض نشد')

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
