/**
 * چرخش پیشنهاد یادداشت — بخش ۵.۵ سند.
 *
 * «سامانه هر روز سه تا چهار کودک را به‌صورت چرخشی برجسته می‌کند و پیشنهاد
 * نوشتن یادداشت می‌دهد، طوری که هر کودک هفته‌ای یک تا دو یادداشت شخصی
 * بگیرد و هیچ کودکی از قلم نیفتد.»
 *
 * جمله آخر مهم‌ترین بخش است. انتخاب تصادفی، کودک ساکت را ماه‌ها از قلم
 * می‌اندازد؛ دقیقاً همان چیزی که این قابلیت برای جلوگیری از آن هست. پس
 * چرخش است، نه قرعه: پنجره‌ای که روی فهرست مرتب‌شده سُر می‌خورد و پیش از
 * دور دوم، به همه رسیده است.
 *
 * خروجی از روی تاریخ ساخته می‌شود، پس در طول روز ثابت می‌ماند و با
 * نوسازی صفحه عوض نمی‌شود.
 */

/** تعداد پیشنهاد در هر روز. بخش ۵.۵ سه تا چهار می‌گوید. */
export const NOTES_PER_DAY = 3

/**
 * شماره روز از یک مبدأ ثابت. مبدأ دلخواه است و فقط باید ثابت بماند؛
 * تاریخ میلادی اینجا فقط شمارنده است و هرگز به رابط نمی‌رود.
 */
function dayIndex(isoDate: string): number {
  const time = Date.parse(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(time)) throw new Error(`تاریخ نامعتبر: ${isoDate}`)
  return Math.floor(time / 86_400_000)
}

/**
 * کودکانی که امروز پیشنهاد یادداشت می‌گیرند.
 *
 * فهرست ورودی باید ترتیب پایدار داشته باشد (مثلاً بر اساس شناسه)، وگرنه
 * چرخش معنایش را از دست می‌دهد.
 */
export function suggestNoteTargets(
  childIds: readonly string[],
  isoDate: string,
  perDay: number = NOTES_PER_DAY,
): string[] {
  if (childIds.length === 0 || perDay <= 0) return []

  const ordered = [...childIds].sort()
  const size = Math.min(perDay, ordered.length)
  const start = (dayIndex(isoDate) * size) % ordered.length

  return Array.from({ length: size }, (_, i) => ordered[(start + i) % ordered.length]!)
}
