import { describe, expect, it } from 'vitest'
import {
  formatCount,
  formatJalali,
  formatTime,
  formatToman,
  jalaliParts,
  jalaliYearMonth,
  toIsoDate,
  toLatinDigits,
  toPersianDigits,
} from './index.ts'

// ۴ ژانویه ۲۰۲۶ برابر یکشنبه ۱۴ دی ۱۴۰۴ است.
const day = new Date(2026, 0, 4, 8, 12)

describe('ارقام', () => {
  it('ارقام لاتین را فارسی می‌کند', () => {
    expect(toPersianDigits('8:12')).toBe('۸:۱۲')
  })

  it('ارقام فارسی و عربی را لاتین می‌کند', () => {
    expect(toLatinDigits('۰۹۱۲۳۴۵۶۷۸۹')).toBe('09123456789')
    expect(toLatinDigits('٠٩١٢')).toBe('0912')
  })

  it('شمارش را بدون جداکننده می‌دهد', () => {
    expect(formatCount(18)).toBe('۱۸')
  })

  it('مبلغ را با جداکننده و واحد می‌دهد', () => {
    expect(formatToman(1234567)).toBe('۱٬۲۳۴٬۵۶۷ تومان')
  })
})

describe('تاریخ جلالی', () => {
  it('قالب کوتاه، کامل و تقویمی', () => {
    expect(formatJalali(day, 'short')).toBe('۱۴ دی')
    expect(formatJalali(day, 'full')).toBe('۱۴ دی ۱۴۰۴')
    expect(formatJalali(day, 'weekday')).toBe('یکشنبه ۱۴ دی')
  })

  it('پیش‌فرض قالب کوتاه است', () => {
    expect(formatJalali(day)).toBe(formatJalali(day, 'short'))
  })

  it('هیچ قالبی رقم لاتین بیرون نمی‌دهد', () => {
    for (const format of ['short', 'full', 'weekday'] as const) {
      expect(formatJalali(day, format)).not.toMatch(/[0-9]/)
    }
    expect(formatTime(day)).not.toMatch(/[0-9]/)
  })

  it('ساعت بدون ثانیه و با ارقام فارسی', () => {
    expect(formatTime(day)).toBe('۸:۱۲')
    expect(formatTime(new Date(2026, 0, 4, 16, 5))).toBe('۱۶:۰۵')
  })

  it('اجزای جلالی را عددی می‌دهد', () => {
    expect(jalaliParts(day)).toEqual({ year: 1404, month: 10, day: 14 })
  })

  it('کلید دوره ماهانه', () => {
    expect(jalaliYearMonth(day)).toBe('1404-10')
  })
})

describe('لایه داده', () => {
  it('تاریخ میلادی محلی می‌دهد، نه UTC', () => {
    expect(toIsoDate(day)).toBe('2026-01-04')
  })
})
