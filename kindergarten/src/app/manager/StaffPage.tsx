import { useCallback, useEffect, useState } from 'react'
import { AlertIcon, EmptyState } from '../../design-system/index.ts'
import { formatCount, formatJalali, parseJalaliInput, toIsoDate } from '../../i18n/index.ts'
import { useData } from '../../core/auth/index.ts'
import type {
  StaffCartableRow,
  StaffDocumentKind,
  StaffNoteKind,
  StaffProfile,
} from '../../core/data/index.ts'
import styles from './StaffPage.module.css'

/**
 * کارتابل کارکنان — ماژول ۰۰۲۲ و ۰۰۲۴.
 *
 * خواسته مالک محصول: «عملکرد مربی‌ها توسط مدیر چگونه ارزیابی میشه … یعنی
 * مربی ها دارای پروفایل باشند در کارتابل مدیر» و «تصاویر گواهینامه مربی
 * ها بشه آپلود کرد … و بشه خروجی گرفت برای بازرس».
 *
 * سه قاعده که این صفحه نمی‌شکند:
 *
 * ۱. **هیچ نمره، رتبه یا مقایسه‌ای بین مربیان.** کارتابل فعالیت را
 *    می‌شمارد، نه کیفیت را. یک تست کل شِما را برای ستون امتیاز می‌گردد.
 *
 * ۲. **شمار رخداد، معیار عملکرد نیست و اینجا نمی‌آید.** اگر مربی ببیند
 *    ثبت رخداد به ضررش تمام می‌شود، کمتر ثبت می‌کند — و آسیبش به کودک
 *    می‌رسد، نه به مربی.
 *
 * ۳. **ارزیابیِ در میان گذاشته‌نشده، ارزیابی نیست.** صفحه مدیر را وادار
 *    نمی‌کند، ولی «با مربی در میان گذاشته نشده» را صریح نشان می‌دهد.
 */

const DOC_KINDS: { value: StaffDocumentKind; label: string; needsExpiry: boolean }[] = [
  { value: 'health_card', label: 'کارت بهداشت', needsExpiry: true },
  { value: 'degree', label: 'مدرک تحصیلی', needsExpiry: false },
  { value: 'training', label: 'گواهی دوره', needsExpiry: false },
  { value: 'national_id', label: 'کارت ملی', needsExpiry: false },
  { value: 'criminal_record', label: 'عدم سوءپیشینه', needsExpiry: true },
  { value: 'contract', label: 'قرارداد', needsExpiry: true },
  { value: 'other', label: 'سایر', needsExpiry: false },
]

const NOTE_KINDS: { value: StaffNoteKind; label: string }[] = [
  { value: 'commendation', label: 'تقدیر' },
  { value: 'review', label: 'ارزیابی دوره‌ای' },
  { value: 'training', label: 'دوره لازم' },
  { value: 'concern', label: 'نگرانی' },
]

const NOTE_LABEL: Record<string, string> = Object.fromEntries(
  NOTE_KINDS.map((k) => [k.value, k.label]),
)
const DOC_LABEL: Record<string, string> = Object.fromEntries(
  DOC_KINDS.map((k) => [k.value, k.label]),
)

