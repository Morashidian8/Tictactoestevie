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
