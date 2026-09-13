import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * کف کنتراست بخش ۱۲.۷ سند: ۴.۵:۱ برای متن، ۳:۱ برای عناصر رابط.
 *
 * توکن‌ها از خود فایل CSS خوانده می‌شوند تا این تست با تغییر پالت هم
 * معتبر بماند. اگر کسی رنگی را عوض کرد و کف شکست، اینجا قرمز می‌شود.
 *
 * نسخه ۲.۰: پالت مرجانی هیچ رنگی ندارد که به‌تنهایی به عنوان متن روی
 * زمینه روشن قبول شود. راه‌حل تغییر رنگ نبود، تغییر قاعده بود — و
 * قاعده‌ها همان‌هایی‌اند که این فایل می‌سنجدشان.
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

/** رنگ‌های پرکننده پالت. هیچ‌کدام حق ندارند گلیف باشند. */
const FILLS = ['coral', 'coral-dark', 'mint', 'mango', 'brick'] as const
/** زمینه‌های روشنی که متن رویشان می‌نشیند. */
const GROUNDS = ['paper', 'surface', 'surface-warm'] as const
const TINTS = ['coral-tint', 'mint-tint', 'mango-tint', 'brick-tint'] as const

describe('کنتراست متن، کف ۴.۵:۱', () => {
  const pairs: [string, string, string][] = [
    ['متن اصلی روی بوم', 'ink', 'paper'],
    ['متن اصلی روی سطح', 'ink', 'surface'],
    ['متن اصلی روی سطح گرم', 'ink', 'surface-warm'],
    ['متن ثانویه روی بوم', 'ink-muted', 'paper'],
    ['متن ثانویه روی سطح', 'ink-muted', 'surface'],
    ['متن روی سطح گرم و تینت‌دار', 'ink', 'surface-warm'],
    // بخش ۱۲.۲: متن دکمه کنش اصلی --ink است، نه سفید.
    ['متن دکمه کنش اصلی', 'ink', 'coral'],
    // تراشه وضعیت: زمینه تینت، متن --ink
    ...TINTS.map((t): [string, string, string] => [`تراشه ${t}`, 'ink', t]),
  ]

  it.each(pairs)('%s', (_label, fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(TEXT_MIN)
  })
})

describe('کنتراست عناصر رابط، کف ۳:۱', () => {
  const pairs: [string, string, string][] = [
    // بخش ۱۲.۲: مرز کنترل تعاملی --ink-muted است، نه --border.
    ['مرز ورودی روی سطح', 'ink-muted', 'surface'],
    ['مرز ورودی روی بوم', 'ink-muted', 'paper'],
    // حلقه فوکوس --coral-dark است.
    ['حلقه فوکوس روی سطح', 'coral-dark', 'surface'],
    ['حلقه فوکوس روی بوم', 'coral-dark', 'paper'],
    // آجری تنها رنگی است که حق آیکون شدن دارد، و فقط برای ایمنی.
    ['آیکون ایمنی روی سطح', 'brick', 'surface'],
    ['آیکون ایمنی روی بوم', 'brick', 'paper'],
  ]

  it.each(pairs)('%s', (_label, fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(UI_MIN)
  })
})

/**
 * قاعده‌ای که رنگ‌ها را نجات داد، به شکل تست.
 *
 * هیچ رنگ پرکننده‌ای روی هیچ زمینه روشنی به کف متن نمی‌رسد. اگر روزی
 * کسی وسوسه شد «حاضر» را نعنایی بنویسد، این تست می‌گوید چرا نمی‌شود.
 */
describe('هیچ رنگ پرکننده‌ای متن نمی‌شود — بخش ۱۲.۲', () => {
  for (const fill of FILLS) {
    for (const ground of GROUNDS) {
      it(`--${fill} روی --${ground} کف متن را رد نمی‌کند`, () => {
        expect(contrast(token(fill), token(ground))).toBeLessThan(TEXT_MIN)
      })
    }
  }

  it('ولی --ink روی هر پرکننده‌ای که متن می‌گیرد، قبول است', () => {
    for (const fill of ['coral', 'mint', 'mango'] as const) {
      expect(contrast(token('ink'), token(fill))).toBeGreaterThanOrEqual(TEXT_MIN)
    }
  })

  /*
   * --brick استثناست: --ink رویش ۳٫۸۹ می‌دهد. پس آجری فقط زمینه متن
   * درشت یا آیکون می‌شود، و پیام هشدار روی --brick-tint می‌نشیند نه
   * روی خودِ --brick.
   */
  it('آجری برای متن عادی زمینه نمی‌شود، ولی تینتش می‌شود', () => {
    expect(contrast(token('ink'), token('brick'))).toBeLessThan(TEXT_MIN)
    expect(contrast(token('ink'), token('brick'))).toBeGreaterThanOrEqual(UI_MIN)
    expect(contrast(token('ink'), token('brick-tint'))).toBeGreaterThanOrEqual(TEXT_MIN)
  })
})

/**
 * دو استثنای عمدی، اینجا ثبت می‌شوند تا سکوت نباشند.
 *
 * حالت غیرفعال: معیار ۱.۴.۳ استاندارد، عنصر غیرفعال را صراحتاً معاف
 * می‌کند.
 *
 * --border: با نسبت حدود ۱.۲ عملاً نامرئی است و همین درست است — خط
 * جداکننده است، نه مرز کنترل. جدایی کارت از بوم را سایه می‌سازد.
 */
describe('استثناهای عمدی', () => {
  it('متن غیرفعال عمداً کم‌کنتراست است', () => {
    expect(contrast(token('ink-muted'), token('surface-warm'))).toBeLessThan(
      contrast(token('ink'), token('surface-warm')),
    )
  })

  /*
   * چرا قاعده «روی تینت، متن --ink است» وجود دارد: --ink-muted روی
   * هر چهار تینت زیر کف می‌ماند. این تست همان را ثبت می‌کند تا قاعده
   * بی‌دلیل به نظر نرسد.
   */
  it('متن ثانویه روی تینت‌ها کف را رد نمی‌کند، پس آنجا --ink می‌نشیند', () => {
    for (const tint of [...TINTS, 'surface-warm'] as const) {
      expect(contrast(token('ink-muted'), token(tint))).toBeLessThan(TEXT_MIN)
    }
  })

  it('خط جداکننده تزئینی است و مرز کنترل نیست', () => {
    expect(contrast(token('border'), token('paper'))).toBeLessThan(UI_MIN)
  })
})

/**
 * پالت باید مقدار به مقدار همان چیزی باشد که سند می‌گوید.
 *
 * هر انحرافی اینجا قرمز می‌شود — چه کسی رنگی را در کد عوض کند، چه در
 * سند.
 */
describe('پالت با سند یکی است — بخش ۱۲.۲', () => {
  const spec = readFileSync(new URL('../../docs/spec.md', import.meta.url), 'utf8')
  const block = spec.slice(spec.indexOf('### ۱۲.۲ پالت رنگ'))
  const wanted = [...block.matchAll(/--([a-z-]+):\s*(#[0-9A-Fa-f]{6})/g)].slice(0, 14)

  it('سند چهارده رنگ تعریف کرده', () => {
    expect(wanted.length).toBe(14)
  })

  for (const [, name, value] of wanted) {
    it(`--${name} برابر ${value} است`, () => {
      expect(token(name!).toLowerCase()).toBe(value!.toLowerCase())
    })
  }
})
