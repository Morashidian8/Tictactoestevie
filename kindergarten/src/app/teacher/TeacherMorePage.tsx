import { useCallback, useEffect, useState } from 'react'
import {
  AlertIcon,
  BottomSheet,
  ChoiceGroup,
  EmptyState,
  JalaliDateField,
} from '../../design-system/index.ts'
import { formatCount, formatJalali, toIsoDate } from '../../i18n/index.ts'
import { ROLE_LABEL, useAuth, useData } from '../../core/auth/index.ts'
import type { LeaveKind, LeaveRequest, StaffProfile } from '../../core/data/index.ts'
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

const LEAVE_KINDS: { value: LeaveKind; label: string }[] = [
  { value: 'personal', label: 'شخصی' },
  { value: 'sick', label: 'بیماری' },
  { value: 'family', label: 'خانوادگی' },
  { value: 'other', label: 'سایر' },
]

const LEAVE_KIND_TEXT: Record<string, string> = Object.fromEntries(
  LEAVE_KINDS.map((k) => [k.value, k.label]),
)

const LEAVE_STATE_TEXT: Record<LeaveRequest['state'], string> = {
  pending: 'در انتظار تأیید مدیر',
  approved: 'تأیید شد',
  rejected: 'رد شد',
}

export function TeacherMorePage({ classId, onOpenChild, onOpenPlay }: {
  classId: string | null
  /** رفتن به مشاهده‌ها و گزارش ماهانه یک کودک. */
  onOpenChild: (childId: string, childName: string) => void
  onOpenPlay: () => void
}) {
  const data = useData()
  const { session } = useAuth()
  const [file, setFile] = useState<StaffProfile | null>(null)
  const [children, setChildren] = useState<{ id: string; name: string }[]>([])
  const [leave, setLeave] = useState<LeaveRequest[] | null>(null)
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    data.getMyStaffFile().then(setFile).catch(() => setFile(null))
  }, [data])

  const loadLeave = useCallback(() => {
    data.listMyLeave().then(setLeave).catch(() => setLeave([]))
  }, [data])

  useEffect(() => {
    loadLeave()
  }, [loadLeave])

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
      {/*
        بازی آزاد، بالای فهرست.
        روزی یک ثبتِ بیست‌ثانیه‌ای است و خوراک نقشه علایقِ گزارش ماهانه؛
        پنهان کردنش ته فهرست یعنی رها شدنش.
      */}
      <section className={styles.card}>
        <span className={`${styles.label} t-caption`}>بازی آزاد</span>
        {/*
          کلاس جدا از ردیف کودکان، و عمدی: این یک کنش است نه یک کودک.
          هم‌کلاس بودنشان یک بار باعث شد تست، دکمه بازی آزاد را به‌جای
          اولین کودک بزند.
        */}
        <button type="button" className={`${styles.actionRow} t-body`} onClick={onOpenPlay}>
          ثبت انتخاب گوشه‌ها
        </button>
        <p className={`${styles.muted} t-caption`}>
          روزی یک ثبت کافی است. همین داده، نقشه علایقِ گزارش ماهانه را می‌سازد.
        </p>
      </section>

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

      {/*
        مرخصی — درخواست و تاریخچه.

        تا امروز راهش تلگرام و تماس بود: هیچ ردی نمی‌ماند، و مدیری که
        صبح شیفت را می‌چیند نمی‌دانست چند نفر کم دارد.

        «درخواست» است نه «اعلام»: تا مدیر تأیید نکند، مرخصی نیست و
        هیچ‌جای برنامه دیده نمی‌شود. متن وضعیت همین را می‌گوید تا مربی
        فردا غافلگیر نشود.
      */}
      <section className={styles.card}>
        <span className={`${styles.label} t-caption`}>مرخصی</span>
        <button type="button" className={`${styles.actionRow} t-body`} onClick={() => setAsking(true)}>
          درخواست مرخصی
        </button>
        {leave === null ? (
          <p className={`${styles.muted} t-body`}>در حال خواندن…</p>
        ) : leave.length === 0 ? (
          <p className={`${styles.muted} t-body`}>هنوز درخواستی نداده‌اید.</p>
        ) : (
          leave.map((row) => (
            <article key={row.id} className={styles.note}>
              <p className={`${styles.noteTop} t-body`}>
                <b>
                  {formatJalali(new Date(row.starts), 'short')}
                  {row.days > 1 ? ` تا ${formatJalali(new Date(row.ends), 'short')}` : ''}
                </b>
                <span
                  className={row.state === 'rejected' ? styles.expired : styles.muted}
                >
                  {LEAVE_STATE_TEXT[row.state]}
                </span>
              </p>
              <p className={`${styles.muted} t-caption`}>
                {LEAVE_KIND_TEXT[row.kind] ?? row.kind} · {formatCount(row.days)} روز
              </p>
              {/*
                دلیلِ رد، همین‌جا و کنار خودِ درخواست.
                مربی‌ای که بی دلیل «نه» می‌شنود، دفعه بعد اصلاً درخواست
                نمی‌دهد و همان روز غیبت می‌کند.
              */}
              {row.decisionNote ? (
                <p className={`${styles.row} t-body`}>{row.decisionNote}</p>
              ) : null}
            </article>
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

      {asking ? (
        <LeaveSheet
          onClose={() => setAsking(false)}
          onDone={() => {
            setAsking(false)
            loadLeave()
          }}
        />
      ) : null}
    </div>
  )
}

/* ── شیت درخواست مرخصی ──────────────────────────────────────── */

function LeaveSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const data = useData()
  const [kind, setKind] = useState<LeaveKind>('personal')
  const [starts, setStarts] = useState<string | null>(toIsoDate(new Date()))
  /* پایان عمداً خالی می‌ماند: خالی یعنی همان یک روز، که حالت غالب است. */
  const [ends, setEnds] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!starts) {
      setError('روز مرخصی را از تقویم انتخاب کنید.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await data.requestLeave({ kind, starts, ends: ends ?? starts, reason })
      onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
      setBusy(false)
    }
  }

  return (
    /*
     * شیتِ مشترک، نه پس‌زمینه و کارتِ ساختِ همین صفحه.
     *
     * نسخه اولِ همین فایل کلاس‌های `sheet`/`field`/`primary` را صدا زد
     * که در CSS این صفحه وجود ندارند — و CSS Modules برای کلاس ناموجود
     * `undefined` می‌دهد، یعنی شیتی بی‌استایل که نه تایپ‌اسکریپت
     * می‌گیردش نه تست. همان باگی که در فرم مدرک مربی دیده شد.
     */
    <BottomSheet
      title="درخواست مرخصی"
      onClose={onClose}
      footer={
        <button
          type="button"
          className={`${styles.actionRow} t-body-lg`}
          onClick={() => void submit()}
          disabled={busy}
        >
          فرستادن برای مدیر
        </button>
      }
    >
      <ChoiceGroup label="نوع" options={LEAVE_KINDS} value={kind} onChange={setKind} />

      <JalaliDateField label="از روز" value={starts} onChange={setStarts} allowClear={false} />
      <JalaliDateField label="تا روز — خالی یعنی همان یک روز" value={ends} onChange={setEnds} />

      <label className={`${styles.leaveField} t-caption`}>
        توضیح برای مدیر
        <textarea
          className={styles.leaveText}
          rows={3}
          value={reason}
          aria-label="توضیح مرخصی"
          onChange={(event) => setReason(event.target.value)}
        />
      </label>

      <p className={`${styles.muted} t-caption`}>
        تا تأیید مدیر، این مرخصی نیست. جوابش را همین‌جا می‌بینید.
      </p>

      {error ? <p className={`${styles.warn} t-caption`}>{error}</p> : null}
    </BottomSheet>
  )
}
