/**
 * هفته کاری — لازمِ بخش ۵.۹ سند.
 *
 * صفحه بستن روز «کودکان بدون یادداشت در این هفته» را می‌شمارد، پس باید
 * بداند هفته کِی شروع شده.
 *
 * هفته در ایران از شنبه شروع می‌شود و به جمعه ختم می‌گردد. این را
 * `Intl` نمی‌دهد و پیش‌فرض جاوااسکریپت هم یکشنبه است، پس دستی حساب
 * می‌شود. اشتباه در همین یک عدد یعنی روز شنبه، هفته پیش شمرده شود و
 * فهرست «بدون یادداشت» غلط دربیاید.
 */

/** شنبه در شمارش جاوااسکریپت، جایی که یکشنبه صفر است. */
const SATURDAY = 6

/** چند روز از شنبه گذشته است. شنبه صفر، جمعه شش. */
export function daysIntoWeek(date: Date): number {
  return (date.getDay() - SATURDAY + 7) % 7
}

/** شنبه همین هفته، ساعت صفر. */
export function weekStart(date: Date): Date {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - daysIntoWeek(date))
  return start
}

/**
 * آیا این تاریخ در هفته جاری است؟
 * ورودی به شکل `YYYY-MM-DD` است، همان چیزی که لایه داده نگه می‌دارد.
 */
export function isInCurrentWeek(isoDate: string, now: Date = new Date()): boolean {
  const start = weekStart(now)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)

  const at = new Date(`${isoDate}T00:00:00`)
  return at >= start && at < end
}
