/**
 * تبدیل ردیف‌های حضور به حالتی که صفحه «امروز» نشان می‌دهد.
 *
 * منطق اینجا نشسته، نه در صفحه، چون سه پنل بعداً همین تعریف‌ها را لازم
 * دارند و تعریف دوگانه یعنی دو رفتار متفاوت.
 */
import type { AbsenceNotice, Attendance } from './types.ts'

export type AttendanceState =
  | 'notArrived'
  | 'absenceDeclared'
  | 'present'
  | 'left'
  | 'unaccounted'

/**
 * بخش ۵.۳: «ساعت ۹:۰۰ سامانه فهرست کودکان غایب بدون اعلام قبلی را نشان
 * می‌دهد.» پیش از این ساعت، نیامدن هنوز خبر نیست.
 */
export const UNACCOUNTED_AFTER_HOUR = 9

export function resolveState(
  childId: string,
  attendance: Map<string, Attendance>,
  absentIds: Set<string>,
  now: Date,
): AttendanceState {
  const row = attendance.get(childId)
  if (row?.checkOutAt) return 'left'
  if (row?.checkInAt) return 'present'
  if (absentIds.has(childId)) return 'absenceDeclared'
  return now.getHours() >= UNACCOUNTED_AFTER_HOUR ? 'unaccounted' : 'notArrived'
}

/**
 * نوار خلاصه بالای صفحه.
 *
 * ستون سوم با ساعت عوض می‌شود: پیش از ۹ «نیامده»، پس از ۹ «بی‌خبر».
 * «غایب» یعنی غیبتش اعلام شده، نه اینکه صرفاً نیامده.
 */
export type DayTally = {
  present: number
  absenceDeclared: number
  /** نیامده پیش از ۹، بی‌خبر پس از ۹. */
  outstanding: number
  left: number
  isAfterNine: boolean
}

export function tally(
  childIds: string[],
  attendance: Map<string, Attendance>,
  absentIds: Set<string>,
  now: Date,
): DayTally {
  const counts: DayTally = {
    present: 0,
    absenceDeclared: 0,
    outstanding: 0,
    left: 0,
    isAfterNine: now.getHours() >= UNACCOUNTED_AFTER_HOUR,
  }

  for (const id of childIds) {
    switch (resolveState(id, attendance, absentIds, now)) {
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
      default:
        counts.outstanding += 1
    }
  }

  return counts
}

export function indexAttendance(rows: Attendance[]): Map<string, Attendance> {
  return new Map(rows.map((row) => [row.childId, row]))
}

export function indexAbsences(rows: AbsenceNotice[]): Set<string> {
  return new Set(rows.map((row) => row.childId))
}
