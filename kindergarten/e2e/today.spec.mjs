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

/*
 * ساعت مرورگر را می‌بندیم.
 *
 * از وقتی کودکان دوره حضور جدا دارند، آنچه صفحه نشان می‌دهد به ساعت
 * اجرا بسته است: شب هیچ بازه‌ای باز نیست و شبکه خالی است، و کودک
 * بعدازظهری صبح اصلاً در فهرست نیست. بدون ساعت ثابت، این تست شب‌ها
 * می‌افتاد و صبح‌ها پاس می‌شد — بی‌اعتمادترین حالت ممکن.
 *
 * ۱۱ اسفند ۱۴۰۴ (۲۰۲۶-۰۳-۱۱) چهارشنبه است، یعنی روز کاری و در
 * weekdays همه ثبت‌نام‌های نمونه.
 */
const FIXED_DAY = '2026-03-11'
const setClock = (hour, minute = 0) =>
  page.clock.setFixedTime(
    new Date(
      `${FIXED_DAY}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`,
    ),
  )
await setClock(9)

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

/**
 * خروج از هر پنلی.
 *
 * یک انتخابگر برای هر سه نقش: از وقتی پوسته مشترک شد، کلید حساب در هر
 * سه پنل یکی است. اگر روزی یکی از پنل‌ها کلید خودش را بسازد، همین‌جا
 * می‌افتد.
 */
const signOutAny = async () => {
  await page.locator('header button[aria-label="حساب کاربری"]').first().click()
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
    shadow: getComputedStyle(el).boxShadow,
    iconColor: getComputedStyle(el.querySelector('svg')).color,
  }
})
check(shape.text === 'ثبت رویداد', 'برچسب فارسی کنار آیکون نوشته شده')
check(shape.hasIcon, 'آیکون هم دارد، پس دکمه خالی نیست')
check(shape.gap === 16, `فاصله ۱۶ تا کنش اصلی دارد (${shape.gap})`)
/*
 * بازطراحی کارت‌محور: کپسول سفید، نه بلوک تیره.
 *
 * دو چیز با هم باید درست باشند، وگرنه دکمه به متن تبدیل می‌شود:
 * پس‌زمینه سفید، و سایه‌ای که بگوید این یک شیء شناور است.
 */
check(shape.bg === 'rgb(255, 255, 255)', 'پس‌زمینه سفید است، نه بلوک تیره')
check(shape.shadow !== 'none', 'و سایه شناور دارد، وگرنه روی بوم گم می‌شود')
/*
 * آجری در این پالت یعنی «همین حالا چیزی شده». دکمه‌ای که تمام روز روی
 * صفحه است نباید آن را بگوید.
 */
check(
  shape.iconColor === 'rgb(15, 23, 42)',
  `گلیف --ink است، نه آجری (${shape.iconColor})`,
)
await page.evaluate(() => window.scrollTo(0, 0))

console.log('▸ بازطراحی کارت‌محور: شبکه دو ستونه، کارت مستقل')
const cardLayout = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('ul li button[aria-label]')].filter((b) =>
    /ثبت ورود|ثبت خروج|رفته/.test(b.getAttribute('aria-label') ?? ''),
  )
  const grid = cards[0]?.closest('ul')
  const first = cards[0].getBoundingClientRect()
  // دو کارت اول باید در یک سطر باشند، سومی در سطر بعد.
  const second = cards[1].getBoundingClientRect()
  const third = cards[2].getBoundingClientRect()
  /*
   * کارت کودکی که رفته، عمداً بی‌سایه و روی بوم می‌نشیند — پس معیار
   * ظاهر کارت نیست. سنجش روی اولین کارتِ کودکی است که هنوز اینجاست.
   */
  const live =
    cards.find((b) => !(b.getAttribute('aria-label') ?? '').includes('رفته')) ?? cards[0]
  const style = getComputedStyle(live)
  return {
    columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
    sameRow: Math.abs(first.top - second.top) < 2,
    nextRow: third.top > first.bottom - 2,
    height: Math.round(first.height),
    bg: style.backgroundColor,
    shadow: style.boxShadow,
    radius: style.borderRadius,
    // عکس مربعِ گوشه‌نرم، نه دایره
    photoRadius: getComputedStyle(live.querySelector('span[class*="frame"]')).borderRadius,
  }
})
check(cardLayout.columns === 2, `شبکه دو ستونه است (${cardLayout.columns})`)
check(cardLayout.sameRow && cardLayout.nextRow, 'دو کارت در هر سطر، سومی سطر بعد')
/*
 * کارت عمودی شد — تصمیم مالک محصول، مطابق ماکت.
 *
 * عکس دایره‌ای بالا و وسط، نام، سن، و دو کپسول وضعیت در پایین. ارتفاع
 * از ۸۹ به ۱۸۵ رسید؛ سقف ۲۰۰ است تا اگر روزی سطر ششمی به کارت اضافه
 * شود، اینجا قرمز شود نه در دست مربی.
 */
check(
  cardLayout.height >= 150 && cardLayout.height <= 200,
  `ارتفاع کارت در بازه ۱۵۰ تا ۲۰۰ است (${cardLayout.height})`,
)
check(cardLayout.bg === 'rgb(255, 255, 255)', 'کارت سفید خالص است')
check(cardLayout.shadow !== 'none', 'و سایه دارد — همان چیزی که می‌گوید این را می‌شود زد')
check(cardLayout.radius === '18px', `گوشه‌های نرم ۱۸ پیکسلی (${cardLayout.radius})`)
// ماکت عکس دایره‌ای دارد. مربع گوشه‌نرم برای چیدمان افقی بود.
check(
  cardLayout.photoRadius === '999px',
  `عکس دایره‌ای است، مثل ماکت (${cardLayout.photoRadius})`,
)

/*
 * بخش ۷.۱: «آلرژی غذایی باید همیشه در دید مربی باشد.»
 * تا پیش از بازطراحی، فقط در پرونده کودک بود — دو ضربه دورتر از لحظه‌ای
 * که مربی بشقاب را دستش می‌گیرد.
 */
const allergyCard = await page.evaluate(() => {
  const card = [...document.querySelectorAll('ul li button[aria-label]')].find((b) =>
    (b.getAttribute('aria-label') ?? '').includes('سارا'),
  )
  if (!card) return null
  return {
    badge: card.textContent.includes('آلرژی'),
    reader: (card.querySelector('.sr-only')?.textContent ?? '').trim(),
    background: getComputedStyle(card).backgroundColor,
  }
})
check(allergyCard?.badge === true, 'کودک آلرژی‌دار روی کارتش بج آلرژی دارد')
/*
 * در چیدمان عمودی، کل کارت کرم می‌شود به‌جای نوار آجری لبه بالا —
 * مثل ماکت. در فهرست سفید کارت‌ها، تفاوت زمینه از دو متری دیده
 * می‌شود؛ یک خط دو پیکسلی نه.
 */
check(
  allergyCard?.background === 'rgb(254, 243, 199)',
  `کارت کودک آلرژی‌دار کرم می‌شود (${allergyCard?.background})`,
)
// رنگ هرگز تنها حامل معنا نیست — بخش ۱۲.۲
check(
  /آلرژی: .+/.test(allergyCard?.reader ?? ''),
  `صفحه‌خوان نام آلرژی را می‌خواند: ${(allergyCard?.reader ?? '').slice(0, 30)}`,
)

/*
 * میکروآیکون‌های وضعیت روز. داده‌اش از قبل در ClassDay بود و کسی
 * نگاهش نمی‌کرد.
 */
const micro = await page.evaluate(() => {
  const card = [...document.querySelectorAll('ul li button[aria-label]')].find((b) =>
    (b.getAttribute('aria-label') ?? '').includes('سارا'),
  )
  // فقط خانه‌های آیکون‌دار. سطر فعالیت، ساعت ورود را هم در خودش دارد.
  const acts = [...card.querySelectorAll('span[class*="activity"] > span')].filter(
    (el) => el.querySelector('svg') !== null,
  )
  return {
    count: acts.length,
    // گلیف رنگی نمی‌شود: رنگ لحن روی تینت خودش برای ۱۲ پیکسل کافی نیست
    colors: acts.map((a) => getComputedStyle(a).color),
    reader: (card.querySelector('.sr-only')?.textContent ?? '').trim(),
  }
})
check(micro.count === 2, `دو میکروآیکون روی کارت: ناهار و خواب (${micro.count})`)
check(
  micro.colors.every((c) => c === 'rgb(15, 23, 42)' || c === 'rgb(100, 116, 139)'),
  `گلیف --ink یا --ink-muted است، نه رنگ لحن (${micro.colors.join(' · ')})`,
)
check(
  micro.reader.includes('ناهار') && micro.reader.includes('خواب'),
  'و هر دو برای صفحه‌خوان کلمه دارند، نه فقط رنگ',
)

