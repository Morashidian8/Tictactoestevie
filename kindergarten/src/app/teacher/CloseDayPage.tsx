import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertIcon, CheckIcon, QuickAction } from '../../design-system/index.ts'
import { formatClock, formatCount, formatJalali, formatTime, toIsoDate } from '../../i18n/index.ts'
import { useAuth, useData } from '../../core/auth/index.ts'
import type { Child, DaySummary } from '../../core/data/index.ts'
import styles from './CloseDayPage.module.css'

/**
 * صفحه بستن روز — بخش ۵.۹ سند.
 *
 * «مهم‌ترین معیار، آخرینِ فهرست نیست؛ ارسال ۱۰۰٪ گزارش‌های روزانه است.
 * یک روز که گزارش نرود، خانواده‌ها به مدیر شکایت می‌کنند و اعتماد مدیر
 * به محصول می‌شکند.» (بخش ۱۷)
 *
 * پس این صفحه فقط شمارش نیست؛ کارش این است که مربی بدون تردید دکمه را
 * بزند. هر سطر می‌گوید چه چیزی کم است و راه رفعش کجاست.
 *
 * پس از ارسال، گزارش‌ها قفل می‌شوند و تغییر بعدی فقط اصلاحیه است.
 */

/** ساعت ارسال خودکار. پیش‌فرض سند، تا تنظیمات مهد وصل شود. */
const AUTO_SEND_AT = '17:30'

type Props = { onBack: () => void; onFixReports: () => void }

export function CloseDayPage({ onBack, onFixReports }: Props) {
  const data = useData()
  const { queue } = useAuth()

  const [classId, setClassId] = useState<string | null>(null)
  const [children, setChildren] = useState<Child[]>([])
  const [summary, setSummary] = useState<DaySummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const date = useMemo(() => toIsoDate(new Date()), [])

  useEffect(() => {
    data
      .listClasses()
      .then((list) => setClassId((current) => current ?? list[0]?.id ?? null))
      .catch((cause: unknown) => setError(messageOf(cause)))
  }, [data])

  const load = useCallback(async () => {
    if (!classId) return
    try {
      const [day, next] = await Promise.all([
        data.getClassDay(classId, date),
        data.getDaySummary(classId, date),
      ])
      setChildren(day.children)
      setSummary(next)
    } catch (cause) {
      setError(messageOf(cause))
    }
  }, [classId, data, date])

  useEffect(() => {
    void load()
  }, [load])

  const nameOf = (id: string) => children.find((c) => c.id === id)?.firstName ?? ''

  const send = () => {
    if (!classId) return
    setBusy(true)
    setError(null)
    void queue
      .submit('text', () => data.sendReports(classId, date))
      .then(() => load())
      .catch((cause: unknown) => setError(messageOf(cause)))
      .finally(() => setBusy(false))
  }

  const sentAt = summary?.sentAt ? new Date(summary.sentAt) : null

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="بازگشت به امروز">
          <svg className="mirror" width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <span className={`${styles.title} t-body-lg`}>پایان روز</span>
        <span className="t-body-lg" style={{ color: 'var(--ink-muted)' }}>
          {formatJalali(new Date(), 'short')}
        </span>
      </header>

      <div className={styles.body}>
        {sentAt ? (
          <div className={styles.sent}>
            <span className={`${styles.sentTitle} t-body-lg`}>
              گزارش‌های امروز ساعت {formatTime(sentAt)} فرستاده شد.
            </span>
            <span className="t-body">
              از این پس تغییر فقط به شکل اصلاحیه ثبت می‌شود، و سرپرست اصلاحیه را می‌بیند.
            </span>
          </div>
        ) : null}

        {/*
          تیک سبز کنار عدد صفر، علامت غلط می‌دهد. سبز فقط وقتی است که
          واقعاً چیزی کامل شده باشد.
        */}
        <Line
          tone={(summary?.complete.length ?? 0) > 0 ? 'ok' : 'warn'}
          text={`${formatCount(summary?.complete.length ?? 0)} گزارش کامل`}
        />

        {summary && summary.incomplete.length > 0 ? (
          <>
            <Line
              tone="warn"
              text={`${formatCount(summary.incomplete.length)} گزارش ناقص`}
              action={sentAt ? undefined : { label: 'تکمیل', onClick: onFixReports }}
            />
            <p className={`${styles.names} t-caption`}>
              {summary.incomplete
                .slice(0, 6)
                .map((row) => `${nameOf(row.childId)} (${row.missing.join('، ')})`)
                .join(' · ')}
              {summary.incomplete.length > 6
                ? ` و ${formatCount(summary.incomplete.length - 6)} کودک دیگر`
                : ''}
            </p>
          </>
        ) : null}

        {summary && summary.untaggedPhotos > 0 ? (
          <Line tone="warn" text={`${formatCount(summary.untaggedPhotos)} عکس بدون تگ`} />
        ) : null}

        {summary && summary.withoutNoteThisWeek.length > 0 ? (
          <>
            <Line
              tone="warn"
              text={`${formatCount(summary.withoutNoteThisWeek.length)} کودک بدون یادداشت این هفته`}
            />
            <p className={`${styles.names} t-caption`}>
              {summary.withoutNoteThisWeek.slice(0, 8).map(nameOf).join(' · ')}
              {summary.withoutNoteThisWeek.length > 8
                ? ` و ${formatCount(summary.withoutNoteThisWeek.length - 8)} کودک دیگر`
                : ''}
            </p>
          </>
        ) : null}

        {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}

        {!sentAt ? (
          <p className={`${styles.autoSend} t-caption`}>
            اگر نزنید، ساعت {formatClock(AUTO_SEND_AT)} خودکار فرستاده می‌شود.
          </p>
        ) : null}
      </div>

      <QuickAction onClick={send} disabled={busy || Boolean(sentAt)}>
        {sentAt ? 'فرستاده شد' : 'ارسال گزارش‌های امروز'}
      </QuickAction>
    </div>
  )
}

function Line({
  tone,
  text,
  action,
}: {
  tone: 'ok' | 'warn'
  text: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className={styles.line}>
      <span className={`${styles.lineIcon} ${styles[tone]}`} aria-hidden>
        {tone === 'ok' ? <CheckIcon size={20} /> : <AlertIcon size={20} />}
      </span>
      <span className={`${styles.lineText} t-body-lg`}>{text}</span>
      {action ? (
        <button type="button" className={`${styles.lineAction} t-body`} onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  )
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'خوانده نشد.'
}
