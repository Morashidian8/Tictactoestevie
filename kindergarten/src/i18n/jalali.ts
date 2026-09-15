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

import { toPersianDigits } from './digits.ts'

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
