import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertIcon, CheckIcon } from '../../design-system/index.ts'
import { formatCount, formatJalali, toPersianDigits } from '../../i18n/index.ts'
import { useData } from '../../core/auth/index.ts'
import type {
  ClassRoom,
  ClosureReason,
  NoticeAudience,
  NoticeInput,
  NoticeKind,
} from '../../core/data/index.ts'
import styles from './NoticePage.module.css'

/**
 * اطلاع‌رسانی به خانواده‌ها — بخش ۱۵.۳.
 *
 * سه قاعده سند در طراحی این صفحه‌اند:
 *
 * ۱. «تأیید دو مرحله‌ای الزامی است؛ ارسال به ده‌ها خانواده برگشت‌ناپذیر
 *    است.» پس نوشتن و فرستادن یک دکمه نیستند؛ بین‌شان صفحه تأیید است
 *    که تعداد گیرنده و سهمیه را نشان می‌دهد.
 * ۲. «در شرایط اضطراری پیامک مسیر اصلی است و اپ مسیر پشتیبان.» پس
 *    برای تعطیلی، پیامک از پیش روشن است و مدیر باید عمداً خاموشش کند.
 * ۳. «تأخیر در بازگشایی احتمالاً پرکاربردتر از تعطیلی کامل است» و به
 *    همان سادگی در دسترس است، نه پشت یک منو.
 */

const KINDS: { value: NoticeKind; label: string }[] = [
  { value: 'delayed_opening', label: 'تأخیر در بازگشایی' },
  { value: 'closure', label: 'تعطیلی کامل' },
  { value: 'announcement', label: 'اطلاعیه عادی' },
]

const REASONS: { value: ClosureReason; label: string }[] = [
  { value: 'weather', label: 'شرایط جوی' },
  { value: 'air_quality', label: 'آلودگی هوا' },
  { value: 'official_holiday', label: 'تعطیلی رسمی' },
  { value: 'utility_outage', label: 'قطعی آب یا گاز' },
  { value: 'health', label: 'مسائل بهداشتی' },
  { value: 'other', label: 'سایر' },
]

