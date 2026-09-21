import { describe, expect, it } from 'vitest'
import { NOTES_PER_DAY, suggestNoteTargets } from './noteRotation.ts'

const CLASS_OF_25 = Array.from({ length: 25 }, (_, i) => `child-${String(i + 1).padStart(2, '0')}`)

/** روزهای پیاپی، برای دنبال کردن چرخش. */
function days(count: number, from = '2026-01-04'): string[] {
  const start = Date.parse(`${from}T00:00:00Z`)
  return Array.from({ length: count }, (_, i) =>
    new Date(start + i * 86_400_000).toISOString().slice(0, 10),
  )
}

describe('چرخش پیشنهاد یادداشت', () => {
  it('هر روز همان تعدادی می‌دهد که بخش ۵.۵ گفته', () => {
    expect(suggestNoteTargets(CLASS_OF_25, '2026-01-04')).toHaveLength(NOTES_PER_DAY)
  })

  it('در طول یک روز ثابت می‌ماند', () => {
    const once = suggestNoteTargets(CLASS_OF_25, '2026-01-04')
    const twice = suggestNoteTargets(CLASS_OF_25, '2026-01-04')
    expect(twice).toEqual(once)
  })

  it('روز به روز عوض می‌شود', () => {
    const a = suggestNoteTargets(CLASS_OF_25, '2026-01-04')
    const b = suggestNoteTargets(CLASS_OF_25, '2026-01-05')
    expect(b).not.toEqual(a)
  })

  it('هیچ کودکی در یک روز دو بار پیشنهاد نمی‌شود', () => {
    for (const date of days(30)) {
      const picked = suggestNoteTargets(CLASS_OF_25, date)
      expect(new Set(picked).size).toBe(picked.length)
    }
  })

  /**
   * تعهد اصلی این قابلیت: «هیچ کودکی از قلم نیفتد». کلاس ۲۵ نفره با سه
   * پیشنهاد در روز باید در نُه روز کاری کامل دور بزند.
   */
  it('پیش از دور دوم، به همه کودکان رسیده است', () => {
    const seen = new Set<string>()
    for (const date of days(9)) {
      for (const id of suggestNoteTargets(CLASS_OF_25, date)) seen.add(id)
    }
    expect(seen.size).toBe(CLASS_OF_25.length)
  })

  it('در یک ماه، فاصله بیشترین و کمترین نوبت از یک بیشتر نمی‌شود', () => {
    const count = new Map<string, number>()
    for (const date of days(30)) {
      for (const id of suggestNoteTargets(CLASS_OF_25, date)) {
        count.set(id, (count.get(id) ?? 0) + 1)
      }
    }
    const values = CLASS_OF_25.map((id) => count.get(id) ?? 0)
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1)
  })

  it('کلاس کوچک‌تر از تعداد پیشنهاد را هم می‌پذیرد', () => {
    expect(suggestNoteTargets(['a', 'b'], '2026-01-04')).toHaveLength(2)
    expect(suggestNoteTargets([], '2026-01-04')).toEqual([])
  })
})
