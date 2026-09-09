import { describe, expect, it } from 'vitest'
import {
  indexAbsences,
  indexAttendance,
  resolveState,
  tally,
} from './attendanceState.ts'
import type { Attendance } from './types.ts'

const DATE = '2026-01-04'
const before9 = new Date(2026, 0, 4, 8, 30)
const after9 = new Date(2026, 0, 4, 9, 15)

function present(childId: string, time = '08:05'): Attendance {
  return {
    childId,
    date: DATE,
    checkInAt: `${DATE}T${time}:00`,
    checkOutAt: null,
    droppedByGuardianId: null,
    arrivalCondition: 'normal',
    arrivalPhotoUrl: null,
  }
}

function left(childId: string): Attendance {
  return { ...present(childId), checkOutAt: `${DATE}T16:05:00` }
}

describe('حالت حضور هر کودک', () => {
  const absences = indexAbsences([{ childId: 'c3', date: DATE, reason: null }])

  it('کودک ثبت‌شده حاضر است', () => {
    const rows = indexAttendance([present('c1')])
    expect(resolveState('c1', rows, absences, before9)).toBe('present')
  })

  it('کودک تحویل داده‌شده «رفته» است', () => {
    const rows = indexAttendance([left('c1')])
    expect(resolveState('c1', rows, absences, before9)).toBe('left')
  })

  it('غیبت اعلام‌شده با نیامدن فرق دارد', () => {
    const rows = indexAttendance([])
    expect(resolveState('c3', rows, absences, before9)).toBe('absenceDeclared')
    expect(resolveState('c9', rows, absences, before9)).toBe('notArrived')
  })

  it('پس از ۹ صبح، نیامده به بی‌خبر تبدیل می‌شود', () => {
    const rows = indexAttendance([])
    expect(resolveState('c9', rows, absences, after9)).toBe('unaccounted')
  })

  it('غیبت اعلام‌شده پس از ۹ هم بی‌خبر نمی‌شود', () => {
    const rows = indexAttendance([])
    expect(resolveState('c3', rows, absences, after9)).toBe('absenceDeclared')
  })
})

describe('نوار خلاصه', () => {
  const ids = ['c1', 'c2', 'c3', 'c4', 'c5']
  const absences = indexAbsences([{ childId: 'c3', date: DATE, reason: null }])
  const rows = indexAttendance([present('c1'), present('c2'), left('c4')])

  it('پیش از ۹: حاضر، غیبت اعلام‌شده، نیامده', () => {
    const counts = tally(ids, rows, absences, before9)
    expect(counts).toMatchObject({
      present: 3,
      absenceDeclared: 1,
      outstanding: 1,
      left: 1,
      isAfterNine: false,
    })
  })

  it('کودکی که رفته هنوز جزو حاضران امروز شمرده می‌شود', () => {
    const counts = tally(['c4'], indexAttendance([left('c4')]), new Set(), before9)
    expect(counts.present).toBe(1)
    expect(counts.outstanding).toBe(0)
  })

  it('پس از ۹ ستون سوم بی‌خبر می‌شود', () => {
    const counts = tally(ids, rows, absences, after9)
    expect(counts.isAfterNine).toBe(true)
    expect(counts.outstanding).toBe(1)
  })

  it('جمع ستون‌ها همیشه برابر تعداد کل کلاس است', () => {
    for (const now of [before9, after9]) {
      const counts = tally(ids, rows, absences, now)
      expect(counts.present + counts.absenceDeclared + counts.outstanding).toBe(ids.length)
    }
  })
})
