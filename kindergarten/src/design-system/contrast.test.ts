import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * کف کنتراست بخش ۱۲.۷ سند: ۴.۵:۱ برای متن، ۳:۱ برای عناصر رابط.
 *
 * توکن‌ها از خود فایل CSS خوانده می‌شوند تا این تست با تغییر پالت هم
 * معتبر بماند. اگر کسی رنگی را عوض کرد و کف شکست، اینجا قرمز می‌شود.
 */
const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')

function token(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match?.[1]) throw new Error(`توکن --${name} در tokens.css پیدا نشد`)
  return match[1]
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const TEXT_MIN = 4.5
const UI_MIN = 3

describe('کنتراست متن، کف ۴.۵:۱', () => {
  const pairs: [string, string, string][] = [
    ['متن اصلی روی کاغذ', 'ink', 'paper'],
    ['متن اصلی روی سطح', 'ink', 'surface'],
    ['متن ثانویه روی کاغذ', 'ink-muted', 'paper'],
    ['متن ثانویه روی سطح', 'ink-muted', 'surface'],
    ['حرف اول در آواتار خالی', 'ink-muted', 'neutral-fill'],
    ['متن دکمه اصلی', 'surface', 'turquoise-dark'],
    // متن هر تراشه --ink است، روی هر پنج پس‌زمینه لحن
    ['تراشه خنثی', 'ink', 'neutral-fill'],
    ['تراشه فیروزه‌ای', 'ink', 'turquoise-tint'],
    ['تراشه زعفرانی', 'ink', 'saffron-tint'],
    ['تراشه آجری', 'ink', 'brick-tint'],
    ['تراشه مریم‌گلی', 'ink', 'sage-tint'],
  ]

  it.each(pairs)('%s', (_label, fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(TEXT_MIN)
  })
})

describe('کنتراست عناصر رابط، کف ۳:۱', () => {
  const pairs: [string, string, string][] = [
    ['حلقه آواتار حاضر روی کاغذ', 'turquoise', 'paper'],
    ['آیکون تراشه زعفرانی', 'ink', 'saffron-tint'],
    ['آیکون تراشه آجری', 'brick', 'brick-tint'],
    ['آیکون تراشه مریم‌گلی', 'sage', 'sage-tint'],
    ['نقطه بی‌خبر روی سطح', 'brick', 'surface'],
  ]

  it.each(pairs)('%s', (_label, fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(UI_MIN)
  })
})

/**
 * دو استثنای عمدی، اینجا ثبت می‌شوند تا سکوت نباشند.
 *
 * حالت غیرفعال: معیار ۱.۴.۳ استاندارد، عنصر غیرفعال را صراحتاً معاف
 * می‌کند. --disabled-fg روی --disabled-bg حدود ۲.۱ است و همین درست است،
 * چون غیرفعال باید خوانا نباشد.
 *
 * حلقه آواتار «نیامده»: تزئینی است، نه حامل معنا. وضعیت با متن زیر آواتار
 * و برچسب صفحه‌خوان هم گفته می‌شود، پس مشمول کف ۳:۱ نیست.
 */
describe('استثناهای عمدی', () => {
  it('متن غیرفعال عمداً کم‌کنتراست است', () => {
    expect(contrast(token('disabled-fg'), token('disabled-bg'))).toBeLessThan(TEXT_MIN)
  })

  it('حلقه خنثی تزئینی است و وضعیت را متن حمل می‌کند', () => {
    expect(contrast(token('neutral-fill-strong'), token('paper'))).toBeLessThan(UI_MIN)
  })
})

/**
 * پالت باید مقدار به مقدار همان چیزی باشد که سند می‌گوید.
 *
 * تا پیش از این، سند در مخزن نبود و این ادعا قابل سنجش نبود. حالا هست،
 * پس هر انحرافی اینجا قرمز می‌شود — چه کسی رنگی را در کد عوض کند، چه
 * در سند.
 */
describe('پالت با سند یکی است — بخش ۱۲.۲', () => {
  const spec = readFileSync(new URL('../../docs/spec.md', import.meta.url), 'utf8')
  const block = spec.slice(spec.indexOf('### ۱۲.۲ پالت رنگ'))
  const wanted = [...block.matchAll(/--([a-z-]+):\s*(#[0-9A-Fa-f]{6})/g)].slice(0, 11)

  it('سند یازده رنگ تعریف کرده', () => {
    expect(wanted.length).toBe(11)
  })

  for (const [, name, value] of wanted) {
    it(`--${name} برابر ${value} است`, () => {
      expect(token(name!).toLowerCase()).toBe(value!.toLowerCase())
    })
  }
})
