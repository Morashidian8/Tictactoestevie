import { describe, expect, it } from 'vitest'
import {
  indexAbsences,
  indexAttendance,
  isOverdue,
  resolveState,
  tally,
  unaccountedAfter,
  type SessionChild,
} from './attendanceState.ts'
import type { Attendance } from './types.ts'

const DATE = '2026-01-04'
const at830 = new Date(2026, 0, 4, 8, 30)
const at915 = new Date(2026, 0, 4, 9, 15)
const at1400 = new Date(2026, 0, 4, 14, 0)
const at1500 = new Date(2026, 0, 4, 15, 0)

/** کودک صبحانه‌ای یا تمام‌روز: روزش ۰۷:۳۰ شروع می‌شود. */
const morning = (id: string): SessionChild => ({ id, dayStart: '07:30' })
/** کودک بعدازظهری: روزش ۱۳:۰۰ شروع می‌شود. */
const afternoon = (id: string): SessionChild => ({ id, dayStart: '13:00' })

function present(childId: string, time = '08:05'): Attendance {
  return {
    childId,
    date: DATE,
    checkInAt: `${DATE}T${time}:00`,
    checkOutAt: null,
    droppedByGuardianId: null,
    arrivalCondition: 'normal',
    arrivalPhotoUrl: null,
    pickedUpById: null,
    pickupMethod: null,
    checkedInByName: null,
    checkedOutByName: null,
    lateMinutes: 0,
  }
}

function left(childId: string): Attendance {
  return { ...present(childId), checkOutAt: `${DATE}T16:05:00` }
}

describe('حالت حضور هر کودک', () => {
  const absences = indexAbsences([{ childId: 'c3', date: DATE, reason: null }])

  it('کودک ثبت‌شده حاضر است', () => {
    const rows = indexAttendance([present('c1')])
    expect(resolveState(morning('c1'), rows, absences, at830)).toBe('present')
  })

  it('کودک تحویل داده‌شده «رفته» است', () => {
    const rows = indexAttendance([left('c1')])
    expect(resolveState(morning('c1'), rows, absences, at830)).toBe('left')
  })

  it('غیبت اعلام‌شده با نیامدن فرق دارد', () => {
    const rows = indexAttendance([])
    expect(resolveState(morning('c3'), rows, absences, at830)).toBe('absenceDeclared')
    expect(resolveState(morning('c9'), rows, absences, at830)).toBe('notArrived')
  })

  it('پس از مهلتِ بازه خودش، نیامده به بی‌خبر تبدیل می‌شود', () => {
    const rows = indexAttendance([])
    expect(resolveState(morning('c9'), rows, absences, at915)).toBe('unaccounted')
  })

  /*
   * قاعده تازه بخش ۵: کودک بعدازظهری پیش از شروع بازه‌اش غایب نیست.
   * پیش‌تر ساعت ثابت ۹ صبح او را هم بی‌خبر می‌شمرد و مربی دنبال کودکی
   * می‌گشت که اصلاً قرار نبود آمده باشد.
   */
  it('کودک بعدازظهری صبح بی‌خبر نمی‌شود', () => {
    const rows = indexAttendance([])
    expect(resolveState(afternoon('c9'), rows, absences, at915)).toBe('notArrived')
    expect(resolveState(afternoon('c9'), rows, absences, at1400)).toBe('notArrived')
    expect(resolveState(afternoon('c9'), rows, absences, at1500)).toBe('unaccounted')
  })

  it('غیبت اعلام‌شده پس از مهلت هم بی‌خبر نمی‌شود', () => {
    const rows = indexAttendance([])
    expect(resolveState(morning('c3'), rows, absences, at915)).toBe('absenceDeclared')
  })

  it('مهلت از آغاز بازه شمرده می‌شود، نه از ساعت ثابت', () => {
    expect(unaccountedAfter('07:30')).toBe(9 * 60)
    expect(unaccountedAfter('13:00')).toBe(14 * 60 + 30)
    // کودکی که هیچ بازه‌ای ندارد، هرگز بی‌خبر شمرده نمی‌شود
    expect(unaccountedAfter(null)).toBeNull()
    expect(isOverdue({ id: 'x', dayStart: null }, at1500)).toBe(false)
  })
})

describe('نوار خلاصه', () => {
  const ids = ['c1', 'c2', 'c3', 'c4', 'c5'].map(morning)
  const absences = indexAbsences([{ childId: 'c3', date: DATE, reason: null }])
  const rows = indexAttendance([present('c1'), present('c2'), left('c4')])

  it('پیش از مهلت: حاضر، غیبت اعلام‌شده، نیامده', () => {
    const counts = tally(ids, rows, absences, at830)
    expect(counts).toMatchObject({
      present: 3,
      absenceDeclared: 1,
      notArrived: 1,
      unaccounted: 0,
      outstanding: 1,
      left: 1,
    })
  })

  it('کودکی که رفته هنوز جزو حاضران امروز شمرده می‌شود', () => {
    const counts = tally([morning('c4')], indexAttendance([left('c4')]), new Set(), at830)
    expect(counts.present).toBe(1)
    expect(counts.outstanding).toBe(0)
  })

  it('پس از مهلت، نیامده به ستون بی‌خبر می‌رود', () => {
    const counts = tally(ids, rows, absences, at915)
    expect(counts.unaccounted).toBe(1)
    expect(counts.notArrived).toBe(0)
  })

  /*
   * لحظه‌ای که دو دسته با هم در یک صفحه‌اند: صبحانه‌ای بی‌خبر است و
   * بعدازظهری فقط هنوز نیامده. یک ستون مشترک این تفاوت را می‌پوشاند.
   */
  it('در یک لحظه هم بی‌خبر داریم هم نیامده', () => {
    const mixed = [morning('c8'), afternoon('c9')]
    const counts = tally(mixed, indexAttendance([]), new Set(), at915)
    expect(counts.unaccounted).toBe(1)
    expect(counts.notArrived).toBe(1)
    expect(counts.outstanding).toBe(2)
  })

  it('جمع ستون‌ها همیشه برابر تعداد کل کلاس است', () => {
    for (const now of [at830, at915, at1500]) {
      const counts = tally(ids, rows, absences, now)
      expect(counts.present + counts.absenceDeclared + counts.outstanding).toBe(ids.length)
    }
  })
})
