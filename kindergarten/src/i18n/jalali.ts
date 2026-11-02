/**
 * تاریخ جلالی — بخش ۱۲.۴ سند.
 *
 * خط قرمز: «تاریخ همه‌جا جلالی است. هیچ تاریخ میلادی در رابط کاربری دیده
 * نمی‌شود.» تاریخ میلادی فقط در لایه داده زندگی می‌کند.
 *
 * بدون کتابخانه ساخته شده. تقویم فارسی در `Intl` موجود است و ارقام فارسی
 * را هم خودش می‌دهد، پس نه وابستگی لازم است نه تبدیل رقم پس از قالب‌بندی.
 */

/**
 * تاریخ روز به‌صورت رشته `YYYY-MM-DD` میلادی برای لایه داده.
 * ستون `date` در `attendance` و `daily_report` از همین شکل استفاده می‌کند.
 * این تنها تابع این ماژول است که خروجی میلادی می‌دهد و هرگز به رابط نمی‌رود.
 */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

import { toLatinDigits, toPersianDigits } from './digits.ts'

const CALENDAR = 'fa-IR-u-ca-persian'

/** `۱۴ دی ۱۴۰۴` — قالب کامل، وقتی سال مهم است. */
const full = new Intl.DateTimeFormat(CALENDAR, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** `۱۴ دی` — قالب جاری، وقتی سال از متن پیداست. سرصفحه صفحه «امروز». */
const short = new Intl.DateTimeFormat(CALENDAR, {
  day: 'numeric',
  month: 'long',
})

/** `دوشنبه ۱۴ دی` — قالب تقویم. سرصفحه کارت روز در پنل والد. */
const withWeekday = new Intl.DateTimeFormat(CALENDAR, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

/** `۸:۱۲` — ساعت بدون ثانیه، بخش ۱۲.۴. */
const clock = new Intl.DateTimeFormat('fa-IR', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: false,
})

export type JalaliFormat = 'full' | 'short' | 'weekday'

const FORMATTERS: Record<JalaliFormat, Intl.DateTimeFormat> = {
  full,
  short,
  weekday: withWeekday,
}

/** تاریخ جلالی با ارقام فارسی. پیش‌فرض قالب کوتاه است. */
export function formatJalali(date: Date, format: JalaliFormat = 'short'): string {
  return FORMATTERS[format].format(date)
}

/** ساعت با ارقام فارسی و بدون ثانیه. */
export function formatTime(date: Date): string {
  return clock.format(date)
}

/**
 * ساعتِ ذخیره‌شده به شکل `HH:MM` را برای نمایش آماده می‌کند.
 *
 * لایه داده ساعت را به‌صورت رشته لاتین نگه می‌دارد (`13:00`)، ولی بخش
 * ۱۲.۴ می‌گوید ارقام در رابط فارسی‌اند. هر جای رابط که ساعتی نمایش
 * می‌دهد باید از همین‌جا رد شود، نه با تبدیل دستی؛ تبدیل دستی همان جایی
 * است که یک صفحه از قلم می‌افتد و ارقام لاتین بیرون می‌زند.
 */
export function formatClock(hhmm: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim())
  if (!match) return toPersianDigits(hhmm)
  return toPersianDigits(`${Number(match[1])}:${match[2]}`)
}

/**
 * اجزای تاریخ جلالی به‌صورت عدد.
 * برای منطقی لازم است که به ماه یا سال جلالی گره خورده، مثل دوره صورتحساب
 * و کلید `year_month` در گزارش ماهانه.
 */
export function jalaliParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).formatToParts(date)

  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type)
    if (!found) throw new Error(`جزء «${type}» در تاریخ جلالی یافت نشد`)
    return Number(found.value)
  }

  return { year: read('year'), month: read('month'), day: read('day') }
}

/** کلید `year_month` به شکل `۱۴۰۴-۱۰` میلادی‌نشده، برای دوره‌های ماهانه. */
export function jalaliYearMonth(date: Date): string {
  const { year, month } = jalaliParts(date)
  return `${year}-${String(month).padStart(2, '0')}`
}

/**
 * سن کودک، به سال و ماه — «۴ سال و ۱ ماه».
 *
 * چرا ماه هم می‌آید و فقط سال نه: در مهدکودک، فاصله سه‌سال‌و‌دو‌ماه با
 * سه‌سال‌و‌یازده‌ماه بزرگ است. مربی از همین می‌فهمد چه انتظاری از این
 * کودک می‌رود.
 *
 * حساب روی تقویم میلادی انجام می‌شود چون فاصله دو تاریخ، مستقل از
 * تقویم است؛ خروجی با ارقام فارسی نوشته می‌شود (بخش ۱۲.۴).
 *
 * زیر یک ماه «تازه‌متولد» نمی‌شود: مهد کودک زیر یک ماه نمی‌گیرد و
 * چنین مقداری یعنی تاریخ تولد اشتباه ثبت شده. همان «کمتر از یک ماه»
 * را می‌گوید تا دیده شود.
 */