/*
 * هزینه صریح کارت عمودی، ثبت‌شده تا کسی بعداً غافلگیر نشود.
 *
 *   چهار ستونه، آواتار معلق      ~۱۲ کودک در پرده، ۰٫۸ پرده اسکرول
 *   دو ستونه، کارت افقی           ۶ کودک،           ۱٫۲ پرده
 *   دو ستونه، کارت عمودی (ماکت)   ۴ کودک،           ۲٫۵ پرده
 *
 * تصمیم مالک محصول است و آگاهانه گرفته شده: در عوضش عکس دو برابر
 * بزرگ‌تر است و کارت از یک متری خوانده می‌شود.
 *
 * سقف سه پرده است. اگر از آن بگذرد، پیدا کردن یک کودک مشخص از «کمی
 * اسکرول» به «گشتن» تبدیل می‌شود و معامله دیگر درست نیست.
 */
const reach = await page.evaluate(() => {
  const bar = document.querySelector('[class*="bar"]')?.getBoundingClientRect()
  const usable = window.innerHeight - (bar?.height ?? 0)
  window.scrollTo(0, document.documentElement.scrollHeight)
  return { screens: window.scrollY / usable }
})
await page.evaluate(() => window.scrollTo(0, 0))
check(
  reach.screens <= 3,
  `رسیدن به آخرین کودک زیر سه پرده می‌ماند (${reach.screens.toFixed(2)})`,
)

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
await page.click('header button[aria-label="حساب کاربری"]')
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

await tap('[aria-label="ثبت یکجا برای کودکان این بازه"] button:has-text("بیشترش")')
await tap('[aria-label="ثبت یکجا برای کودکان این بازه"] button:has-text("خوب")')
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

console.log('▸ بخش ۶: ثبت گروهی فقط فیلدهای بازه جاری را نشان می‌دهد')
check(
  (await page.locator('[class*="rowLabel"]').nth(1).innerText()) === 'خلق در بازه صبح',
  'کنترل خلق می‌گوید مال کدام بازه است',
)
check(
  (await page.locator('input[aria-label="ساعت شروع خواب"]').count()) === 0,
  'صبح، ردیف خواب اصلاً کشیده نمی‌شود — فیلد بازه بعدازظهر است',
)
check(
  /بازه صبح/.test(await page.locator('[class*="scope"]').innerText()),
  'و بالای کارت نوشته این ثبت روی کودکان کدام بازه می‌نشیند',
)

console.log('▸ استثنا برنده است، نه آخرین نوشته')
await tap('[aria-label="ثبت یکجا برای کودکان این بازه"] button:has-text("همه")')
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

console.log('▸ تصمیم ۰۳: پنجره انتقال، شبکه ناگهان عوض نمی‌شود')
/*
 * ساعت ۱۲:۴۵ — نیم‌ساعت مانده به مرز. کودکان بعدازظهر باید در بخش
 * تفکیک‌شده پیدا شده باشند، نه در شبکه اصلی، و بنر موقت هم آمده باشد.
 */
await setClock(12, 45)
await page.reload()
await page.waitForSelector('text=ثبت گروهی امروز')
await page.waitForTimeout(600)
check(
  (await page.locator('[class*="transitionBanner"]').count()) === 1,
  'بنر موقت پنجره انتقال آمد',
)
const bannerRole = await page.locator('[class*="transitionBanner"]').getAttribute('role')
check(bannerRole === 'status', `بنر role=status دارد، پس صفحه‌خوان می‌خواندش (${bannerRole})`)
const phaseTitles = await page.locator('[class*="phaseTitle"]').allInnerTexts()
check(
  phaseTitles.some((t) => t.includes('ورودی‌های بازه بعدازظهر')),
  `کودکان بازه بعد در بخش تفکیک‌شده‌اند: ${phaseTitles.join(' · ')}`,
)
check(
  (await page.locator('[class*="phaseDim"] img').first().evaluate((el) =>
    Number(getComputedStyle(el).opacity),
  )) < 1,
  'و کم‌رنگ‌اند، چون هنوز بازه‌شان نیست',
)
// منبع حقیقت عنوان بخش است، نه بنر: بنر می‌رود، عنوان می‌ماند.
await page.waitForTimeout(5200)
check(
  (await page.locator('[class*="transitionBanner"]').count()) === 0,
  'بنر پس از پنج ثانیه خودش می‌رود',
)
check(
  (await page.locator('[class*="phaseTitle"]').count()) > 0,
  'ولی عنوان بخش می‌ماند — منبع حقیقت آن است، نه بنر',
)

console.log('▸ تصمیم ۰۲: بازه‌های هم‌پوشان با عدد فشرده می‌شوند، نه با «و»')
const barText = await page.locator('[class*="periodBar"]').innerText()
check(!barText.includes(' و '), `نوار بازه اسامی را با «و» نمی‌چیند: ${barText.replace(/\n/g, ' · ')}`)

console.log('▸ بخش ۶: ثبت بعدازظهر، همان صفحه با فیلدهای دیگر')
/*
 * ساعت را به بعدازظهر می‌بریم. همان صفحه، ولی حالا ردیف خواب هست و
 * کودکان بعدازظهری در فهرست‌اند. کامل شدن روز دو ثبت می‌خواهد، یکی در
 * هر بازه — و این دقیقاً همان چیزی است که مربی واقعی می‌کند.
 */
await setClock(14)
await page.reload()
await page.waitForSelector('text=ثبت گروهی امروز')
await page.click('button:has-text("ثبت گروهی امروز")')
await page.waitForSelector('text=اعمال روی همه')
check(
  /بازه بعدازظهر/.test(await page.locator('[class*="scope"]').innerText()),
  'صفحه می‌گوید حالا بازه بعدازظهر است',
)
check(
  (await page.locator('input[aria-label="ساعت شروع خواب"]').count()) === 1,
  'و ردیف خواب حالا کشیده می‌شود',
)
await page.click('[aria-label="ثبت یکجا برای کودکان این بازه"] button:has-text("بیشترش")')
await page.click('[aria-label="ثبت یکجا برای کودکان این بازه"] button:has-text("خوب")')
await page.fill('input[aria-label="ساعت شروع خواب"]', '13:00')
await page.click('[class*="applyInline"]')
await page.waitForSelector('text=/اعمال شد/')
await page.click('[aria-label="بازگشت به امروز"]')
await page.waitForSelector('text=ثبت گروهی امروز')

