import { describe, expect, it } from 'vitest'
import {
  CRITICAL_GRACE_MS,
  decideSms,
  dueAlerts,
  quotaReport,
  smsDueAt,
  type CriticalAlert,
} from './critical.ts'

const t0 = new Date('2025-11-04T04:30:00.000Z')
const at = (seconds: number) => new Date(t0.getTime() + seconds * 1000)

function alert(over: Partial<CriticalAlert> = {}): CriticalAlert {
  return {
    id: 'a1',
    event: 'pickup_code',
    raisedAt: t0,
    acknowledgedAt: null,
    smsSentAt: null,
    smsSkippedReason: null,
    ...over,
  }
}

describe('مهلت اپ پیش از پیامک', () => {
  it('دقیقاً شصت ثانیه است — همان عدد SQL', () => {
    expect(CRITICAL_GRACE_MS).toBe(60_000)
    expect(smsDueAt(alert()).getTime() - t0.getTime()).toBe(60_000)
  })

  it('پیش از مهلت، پیامکی نمی‌رود', () => {
    expect(decideSms(alert(), at(59), 10)).toBe('waiting')
  })

  it('پس از مهلت، می‌رود', () => {
    expect(decideSms(alert(), at(61), 10)).toBe('sent')
  })
})

describe('دیدن در اپ، پیامک را لغو می‌کند', () => {
  it('خانواده‌ای که در اپ دید، پیامک نمی‌گیرد', () => {
    expect(decideSms(alert({ acknowledgedAt: at(20) }), at(90), 10)).toBe('acknowledged')
  })

  it('و سررسید هم نمی‌شود', () => {
    expect(dueAlerts([alert({ acknowledgedAt: at(20) })], at(90))).toHaveLength(0)
  })

  /*
   * این تست از یک اشتباهِ محتمل جلوگیری می‌کند: اگر تأیید بر پیامکِ
   * رفته مقدم شود، مصرفی که واقعاً اتفاق افتاده از آمار پاک می‌شود و
   * مدیر سهمیه‌ای را می‌بیند که ندارد.
   */
  it('ولی تأیید پس از رفتن پیامک، مصرف را پس نمی‌گیرد', () => {
    expect(decideSms(alert({ smsSentAt: at(61), acknowledgedAt: at(120) }), at(130), 10)).toBe(
      'sent',
    )
  })
})

describe('سهمیه', () => {
  it('سطل خالی، پیامک را متوقف می‌کند ولی رخداد را پاک نمی‌کند', () => {
    expect(decideSms(alert(), at(61), 0)).toBe('quota_exhausted')
  })

  it('رخدادِ رد شده به‌خاطر سهمیه، دوباره سررسید نمی‌شود', () => {
    expect(dueAlerts([alert({ smsSkippedReason: 'quota_exhausted' })], at(90))).toHaveLength(0)
  })

  it('هر دو سطل همیشه در گزارش هستند، حتی سطلی که ردیف ندارد', () => {
    const lines = quotaReport([])
    expect(lines.map((l) => l.bucket)).toEqual(['notice', 'critical_fallback'])
    expect(lines.every((l) => l.allocated === 0 && !l.warn)).toBe(true)
  })

  it('شارژ اضافه در سقف حساب می‌شود', () => {
    const [notice] = quotaReport([
      { bucket: 'notice', allocated: 100, extraPurchased: 50, used: 100 },
    ])
    expect(notice?.allocated).toBe(150)
    expect(notice?.remaining).toBe(50)
  })

  it('از هشتاد درصد هشدار می‌دهد، نه زودتر', () => {
    const at79 = quotaReport([{ bucket: 'notice', allocated: 100, extraPurchased: 0, used: 79 }])
    const at80 = quotaReport([{ bucket: 'notice', allocated: 100, extraPurchased: 0, used: 80 }])
    expect(at79[0]?.warn).toBe(false)
    expect(at80[0]?.warn).toBe(true)
  })

  /*
   * قاعده اصلی جداسازی: سطل اطلاع‌رسانیِ سوخته نباید روی سطل حیاتی اثر
   * بگذارد. اگر روزی کسی این دو را در یک عدد جمع کند، همین تست می‌افتد.
   */
  it('سطل اطلاع‌رسانیِ تمام‌شده، سطل حیاتی را خالی نمی‌کند', () => {
    const lines = quotaReport([
      { bucket: 'notice', allocated: 100, extraPurchased: 0, used: 100 },
      { bucket: 'critical_fallback', allocated: 50, extraPurchased: 0, used: 1 },
    ])
    expect(lines.find((l) => l.bucket === 'notice')?.remaining).toBe(0)
    expect(lines.find((l) => l.bucket === 'critical_fallback')?.remaining).toBe(49)
  })
})

describe('صف ارسال', () => {
  it('به ترتیب سررسید مرتب می‌شود — قدیمی‌ترین انتظار، اول', () => {
    const older = alert({ id: 'old', raisedAt: new Date(t0.getTime() - 120_000) })
    const newer = alert({ id: 'new' })
    expect(dueAlerts([newer, older], at(61)).map((a) => a.id)).toEqual(['old', 'new'])
  })
})
