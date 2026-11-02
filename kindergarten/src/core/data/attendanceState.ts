/**
 * تبدیل ردیف‌های حضور به حالتی که صفحه «امروز» نشان می‌دهد.
 *
 * منطق اینجا نشسته، نه در صفحه، چون سه پنل بعداً همین تعریف‌ها را لازم
 * دارند و تعریف دوگانه یعنی دو رفتار متفاوت.
 *
 * از وقتی کودکان دوره حضور جدا دارند، «بی‌خبر» دیگر از یک ساعت ثابت
 * نمی‌آید. کودک بعدازظهری ساعت ۹ صبح غایب نیست؛ هنوز روزش شروع نشده.
 * مبنا آغاز بازه خودِ کودک است، و ساعت ثابت جایش را به مهلتی پس از آن
 * می‌دهد.
 */
import { minutesOf } from './periods.ts'
import type { AbsenceNotice, Attendance } from './types.ts'

export type AttendanceState =
  | 'notArrived'
  | 'absenceDeclared'
  | 'present'
  | 'left'
  | 'unaccounted'

/**
 * کمترین چیزی که برای تشخیص حالت لازم است: شناسه و ساعت آغاز روزِ خود
 * کودک. هر چیزی که این دو را داشته باشد کافی است، پس ChildInSession
 * مستقیم اینجا می‌نشیند بی‌آنکه این ماژول به آن وابسته شود.
 */
export type SessionChild = {
  id: string
  dayStart: string | null
}

/**
 * بخش ۵.۳: «ساعت ۹:۰۰ سامانه فهرست کودکان غایب بدون اعلام قبلی را نشان
 * می‌دهد.» آن ۹:۰۰ با بازه پیش‌فرض صبح (۰۷:۳۰) یعنی نود دقیقه مهلت.
 * همان نود دقیقه را نگه می‌داریم ولی از آغاز بازه خودِ کودک می‌شماریم،
 * پس مهد اگر مرز را جابه‌جا کند یا بازه سوم بسازد، این خودش جابه‌جا
 * می‌شود و جایی عدد ۹ نمی‌ماند.
 */
export const UNACCOUNTED_GRACE_MINUTES = 90

/** دقیقه‌ای که پس از آن، نیامدنِ این کودک «بی‌خبر» است. */
export function unaccountedAfter(dayStart: string | null): number | null {
  if (!dayStart) return null
  return minutesOf(dayStart) + UNACCOUNTED_GRACE_MINUTES
}

/** آیا مهلت این کودک گذشته است؟ */
export function isOverdue(child: SessionChild, now: Date): boolean {
  const limit = unaccountedAfter(child.dayStart)
  if (limit === null) return false
  return now.getHours() * 60 + now.getMinutes() >= limit
}

export function resolveState(
  child: SessionChild,
  attendance: Map<string, Attendance>,
  absentIds: Set<string>,
  now: Date,
): AttendanceState {
  const row = attendance.get(child.id)
  if (row?.checkOutAt) return 'left'
  if (row?.checkInAt) return 'present'
  if (absentIds.has(child.id)) return 'absenceDeclared'
  return isOverdue(child, now) ? 'unaccounted' : 'notArrived'
}

/**
 * نوار خلاصه بالای صفحه.
 *
 * دو ستون جدا برای نیامده و بی‌خبر، چون حالا در یک لحظه هر دو ممکن‌اند:
 * کودک صبحانه‌ای ساعت ۱۰ بی‌خبر است و کودک بعدازظهری در همان لحظه فقط
 * هنوز نیامده. یک ستون مشترک این دو را قاطی می‌کرد.
 */
export type DayTally = {
  present: number
  absenceDeclared: number
  /** هنوز نیامده ولی مهلتش نگذشته. */
  notArrived: number
  /** مهلت بازه خودش گذشته و خبری نیست. */
  unaccounted: number
  /** جمع دو تای بالا؛ برای نگه داشتن تساوی جمع ستون‌ها با تعداد کلاس. */
  outstanding: number
  left: number
}

export function tally(
  children: readonly SessionChild[],
  attendance: Map<string, Attendance>,
  absentIds: Set<string>,
  now: Date,
): DayTally {
  const counts: DayTally = {
    present: 0,
    absenceDeclared: 0,
    notArrived: 0,
    unaccounted: 0,
    outstanding: 0,
    left: 0,
  }

  for (const child of children) {
    switch (resolveState(child, attendance, absentIds, now)) {
      case 'present':
        counts.present += 1
        break
      case 'left':
        // کودکی که رفته، امروز حاضر بوده. شمارش حضور او را از دست نمی‌دهد.
        counts.left += 1
        counts.present += 1
        break
      case 'absenceDeclared':
        counts.absenceDeclared += 1
        break
      case 'unaccounted':
        counts.unaccounted += 1
        break
      default:
        counts.notArrived += 1
    }
  }

  counts.outstanding = counts.notArrived + counts.unaccounted
  return counts
}

export function indexAttendance(rows: Attendance[]): Map<string, Attendance> {
  return new Map(rows.map((row) => [row.childId, row]))
}

export function indexAbsences(rows: AbsenceNotice[]): Set<string> {
  return new Set(rows.map((row) => row.childId))
}