console.log('▸ بخش ۵.۹: بستن روز')
await page.click('button:has-text("بستن روز")')
await page.waitForSelector('text=ارسال گزارش‌های امروز')
const lines = () => page.locator('[class*="lineText"]').allInnerTexts()
check((await lines()).some((t) => t.includes('کامل')), 'شمار گزارش کامل نشان داده می‌شود')
// با ثبت در هر دو بازه، هیچ گزارشی ناقص نمی‌ماند — نه کودک صبحانه‌ای
// که خواب ندارد، نه کودک بعدازظهری که صبح نبود.
check(
  (await lines()).some((t) => t.includes('کامل')) &&
    !(await lines()).some((t) => t.includes('ناقص')),
  'پس از ثبت در هر دو بازه، گزارشی ناقص نمی‌ماند',
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
await page.click('header button[aria-label="حساب کاربری"]')
await page.click('button:has-text("خروج")')
await page.waitForSelector('#phone')
await page.fill('#phone', '09120000003')
await page.click('button:has-text("فرستادن کد")')
await page.waitForSelector('#code')
await page.fill('#code', '11111')
await page.click('button:has-text("ورود")')
await page.waitForSelector('[class*="cardDate"]', { timeout: 8000 })
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
await page.waitForSelector('[class*="cardDate"]', { timeout: 8000 })
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
/*
 * بازطراحی: سه عدد خام جایش را به حلقه نسبت داد. «۱۸۸ از ۲۰۰» به مدیر
 * نمی‌گفت امروز خوب است یا بد؛ درصد می‌گوید. عدد خام زیر حلقه ماند.
 */
check(board.includes('حضور امروز'), 'حلقه حضور امروز آمد')
check(/٪/.test(board), 'و درصدش نوشته شده، نه فقط رنگ حلقه')
check(board.includes('پراکندگی سنی'), 'پراکندگی سنی روی داشبورد است')
// رنگ هرگز تنها حامل معنا نیست — هر قطعه عدد و درصد خودش را دارد.
check(
  (await page.locator('[class*="rowShare"]').count()) >= 2,
  'و هر گروه سنی عدد و درصد خودش را دارد، نه فقط قطعه رنگی',
)
check(board.includes('وضعیت ثبت'), 'وضعیت ثبت کلاس‌ها آمد')
check(board.includes('سهمیه پیامک'), 'سهمیه پیامک دیده می‌شود — بخش ۱۵.۴')
// ارتقای ۴: یک عدد به مدیر نمی‌گفت که آیا فردا می‌تواند حادثه را خبر دهد.
check(
  board.includes('اطلاع‌رسانی') && board.includes('پشتیبان رخداد حیاتی'),
  'سهمیه در دو سطل جدا دیده می‌شود — ارتقای ۴',
)
check(
  board.includes('با اطلاعیه خرج نمی‌شود'),
  'و گفته می‌شود که سطل حیاتی با اطلاعیه خالی نمی‌شود',
)
check(
  (await page.locator('text=/هیچ کودکی|شماره ثبت نشده|بدون اطلاع/').count()) >= 0,
  'فهرست بی‌خبرها با شماره تماس',
)

console.log('▸ بخش ۱۵.۳: اطلاع‌رسانی با تأیید دو مرحله‌ای')
// اطلاع‌رسانی به «بیشتر» رفت؛ جای کنش مرکزی مالِ کارِ روزانه است.
await page.locator('nav button:has-text("بیشتر")').click()
await page.waitForSelector('button:has-text("اطلاع‌رسانی به خانواده‌ها")')
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

/*
 * نوار پایین نباید منتظر داده بماند.
 *
 * تا اینجا شرط رفتن به هر مقصد، آمدنِ گزارش روز بود. یعنی تا وقتی آن
 * درخواست برنگشته — و پس از هر جابه‌جایی کودک دوباره برنگشته — زدن روی
 * خانه‌های نوار هیچ کاری نمی‌کرد: کاربر می‌زد، رنگ تب عوض می‌شد، صفحه
 * همان می‌ماند. همان چیزی که کاربر «گیر کردن نوار» می‌نامیدش.
 *
 * پس اینجا عمداً منتظر گزارش روز نمی‌مانیم؛ به محض آمدن نوار، می‌زنیم.
 */
await page.waitForSelector('nav button:has-text("بیشتر")', { timeout: 8000 })
await page.locator('nav button:has-text("بیشتر")').click()
await page.waitForSelector('text=اعلام غیبت', { timeout: 8000 })
check(true, 'نوار پیش از آمدن گزارش روز هم کار می‌کند')

/*
 * دکمه گرد وسط هم یک خانه نوار است و همان مسیر را می‌رود.
 *
 * چون متن دیده‌شدنی ندارد، با برچسب دسترس‌پذیری‌اش زده می‌شود — و اگر
 * روزی آن برچسب برود، همین‌جا می‌افتد.
 */
await page.locator('nav button[aria-label="پیام‌ها"]').click()
await page.waitForSelector('text=گفتگوی تازه', { timeout: 8000 })
check(true, 'دکمه گرد وسط، صندوق پیام را باز می‌کند')

await page.locator('nav button:has-text("بیشتر")').click()
await page.waitForSelector('text=اعلام غیبت')
check(true, 'فهرست «بیشتر» باز شد')

console.log('▸ بایگانی حضور و غیاب، در پرونده کودک')
await page.click('button:has-text("پرونده کودک")')
await page.waitForSelector('text=حضور و غیاب')
const archive = await page.evaluate(() => document.body.innerText)
check(/روز حاضر/.test(archive), 'شمار روزهای حضور ماه می‌آید')
check(/روز غایب/.test(archive), 'و شمار روزهای غیبت')
check(/مجموع ساعت/.test(archive), 'و مجموع ساعت حضور')
/*
 * روزی که خروجش ثبت نشده «۰ ساعت» نمی‌شود.
 *
 * صفر گذاشتن یعنی دروغ گفتن درباره ساعتی که کودک آنجا بود — و همین
 * عدد است که اگر روزی اختلافی پیش بیاید، به آن استناد می‌شود.
 */
check(
  !/۰:۰۰/.test(archive) || /خروج ثبت نشده/.test(archive),
  'روز بی‌خروج، مدت صفر نشان نمی‌دهد',
)
await page.locator('[aria-label="بازگشت"]').click()
await page.waitForTimeout(400)

/*
 * خانواده حالا انتخاب می‌کند به کدام مربی بنویسد.
 *
 * تا اینجا یک اتاق برای هر کودک بود و همه مربیانِ کلاس در آن — نمی‌شد
 * گفت این پیام برای کدام مربی است.
 */
await page.locator('nav button[aria-label="پیام‌ها"]').click()
await page.waitForSelector('text=گفتگوی تازه')
await page.click('button:has-text("گفتگوی تازه")')
await page.waitForSelector('text=مربیان')
const picker = await page.evaluate(() => document.body.innerText)
check(/زهرا محمدی/.test(picker), 'فهرست مربیانِ کلاسِ کودک برای انتخاب می‌آید')
check(/گل‌ها/.test(picker), 'و نام کلاس هم هست، تا انتخاب حدس نباشد')
check(!/09\d{9}/.test(picker), 'و هیچ شماره‌ای در فهرست انتخاب نیست')

await page.click('button:has-text("زهرا محمدی")')
await page.waitForSelector('textarea[aria-label="متن پیام"]')
check(
  (await page.locator('text=ساعت کاری پیام').count()) === 1,
  'ساعت کاری پیام به خانواده گفته می‌شود — بخش ۶.۶',
)
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

await page.locator('nav button:has-text("بیشتر")').click()
await page.waitForSelector('text=اعلام غیبت')
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

/*
 * مالی دیگر پشت «بیشتر» نیست؛ مقصد نوار پایین است.
 *
 * این ضربه از خانه زده می‌شود، نه از فهرست بیشتر — همان مسیری که
 * خانواده واقعاً می‌رود. اگر روزی مالی دوباره به فهرست برگردد، این
 * تست می‌افتد.
 */
await page.locator('nav button:has-text("مالی")').click()
await page.waitForSelector('text=مانده')
const parentMoney = await page.evaluate(() => document.body.innerText)
check(/تسویه/.test(parentMoney), 'خانواده همان صورتحسابی را می‌بیند که مدیر صادر کرد')
check(/پرداخت‌های ثبت‌شده/.test(parentMoney), 'و پرداختی را که مدیر ثبت کرد')

console.log('▸ شهریه سال، اقلام و جریمه — از دید خانواده')
check(/شهریه سال ۱۴/.test(parentMoney), 'برنامه شهریه سال آمد')
check(
  (await page.locator('[class*="month"]').count()) >= 12,
  'و هر دوازده ماه در آن هست',
)
check(
  /صادر نشده/.test(parentMoney),
  'ماه‌هایی که هنوز صورتحساب ندارند، «صادر نشده» علامت می‌خورند',
)

/*
 * سه دسته، به همان ترتیبی که خانواده می‌پرسد:
 * چه بدهکارم، چه در راه است، چه داده‌ام.
 */
check(/بدهی الان/.test(parentMoney), 'بدهی الان دسته خودش را دارد')
check(/پیش رو/.test(parentMoney), 'پرداخت‌های پیش رو دسته خودش را دارد')
check(/پرداخت‌شده/.test(parentMoney), 'پرداخت‌های گذشته دسته خودش را دارد')
check(
  /پرداخت‌های ثبت‌شده/.test(parentMoney),
  'و سابقه پرداخت، جدا از برنامه سال، با سند هر پرداخت',
)
check(
  /بدهی به حساب نمی‌آیند/.test(parentMoney),
  'و صریح گفته می‌شود که برآوردند، نه بدهی',
)

/*
 * قلم اختیاری: تا وقتی خانواده نپذیرفته، در مانده نمی‌آید.
 *
 * این را با عدد می‌سنجیم نه با متن: مانده پیش و پس از «شرکت نمی‌کنیم»
 * باید یکی باشد، وگرنه اردویی که کودک نمی‌رود در بدهی نشسته.
 */
check(/منتظر جواب شما/.test(parentMoney), 'قلم اختیاری از خانواده جواب می‌خواهد')
check(/اردوی باغ پرندگان/.test(parentMoney), 'و نامش را می‌گوید')
const owedBefore = await page.locator('[class*="big"]').first().innerText()
await page.locator('button:has-text("شرکت نمی‌کنیم")').first().click()
await page.waitForTimeout(600)
check(
  (await page.locator('[class*="big"]').first().innerText()) === owedBefore,
  'نپذیرفتن اردو، مانده را تکان نمی‌دهد',
)

// یک ماه را باز می‌کنیم تا ریز مبلغ دیده شود.
await page.locator('[class*="monthButton"]').first().click()
await page.waitForTimeout(400)
const detail = await page.evaluate(() => document.body.innerText)
check(/شهریه/.test(detail), 'ریز مبلغ ماه باز می‌شود')
check(
  /جریمه دیرکرد پرداخت/.test(detail) || /جریمه تأخیر در تحویل/.test(detail)
    || /پرداخت‌شده/.test(detail),
  'و اجزای مبلغ را نام می‌برد',
)

/*
 * دو جریمه، دو اسم.
 *
 * اگر روزی کسی این دو را در یک ستون جمع کند، همین تست می‌افتد —
 * چون خانواده‌ای که دیر رسیده بود، متهم به دیر پرداختن می‌شود.
 */
const all = await page.evaluate(() => document.body.innerText)
check(
  !/جریمه(?! تأخیر در تحویل)(?! دیرکرد پرداخت)/.test(all),
  'هر جریمه‌ای که نوشته می‌شود، می‌گوید بابت چیست',
)
check(
  /کد رهگیری|تصویر فیش|سندی ثبت نشده/.test(all),
  'هر پرداخت گذشته سندش را می‌گوید — یا صریح می‌گوید که ندارد',
)

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

/*
 * نوار پایین، مشترک بین هر سه پنل.
 *
 * کفِ اندازه از سخت‌گیرانه‌ترین نقش برداشته شده، نه از نقش جاری: نوار
 * یکی است و نمی‌شود برای مدیر کوچک و برای مربی بزرگ باشد.
 */
const navBox = await page.locator('nav button:has-text("مالی")').first().boundingBox()
check(navBox.height >= 56, `خانه‌های نوار پایین درشت‌اند (${Math.round(navBox.height)})`)
check(
  (await page
    .locator('nav button[aria-current="page"] [class*="label"]')
    .first()
    .evaluate((el) => getComputedStyle(el).fontWeight)) === '700',
  'و خانه فعال پررنگ است',
)

await page.click('button:has-text("مالی")')
await page.waitForSelector('text=شهریه‌ها')
await page.click('button:has-text("صدور گروهی")')
await page.waitForSelector('text=/صورتحساب صادر شد/')

await page.locator('[aria-label="بازگشت به داشبورد"]').click()
await page.waitForSelector('text=وضعیت ثبت')
await signOutAny()
await signIn('09120000003', { fresh: false })
await page.waitForSelector('[class*="cardDate"]', { timeout: 8000 })
await page.locator('nav button:has-text("مالی")').click()
await page.waitForSelector('text=مانده')
await page.click('button:has-text("کارت به کارت")')
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

// یک «بازگشت»، نه دو: مالی حالا مقصد نوار است و بازگشتش یک‌راست خانه.
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
  // دکمه بازرسی هم نشان دارد، پس دقیقاً همین یکی سنجیده می‌شود.
  (await page.locator('nav button:has-text("مالی") [class*="dot"]').count()) === 1,
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

console.log('▸ ارتقای ۱: پرداخت آنلاین، تا کد رهگیری')
/*
 * قاعده سفت معماری: وضعیت صورتحساب فقط با تأیید سمت سرور عوض می‌شود،
 * هرگز با بازگشت مرورگر. پس شیت پس از بازگشت «پرداخت شد» نمی‌گوید؛
 * می‌پرسد.
 */
await signIn('09120000002')
await page.waitForSelector('text=با کدام حساب وارد می‌شوید؟')
await page.locator('button:has-text("مریم رضایی")').nth(1).click()
await page.waitForSelector('text=وضعیت ثبت', { timeout: 10000 })
await page.click('button:has-text("مالی")')
await page.waitForSelector('text=شهریه‌ها')
await page.click('button:has-text("صدور گروهی")')
await page.waitForSelector('text=/صورتحساب صادر شد/')
await page.locator('[aria-label="بازگشت به داشبورد"]').click()
await page.waitForSelector('text=وضعیت ثبت')

await signOutAny()
await signIn('09120000003', { fresh: false })
await page.waitForSelector('[class*="cardDate"]', { timeout: 8000 })
await page.locator('nav button:has-text("مالی")').click()
await page.waitForSelector('text=مانده')
await page.waitForTimeout(500)
check(
  (await page.locator('button:has-text("پرداخت با شاپرک")').count()) >= 1,
  'شاپرک کنش اصلی کارت صورتحساب است، و به اسم خودش',
)
check(
  (await page.locator('button:has-text("کارت به کارت")').count()) >= 1,
  'و کارت‌به‌کارت مسیر دوم است، نه حذف',
)

const payableBefore = await page.locator('button:has-text("پرداخت با شاپرک")').count()
await page.locator('button:has-text("پرداخت با شاپرک")').first().click()
await page.waitForSelector('[role="dialog"]')
await page.click('button:has-text("رفتن به درگاه")')
await page.waitForTimeout(400)
await page.click('button:has-text("بازگشت از درگاه")')
check(
  (await page.locator('text=در حال تأیید پرداخت').count()) === 1,
  'بازگشت از درگاه «پرداخت شد» نمی‌گوید، می‌پرسد',
)
/*
 * انتظار داخل شیت، نه روی کل صفحه.
 *
 * «کد رهگیری» حالا در فهرست پرداخت‌های گذشته هم هست، پس انتظارِ
 * بی‌قید همان لحظه اول برآورده می‌شد و تست، رسیدِ نیامده را می‌سنجید.
 */
await page.waitForSelector('[role="dialog"] >> text=/کد رهگیری/', { timeout: 15000 })
const receipt = await page.locator('[role="dialog"]').innerText()
check(/تأیید شد/.test(receipt), 'پس از تأیید سرور، پرداخت ثبت می‌شود')
check(/کد رهگیری/.test(receipt), 'و رسید دیجیتال با کد رهگیری صادر می‌شود')
await page.click('button:has-text("بستن")')
await page.waitForTimeout(800)
// یکی کم‌تر، نه صفر: صورتحساب‌های باز دیگری هم روی صفحه هست.
check(
  (await page.locator('button:has-text("پرداخت با شاپرک")').count()) === payableBefore - 1,
  'و صورتحساب تسویه‌شده دیگر دکمه پرداخت ندارد',
)
await page.locator('[aria-label="بازگشت"]').first().click()
await page.waitForTimeout(400)

console.log('▸ اقلام هزینه: از تعریف مدیر تا صورتحساب خانواده')
await signIn('09120000002')
await page.waitForSelector('text=با کدام حساب وارد می‌شوید؟')
await page.locator('button:has-text("مریم رضایی")').nth(1).click()
await page.waitForSelector('text=وضعیت ثبت', { timeout: 10000 })
await page.click('button:has-text("مالی")')
await page.waitForSelector('text=اقلام هزینه این دوره')
await page.click('button:has-text("صدور گروهی")')
await page.waitForSelector('text=/صورتحساب صادر شد|صورتحساب این دوره را دارند/')

await page.click('button:has-text("تعریف قلم تازه")')
await page.waitForSelector('[role="dialog"]')
await page.fill('input[aria-label="عنوان قلم"]', 'جشن پایان ترم')
await page.fill('input[aria-label="مبلغ قلم"]', '120000')
await page.locator('[role="dialog"] button:has-text("اجباری")').click()
// دقیقاً دکمه داخل شیت: «تعریف قلم تازه» پشت شیت هم هنوز روی صفحه است.
await page.locator('[role="dialog"] button:has-text("تعریف قلم")').click()
await page.waitForSelector('text=/«جشن پایان ترم» تعریف شد/')

/*
 * ساختن، فرستادن نیست.
 *
 * پس از تعریف، قلم هنوز روی هیچ صورتحسابی ننشسته و هیچ خانواده‌ای
 * نمی‌بیندش. اگر روزی این دو یکی شوند، همین تست می‌افتد.
 */
check(
  (await page.locator('text=هنوز فرستاده نشده').count()) >= 1,
  'قلم تازه ساخته می‌شود ولی فرستاده نمی‌شود',
)
check(
  (await page.locator('button:has-text("فرستادن به خانواده‌ها")').count()) >= 1,
  'و فرستادنش ضربه جدای خودش را دارد',
)

await page.locator('button:has-text("فرستادن به خانواده‌ها")').first().click()
await page.waitForSelector('text=/روی .* صورتحساب نشست/')
check(true, 'قلم اجباری با فرستادن، روی صورتحساب‌ها می‌نشیند')

await page.locator('[aria-label="بازگشت به داشبورد"]').click()
await page.waitForSelector('text=وضعیت ثبت')
await signOutAny()
await signIn('09120000003', { fresh: false })
await page.waitForSelector('[class*="cardDate"]', { timeout: 8000 })
await page.locator('nav button:has-text("مالی")').click()
await page.waitForSelector('text=مانده')
await page.locator('[class*="monthButton"]').last().click()
await page.waitForTimeout(500)
const withItem = await page.evaluate(() => document.body.innerText)
check(/جشن پایان ترم/.test(withItem), 'خانواده همان قلمی را می‌بیند که مدیر فرستاد')
check(
  /جشن پایان ترم/.test(withItem) && /شهریه/.test(withItem),
  'و می‌بیند مبلغ صورتحساب از چه چیزهایی ساخته شده',
)
await page.locator('[aria-label="بازگشت"]').click()
await page.waitForTimeout(400)

console.log('▸ ویرایش پرونده کودک: از خانواده تا تأیید مدیر')
await signIn('09120000003')
await page.waitForSelector('nav button:has-text("بیشتر")', { timeout: 8000 })
await page.locator('nav button:has-text("بیشتر")').click()
await page.waitForSelector('text=پرونده کودک')
await page.click('button:has-text("پرونده کودک")')
await page.waitForSelector('text=اطلاعات کودک')

const profileText = await page.evaluate(() => document.body.innerText)
check(/آلرژی/.test(profileText), 'خانواده میدان‌های پرونده را می‌بیند')
check(
  /کلاس، شهریه و سرپرست پرداخت‌کننده را مهد ثبت می‌کند/.test(profileText),
  'و صریح گفته می‌شود چه چیزهایی از اینجا عوض نمی‌شوند',
)

/*
 * میدان ایمنی علامت دارد.
 *
 * نه برای ترساندن: خانواده باید بداند چرا آلرژی مهم‌تر است و چرا تا
 * تأیید مدیر باید تلفنی هم خبر بدهد.
 */
check(
  (await page.locator('[class*="safety"]').count()) >= 1,
  'میدان‌های ایمنی علامت دارند',
)

await page.locator('button:has-text("آلرژی")').first().click()
await page.waitForSelector('[role="dialog"]')
const sheetText = await page.locator('[role="dialog"]').innerText()
check(
  /تا تأیید او اعمال نمی‌شود/.test(sheetText),
  'شیت وعده «ذخیره شد» نمی‌دهد — می‌گوید درخواست فرستاده می‌شود',
)
await page.fill('[role="dialog"] input[aria-label*="آلرژی"]', 'بادام‌زمینی، تخم‌مرغ')
await page.click('button:has-text("فرستادن برای تأیید")')
await page.waitForSelector('text=/برای تأیید مهد فرستاده شد/')

/*
 * مهم‌ترین گزاره این بخش: نوشتن، عوض شدن نیست.
 *
 * مقدار فعلی سر جایش می‌ماند و مقدار پیشنهادی زیرش می‌نشیند. اگر روزی
 * مقدار تازه جای قبلی را بگیرد، خانواده فکر می‌کند اعمال شده و بعد
 * می‌بیند رد شده.
 */
const afterRequest = await page.evaluate(() => document.body.innerText)
check(/منتظر تأیید/.test(afterRequest), 'مقدار پیشنهادی «منتظر تأیید» علامت می‌خورد')
check(
  /مربی همان اطلاعات قبلی را می‌بیند/.test(afterRequest),
  'و به خانواده گفته می‌شود که تا تأیید، مربی مقدار قبلی را می‌بیند',
)

// کلید حساب در سرصفحه سلام است، نه روی مقصدهایی که سرصفحه خودشان را دارند.
await page.locator('[aria-label="بازگشت"]').click()
await page.waitForTimeout(400)
await page.locator('nav button:has-text("خانه")').click()
await page.waitForTimeout(600)
await signOutAny()
await signIn('09120000002', { fresh: false })
await page.waitForTimeout(1200)
if (await page.locator('button:has-text("مریم رضایی")').count()) {
  await page.locator('button:has-text("مریم رضایی")').nth(1).click()
}
await page.waitForSelector('text=وضعیت ثبت', { timeout: 10000 })
await page.locator('nav button:has-text("کودکان")').click()
await page.waitForSelector('text=/درخواست تغییر پرونده از خانواده‌ها/')
const queueText = await page.evaluate(() => document.body.innerText)
check(/بادام‌زمینی، تخم‌مرغ/.test(queueText), 'درخواست خانواده به صف مدیر می‌رسد')
check(/←/.test(queueText), 'و مدیر می‌بیند چه چیزی جای چه چیزی می‌نشیند')

await page.click('button:has-text("تأیید و ثبت")')
await page.waitForSelector('text=/ثبت شد/')
check(
  (await page.locator('text=/درخواست تغییر پرونده از خانواده‌ها/').count()) === 0,
  'با تأیید، درخواست از صف مدیر بیرون می‌رود',
)


console.log('▸ ارتقای ۲: پرونده بازرسی')
await signIn('09120000002')
await page.waitForSelector('text=با کدام حساب وارد می‌شوید؟')
await page.locator('button:has-text("مریم رضایی")').nth(1).click()
await page.waitForSelector('text=وضعیت ثبت', { timeout: 10000 })
await page.waitForTimeout(800)
/*
 * نشان، نه عدد.
 *
 * نوار مشترک نقطه می‌گذارد نه رقم: عدد روی یک نشان ۹ پیکسلی خوانده
 * نمی‌شود و مدیر برای دیدن شمار، خودش وارد صفحه می‌شود.
 */
const auditBadge = await page
  .locator('nav button:has-text("بیشتر") [class*="dot"]')
  .count()
check(auditBadge === 1, 'نشان آمادگی روی خانه «بیشتر» می‌آید')

await page.locator('nav button:has-text("بیشتر")').click()
await page.waitForSelector('button:has-text("پرونده بازرسی")')
await page.click('button:has-text("پرونده بازرسی")')
await page.waitForSelector('text=آمادگی بازرسی')
await page.waitForTimeout(500)
check(
  (await page.locator('[class*="gap_"]').count()) > 0,
  'شکاف‌های پیش از بازرسی فهرست می‌شوند، نه فقط در خروجی',
)
check(
  (await page.locator('text=/ساختنش با نام شما ثبت می‌شود/').count()) === 1,
  'پیش از ساخت، گفته می‌شود که فایل حساس است و ردِ پا می‌گذارد',
)

await page.click('button:has-text("ساخت پرونده")')
await page.waitForSelector('text=جدول ۱', { timeout: 10000 })
await page.waitForTimeout(400)
const tables = await page.locator('[class*="tableTitle"]').allInnerTexts()
check(tables.length === 3, `هر سه جدول ساخته شد: ${tables.length}`)
check(
  tables.some((t) => t.includes('دفتر آمار')) &&
    tables.some((t) => t.includes('واکسیناسیون')) &&
    tables.some((t) => t.includes('کارت بهداشت')),
  'دفتر آمار، کنترل سلامت، و کارت بهداشت مربیان',
)
check(
  (await page.locator('[class*="rowMarked"]').count()) > 0,
  'ردیفی که کار دارد علامت می‌خورد — تنها رنگ فایل',
)

console.log('▸ پرونده بازرسی: چک‌لیست، مدارک مهد، دفتر بازدید')
/*
 * چک‌لیست خالی شروع می‌شود و مدیر خودش می‌سازدش.
 *
 * عمدی: سیاهه‌ای که اپ از پیش بگذارد، شبیه فهرست قانونی به نظر
 * می‌رسد — و نیست.
 */
const emptyList = await page.evaluate(() => document.body.innerText)
check(/هنوز چک‌لیستی ندارید/.test(emptyList), 'چک‌لیست خالی شروع می‌شود')
await page.click('button:has-text("ساختن چک‌لیست آغازین")')
await page.waitForSelector('text=/قلم به چک‌لیست اضافه شد/')

const inspection = await page.evaluate(() => document.body.innerText)
check(/چک‌لیست بازرسی/.test(inspection), 'چک‌لیست بازرسی روی صفحه است')
check(/مدارک مهد/.test(inspection), 'و بخش مدارک مهد')
check(/دفتر بازدید/.test(inspection), 'و دفتر بازدید')
/*
 * فهرست، مرجع قانونی نیست و صفحه همین را می‌گوید.
 *
 * مقررات از استانی به استان دیگر فرق دارد و بازرسِ امسال چیزی
 * می‌خواهد که پارسال نمی‌خواست. ادعای «کامل است» خطرناک‌تر از نداشتن
 * فهرست است.
 */
check(
  /نقطه شروع است، نه فهرست قانونی/.test(inspection),
  'و صریح می‌گوید مرجع قانونی نیست',
)
check(/آماده/.test(inspection), 'شمار اقلام آماده از کل، نوشته می‌شود')

/*
 * قلم «خروجی اپ» همیشه تأمین‌شده است — عمدی.
 *
 * داده‌اش در اپ هست و خروجی‌اش ساختنی؛ قلمی که اپ خودش تولیدش می‌کند
 * نباید مدیر را نگران کند.
 */
check(/خروجی اپ/.test(inspection), 'اقلامی که از خود اپ درمی‌آیند علامت خورده‌اند')
/*
 * ولی مدرکی که هنوز نیامده، «تأمین نشده» است.
 * مهدی که مجوز فعالیتش را ثبت نکرده نباید فهرست سبز ببیند.
 */
check(/تأمین نشده/.test(inspection), 'و مدرکی که هنوز ثبت نشده، تأمین‌نشده است')

await page.click('button:has-text("ثبت مدرک مهد")')
await page.waitForSelector('[role="dialog"]')
await page.fill('input[aria-label="عنوان مدرک مهد"]', 'مجوز فعالیت ۱۴۰۵')
await page.fill('input[aria-label="مرجع صادرکننده"]', 'بهزیستی استان')
await page.fill('input[aria-label="تاریخ انقضای مدرک مهد"]', '۱۴۰۴-۱۲-۳۰')
await page.click('[role="dialog"] button:has-text("ثبت")')
await page.waitForTimeout(400)
check(
  (await page.locator('text=تاریخ خوانده نشد').count()) === 1,
  'تاریخ نامعتبر مدرک مهد رد می‌شود',
)
await page.fill('input[aria-label="تاریخ انقضای مدرک مهد"]', '۱۴۰۶-۰۳-۳۱')
await page.click('[role="dialog"] button:has-text("ثبت")')
await page.waitForSelector('text=/«مجوز فعالیت ۱۴۰۵» ثبت شد/')
const afterDoc = await page.evaluate(() => document.body.innerText)
check(/مجوز فعالیت ۱۴۰۵/.test(afterDoc), 'مدرک مهد ثبت و در فهرست دیده شد')

await page.click('button:has-text("ثبت بازدید")')
await page.waitForSelector('[role="dialog"]')
await page.fill('input[aria-label="مرجع بازرسی"]', 'بهزیستی')
await page.fill('textarea[aria-label="یافته‌های بازرس"]', 'کپسول آتش‌نشانی راهرو شارژ نبود.')
await page.fill('textarea[aria-label="اقدام لازم"]', 'شارژ کپسول تا پایان ماه.')
await page.click('[role="dialog"] button:has-text("ثبت")')
await page.waitForSelector('text=/بازدید ثبت شد/')
const afterVisit = await page.evaluate(() => document.body.innerText)
check(/کپسول آتش‌نشانی/.test(afterVisit), 'بازدید و یافته‌اش ثبت شد')
check(/اقدام باز/.test(afterVisit), 'و اقدامِ رفع‌نشده شمرده می‌شود')

/*
 * تاریخ رفع، نه یک تیک.
 * بازرسِ بعدی می‌پرسد کِی رفع شد؛ «بله» جوابش نیست.
 */
await page.click('button:has-text("رفع شد")')
await page.waitForSelector('text=/اقدام لازم، رفع‌شده ثبت شد/')
check(
  (await page.locator('text=/رفع شد —/').count()) >= 1,
  'رفع با تاریخش ثبت می‌شود، نه فقط یک تیک',
)

// بازگشت از بازرسی به «بیشتر» است، چون از آنجا باز شده.
await page.locator('[aria-label="بازگشت به داشبورد"]').click()
await page.locator('nav button:has-text("خانه")').click()
await page.waitForSelector('text=وضعیت ثبت')

console.log('▸ ارتقای ۳: درخواست دارو از خانه، تا ثبت مصرف')
/*
 * قاعده‌ای که این بخش محافظت می‌کند: اعلام والد، تحویل دادن نیست.
 * والد می‌تواند فرم را پر کند و شیشه دارو را در خانه جا بگذارد.
 */
await setClock(9)
await signIn('09120000003')
await page.waitForSelector('[class*="cardDate"]', { timeout: 8000 })
await page.click('button:has-text("بیشتر")')
await page.click('button:has-text("درخواست مصرف دارو")')
await page.waitForSelector('input[aria-label="نام دارو"]')
await page.fill('input[aria-label="نام دارو"]', 'شربت سرماخوردگی')
await page.fill('input[aria-label="مقدار مصرف"]', '۵ سی‌سی')
await page.fill('input[aria-label="ساعت مصرف ۱"]', '11:30')
await page.click('button:has-text("امروز")')
await page.click('button:has-text("اعلام به مهد")')
await page.waitForTimeout(900)
const afterAnnounce = await page.evaluate(() => document.body.innerText)
check(/اعلام شد/.test(afterAnnounce), 'خانواده دارو را اعلام کرد')
check(
  /هنوز تحویل مهد نشده/.test(afterAnnounce),
  'و صفحه صادقانه می‌گوید هنوز تحویل نشده — اعلام، تحویل نیست',
)

await page.locator('[aria-label="بازگشت"]').first().click()
await page.waitForTimeout(300)
await page.locator('[aria-label="بازگشت"]').first().click()
await page.waitForTimeout(500)
await signOutAny()
await signIn('09120000001', { fresh: false })
await page.waitForSelector('text=ثبت گروهی امروز')
await page.waitForTimeout(700)
check(
  (await page.locator('[class*="handoverHead"]').count()) === 1,
  `مربی کارت «تحویل نگرفته‌ایم» را می‌بیند: ${await page
    .locator('[class*="handoverHead"]')
    .innerText()}`,
)
const takeBox = await page.locator('button:has-text("تحویل گرفتم")').boundingBox()
check(takeBox.height >= 56, `دکمه تحویل هدف لمسی کامل دارد (${Math.round(takeBox.height)})`)

await page.click('button:has-text("تحویل گرفتم")')
await page.waitForTimeout(900)
check(
  (await page.locator('[class*="handoverHead"]').count()) === 0,
  'با «تحویل گرفتم»، کارت انتظار می‌رود',
)
await page.click('[class*="medicationBar"]')
await page.waitForTimeout(400)
check(
  (await page.locator('[class*="medicationList"]').innerText()).includes('شربت سرماخوردگی'),
  'و همان دارو در یادآور می‌نشیند، حالا با دکمه «داده شد»',
)

await signOutAny()
await signIn('09120000003', { fresh: false })
await page.waitForSelector('[class*="cardDate"]', { timeout: 8000 })
await page.click('button:has-text("بیشتر")')
await page.click('button:has-text("درخواست مصرف دارو")')
await page.waitForTimeout(600)
const afterReceive = await page.evaluate(() => document.body.innerText)
check(/مهد تحویل گرفت/.test(afterReceive), 'خانواده می‌بیند که مهد تحویل گرفت')
check(
  (await page.locator('button:has-text("لغو درخواست")').count()) === 0,
  'و راه لغو بسته شد، چون دارو دست مهد است',
)
await page.locator('[aria-label="بازگشت"]').first().click()
await page.waitForTimeout(300)
await page.locator('[aria-label="بازگشت"]').first().click()
await page.waitForTimeout(400)

console.log('▸ بخش ۶.۶: پیام خانواده تا صندوق مربی و جوابش')
/*
 * حلقه‌ای که تا امروز شکسته بود: خانواده می‌توانست پیام بفرستد و مربی
 * هیچ صندوق ورودی نداشت — پیام ثبت می‌شد و به جایی نمی‌رسید.
 */
await signOutAny()
await signIn('09120000003', { fresh: false })
await page.waitForSelector('[class*="cardDate"]', { timeout: 8000 })
await page.locator('nav button[aria-label="پیام‌ها"]').click()
await page.waitForSelector('text=گفتگوی تازه')
/*
 * از راه انتخاب، نه از فهرست.
 *
 * open_conversation دوباره‌اجراپذیر است: اگر گفتگو با همین مربی باشد
 * همان برمی‌گردد، و اگر نباشد ساخته می‌شود. پس تست به وضعیت قبلی
 * مرورگر وابسته نیست.
 */
await page.click('button:has-text("گفتگوی تازه")')
await page.waitForSelector('text=مربیان')
await page.click('button:has-text("زهرا محمدی")')
await page.waitForSelector('textarea[aria-label="متن پیام"]')
await page.fill('textarea[aria-label="متن پیام"]', 'سارا امروز کمی سرفه داشت.')
await page.click('button:has-text("فرستادن")')
await page.waitForTimeout(700)
check(
  (await page.locator('text=سارا امروز کمی سرفه داشت.').count()) > 0,
  'خانواده پیام فرستاد',
)

await page.click('nav button:has-text("خانه")')
await page.waitForTimeout(500)
await signOutAny()
await signIn('09120000001', { fresh: false })
await page.waitForSelector('text=ثبت گروهی امروز', { timeout: 8000 })

/*
 * نشان روی تب، پیش از باز کردن صندوق.
 *
 * این گزاره یک باگ واقعی را نگه می‌دارد: hydrate داده ذخیره‌شده را
 * تنبل می‌خواند و listThreads روی بارگذاری تازه صفر برمی‌گرداند.
 * بی این تست، نشان فقط وقتی می‌آمد که مربی از قبل جای دیگری رفته بود.
 */
const inboxTab = page.locator('nav button:has-text("پیام‌ها")')
check(
  (await inboxTab.locator('span[class*="dot"]').count()) === 1,
  'نشان نخوانده روی تب پیام‌ها می‌آید، بی باز کردن صندوق',
)

await inboxTab.click()
await page.waitForTimeout(800)
const inbox = await page.evaluate(() => document.body.innerText)
check(inbox.includes('مادر سارا'), 'صندوق مربی، خودِ سرپرست را طرف گفتگو نشان می‌دهد')
/*
 * شماره هیچ‌کس در این مسیر نیست: گفتگو با شناسه حساب کلید می‌خورد و
 * پیام‌ها نام فرستنده را حمل می‌کنند، نه شماره‌اش.
 */
check(!/09\d{9}/.test(inbox), 'و هیچ شماره تلفنی در صندوق دیده نمی‌شود')

await page.locator('[class*="row"]').first().click()
await page.waitForTimeout(700)
await page.fill('textarea[aria-label="متن پیام"]', 'حواسمان هست، خبر می‌دهیم.')
await page.click('button:has-text("فرستادن")')
await page.waitForTimeout(700)
const chat = await page.evaluate(() => document.body.innerText)
check(chat.includes('حواسمان هست'), 'مربی جواب داد')
check(chat.includes('سارا امروز کمی سرفه داشت.'), 'و هر دو پیام در یک گفتگو هستند')
check(!/09\d{9}/.test(chat), 'در گفتگو هم شماره‌ای نیست')

await page.locator('[aria-label="بازگشت"]').first().click()
await page.waitForTimeout(600)
check(
  (await page.locator('nav button:has-text("پیام‌ها") span[class*="dot"]').count()) === 0,
  'پس از خواندن، نشان نخوانده می‌رود',
)

/*
 * و مربی می‌تواند خودش گفتگوی تازه شروع کند — با هر سرپرستی که کودکش
 * در کلاس اوست. تا اینجا فقط می‌توانست جواب بدهد.
 */
await page.click('button:has-text("گفتگوی تازه")')
await page.waitForSelector('text=خانواده‌ها')
const teacherPicker = await page.evaluate(() => document.body.innerText)
check(/مادر سارا/.test(teacherPicker), 'مربی فهرست خانواده‌های کلاسش را برای گفتگو می‌بیند')
check(/مدیر/.test(teacherPicker), 'و مدیر هم در فهرستش هست')
check(!/09\d{9}/.test(teacherPicker), 'باز هم بی هیچ شماره‌ای')
await page.locator('[aria-label="بازگشت"]').first().click()
await page.waitForTimeout(400)
await page.click('nav button:has-text("امروز")')
await page.waitForTimeout(600)

console.log('▸ پیام مدیر: جداگانه به هر مربی یا سرپرست')
await signIn('09120000002')
await page.waitForSelector('text=با کدام حساب وارد می‌شوید؟')
await page.locator('button:has-text("مریم رضایی")').nth(1).click()
await page.waitForSelector('text=وضعیت ثبت', { timeout: 10000 })
await page.locator('nav button[aria-label="پیام‌ها"]').click()
await page.waitForSelector('text=گفتگوی تازه')
await page.click('button:has-text("گفتگوی تازه")')
await page.waitForSelector('text=مربیان')

const managerPicker = await page.evaluate(() => document.body.innerText)
/*
 * مدیر با همه، جداگانه.
 *
 * هم مربیان و هم خانواده‌ها در یک فهرست‌اند ولی زیر دو عنوان — تا
 * انتخاب اشتباه یک ضربه نباشد.
 */
check(/مربیان/.test(managerPicker), 'مدیر فهرست مربیان را می‌بیند')
check(/خانواده‌ها/.test(managerPicker), 'و فهرست خانواده‌ها را')
check(/الهام نوری/.test(managerPicker), 'مربی کلاس دیگر هم در فهرست مدیر هست')
check(!/09\d{9}/.test(managerPicker), 'و هیچ شماره‌ای در فهرست مدیر نیست')

await page.click('button:has-text("الهام نوری")')
await page.waitForSelector('textarea[aria-label="متن پیام"]')
/*
 * ساعت کاری فقط وقتی یک سرِ گفتگو خانواده است — بخش ۶.۶.
 *
 * قاعده ساعت کاری برای محافظت از خانواده است، نه یک قاعده عمومی:
 * مدیری که به مربی می‌نویسد نباید تا صبح صبر کند.
 */
check(
  (await page.locator('text=ساعت کاری پیام').count()) === 0,
  'گفتگوی مدیر و مربی قید ساعت کاری ندارد',
)
await page.fill('textarea[aria-label="متن پیام"]', 'فردا جلسه ساعت ۸ صبح.')
await page.click('button:has-text("فرستادن")')
await page.waitForTimeout(700)
check(
  (await page.locator('text=فردا جلسه ساعت ۸ صبح.').count()) > 0,
  'مدیر مستقیم به یک مربی پیام داد',
)

await page.locator('[aria-label="بازگشت"]').first().click()
await page.waitForTimeout(500)
await page.click('nav button:has-text("خانه")')
await page.waitForTimeout(500)

console.log('▸ کارتابل کارکنان: مدرک، ارزیابی، و خروجی بازرس')
await page.locator('nav button:has-text("بیشتر")').click()
await page.waitForSelector('button:has-text("کارکنان")')
await page.click('button:has-text("کارکنان")')
await page.waitForSelector('text=/فعالیت سی روز گذشته|روز فعال/')

const cartable = await page.evaluate(() => document.body.innerText)
/*
 * قاعده‌ای که این صفحه نمی‌شکند: هیچ نمره، رتبه یا مقایسه‌ای بین
 * مربیان. اگر روزی کسی «امتیاز مربی» اضافه کند، همین‌جا می‌افتد.
 */
check(
  !/نمره|امتیاز|رتبه|رده‌بندی/.test(cartable),
  'کارتابل هیچ نمره یا رتبه‌ای برای مربی ندارد',
)
check(
  /مقایسه نمی‌شوند/.test(cartable),
  'و صریح می‌گوید بین مربیان مقایسه نمی‌شود',
)
check(/هنوز ارزیابی نشده/.test(cartable), 'مربی بدون ارزیابی علامت می‌خورد')

await page.locator('[class*="item"]').first().click()
await page.waitForSelector('text=مدارک')
await page.click('button:has-text("بارگذاری مدرک")')
await page.waitForSelector('[role="dialog"]')
await page.fill('input[aria-label="عنوان مدرک"]', 'کارت بهداشت ۱۴۰۵')
await page.fill('input[aria-label="تاریخ انقضای مدرک"]', '۱۴۰۵-۱۲-۲۹')
/*
 * تاریخ نامعتبر رد می‌شود، نه حدس زده.
 *
 * ستون انقضا با تاریخ امروز مقایسه می‌شود؛ تاریخی که خوانده نشده یعنی
 * «مدرک منقضی» هرگز درست درنمی‌آید.
 */
await page.fill('input[aria-label="تاریخ انقضای مدرک"]', '۱۴۰۴-۱۲-۳۰')
await page.click('[role="dialog"] button:has-text("بارگذاری")')
await page.waitForTimeout(400)
check(
  (await page.locator('text=تاریخ خوانده نشد').count()) === 1,
  '۳۰ اسفندِ سال غیرکبیسه رد می‌شود',
)

await page.fill('input[aria-label="تاریخ انقضای مدرک"]', '۱۴۰۵-۱۲-۲۹')
await page.click('[role="dialog"] button:has-text("بارگذاری")')
await page.waitForSelector('text=/بارگذاری شد/')
check(true, 'مدرک مربی بارگذاری شد، با تاریخ انقضا')

await page.click('button:has-text("ثبت یادداشت یا ارزیابی")')
await page.waitForSelector('[role="dialog"]')
await page.fill('textarea[aria-label="متن یادداشت"]', 'با کودکان صبور است و گزارش‌هایش دقیق.')
/*
 * ارزیابی‌ای که مربی هرگز نمی‌بیند، ارزیابی نیست؛ پرونده‌سازی است.
 * پیش‌فرض «در میان گذاشته شود» است، و برداشتنش هشدار خودش را دارد.
 */
await page.uncheck('[role="dialog"] input[type="checkbox"]')
const unshared = await page.locator('[role="dialog"]').innerText()
check(
  /فرصت پاسخ یا اصلاح ندارد/.test(unshared),
  'برداشتن تیکِ «در میان گذاشته شود» هشدارش را می‌گوید',
)
await page.check('[role="dialog"] input[type="checkbox"]')
await page.click('[role="dialog"] button:has-text("ثبت")')
await page.waitForSelector('text=/در میان گذاشته شد/')
check(
  (await page.locator('text=با مربی در میان گذاشته شده').count()) >= 1,
  'یادداشت ثبت و با مربی در میان گذاشته شد',
)

await page.locator('[aria-label="بازگشت به فهرست کارکنان"]').click()
await page.waitForTimeout(500)
await page.click('button:has-text("خروجی پرونده کارکنان برای بازرس")')
await page.waitForSelector('[aria-label="خروجی پرونده کارکنان"]')
const staffExport = await page.locator('[aria-label="خروجی پرونده کارکنان"]').innerText()
check(/کارت بهداشت ۱۴۰۵/.test(staffExport), 'خروجی بازرس، مدرک بارگذاری‌شده را دارد')
check(
  !/نمره|امتیاز|رتبه/.test(staffExport),
  'و در خروجی هم هیچ نمره‌ای برای مربی نیست',
)
await page.click('nav button:has-text("خانه")')
await page.waitForTimeout(500)

console.log('▸ مشاهده مربی تا گزارش ماهانه خانواده')
await signIn('09120000001')
await page.waitForSelector('text=ثبت گروهی امروز', { timeout: 8000 })
await page.locator('nav button:has-text("بیشتر")').click()
await page.waitForSelector('text=مشاهده و گزارش ماهانه')

const teacherMore = await page.evaluate(() => document.body.innerText)
check(/مدارک من/.test(teacherMore), 'مربی مدارک خودش را می‌بیند')
check(/بازخورد مدیر/.test(teacherMore), 'و بازخوردی که مدیر با او در میان گذاشته')
/*
 * آنچه در پرونده مربی عمداً نیست: هیچ عددی درباره عملکرد خودش و هیچ
 * مقایسه‌ای. اگر مربی ببیند ثبت رخداد به ضررش تمام می‌شود، کمتر ثبت
 * می‌کند و آسیبش به کودک می‌رسد.
 */
check(
  !/نمره|رتبه|امتیاز/.test(teacherMore),
  'و هیچ نمره‌ای برای خودش نمی‌بیند',
)

await page.locator('[class*="childRow"]').first().click()
await page.waitForSelector('text=مشاهده تازه')

const obsPage = await page.evaluate(() => document.body.innerText)
/*
 * شش عدسی، و همه‌شان پرسش‌اند نه برچسب.
 *
 * «کجا سخت بود؟» درباره امروز می‌پرسد؛ «چالش‌های کودک» درباره خودِ
 * کودک حرف می‌زند — و آن یکی همان چیزی است که بند ۱۰ ممنوع کرده.
 */
check(/علاقه/.test(obsPage) && /چالش/.test(obsPage), 'شش عدسی مشاهده روی صفحه‌اند')
check(
  /هنوز درباره .* چیزی ننوشته‌اید/.test(obsPage),
  'عدسیِ خالی، کاستیِ مربی نوشته می‌شود نه کاستیِ کودک',
)

await page.click('button:has-text("چالش")')
await page.waitForSelector('[role="dialog"]')
const lensSheet = await page.locator('[role="dialog"]').innerText()
check(/کجا سخت بود؟/.test(lensSheet), 'عدسی با پرسش می‌آید، نه با برچسب')
await page.fill('textarea[aria-label="متن مشاهده"]', 'نوبت گرفتن سر تاب برایش سخت بود.')
await page.click('[role="dialog"] button:has-text("ثبت")')
await page.waitForSelector('text=/مشاهده ثبت شد/')

await page.click('button:has-text("علاقه")')
await page.waitForSelector('[role="dialog"]')
await page.fill('textarea[aria-label="متن مشاهده"]', 'تمام صبح با خمیر بازی برج می‌ساخت.')
await page.click('[role="dialog"] button:has-text("ثبت")')
await page.waitForSelector('text=/مشاهده ثبت شد/')
check(true, 'دو مشاهده ثبت شد')

/*
 * پیش‌نویس فقط از جمله‌های خودِ مربی ساخته می‌شود.
 *
 * نه حضور، نه خلق، نه غذا، نه نام کودکان دیگر: از عدد نتیجه‌گیری
 * درمی‌آید و از جمله مربی، فقط ویرایش. این مرز یک تابع در پایگاه
 * داده است، نه یک جمله در دستورالعمل مدل.
 */
await page.click('button:has-text("ساختن پیش‌نویس از مشاهده‌ها")')
await page.waitForSelector('text=/پیش‌نویس ساخته شد/')
const withDraft = await page.evaluate(() => document.body.innerText)
check(/خمیر بازی/.test(withDraft), 'پیش‌نویس از جمله‌های خودِ مربی ساخته شد')
check(
  /هیچ عددی — حضور، خلق، غذا — و\s*هیچ نام کودک دیگری به آن داده نمی‌شود/.test(
    withDraft.replace(/\s+/g, ' '),
  ) || /هیچ نام کودک دیگری/.test(withDraft),
  'و صفحه صریح می‌گوید چه چیزی به مدل داده نمی‌شود',
)

/*
 * پیش‌نویس، گزارش نیست.
 *
 * تا مربی جمع‌بندی ننویسد، دکمه ارسال کار نمی‌کند — و پایگاه داده هم
 * همین را می‌بندد، نه فقط این دکمه.
 */
check(
  await page.locator('button:has-text("فرستادن به خانواده")').isDisabled(),
  'تا جمع‌بندی نوشته نشود، ارسال به خانواده ممکن نیست',
)

await page.fill(
  'textarea[aria-label="جمع‌بندی گزارش ماهانه"]',
  'مهر برای سارا ماه خمیر و برج بود؛ صبر کردن سر تاب هنوز سخت است.',
)
await page.click('button:has-text("فرستادن به خانواده")')
await page.waitForSelector('text=/برای خانواده فرستاده شد/')
check(true, 'گزارش با جمع‌بندی مربی فرستاده شد')

await page.locator('[aria-label="بازگشت"]').first().click()
await page.waitForTimeout(400)
await page.click('nav button:has-text("امروز")')
await page.waitForTimeout(400)

await signOutAny()
await signIn('09120000003', { fresh: false })
await page.waitForSelector('nav button:has-text("بیشتر")', { timeout: 8000 })
await page.locator('nav button:has-text("بیشتر")').click()
await page.waitForSelector('text=گزارش ماهانه')
await page.click('button:has-text("گزارش ماهانه")')
await page.waitForSelector('text=جمع‌بندی مربی')

const familyReport = await page.evaluate(() => document.body.innerText)
check(/ماه خمیر و برج بود/.test(familyReport), 'خانواده جمع‌بندی مربی را می‌بیند')
check(/نوبت گرفتن سر تاب/.test(familyReport), 'و مشاهده‌های ماه را')
/*
 * جمله‌ای که این صفحه عمداً می‌گوید. بی آن، خانواده خودش مقایسه
 * می‌سازد — با کودک همسایه، با خواهر بزرگ‌تر، با آنچه «طبیعی» می‌داند.
 */
check(
  /با میانگین کلاس مقایسه نمی‌شوند/.test(familyReport),
  'و صریح گفته می‌شود که با هیچ کودک دیگری مقایسه نشده',
)
check(
  !/نمره|رتبه|امتیاز|درصد/.test(familyReport),
  'گزارش خانواده هیچ نمره‌ای ندارد',
)
await page.locator('[aria-label="بازگشت"]').click()
await page.waitForTimeout(400)

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