export function StaffPage({ onBack }: { onBack: () => void }) {
  const data = useData()
  const [rows, setRows] = useState<StaffCartableRow[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [exported, setExported] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const to = toIsoDate(new Date())
    const from = new Date()
    from.setDate(from.getDate() - 30)
    try {
      setRows(await data.getStaffCartable(toIsoDate(from), to))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'خوانده نشد.')
      setRows([])
    }
  }, [data])

  useEffect(() => {
    void load()
  }, [load])

  if (openId) {
    return (
      <StaffFile
        staffId={openId}
        onBack={() => {
          setOpenId(null)
          void load()
        }}
      />
    )
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="بازگشت به داشبورد">
          <Chevron />
        </button>
        <span className={`${styles.title} t-h2`}>کارکنان</span>
      </header>

      <div className={styles.body}>
        {/*
          آنچه این صفحه عمداً نمی‌گوید: کدام مربی «بهتر» است.
          گفتنش یعنی ساختن معیاری که مربی برای بهتر شدنش، کار واقعی را
          کنار بگذارد.
        */}
        <p className={`${styles.muted} t-caption`}>
          فعالیت سی روز گذشته. این ارقام کارِ ثبت‌شده را می‌شمارند، نه کیفیت کار را —
          و بین مربیان مقایسه نمی‌شوند.
        </p>

        {rows === null ? (
          <EmptyState text="در حال خواندن…" />
        ) : rows.length === 0 ? (
          <EmptyState text="کارکنی ثبت نشده." />
        ) : (
          <ul className={styles.list}>
            {rows.map((row) => (
              <li key={row.staffId}>
                <button type="button" className={styles.item} onClick={() => setOpenId(row.staffId)}>
                  <span className={styles.main}>
                    <span className={`${styles.name} t-body`}>{row.fullName}</span>
                    <span className={`${styles.stats} t-caption`}>
                      {formatCount(row.daysActive)} روز فعال ·{' '}
                      {formatCount(row.checkIns)} ورود ثبت‌شده
                    </span>
                    {row.lastReview ? (
                      <span className={`${styles.muted} t-caption`}>
                        آخرین ارزیابی: {formatJalali(new Date(row.lastReview), 'short')}
                      </span>
                    ) : (
                      <span className={`${styles.needsReview} t-caption`}>
                        هنوز ارزیابی نشده
                      </span>
                    )}
                  </span>
                  {/*
                    مدرک منقضی، تنها هشدار این فهرست است — چون تنها چیزی
                    است که روز بازرسی تبدیل به تخلف می‌شود.
                  */}
                  {row.documentsExpired > 0 ? (
                    <span className={`${styles.flag} ${styles.flagBad}`}>
                      {formatCount(row.documentsExpired)} مدرک منقضی
                    </span>
                  ) : row.documentsExpiring > 0 ? (
                    <span className={styles.flag}>
                      {formatCount(row.documentsExpiring)} مدرک رو به انقضا
                    </span>
                  ) : null}
                  <Chevron flip />
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          className={styles.action}
          onClick={() => void data.exportStaffFile().then(setExported).catch(() => setExported(null))}
        >
          خروجی پرونده کارکنان برای بازرس
        </button>

        {exported ? (
          <section className={styles.export} aria-label="خروجی پرونده کارکنان">
            <pre className={styles.exportText}>{exported}</pre>
          </section>
        ) : null}

        {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}
      </div>
    </div>
  )
}

/* ── پرونده یک مربی ─────────────────────────────────────────── */

function StaffFile({ staffId, onBack }: { staffId: string; onBack: () => void }) {
  const data = useData()
  const [file, setFile] = useState<StaffProfile | null>(null)
  const [adding, setAdding] = useState<'doc' | 'note' | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setFile(await data.getStaffProfile(staffId))
    } catch {
      setFile(null)
    }
  }, [data, staffId])

  useEffect(() => {
    void load()
  }, [load])

  if (!file) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <button type="button" className={styles.back} onClick={onBack} aria-label="بازگشت به فهرست کارکنان">
            <Chevron />
          </button>
          <span className={`${styles.title} t-h2`}>پرونده مربی</span>
        </header>
        <EmptyState text="در حال خواندن…" />
      </div>
    )
  }

  const today = toIsoDate(new Date())

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="بازگشت به فهرست کارکنان">
          <Chevron />
        </button>
        <span className={`${styles.title} t-h2`}>{file.fullName}</span>
      </header>

      <div className={styles.body}>
        {note ? <p className={`${styles.note} t-body`}>{note}</p> : null}

        <section className={styles.card}>
          <span className={`${styles.cardLabel} t-caption`}>مشخصات</span>
          <p className={`${styles.row} t-body`}>
            <span>نقش</span>
            <b>{file.role}</b>
          </p>
          <p className={`${styles.row} t-body`}>
            <span>کلاس‌ها</span>
            <b>{file.classNames.join('، ') || '—'}</b>
          </p>
          {/*
            شماره تلفن عمداً نیست. پرونده کارکنان جای افشای شماره نیست؛
            برای تماس، گفتگوی درون‌اپ هست.
          */}
        </section>

        <section className={styles.card}>
          <span className={`${styles.cardLabel} t-caption`}>مدارک</span>
          {file.documents.length === 0 ? (
            <p className={`${styles.muted} t-body`}>هنوز مدرکی بارگذاری نشده.</p>
          ) : (
            file.documents.map((doc) => {
              const expired = doc.expiresAt !== null && doc.expiresAt < today
              return (
                <p key={doc.id} className={`${styles.row} t-body`}>
                  <span>{doc.title}</span>
                  <span className={styles.muted}>{DOC_LABEL[doc.kind] ?? doc.kind}</span>
                  {doc.expiresAt ? (
                    <b className={expired ? styles.expired : undefined}>
                      {expired ? 'منقضی ' : 'تا '}
                      {formatJalali(new Date(doc.expiresAt), 'short')}
                    </b>
                  ) : (
                    <b className={styles.muted}>بدون انقضا</b>
                  )}
                </p>
              )
            })
          )}
          <button type="button" className={styles.action} onClick={() => setAdding('doc')}>
            بارگذاری مدرک
          </button>
        </section>

        <section className={styles.card}>
          <span className={`${styles.cardLabel} t-caption`}>یادداشت‌ها و ارزیابی</span>
          {file.notes.length === 0 ? (
            <p className={`${styles.muted} t-body`}>هنوز یادداشتی ثبت نشده.</p>
          ) : (
            file.notes.map((n) => (
              <article key={n.id} className={styles.noteRow}>
                <p className={`${styles.noteTop} t-body`}>
                  <b>{NOTE_LABEL[n.kind] ?? n.kind}</b>
                  <span className={styles.muted}>
                    {formatJalali(new Date(n.writtenAt), 'short')}
                  </span>
                </p>
                <p className={`${styles.noteBody} t-body`}>{n.body}</p>
                {/*
                  ارزیابی‌ای که مربی هرگز نمی‌بیند، ارزیابی نیست؛
                  پرونده‌سازی است. اپ وادار نمی‌کند، ولی سکوت را می‌گوید.
                */}
                <p className={`${n.sharedAt ? styles.shared : styles.unshared} t-caption`}>
                  {n.sharedAt ? 'با مربی در میان گذاشته شده' : 'با مربی در میان گذاشته نشده'}
                </p>
              </article>
            ))
          )}
          <button type="button" className={styles.action} onClick={() => setAdding('note')}>
            ثبت یادداشت یا ارزیابی
          </button>
        </section>

        <section className={styles.card}>
          <span className={`${styles.cardLabel} t-caption`}>فعالیت سی روز گذشته</span>
          <p className={`${styles.row} t-body`}>
            <span>روز فعال</span>
            <b>{formatCount(file.activity.daysActive)}</b>
          </p>
          <p className={`${styles.row} t-body`}>
            <span>ورود ثبت‌شده</span>
            <b>{formatCount(file.activity.checkIns)}</b>
          </p>
          <p className={`${styles.row} t-body`}>
            <span>خروج ثبت‌شده</span>
            <b>{formatCount(file.activity.checkOuts)}</b>
          </p>
          <p className={`${styles.muted} t-caption`}>
            «روز فعال» یعنی روزی که این مربی دست‌کم یک ثبت کرده. جایگزین حضور و غیاب
            پرسنل نیست: مربی‌ای که تمام روز بوده و چیزی ثبت نکرده، اینجا صفر می‌خورد.
          </p>
        </section>
      </div>

      {adding === 'doc' ? (
        <DocumentSheet
          staffId={staffId}
          onClose={() => setAdding(null)}
          onDone={async (title) => {
            setAdding(null)
            setNote(`«${title}» بارگذاری شد.`)
            await load()
          }}
        />
      ) : null}

      {adding === 'note' ? (
        <NoteSheet
          staffId={staffId}
          onClose={() => setAdding(null)}
          onDone={async (shared) => {
            setAdding(null)
            setNote(
              shared
                ? 'یادداشت ثبت و با مربی در میان گذاشته شد.'
                : 'یادداشت ثبت شد — هنوز با مربی در میان گذاشته نشده.',
            )
            await load()
          }}
        />
      ) : null}
    </div>
  )
}

