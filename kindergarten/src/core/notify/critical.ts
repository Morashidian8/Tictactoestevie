/**
 * پشتیبان پیامک رخدادهای حیاتی — ارتقای ۴ سند بررسی طراحی.
 *
 * دوقلوی `supabase/migrations/0021_critical_alert.sql`. هر قاعده‌ای که
 * اینجا هست، آنجا هم هست: یکی برای صفحه مدیر و تصمیم‌های سمت مرورگر،
 * یکی برای کارگری که واقعاً پیامک را می‌فرستد. اگر این دو از هم جدا
 * بیفتند، پنل چیزی را نشان می‌دهد که سامانه انجام نداده.
 *
 * چرا این لایه وجود دارد: اپ روی iOS وب‌اپ است و اعلانش مشروط به
 * «افزودن به صفحه خانه» و اجازه کاربر. یعنی برای بخشی از خانواده‌ها
 * اعلان هرگز نمی‌رسد — و ما نمی‌دانیم کدام بخش.
 */

/** فقط این سه. سهمیه محدود است و هر چیزِ «مهم»، حیاتی نیست. */
export type CriticalEvent = 'pickup_code' | 'incident_confirmed' | 'medication_emergency'

export const CRITICAL_EVENT_LABEL: Record<CriticalEvent, string> = {
  pickup_code: 'کد تحویل',
  incident_confirmed: 'حادثه تأییدشده',
  medication_emergency: 'هشدار دارویی اضطراری',
}

/** دو سطل جدا. تمام شدن اولی هرگز دومی را خالی نمی‌کند. */
export type SmsBucket = 'notice' | 'critical_fallback'

export const SMS_BUCKET_LABEL: Record<SmsBucket, string> = {
  notice: 'اطلاع‌رسانی',
  critical_fallback: 'پشتیبان رخداد حیاتی',
}

/**
 * مهلت اپ پیش از پیامک.
 *
 * از سند نمی‌آید. کوتاه‌ترین فاصله‌ای است که هم به اعلان اپ فرصت رسیدن
 * می‌دهد و هم در یک حادثه، تأخیرِ بی‌معنا نیست.
 */
export const CRITICAL_GRACE_MS = 60_000

/** بخش ۱۵.۴: «در آستانه ۸۰٪ هشدار داده شود». */
export const QUOTA_WARN_RATIO = 0.8

export type CriticalAlert = {
  id: string
  event: CriticalEvent
  raisedAt: Date
  acknowledgedAt: Date | null
  smsSentAt: Date | null
  smsSkippedReason: 'acknowledged' | 'quota_exhausted' | null
}

export type SmsDecision = 'waiting' | 'acknowledged' | 'sent' | 'quota_exhausted'

/** لحظه‌ای که اگر تا آن کسی در اپ ندید، پیامک می‌رود. */
export function smsDueAt(alert: Pick<CriticalAlert, 'raisedAt'>): Date {
  return new Date(alert.raisedAt.getTime() + CRITICAL_GRACE_MS)
}

/**
 * سرنوشت یک رخداد در لحظه `at`، با `room` جای خالیِ سطل حیاتی.
 *
 * ترتیب شرط‌ها معنادار است و با SQL یکی است:
 *   دیدنِ در اپ > پیامکِ رفته > مهلت > سهمیه.
 *
 * یعنی تأیید پس از رفتن پیامک، «نرفته» نمی‌شود: سهمیه خرج شده و آمار
 * نباید دروغ بگوید.
 */
export function decideSms(alert: CriticalAlert, at: Date, room: number): SmsDecision {
  if (alert.smsSentAt) return 'sent'
  if (alert.acknowledgedAt) return 'acknowledged'
  if (at.getTime() < smsDueAt(alert).getTime()) return 'waiting'
  if (room <= 0) return 'quota_exhausted'
  return 'sent'
}

/** رخدادهایی که مهلتشان گذشته و هنوز کسی ندیده. */
export function dueAlerts(alerts: readonly CriticalAlert[], at: Date): CriticalAlert[] {
  return alerts
    .filter(
      (a) =>
        !a.acknowledgedAt &&
        !a.smsSentAt &&
        !a.smsSkippedReason &&
        smsDueAt(a).getTime() <= at.getTime(),
    )
    .sort((a, b) => smsDueAt(a).getTime() - smsDueAt(b).getTime())
}

export type QuotaRow = {
  bucket: SmsBucket
  allocated: number
  extraPurchased: number
  used: number
}

export type QuotaLine = {
  bucket: SmsBucket
  label: string
  allocated: number
  used: number
  remaining: number
  warn: boolean
}

/**
 * گزارش سهمیه برای پنل مدیر.
 *
 * هر دو سطل همیشه برمی‌گردند، حتی سطلی که هیچ ردیفی ندارد: سطلی که
 * دیده نمی‌شود، سطلی است که مدیر فکر می‌کند وجود ندارد.
 */
export function quotaReport(rows: readonly QuotaRow[]): QuotaLine[] {
  const buckets: SmsBucket[] = ['notice', 'critical_fallback']
  return buckets.map((bucket) => {
    const row = rows.find((r) => r.bucket === bucket)
    const allocated = (row?.allocated ?? 0) + (row?.extraPurchased ?? 0)
    const used = row?.used ?? 0
    return {
      bucket,
      label: SMS_BUCKET_LABEL[bucket],
      allocated,
      used,
      remaining: allocated - used,
      warn: allocated > 0 && used / allocated >= QUOTA_WARN_RATIO,
    }
  })
}
