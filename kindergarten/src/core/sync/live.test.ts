import { describe, expect, it } from 'vitest'
import { backoffMs, FALLBACK_POLL_MS } from './live.ts'

/**
 * قواعد مقاومت اتصال — ارتقای ۴ سند بررسی طراحی.
 *
 * اینترنت موبایل ایران قطع می‌شود. این‌ها همان قاعده‌هایی‌اند که
 * می‌گویند قطع شدن نباید نه صفحه را بشکند، نه سرور را زیر فشار
 * تلاش‌های پیاپی بگذارد.
 */
describe('عقب‌نشینی نمایی', () => {
  it('از یک ثانیه شروع می‌شود و دو برابر می‌شود', () => {
    expect(backoffMs(0)).toBe(1000)
    expect(backoffMs(1)).toBe(2000)
    expect(backoffMs(2)).toBe(4000)
    expect(backoffMs(3)).toBe(8000)
    expect(backoffMs(4)).toBe(16000)
  })

  /*
   * سقف لازم است: بی آن، پس از ده تلاش فاصله به هفده دقیقه می‌رسد و
   * مربی‌ای که اینترنتش برگشته تا ربع ساعت بی‌خبر می‌ماند.
   */
  it('سقفش سی ثانیه است', () => {
    expect(backoffMs(5)).toBe(30_000)
    expect(backoffMs(20)).toBe(30_000)
  })

  it('ورودی منفی هم از یک ثانیه شروع می‌شود', () => {
    expect(backoffMs(-3)).toBe(1000)
  })
})

describe('لایه پشتیبان', () => {
  /*
   * همان سی ثانیه پیشین. پشتیبان است نه مسیر اصلی، پس نباید باتری و
   * سهمیه اینترنت را بخورد.
   */
  it('فاصله فراخوانی دوره‌ای سی ثانیه می‌ماند', () => {
    expect(FALLBACK_POLL_MS).toBe(30_000)
  })

  it('از بیشترین فاصله تلاش دوباره کمتر نیست', () => {
    expect(FALLBACK_POLL_MS).toBeGreaterThanOrEqual(backoffMs(99))
  })
})
