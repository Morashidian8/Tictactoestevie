import { describe, expect, it } from 'vitest'
import { daysIntoWeek, isInCurrentWeek, weekStart } from './week.ts'

/**
 * هفته ایرانی از شنبه شروع می‌شود. هر تست اینجا یک روز واقعی از تقویم
 * میلادی است که روز هفته‌اش را می‌دانیم.
 *
 * ۲۰۲۶-۰۳-۰۷ شنبه است، ۲۰۲۶-۰۳-۱۳ جمعه، ۲۰۲۶-۰۳-۱۴ شنبه بعد.
 */
const SAT = new Date(2026, 2, 7, 10, 0)
const SUN = new Date(2026, 2, 8, 10, 0)
const WED = new Date(2026, 2, 11, 10, 0)
const FRI = new Date(2026, 2, 13, 23, 30)
const NEXT_SAT = new Date(2026, 2, 14, 0, 30)

describe('شمارش روز در هفته', () => {
  it('شنبه روز صفر است، نه یکشنبه', () => {
    expect(daysIntoWeek(SAT)).toBe(0)
    expect(daysIntoWeek(SUN)).toBe(1)
    expect(daysIntoWeek(WED)).toBe(4)
    expect(daysIntoWeek(FRI)).toBe(6)
  })

  it('شنبه بعد دوباره صفر می‌شود', () => {
    expect(daysIntoWeek(NEXT_SAT)).toBe(0)
  })
})

describe('شروع هفته', () => {
  it('برای هر روز هفته، همان شنبه را می‌دهد', () => {
    const expected = weekStart(SAT).getTime()
    for (const day of [SAT, SUN, WED, FRI]) {
      expect(weekStart(day).getTime()).toBe(expected)
    }
  })

  it('ساعت را صفر می‌کند', () => {
    const start = weekStart(WED)
    expect([start.getHours(), start.getMinutes(), start.getSeconds()]).toEqual([0, 0, 0])
  })

  it('شنبه بعد هفته تازه‌ای است', () => {
    expect(weekStart(NEXT_SAT).getTime()).toBeGreaterThan(weekStart(FRI).getTime())
  })
})

describe('آیا در هفته جاری است', () => {
  it('روزهای همان هفته را می‌پذیرد', () => {
    for (const date of ['2026-03-07', '2026-03-08', '2026-03-11', '2026-03-13']) {
      expect(isInCurrentWeek(date, WED)).toBe(true)
    }
  })

  it('جمعه پیش و شنبه بعد را رد می‌کند', () => {
    expect(isInCurrentWeek('2026-03-06', WED)).toBe(false)
    expect(isInCurrentWeek('2026-03-14', WED)).toBe(false)
  })

  /**
   * تله اصلی: اگر هفته را از یکشنبه بگیریم، روز شنبه به هفته پیش
   * می‌افتد و فهرست «بدون یادداشت» غلط درمی‌آید.
   */
  it('روز شنبه در هفته خودش می‌ماند، نه هفته پیش', () => {
    expect(isInCurrentWeek('2026-03-07', SAT)).toBe(true)
  })
})
