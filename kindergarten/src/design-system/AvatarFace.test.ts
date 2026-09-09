import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * چهره جایگزین عکس دو تعهد دارد که با تست نگه داشته می‌شوند.
 *
 * تعهد اول از بند ۱۰.۱ می‌آید: «هیچ برچسبی روی کودک نمی‌خورد.» تصویری که
 * از روی جنسیت یا سن یا هر داده واقعیِ کودک ساخته شود، یک برچسب بصری
 * است. پس چهره فقط از شناسه ساخته می‌شود و از هیچ‌چیز دیگر.
 *
 * تعهد دوم: چهره هر کودک باید همیشه یکی بماند تا مربی به آن عادت کند.
 */
const source = readFileSync(new URL('./AvatarFace.tsx', import.meta.url), 'utf8')

describe('چهره جایگزین عکس', () => {
  it('تنها ورودی‌اش شناسه است', () => {
    const props = source.match(/type Props = \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(props).toContain('seed: string')
    for (const forbidden of ['gender', 'birthDate', 'age', 'firstName', 'lastName']) {
      expect(props).not.toContain(forbidden)
    }
  })

  it('هیچ رنگ دلخواهی بیرون از پالت بخش ۱۲ ندارد', () => {
    // رنگ پوست و مو و لباس تصویری‌اند و در پالت رابط نیستند؛ بقیه باید
    // از توکن بیایند. اینجا فقط پس‌زمینه بررسی می‌شود که پشت رابط است.
    const backdrop = source.match(/const BACKDROP = \[[\s\S]*?\] as const/)?.[0] ?? ''
    expect(backdrop).not.toMatch(/#[0-9a-fA-F]{3,6}/)
    expect(backdrop).toContain('var(--')
  })

  it('برای یک شناسه همیشه یک خروجی می‌دهد', async () => {
    const { AvatarFace } = await import('./AvatarFace.tsx')
    const render = (seed: string) => JSON.stringify(AvatarFace({ seed }))
    expect(render('child-7')).toBe(render('child-7'))
  })

  it('شناسه‌های پشت‌سرهم چهره‌های یکسان نمی‌سازند', async () => {
    const { AvatarFace } = await import('./AvatarFace.tsx')
    const seen = new Set(
      Array.from({ length: 25 }, (_, i) => JSON.stringify(AvatarFace({ seed: `child-${i + 1}` }))),
    )
    // با پنج رنگ پوست، پنج مو، پنج لباس و پنج پس‌زمینه، بیست‌وپنج کودک
    // نباید در چند چهره تکراری جمع شوند.
    expect(seen.size).toBeGreaterThanOrEqual(20)
  })
})