/* ── شیت بارگذاری مدرک ──────────────────────────────────────── */

function DocumentSheet({ staffId, onClose, onDone }: {
  staffId: string
  onClose: () => void
  onDone: (title: string) => Promise<void>
}) {
  const data = useData()
  const [kind, setKind] = useState<StaffDocumentKind>('health_card')
  const [title, setTitle] = useState('')
  const [expires, setExpires] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const needsExpiry = DOC_KINDS.find((k) => k.value === kind)?.needsExpiry ?? false

  const submit = async () => {
    /*
     * تاریخ جلالی، میلادی می‌شود — پیش از ذخیره.
     *
     * ستون انقضا با تاریخ امروز مقایسه می‌شود؛ رشته جلالیِ خام یعنی
     * «مدرک منقضی» هرگز درست درنمی‌آید، و کل ارزش آن ستون همین مقایسه
     * است. تاریخی که خوانده نشود، رد می‌شود نه حدس زده.
     */
    const typed = expires.trim()
    const iso = typed ? parseJalaliInput(typed) : null
    if (typed && iso === null) {
      setError('تاریخ خوانده نشد. به شکل ۱۴۰۵-۱۲-۲۹ بنویسید.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      await data.uploadStaffDocument({
        staffId,
        kind,
        title: title.trim() || (DOC_LABEL[kind] ?? 'مدرک'),
        // تا وصل شدن استوریج، نشانی محلی مرورگر است.
        fileUrl: 'demo-document',
        expiresAt: iso,
      })
      await onDone(title.trim() || (DOC_LABEL[kind] ?? 'مدرک'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'بارگذاری نشد.')
      setBusy(false)
    }
  }

  return (
    <div className={styles.sheetBackdrop} role="dialog" aria-label="بارگذاری مدرک">
      <div className={styles.sheet}>
        <p className={`${styles.sheetTitle} t-h2`}>بارگذاری مدرک</p>

        <fieldset className={styles.choices}>
          <legend className={`${styles.muted} t-caption`}>نوع مدرک</legend>
          {DOC_KINDS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={styles.choice}
              aria-pressed={kind === option.value}
              onClick={() => setKind(option.value)}
            >
              {option.label}
            </button>
          ))}
        </fieldset>

        <label className={`${styles.field} t-caption`}>
          عنوان
          <input
            className={styles.input}
            value={title}
            aria-label="عنوان مدرک"
            placeholder={DOC_LABEL[kind]}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        {/*
          تاریخ انقضا برای مدرکی که دارد، اجباری نیست ولی خواسته می‌شود.
          کل ارزش این جدول همین ستون است: مدرکی که تاریخ انقضا دارد و
          کسی نگاهش نمی‌کند، روز بازرسی تبدیل به تخلف می‌شود.
        */}
        <label className={`${styles.field} t-caption`}>
          {needsExpiry ? 'اعتبار تا (۱۴۰۵-۰۶-۳۱)' : 'اعتبار تا — اختیاری'}
          <input
            className={styles.input}
            value={expires}
            inputMode="numeric"
            aria-label="تاریخ انقضای مدرک"
            placeholder="۱۴۰۵-۰۶-۳۱"
            onChange={(event) => setExpires(event.target.value)}
          />
        </label>

        {error ? <p className={`${styles.error} t-caption`}>{error}</p> : null}

        <div className={styles.sheetActions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            انصراف
          </button>
          <button
            type="button"
            className={`${styles.primary} t-body`}
            disabled={busy}
            onClick={() => void submit()}
          >
            بارگذاری
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── شیت یادداشت ────────────────────────────────────────────── */

function NoteSheet({ staffId, onClose, onDone }: {
  staffId: string
  onClose: () => void
  onDone: (shared: boolean) => Promise<void>
}) {
  const data = useData()
  const [kind, setKind] = useState<StaffNoteKind>('review')
  const [body, setBody] = useState('')
  const [share, setShare] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await data.addStaffNote({ staffId, kind, body, share })
      await onDone(share)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
      setBusy(false)
    }
  }

  return (
    <div className={styles.sheetBackdrop} role="dialog" aria-label="ثبت یادداشت">
      <div className={styles.sheet}>
        <p className={`${styles.sheetTitle} t-h2`}>یادداشت یا ارزیابی</p>

        <fieldset className={styles.choices}>
          <legend className={`${styles.muted} t-caption`}>نوع</legend>
          {NOTE_KINDS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={styles.choice}
              aria-pressed={kind === option.value}
              onClick={() => setKind(option.value)}
            >
              {option.label}
            </button>
          ))}
        </fieldset>

        <label className={`${styles.field} t-caption`}>
          متن
          <textarea
            className={styles.textarea}
            value={body}
            rows={4}
            aria-label="متن یادداشت"
            onChange={(event) => setBody(event.target.value)}
          />
        </label>

        {/*
          پیش‌فرض «در میان گذاشته شود» است، و عمدی.
          ارزیابی‌ای که مربی هرگز نمی‌بیند، ارزیابی نیست.
        */}
        <label className={`${styles.check} t-body`}>
          <input
            type="checkbox"
            checked={share}
            onChange={(event) => setShare(event.target.checked)}
          />
          با خود مربی در میان گذاشته شود
        </label>
        {!share ? (
          <p className={`${styles.warn} t-caption`}>
            <AlertIcon size={16} />
            یادداشتی که مربی نمی‌بیند، در پرونده‌اش می‌ماند ولی فرصت پاسخ یا اصلاح ندارد.
          </p>
        ) : null}

        {error ? <p className={`${styles.error} t-caption`}>{error}</p> : null}

        <div className={styles.sheetActions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            انصراف
          </button>
          <button
            type="button"
            className={`${styles.primary} t-body`}
            disabled={busy || body.trim().length === 0}
            onClick={() => void submit()}
          >
            ثبت
          </button>
        </div>
      </div>
    </div>
  )
}

function Chevron({ flip }: { flip?: boolean }) {
  return (
    <svg className="mirror" width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={flip ? 'm9 18 6-6-6-6' : 'm15 18-6-6 6-6'} />
    </svg>
  )
}
