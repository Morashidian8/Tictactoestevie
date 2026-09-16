import { describe, expect, it } from 'vitest'
import { jalaliParts, jalaliToIso, parseJalaliInput, toIsoDate } from './index.ts'

/**
 * تبدیل جلالی به میلادی.
 *
 * محک اصلی، رفت و برگشت است: هر تاریخ میلادی را به جلالی می‌بریم و
 * دوباره برمی‌گردانیم؛ اگر همان درنیامد، تبدیل غلط است. این محک قواعد
 * کبیسه را جداگانه نمی‌آزماید چون لازم نیست — هر سال کبیسه‌ای که در
 * بازه باشد، خودش را نشان می‌دهد.
 */
describe('رفت و برگشت با تقویم خودِ مرورگر می‌خواند', () => {
  it('برای هر روزِ شش سال پیاپی', () => {
    const start = new Date(Date.UTC(2023, 0, 1, 12))
    const failures: string[] = []

    for (let i = 0; i < 365 * 6; i += 1) {
      const day = new Date(start)
      day.setUTCDate(day.getUTCDate() + i)
      const parts = jalaliParts(day)
      const back = jalaliToIso(parts.year, parts.month, parts.day)
      if (back !== toIsoDate(day)) {
        failures.push(`${toIsoDate(day)} → ${parts.year}-${parts.month}-${parts.day} → ${back}`)
      }
    }

    expect(failures).toEqual([])
  })
})

describe('مرزها', () => {
  /*
   * ۳۰ اسفند فقط در سال کبیسه هست. ۱۴۰۳ کبیسه است و ۱۴۰۴ نیست — پس
   * یکی باید ساخته شود و دیگری نه.
   */
  it('۳۰ اسفند سال کبیسه ساخته می‌شود', () => {
    expect(jalaliToIso(1403, 12, 30)).not.toBeNull()
  })

  it('و در سال غیرکبیسه ساخته نمی‌شود', () => {
    expect(jalaliToIso(1404, 12, 30)).toBeNull()
  })

  it('۳۱ ام هیچ ماه دوم سالی وجود ندارد', () => {
    expect(jalaliToIso(1404, 7, 31)).toBeNull()
    expect(jalaliToIso(1404, 6, 31)).not.toBeNull()
  })

  it('ورودی بی‌معنی، تاریخ حدسی نمی‌سازد', () => {
    expect(jalaliToIso(1404, 13, 1)).toBeNull()
    expect(jalaliToIso(1404, 0, 1)).toBeNull()
    expect(jalaliToIso(1404, 1, 0)).toBeNull()
    expect(jalaliToIso(Number.NaN, 1, 1)).toBeNull()
  })
})

describe('آنچه کاربر می‌نویسد', () => {
  it('ارقام فارسی را می‌پذیرد', () => {
    expect(parseJalaliInput('۱۴۰۴-۰۷-۰۱')).toBe(jalaliToIso(1404, 7, 1))
  })

  it('و جداکننده‌های رایج را', () => {
    const target = jalaliToIso(1404, 7, 1)
    expect(parseJalaliInput('1404/07/01')).toBe(target)
    expect(parseJalaliInput('۱۴۰۴.۰۷.۰۱')).toBe(target)
  })

  it('ورودی ناقص، چیزی نمی‌سازد', () => {
    expect(parseJalaliInput('۱۴۰۴-۰۷')).toBeNull()
    expect(parseJalaliInput('')).toBeNull()
    expect(parseJalaliInput('فردا')).toBeNull()
  })
})
