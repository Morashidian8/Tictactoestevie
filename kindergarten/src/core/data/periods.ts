/**
 * بازه‌های روز، دوره حضور کودک، و شیفت مربی.
 *
 * سه مفهوم جدا که به یک مرجع ارجاع می‌دهند. هیچ تابعی اینجا تعداد
 * بازه‌ها را فرض نمی‌کند: مهد می‌تواند مرز را جابه‌جا کند یا بازه سوم
 * اضافه کند و هیچ‌کدام نمی‌شکنند.
 *
 * همان منطقی که توابع پایگاه داده در مهاجرت ۰۰۱۴ تا ۰۰۱۷ اجرا می‌کنند،
 * اینجا هم هست. دو جا نوشتنش عمدی است: پایگاه داده حصار است و نمی‌شود
 * دورش زد، ولی رابط نمی‌تواند برای هر تصمیم کوچک به سرور برود.
 */
import type { AttendanceType, DayPeriod, Enrollment, StaffShift } from './types.ts'

/** «HH:MM» به دقیقه از نیمه‌شب. مقایسه رشته‌ای برای ساعت کافی نیست. */
export function minutesOf(clock: string): number {
  const [h = '0', m = '0'] = clock.split(':')
  return Number(h) * 60 + Number(m)
}

/** همان قالب، برعکس. */
export function clockOf(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const minutesAt = (at: Date): number => at.getHours() * 60 + at.getMinutes()

/**
 * بازه‌های دربرگیرنده یک لحظه.
 *
 * جمع است، نه مفرد: در مرز دو بازه، کودکان هر دو گروه با هم در مهدند و
 * همان‌جا بحرانی‌ترین نقطه روز برای نسبت مربی به کودک است.
 */
export function periodsAt(periods: readonly DayPeriod[], at: Date): DayPeriod[] {
  const now = minutesAt(at)
  return periods
    .filter((p) => now >= minutesOf(p.startTime) && now < minutesOf(p.endTime))
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/** بازه‌هایی که برای این نوع حضور معنا دارند. */
export function periodsFor(
  periods: readonly DayPeriod[],
  type: AttendanceType,
): DayPeriod[] {
  return periods
    .filter((p) => p.includedIn.includes(type))
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/** روز هفته به شکل ایرانی: شنبه صفر. */
export function weekdayOf(date: Date): number {
  return (date.getDay() + 1) % 7
}

/** آیا امروز روزِ این کودک است؟ کودک سه‌روزه بقیه روزها نمی‌آید. */
export function enrolledOn(enrollment: Enrollment | null, date: Date): boolean {
  if (!enrollment) return false
  return enrollment.weekdays.includes(weekdayOf(date))
}

/** ثبت‌نام فعال در یک تاریخ. حداکثر یکی؛ قید پایگاه داده همین را می‌بندد. */
export function activeEnrollment(
  enrollments: readonly Enrollment[],
  isoDate: string,
): Enrollment | null {
  return (
    enrollments.find(
      (e) => isoDate >= e.startDate && (e.endDate === null || isoDate <= e.endDate),
    ) ?? null
  )
}

/**
 * فیلدهای گزارش که برای این کودک معنا دارند.
 *
 * ناهار طبق تصمیم مالک محصول برای همه است و به هیچ بازه‌ای وصل نیست.
 * بقیه از بازه‌های خود کودک می‌آیند، پس کودک صبحانه‌ای خلق عصر ندارد —
 * نه اینکه خالی داشته باشد.
 */
export function applicableFields(
  periods: readonly DayPeriod[],
  type: AttendanceType,
): string[] {
  const fields = new Set<string>(['lunch'])
  for (const period of periodsFor(periods, type)) {
    for (const field of period.reportFields) fields.add(field)
  }
  return [...fields]
}

/**
 * فیلدهایی که ثبت گروهی در این لحظه حق نوشتن رویشان دارد.
 *
 * بخش ۶ سند دوره حضور: «فقط روی کودکان بازه فعلی و فقط روی فیلدهای
 * همان بازه.» بی این قید، ثبت گروهیِ بعدازظهر خلق صبحِ ثبت‌شده را
 * بی‌سروصدا با مقدار تازه عوض می‌کرد.
 *
 * ناهار استثناست: به هیچ بازه‌ای وصل نیست و در هر ساعتی قابل ثبت است.
 */
export function bulkFields(
  childFields: readonly string[],
  currentPeriods: readonly DayPeriod[],
): string[] {
  const allowed = new Set<string>(['lunch'])
  for (const period of currentPeriods) {
    for (const field of period.reportFields) allowed.add(field)
  }
  return childFields.filter((field) => allowed.has(field))
}

/** ساعت آغاز روزِ خودِ کودک. «بی‌خبر» از این حساب می‌شود، نه از ساعت ۹. */
export function dayStartFor(
  periods: readonly DayPeriod[],
  type: AttendanceType,
): string | null {
  const mine = periodsFor(periods, type)
  return mine[0]?.startTime ?? null
}

/** ساعت پایان روزِ خودِ کودک. تأخیر از این حساب می‌شود، نه از پایان کار مهد. */
export function dayEndFor(
  periods: readonly DayPeriod[],
  type: AttendanceType,
): string | null {
  const mine = periodsFor(periods, type)
  return mine[mine.length - 1]?.endTime ?? null
}

/**
 * بازه‌هایی که شیفت‌های یک مربی در یک روز می‌پوشانند.
 *
 * از تقاطع ساعت شیفت با ساعت بازه ساخته می‌شود. مربی ۸ تا ۱۶ هر دو بازه
 * را می‌پوشاند و مربی ۸ تا ۱۳ فقط یکی را؛ اگر شیفت را با بازه تعریف
 * کرده بودیم، این تفاوت اصلاً قابل بیان نبود.
 */
export function shiftPeriods(
  periods: readonly DayPeriod[],
  shifts: readonly StaffShift[],
  date: Date,
  isoDate: string,
): DayPeriod[] {
  const weekday = weekdayOf(date)
  const active = shifts.filter(
    (s) =>
      s.weekday === weekday &&
      isoDate >= s.effectiveFrom &&
      (s.effectiveTo === null || isoDate <= s.effectiveTo),
  )
  return periods
    .filter((p) =>
      active.some(
        (s) =>
          minutesOf(s.startTime) < minutesOf(p.endTime) &&
          minutesOf(s.endTime) > minutesOf(p.startTime),
      ),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/** مربی‌هایی که در یک لحظه سر کارند. می‌تواند بیش از یک نفر باشد. */
export function staffOnDutyIds(
  shifts: readonly StaffShift[],
  at: Date,
  isoDate: string,
): string[] {
  const weekday = weekdayOf(at)
  const now = minutesAt(at)
  const ids = new Set<string>()
  for (const shift of shifts) {
    if (shift.weekday !== weekday) continue
    if (isoDate < shift.effectiveFrom) continue
    if (shift.effectiveTo !== null && isoDate > shift.effectiveTo) continue
    if (now >= minutesOf(shift.startTime) && now < minutesOf(shift.endTime)) {
      ids.add(shift.staffId)
    }
  }
  return [...ids]
}