export function NoticePage({ onBack }: { onBack: () => void }) {
  const data = useData()
  const [classes, setClasses] = useState<ClassRoom[]>([])
  const [kind, setKind] = useState<NoticeKind>('delayed_opening')
  const [classId, setClassId] = useState<string | null>(null)
  const [reason, setReason] = useState<ClosureReason>('weather')
  const [reopenAt, setReopenAt] = useState('10:00')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [edited, setEdited] = useState(false)
  const [sendSms, setSendSms] = useState(true)
  const [step, setStep] = useState<'write' | 'confirm' | 'done'>('write')
  const [audience, setAudience] = useState<NoticeAudience | null>(null)
  const [sentCount, setSentCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    data.listClasses().then(setClasses).catch(() => setClasses([]))
  }, [data])

  const tomorrow = useMemo(() => {
    const date = new Date()
    date.setDate(date.getDate() + 1)
    return date
  }, [])

  /*
   * بخش ۱۵.۳ بند ۴: «تولید خودکار متن از قالب، با امکان ویرایش جزئی».
   * تا وقتی مدیر دست نزده، متن با هر تغییر گزینه‌ها دوباره ساخته می‌شود؛
   * از لحظه‌ای که دست زد، دیگر بازنویسی نمی‌شود.
   */
  const generated = useMemo(() => {
    const when = formatJalali(tomorrow, 'short')
    const why = REASONS.find((r) => r.value === reason)?.label ?? ''
    if (kind === 'delayed_opening') {
      return `اولیای گرامی، مهد فردا ${when} به دلیل ${why} از ساعت ${toPersianDigits(reopenAt)} بازگشایی می‌شود.`
    }
    if (kind === 'closure') {
      return `اولیای گرامی، مهد فردا ${when} به دلیل ${why} تعطیل است.`
    }
    return ''
  }, [kind, reason, reopenAt, tomorrow])

  useEffect(() => {
    if (edited) return
    setBody(generated)
    if (kind !== 'announcement') {
      setTitle(KINDS.find((k) => k.value === kind)?.label ?? '')
    }
  }, [generated, edited, kind])

  useEffect(() => {
    // پیامک برای تعطیلی پیش‌فرض روشن است، برای اطلاعیه عادی خاموش.
    setSendSms(kind !== 'announcement')
  }, [kind])

  const input: NoticeInput = {
    kind,
    classId,
    title: title.trim(),
    body: body.trim(),
    reason: kind === 'announcement' ? null : reason,
    reopenAt: kind === 'delayed_opening' ? reopenAt : null,
    date: toLocalIso(tomorrow),
    sendSms,
  }

  const ready = input.title.length > 0 && input.body.length > 0

  const review = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      setAudience(await data.previewNotice(input))
      setStep('confirm')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'خوانده نشد.')
    } finally {
      setBusy(false)
    }
  }, [data, input])

  const publish = async () => {
    setBusy(true)
    setError(null)
    try {
      const notice = await data.publishNotice(input)
      setSentCount(notice.smsSentCount)
      setStep('done')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'فرستاده نشد.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="بازگشت به داشبورد">
          <svg className="mirror" width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <span className={`${styles.title} t-h2`}>اطلاع‌رسانی</span>
      </header>

      <div className={styles.body}>
        {step === 'write' ? (
          <>
            <Section label="چه چیزی">
              <div className={styles.choices}>
                {KINDS.map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    className={`${styles.choice} t-body`}
                    aria-pressed={kind === choice.value}
                    onClick={() => {
                      setKind(choice.value)
                      setEdited(false)
                    }}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            </Section>

            <Section label="به چه کسانی">
              <div className={styles.choices}>
                <button
                  type="button"
                  className={`${styles.choice} t-body`}
                  aria-pressed={classId === null}
                  onClick={() => setClassId(null)}
                >
                  کل مهد
                </button>
                {classes.map((room) => (
                  <button
                    key={room.id}
                    type="button"
                    className={`${styles.choice} t-body`}
                    aria-pressed={classId === room.id}
                    onClick={() => setClassId(room.id)}
                  >
                    {room.name}
                  </button>
                ))}
              </div>
            </Section>

            {kind !== 'announcement' ? (
              <Section label="علت">
                <div className={styles.choices}>
                  {REASONS.map((choice) => (
                    <button
                      key={choice.value}
                      type="button"
                      className={`${styles.choice} t-body`}
                      aria-pressed={reason === choice.value}
                      onClick={() => {
                        setReason(choice.value)
                        setEdited(false)
                      }}
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
              </Section>
            ) : null}

            {kind === 'delayed_opening' ? (
              <Section label="ساعت بازگشایی">
                <input
                  className={styles.time}
                  type="time"
                  value={reopenAt}
                  aria-label="ساعت بازگشایی"
                  onChange={(event) => {
                    setReopenAt(event.target.value)
                    setEdited(false)
                  }}
                />
              </Section>
            ) : null}

            <Section label="عنوان">
              <input
                className={styles.input}
                value={title}
                aria-label="عنوان اطلاعیه"
                onChange={(event) => setTitle(event.target.value)}
              />
            </Section>

            <Section label="متن پیامک">
              <textarea
                className={styles.text}
                rows={4}
                value={body}
                aria-label="متن اطلاعیه"
                onChange={(event) => {
                  setBody(event.target.value)
                  setEdited(true)
                }}
              />
              <p className={`${styles.hint} t-caption`}>
                {toPersianDigits(body.length)} نویسه.
                {edited ? ' متن را خودتان نوشته‌اید.' : ' متن خودکار ساخته شده و قابل ویرایش است.'}
              </p>
            </Section>

            <Section label="کانال">
              <button
                type="button"
                className={`${styles.channel} t-body`}
                aria-pressed={sendSms}
                onClick={() => setSendSms(!sendSms)}
              >
                <span className={`${styles.box} ${sendSms ? styles.boxOn : ''}`} aria-hidden>
                  {sendSms ? <CheckIcon size={16} /> : null}
                </span>
                <span>پیامک هم فرستاده شود</span>
              </button>
              <p className={`${styles.hint} t-caption`}>
                ساعت شش صبح خانواده اپ را باز نمی‌کند ولی پیامک را می‌بیند. برای
                تعطیلی و تأخیر، پیامک مسیر اصلی است.
              </p>
            </Section>
          </>
        ) : null}

        {step === 'confirm' && audience ? (
          <>
            <section className={styles.preview}>
              <span className={`${styles.previewLabel} t-caption`}>آنچه فرستاده می‌شود</span>
              <p className={`${styles.previewTitle} t-body-lg`}>{input.title}</p>
              <p className={`${styles.previewBody} t-body`}>{input.body}</p>
            </section>

            <section className={styles.card}>
              <p className={`${styles.row} t-body`}>
                <span>خانواده‌ها</span>
                <b>{formatCount(audience.families)}</b>
              </p>
              <p className={`${styles.row} t-body`}>
                <span>پرسنل</span>
                <b>{formatCount(audience.staff)}</b>
              </p>
              <p className={`${styles.row} t-body`}>
                <span>پیامک لازم</span>
                <b>{formatCount(audience.smsNeeded)}</b>
              </p>
              <p className={`${styles.row} t-body`}>
                <span>سهمیه باقی‌مانده</span>
                <b className={audience.smsNeeded > audience.smsRemaining ? styles.short : ''}>
                  {formatCount(audience.smsRemaining)}
                </b>
              </p>
            </section>

            {audience.withoutPhone.length > 0 ? (
              <section className={`${styles.card} ${styles.warn}`}>
                <p className={`${styles.warnHead} t-body`}>
                  <AlertIcon size={20} />
                  پیامک به {formatCount(audience.withoutPhone.length)} خانواده نمی‌رسد
                </p>
                <p className={`${styles.hint} t-caption`}>
                  شماره‌ای برایشان ثبت نشده. فقط در اپ می‌بینند، پس اگر فوری است
                  تلفنی خبر دهید.
                </p>
                {audience.withoutPhone.map((row) => (
                  <p key={row.childId} className={`${styles.row} t-body`}>
                    <span>{row.childName}</span>
                    <span className={`${styles.hint} t-caption`}>{row.guardianName}</span>
                  </p>
                ))}
              </section>
            ) : null}
          </>
        ) : null}

        {step === 'done' ? (
          <section className={styles.done}>
            <p className={`${styles.doneTitle} t-h2`}>فرستاده شد</p>
            <p className={`${styles.hint} t-body`}>
              {sentCount > 0
                ? `${formatCount(sentCount)} پیامک رفت. همه خانواده‌ها در اپ هم می‌بینند.`
                : 'در اپ خانواده‌ها منتشر شد. پیامکی فرستاده نشد.'}
            </p>
          </section>
        ) : null}

        {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}
      </div>

      <div className={styles.bar}>
        {step === 'write' ? (
          <button
            type="button"
            className={`${styles.primary} t-body-lg`}
            disabled={!ready || busy}
            onClick={() => void review()}
          >
            بررسی پیش از ارسال
          </button>
        ) : null}
        {step === 'confirm' ? (
          <>
            <button type="button" className={`${styles.secondary} t-body`} onClick={() => setStep('write')}>
              بازگشت و ویرایش
            </button>
            <button
              type="button"
              className={`${styles.primary} t-body-lg`}
              disabled={busy}
              onClick={() => void publish()}
            >
              تأیید و ارسال
            </button>
          </>
        ) : null}
        {step === 'done' ? (
          <button type="button" className={`${styles.primary} t-body-lg`} onClick={onBack}>
            بازگشت به داشبورد
          </button>
        ) : null}
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className={styles.section} aria-label={label}>
      <span className={`${styles.sectionLabel} t-caption`}>{label}</span>
      {children}
    </section>
  )
}

/** تاریخ محلی، نه UTC — وگرنه شب‌ها یک روز جلو می‌افتد. */
function toLocalIso(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