export function formatAge(birthDate: string | null, now: Date = new Date()): string | null {
  if (!birthDate) return null
  const born = new Date(birthDate)
  if (Number.isNaN(born.getTime())) return null

  let months =
    (now.getFullYear() - born.getFullYear()) * 12 + (now.getMonth() - born.getMonth())
  if (now.getDate() < born.getDate()) months -= 1
  if (months < 0) return null
  if (months < 1) return 'کمتر از یک ماه'

  const years = Math.floor(months / 12)
  const rest = months % 12
  if (years === 0) return `${toPersianDigits(rest)} ماه`
  if (rest === 0) return `${toPersianDigits(years)} سال`
  return `${toPersianDigits(years)} سال و ${toPersianDigits(rest)} ماه`
}

/**
 * نام ماه‌های جلالی، به ترتیب. فروردین یک است، نه صفر.
 *
 * فهرست است نه تابع، چون نوار ماه‌های سال هم همین ترتیب را می‌خواهد.
 */
export const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
] as const

/**
 * دوره مالی «۱۴۰۴-۰۷» را به «مهر ۱۴۰۴» تبدیل می‌کند.
 *
 * دوره‌ها در پایگاه داده با ارقام لاتین ذخیره می‌شوند چون کلیدند؛ آنچه
 * خانواده می‌بیند اسم ماه است، نه یک شناسه — بخش ۱۲.۴.
 *
 * ورودی نامعتبر همان ورودی را با ارقام فارسی برمی‌گرداند: بهتر است
 * خانواده یک رشته عجیب ببیند تا اینکه صفحه سفید شود.
 */
export function formatPeriod(period: string, withYear = true): string {
  const [year, month] = period.split('-')
  const index = Number(month)
  const name = JALALI_MONTHS[index - 1]
  if (!year || !name) return toPersianDigits(period)
  return withYear ? `${name} ${toPersianDigits(year)}` : name
}

/**
 * تاریخ جلالی به میلادی — وارونِ `jalaliParts`.
 *
 * چرا لازم است: مدیر تاریخ انقضای مدرک را جلالی می‌نویسد، ولی ستونش در
 * پایگاه داده از نوع `date` است و با `current_date` مقایسه می‌شود. اگر
 * رشته جلالی را همان‌طور ذخیره کنیم، «مدرک منقضی» هرگز درست درنمی‌آید —
 * و کل ارزش آن ستون همین مقایسه است.
 *
 * روش: تبدیلِ میلادی به جلالی از `Intl` می‌آید و دقیق است، پس به‌جای
 * پیاده‌سازی دوباره تقویم، همان تابع وارونه می‌شود: یک حدس اولیه، و بعد
 * تصحیح تا وقتی اجزا دقیقاً بخوانند. هم کوتاه‌تر است، هم قواعد کبیسه را
 * از همان منبعی می‌گیرد که بقیه اپ می‌گیرد.
 *
 * ورودی نامعتبر `null` می‌دهد، نه یک تاریخ حدسی: تاریخی که کاربر
 * نگفته، ساختنی نیست.
 */
export function jalaliToIso(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || year < 1000 || year > 2000) return null
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  if (!Number.isInteger(day) || day < 1 || day > 31) return null

  /*
   * جست‌وجوی دودویی، نه تصحیحِ گام‌به‌گام.
   *
   * تصحیح با تخمینِ «هر ماه سی روز» روی ماه‌های سی‌ویک‌روزه نوسان
   * می‌کرد و هرگز نمی‌نشست — سی‌وشش تاریخ از شش سال را `null`
   * برمی‌گرداند. سه‌تایی (سال، ماه، روز) با تاریخ یکنواخت بالا می‌رود،
   * پس جست‌وجوی دودویی هم دقیق است و هم کوتاه: حدود ده گام.
   */
  const target = year * 10000 + month * 100 + day
  const key = (at: Date): number => {
    const p = jalaliParts(at)
    return p.year * 10000 + p.month * 100 + p.day
  }

  let lo = Date.UTC(year + 620, 0, 1, 12)
  let hi = Date.UTC(year + 622, 11, 31, 12)
  const DAY = 86_400_000

  while (lo <= hi) {
    const mid = lo + Math.floor((hi - lo) / DAY / 2) * DAY
    const here = key(new Date(mid))
    if (here === target) return toIsoDate(new Date(mid))
    if (here < target) lo = mid + DAY
    else hi = mid - DAY
  }

  // روزی که وجود ندارد — مثل ۳۰ اسفند در سال غیرکبیسه — ساخته نمی‌شود.
  return null
}

/**
 * رشته‌ای که کاربر نوشته، به تاریخ میلادی.
 *
 * ارقام فارسی و جداکننده‌های رایج (`-`، `/`، `.`) را می‌پذیرد، چون
 * کاربر همان‌طور می‌نویسد که در شناسنامه دیده.
 */
export function parseJalaliInput(text: string): string | null {
  const parts = toLatinDigits(text)
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number)
  const [year, month, day] = parts
  if (parts.length !== 3 || year === undefined || month === undefined || day === undefined) {
    return null
  }
  return jalaliToIso(year, month, day)
}
