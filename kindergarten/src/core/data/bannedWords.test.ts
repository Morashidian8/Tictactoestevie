import { describe, expect, it } from 'vitest'
import { BANNED_WORDS, findBannedWords } from './bannedWords.ts'

describe('واژگان ممنوع، پیوست ب', () => {
  it('کل فهرست پیوست ب را دارد', () => {
    expect(BANNED_WORDS).toHaveLength(16)
  })

  it('واژه ممنوع را در جمله پیدا می‌کند', () => {
    expect(findBannedWords('امروز خیلی پرخاشگر بود')).toEqual(['پرخاشگر'])
  })

  it('نیم‌فاصله را با فاصله یکی می‌شمارد', () => {
    expect(findBannedWords('بیش‌فعال است')).toContain('بیش‌فعال')
    expect(findBannedWords('بیش فعال است')).toContain('بیش‌فعال')
  })

  it('چند واژه را با هم برمی‌گرداند', () => {
    expect(findBannedWords('کمی تنبل و خجالتی')).toEqual(['تنبل', 'خجالتی'])
  })

  it('متن پاک را پاک می‌داند', () => {
    expect(findBannedWords('امروز اولین بار برج شش طبقه ساخت.')).toEqual([])
    expect(findBannedWords('')).toEqual([])
  })

  /**
   * تفاوت مهم: این تابع فقط پیدا می‌کند. جلوگیری کار او نیست، چون سند
   * برای متن مربی هشدار خواسته نه مانع.
   */
  it('فقط گزارش می‌دهد و چیزی را عوض نمی‌کند', () => {
    const text = 'کمی تنبل بود'
    findBannedWords(text)
    expect(text).toBe('کمی تنبل بود')
  })
})
