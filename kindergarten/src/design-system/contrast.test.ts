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
   * آجری با --ink تازه (#0F172A) به ۴٫۷۴ رسید و دیگر استثنا نیست.
   *
   * ولی قاعده استفاده عوض نمی‌شود: پیام هشدار همچنان روی --brick-tint
   * می‌نشیند، نه روی خودِ --brick. دلیلش این بار کنتراست نیست، لحن
   * است — یک مستطیل قرمز پر، در صفحه‌ای که «رنگ رویداد است»، جیغ
   * می‌زند.
   */
  it('آجری هم مثل بقیه، با متن --ink کف را رد می‌کند', () => {
    expect(contrast(token('ink'), token('brick'))).toBeGreaterThanOrEqual(TEXT_MIN)
    expect(contrast(token('ink'), token('brick-tint'))).toBeGreaterThanOrEqual(TEXT_MIN)
  })

  /*
   * دکمه کنش اصلی گرادیانی شد. هر دو سرِ گرادیان باید با برچسب --ink
   * از کف رد شوند، وگرنه وسط دکمه خوانا و لبه‌اش ناخوانا می‌ماند.
   */
  describe('گرادیان کنش اصلی', () => {
    const GRADIENT_ENDS = ['#10B981', '#059669'] as const

    it('برچسب --ink روی هر دو سرِ گرادیان قبول است', () => {
      for (const end of GRADIENT_ENDS) {
        expect(contrast(token('ink'), end)).toBeGreaterThanOrEqual(TEXT_MIN)
      }
    })

    /*
     * این تست دلیلِ نه گفتن به «متن سفید» را نگه می‌دارد. سند بازطراحی
     * سفید خواسته بود؛ عدد اجازه نداد.
     */
    it('و سفید روی هیچ‌کدام قبول نیست — چرا برچسب سفید نشد', () => {
      for (const end of GRADIENT_ENDS) {
        expect(contrast('#FFFFFF', end)).toBeLessThan(TEXT_MIN)
      }
    })
  })

  /*
   * تنها رنگی که حق گلیف شدن دارد، و فقط روی یک زمینه.
   */
  describe('--mint-deep، تنها استثنای قاعده گلیف', () => {
    it('روی --mint-tint کف متن را رد می‌کند', () => {
      expect(contrast(token('mint-deep'), token('mint-tint'))).toBeGreaterThanOrEqual(
        TEXT_MIN,
      )
    })

    it('و روی سفید و بوم هم می‌رد، ولی کاربردش عمداً همان یکی است', () => {
      for (const ground of ['surface', 'paper'] as const) {
        expect(contrast(token('mint-deep'), token(ground))).toBeGreaterThanOrEqual(TEXT_MIN)
      }
    })
  })

  /*
   * میکروآیکون‌های فعالیت: رنگ لحن گلیف نمی‌شود.
   *
   * سند بازطراحی `text-emerald-600` و `text-amber-600` روی تینتشان
   * خواسته بود. هر دو زیر کف‌اند و گلیف اینجا ۱۰ پیکسل است، یعنی
   * بدترین حالت ممکن.
   */
  it('رنگ لحن روی تینت خودش گلیف نمی‌شود', () => {
    expect(contrast('#059669', token('mint-tint'))).toBeLessThan(TEXT_MIN)
    expect(contrast('#D97706', token('mango-tint'))).toBeLessThan(TEXT_MIN)
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
   * تینت‌ها زیر کف می‌ماند.
   *
   * --mint-tint پس از روشن‌تر شدن به ۴٫۵۲ رسید، یعنی ۰٫۰۲ بالای کف.
   * قاعده با این حال بی‌استثنا می‌ماند و همین تست حاشیه را نگه می‌دارد:
   * اگر روزی تینت یک پله تیره‌تر شود، اینجا قرمز می‌شود نه در دست مربی.
   */
  it('متن ثانویه روی تینت‌ها کف را رد نمی‌کند، پس آنجا --ink می‌نشیند', () => {
    for (const tint of ['coral-tint', 'mango-tint', 'brick-tint', 'surface-warm'] as const) {
      expect(contrast(token('ink-muted'), token(tint))).toBeLessThan(TEXT_MIN)
    }
  })

  it('--mint-tint تنها تینتی است که مرز را رد می‌کند، و آن هم مویی', () => {
    const ratio = contrast(token('ink-muted'), token('mint-tint'))
    expect(ratio).toBeGreaterThanOrEqual(TEXT_MIN)
    expect(ratio).toBeLessThan(4.7)
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
  const wanted = [...block.matchAll(/--([a-z-]+):\s*(#[0-9A-Fa-f]{6})/g)].slice(0, 16)

  it('سند شانزده رنگ تعریف کرده', () => {
    expect(wanted.length).toBe(16)
  })

  for (const [, name, value] of wanted) {
    it(`--${name} برابر ${value} است`, () => {
      expect(token(name!).toLowerCase()).toBe(value!.toLowerCase())
    })
  }
})

/**
 * نوار پایین — هر خانه رنگِ خودش، و هر دو حالت سنجیده.
 *
 * آیکون‌ها گرافیکِ معنادارند نه متن، پس کفشان ۳:۱ است (معیار ۱.۴.۱۱).
 * برچسبِ متنیِ زیرشان ولی متن است و کف ۴٫۵ را می‌خواهد.
 *
 * این تست همان چیزی را نگه می‌دارد که «هر آیکون رنگ خودش» را ممکن
 * کرد: رنگی که کف را رد نکند، وارد پالت نوار نمی‌شود.
 */
describe('نوار پایین — رنگِ هر خانه', () => {
  const TONES = ['mint', 'sky', 'bubble', 'mango', 'grape', 'neutral'] as const

  it('برچسبِ نوار روی زمینهٔ نوار، کف متن را رد می‌کند', () => {
    expect(contrast(token('nav-fg'), token('nav-bg'))).toBeGreaterThanOrEqual(TEXT_MIN)
  })

  for (const tone of TONES) {
    it(`آیکونِ ${tone} در حالت غیرفعال، روی زمینهٔ نوار`, () => {
      expect(contrast(token(`nav-${tone}`), token('nav-bg'))).toBeGreaterThanOrEqual(UI_MIN)
    })

    it(`آیکونِ ${tone} در حالت فعال، روی قرصِ کرم`, () => {
      expect(contrast(token(`nav-${tone}-deep`), token('paper'))).toBeGreaterThanOrEqual(UI_MIN)
    })
  }

  /*
   * کنشِ مرکزی از نعنایی به انبه‌ای رفت — روی نوارِ سبزِ تیره، سبز روی
   * سبز گم می‌شد. گلیفش --ink است و این تست می‌گوید چرا سفید نشد.
   */
  describe('کنشِ مرکزی', () => {
    const ENDS = ['#FFD66B', '#F5B733'] as const

    it('گلیفِ --ink روی هر دو سرِ گرادیان قبول است', () => {
      for (const end of ENDS) {
        expect(contrast(token('ink'), end)).toBeGreaterThanOrEqual(TEXT_MIN)
      }
    })

    it('و سفید روی هیچ‌کدام قبول نیست', () => {
      for (const end of ENDS) {
        expect(contrast('#FFFFFF', end)).toBeLessThan(TEXT_MIN)
      }
    })
  })
})

/**
 * متنِ ثانویه روی تینت‌ها.
 *
 * از وقتی کارت‌ها تینت می‌گیرند، --ink-muted کافی نیست: روی --grape-tint
 * نسبت ۴٫۰۹ می‌دهد. --ink-muted-on-tint یک پله تیره‌تر است و این تست
 * می‌گوید چرا لازم شد.
 */
describe('متن ثانویه روی تینت', () => {
  const TINTED = ['mint-tint', 'sky-tint', 'grape-tint', 'mango-tint', 'bubble-tint'] as const

  for (const tint of TINTED) {
    it(`--ink-muted-on-tint روی --${tint}`, () => {
      expect(contrast(token('ink-muted-on-tint'), token(tint))).toBeGreaterThanOrEqual(TEXT_MIN)
    })
  }

  it('و --ink-muted روی --grape-tint کف را رد نمی‌کند — چرا توکن تازه لازم شد', () => {
    expect(contrast(token('ink-muted'), token('grape-tint'))).toBeLessThan(TEXT_MIN)
  })
})
