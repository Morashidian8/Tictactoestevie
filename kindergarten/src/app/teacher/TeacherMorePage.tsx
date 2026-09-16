import { useEffect, useState } from 'react'
import { AlertIcon, EmptyState } from '../../design-system/index.ts'
import { formatCount, formatJalali, toIsoDate } from '../../i18n/index.ts'
import { ROLE_LABEL, useAuth, useData } from '../../core/auth/index.ts'
import type { StaffProfile } from '../../core/data/index.ts'
import styles from './TeacherMorePage.module.css'

/**
 * «بیشتر» پنل مربی — پروفایل خودش.
 *
 * چرا این صفحه وجود دارد: نوار پایین هر سه پنل حالا پنج خانه دارد و
 * خانه چهارم در پنل والد «بیشتر» است. خالی گذاشتنش در پنل مربی یعنی
 * دکمه‌ای که کار نمی‌کند — و دکمه مرده بدتر از نبودن دکمه است.
 *
 * آنچه اینجا **نیست** و عمدی است: هیچ عددی درباره عملکرد خود مربی.
 * شمار رویداد و گزارش، معیار ارزیابی نیست؛ اگر مربی ببیند رویداد ثبت
 * کردن به ضررش تمام می‌شود، کمتر ثبت می‌کند و آسیب به کودک می‌رسد.
 */
const NOTE_LABEL: Record<string, string> = {
  commendation: 'تقدیر',
  review: 'ارزیابی دوره‌ای',
  training: 'دوره لازم',
  concern: 'نکته‌ای برای بهتر شدن',
}

export function TeacherMorePage({ classId, onOpenChild }: {
  classId: string | null
  /** رفتن به مشاهده‌ها و گزارش ماهانه یک کودک. */
  onOpenChild: (childId: string, childName: string) => void
}) {
  const data = useData()
  const { session } = useAuth()
  const [file, setFile] = useState<StaffProfile | null>(null)
  const [children, setChildren] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    data.getMyStaffFile().then(setFile).catch(() => setFile(null))
  }, [data])

  useEffect(() => {
    if (!classId) return
    data
      .getClassDay(classId, toIsoDate(new Date()))
      .then((day) =>
        setChildren(
          day.children.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}` })),
        ),
      )
      .catch(() => setChildren([]))
  }, [data, classId])

  const me = session?.active
  if (!me) return <EmptyState text="در حال خواندن…" />

  const today = toIsoDate(new Date())
  const expiring = (file?.documents ?? []).filter(
    (d) => d.expiresAt !== null && d.expiresAt < today,
  )

  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <span className={`${styles.label} t-caption`}>حساب من</span>
        <p className={`${styles.name} t-h2`}>{me.displayName}</p>
        <p className={`${styles.muted} t-body`}>{ROLE_LABEL[me.role]}</p>
      </section>

      {/*
        مشاهده‌ها و گزارش ماهانه، از اینجا.

        عمداً روی خودِ شبکه کودکانِ «امروز» ننشست: آنجا ضربه یعنی ثبت
        ورود یا خروج، و آن مسیر باید سریع‌ترین چیز پنل بماند.
      */}
      <section className={styles.card}>
        <span className={`${styles.label} t-caption`}>مشاهده و گزارش ماهانه</span>
        {children.length === 0 ? (
          <p className={`${styles.muted} t-body`}>کودکی در کلاس امروز نیست.</p>
        ) : (
          children.map((child) => (
            <button
              key={child.id}
              type="button"
              className={`${styles.childRow} t-body`}
              onClick={() => onOpenChild(child.id, child.name)}
            >
              {child.name}
            </button>
          ))
        )}
      </section>

      <section className={styles.card}>
        <span className={`${styles.label} t-caption`}>کلاس‌های من</span>
        {file === null ? (
          <p className={`${styles.muted} t-body`}>در حال خواندن…</p>
        ) : file.classNames.length === 0 ? (
          <p className={`${styles.muted} t-body`}>هنوز کلاسی به شما داده نشده.</p>
        ) : (
          file.classNames.map((name) => (
            <p key={name} className={`${styles.row} t-body`}>
              {name}
            </p>
          ))
        )}
      </section>

      {/*
        مدارک، از دید خودِ مربی.

        چرا اینجا هست و فقط در پنل مدیر نیست: مدرکی که منقضی شده، اول
        از همه مشکل خودِ مربی است. دیدنش در پنل مدیر یعنی مربی روز
        بازرسی خبردار شود.
      */}
      <section className={styles.card}>
        <span className={`${styles.label} t-caption`}>مدارک من</span>
        {expiring.length > 0 ? (
          <p className={`${styles.warn} t-body`}>
            <AlertIcon size={18} />
            {formatCount(expiring.length)} مدرک شما منقضی شده. به مدیر خبر بدهید.
          </p>
        ) : null}
        {file === null ? (
          <p className={`${styles.muted} t-body`}>در حال خواندن…</p>
        ) : file.documents.length === 0 ? (
          <p className={`${styles.muted} t-body`}>
            هنوز مدرکی برای شما ثبت نشده. بارگذاری مدارک کار مدیر است.
          </p>
        ) : (
          file.documents.map((doc) => {
            const expired = doc.expiresAt !== null && doc.expiresAt < today
            return (
              <p key={doc.id} className={`${styles.docRow} t-body`}>
                <span>{doc.title}</span>
                <b className={expired ? styles.expired : styles.muted}>
                  {doc.expiresAt
                    ? `${expired ? 'منقضی ' : 'تا '}${formatJalali(new Date(doc.expiresAt), 'short')}`
                    : 'بدون انقضا'}
                </b>
              </p>
            )
          })
        )}
      </section>

      {/*
        یادداشت‌های مدیر — فقط آن‌ها که با خودِ مربی در میان گذاشته شده.

        ارزیابی‌ای که مربی هرگز نمی‌بیند، ارزیابی نیست؛ پرونده‌سازی است.
        این بخش همان چیزی است که آن قاعده را واقعی می‌کند.
      */}
      <section className={styles.card}>
        <span className={`${styles.label} t-caption`}>بازخورد مدیر</span>
        {file === null ? (
          <p className={`${styles.muted} t-body`}>در حال خواندن…</p>
        ) : file.notes.length === 0 ? (
          <p className={`${styles.muted} t-body`}>هنوز بازخوردی با شما در میان گذاشته نشده.</p>
        ) : (
          file.notes.map((note) => (
            <article key={note.id} className={styles.note}>
              <p className={`${styles.noteTop} t-body`}>
                <b>{NOTE_LABEL[note.kind] ?? note.kind}</b>
                <span className={styles.muted}>
                  {formatJalali(new Date(note.writtenAt), 'short')}
                </span>
              </p>
              <p className={`${styles.row} t-body`}>{note.body}</p>
            </article>
          ))
        )}
      </section>

      {/*
        آنچه عمداً اینجا نیست: هیچ عددی درباره عملکرد خود مربی، و هیچ
        مقایسه‌ای با مربیان دیگر. شمار رخداد و گزارش، معیار ارزیابی
        نیست — اگر مربی ببیند ثبت رخداد به ضررش تمام می‌شود، کمتر ثبت
        می‌کند و آسیب به کودک می‌رسد.
      */}
      <p className={`${styles.muted} t-caption`}>
        برای خروج از حساب، کلید حساب کاربری در بالای صفحه.
      </p>
    </div>
  )
}
