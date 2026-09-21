import { describe, expect, it } from 'vitest'
import { fitWithin, MAX_EDGE, QUALITY, THUMB_EDGE } from './compress.ts'

/**
 * اعداد بخش ۱۴.۳ سند معیار پذیرش‌اند، نه پیشنهاد. تست نگهشان می‌دارد.
 */
describe('اعداد خط پردازش عکس', () => {
  it('همان چیزی است که بخش ۱۴.۳ گفته', () => {
    expect(MAX_EDGE).toBe(1600)
    expect(QUALITY).toBe(0.7)
  })

  it('بندانگشتی از تصویر اصلی کوچک‌تر است', () => {
    expect(THUMB_EDGE).toBeLessThan(MAX_EDGE)
  })
})

describe('اندازه مقصد', () => {
  it('بُعد بزرگ‌تر را به سقف می‌رساند و نسبت را نگه می‌دارد', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 })
  })

  it('تصویر کوچک را بزرگ نمی‌کند', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
  })

  it('تصویر مربع را مربع نگه می‌دارد', () => {
    expect(fitWithin(2000, 2000, 1600)).toEqual({ width: 1600, height: 1600 })
  })

  it('هیچ بُعدی از سقف بیشتر نمی‌شود', () => {
    for (const [w, h] of [[5000, 120], [120, 5000], [1601, 1601], [1599, 900]] as const) {
      const out = fitWithin(w, h, MAX_EDGE)
      expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(MAX_EDGE)
    }
  })
})
