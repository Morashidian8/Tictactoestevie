import { useCallback, useEffect, useState } from 'react'
import { AlertIcon, CheckIcon, EmptyState } from '../../design-system/index.ts'
import {
  formatClock,
  formatJalali,
  formatTime,
  toIsoDate,
  toLatinDigits,
  toPersianDigits,
} from '../../i18n/index.ts'
import { useData } from '../../core/auth/index.ts'
import type {
  MedicationRequest,
  MessageThread,
  Notice,
} from '../../core/data/index.ts'
import { ChildProfilePage } from './ChildProfilePage.tsx'
import { FinancePage } from './FinancePage.tsx'
import { MonthlyReportPage } from './MonthlyReportPage.tsx'
import styles from './MorePage.module.css'

/**
 * «بیشتر» در پنل خانواده — بخش ۶.۴.
 *
 * سند این‌ها را در یک فهرست ساده گذاشته و گفته «اعلام غیبت» بالای فهرست
 * باشد چون پرکاربردترین است. همان ترتیب رعایت شده.
 *
 * مالی فقط برای سرپرست پرداخت‌کننده دیده می‌شود — بخش ۶.۵. سایر
 * سرپرستان این بخش را اصلاً نمی‌بینند، نه اینکه خالی ببینند.
 */
type Tab = 'menu' | 'absence' | 'medication' | 'finance' | 'notices' | 'messages' | 'profile' | 'report'

export function MorePage({ childId, childName, onBack, initialTab = 'menu' }: {
  childId: string
  childName: string
  onBack: () => void
  /**
   * تبی که مستقیم باز می‌شود.
   *
   * نوار پایین، «پیام» و «اطلاعیه» را مقصد مستقل کرده. بی این، هر دو
   * پشت فهرست «بیشتر» می‌ماندند و یک ضربه دورتر — که کل دلیل وجود
   * نوار پایین را از بین می‌برد.
   */
  initialTab?: Tab
}) {
  const [tab, setTab] = useState<Tab>(initialTab)

  if (tab !== 'menu') {
    // اگر این تب مقصدِ نوار پایین بوده، «بازگشت» یعنی خانه، نه فهرست بیشتر.
    const back = initialTab === 'menu' ? () => setTab('menu') : onBack
    if (tab === 'absence') return <AbsenceTab childId={childId} childName={childName} onBack={back} />
    if (tab === 'medication') return <MedicationTab childId={childId} onBack={back} />
    if (tab === 'finance') return <FinancePage childId={childId} onBack={back} />
    if (tab === 'profile') {
      return <ChildProfilePage childId={childId} childName={childName} onBack={back} />
    }
    if (tab === 'report') {
      return <MonthlyReportPage childId={childId} childName={childName} onBack={back} />
    }
    if (tab === 'notices') return <NoticesTab onBack={back} />
    return <MessagesTab childId={childId} onBack={back} />
  }

  return (
    <Shell title="بیشتر" onBack={onBack}>
      <ul className={styles.menu}>
        <MenuItem
          label="پرونده کودک"
          hint="اطلاعات و آلرژی‌ها — با تأیید مهد"
          onClick={() => setTab('profile')}
        />
        <MenuItem
          label="گزارش ماهانه"
          hint="آنچه مربی این ماه دیده"
          onClick={() => setTab('report')}
        />
        <MenuItem label="اعلام غیبت" hint="وقتی کودک فردا نمی‌آید" onClick={() => setTab('absence')} />
        <MenuItem
          label="درخواست مصرف دارو"
          hint="از شب قبل بنویسید، مربی صبح تحویل می‌گیرد"
          onClick={() => setTab('medication')}
        />
        <MenuItem label="پیام به مربی" hint="در ساعت کاری مهد" onClick={() => setTab('messages')} />
        {/*
          مالی از این فهرست برداشته شد چون به نوار پایین رفت. ماندنش
          اینجا یعنی دو راه به یک صفحه، و کاربر نمی‌داند کدام تازه‌تر است.
        */}
        <MenuItem label="اطلاعیه‌ها" hint="پیام‌های مهد" onClick={() => setTab('notices')} />
      </ul>
    </Shell>
  )
}

function MenuItem({ label, hint, onClick }: { label: string; hint: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" className={styles.menuItem} onClick={onClick}>
        <span className={styles.menuMain}>
          <span className={`${styles.menuLabel} t-body`}>{label}</span>
          <span className={`${styles.menuHint} t-caption`}>{hint}</span>
        </span>
        <Chevron flip />
      </button>
    </li>
  )
}

/* ── درخواست مصرف دارو — ارتقای ۳ سند بررسی طراحی ────────────── */

/**
 * خانواده از شب قبل دارو را اعلام می‌کند.
 *
 * قاعده‌ای که این صفحه باید صادقانه بگوید و می‌گوید:
 * **اعلام کردن، تحویل دادن نیست.** والد می‌تواند فرم را پر کند و شیشه
 * دارو را در خانه جا بگذارد. پس صفحه وعده نمی‌دهد که دارو داده می‌شود؛
 * می‌گوید مربی باید تحویلش بگیرد، و وضعیت زنده را نشان می‌دهد.
 */
function MedicationTab({ childId, onBack }: { childId: string; onBack: () => void }) {
  const data = useData()
  const [list, setList] = useState<MedicationRequest[]>([])
  const [name, setName] = useState('')
  const [dose, setDose] = useState('')
  const [times, setTimes] = useState<string[]>([''])
  const [days, setDays] = useState<'today' | 'tomorrow' | 'week'>('tomorrow')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const from = (() => {
    const day = new Date()
    if (days !== 'today') day.setDate(day.getDate() + 1)
    return toIsoDate(day)
  })()
  const to = (() => {
    const day = new Date(`${from}T09:00:00`)
    if (days === 'week') day.setDate(day.getDate() + 6)
    return toIsoDate(day)
  })()

  const load = useCallback(async () => {
    try {
      // امروز و فردا هر دو مهم‌اند: چیزی که دیشب نوشته شده امروز جاری است.
      const today = toIsoDate(new Date())
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const [now, next] = await Promise.all([
        data.listMedicationRequests(childId, today),
        data.listMedicationRequests(childId, toIsoDate(tomorrow)),
      ])
      const seen = new Set<string>()
      setList([...now, ...next].filter((r) => !seen.has(r.id) && seen.add(r.id)))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'خوانده نشد.')
    }
  }, [data, childId])

  useEffect(() => {
    void load()
  }, [load])

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await data.requestMedication({
        childId,
        name,
        dose,
        times: times.map((t) => toLatinDigits(t.trim())).filter(Boolean),
        fromDate: from,
        toDate: to,
        note: note.trim() || null,
      })
      setName(''); setDose(''); setTimes(['']); setNote('')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
    } finally {
      setBusy(false)
    }
  }

  const ready = name.trim() && dose.trim() && times.some((t) => t.trim())

  return (
    <Shell title="درخواست مصرف دارو" onBack={onBack}>
      {list.length > 0 ? (
        <section className={styles.medList} aria-label="درخواست‌های ثبت‌شده">
          {list.map((row) => (
            <article key={row.id} className={styles.medCard}>
              <p className={`${styles.medName} t-body`}>
                {row.name} · {row.dose}
              </p>
              <p className={`${styles.medTimes} t-caption`}>
                ساعت {row.times.map((t) => formatClock(t)).join(' و ')}
              </p>
              {/*
                نوار سه‌مرحله‌ای: اعلام شد ← مهد تحویل گرفت ← داده شد.
                مرحله سوم در گزارش شب دیده می‌شود، اینجا دو مرحله اول.
              */}
              <ol className={styles.medSteps}>
                <li className={styles.medStepDone}>اعلام شد</li>
                <li className={row.receivedAt ? styles.medStepDone : styles.medStepWait}>
                  {row.receivedAt
                    ? `مهد تحویل گرفت${row.receivedByName ? ` — ${row.receivedByName}` : ''}`
                    : 'هنوز تحویل مهد نشده'}
                </li>
              </ol>
              {!row.receivedAt ? (
                <button
                  type="button"
                  className={`${styles.medCancel} t-caption`}
                  onClick={() => {
                    void data
                      .cancelMedicationRequest(row.id)
                      .then(load)
                      .catch((cause: unknown) =>
                        setError(cause instanceof Error ? cause.message : 'لغو نشد.'),
                      )
                  }}
                >
                  لغو درخواست
                </button>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}

      <p className={`${styles.hint} t-caption`}>
        دارو را صبح به مربی بدهید. تا وقتی مربی تحویل نگرفته باشد، سامانه
        اجازه ثبت مصرف نمی‌دهد.
      </p>

      <label className={`${styles.field} t-caption`}>
        نام دارو
        <input
          className={styles.input}
          value={name}
          aria-label="نام دارو"
          placeholder="مثلاً: شربت سرماخوردگی"
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <label className={`${styles.field} t-caption`}>
        مقدار مصرف
        <input
          className={styles.input}
          value={dose}
          aria-label="مقدار مصرف"
          placeholder="مثلاً: ۵ سی‌سی، یا یک قاشق مرباخوری"
          onChange={(event) => setDose(event.target.value)}
        />
      </label>

      <span className={`${styles.field} t-caption`}>ساعت مصرف</span>
      {times.map((time, index) => (
        <div key={index} className={styles.medTimeRow}>
          <input
            className={styles.input}
            inputMode="numeric"
            value={time}
            aria-label={`ساعت مصرف ${toPersianDigits(index + 1)}`}
            placeholder="۱۱:۳۰"
            onChange={(event) => {
              const next = [...times]
              next[index] = event.target.value
              setTimes(next)
            }}
          />
          {times.length > 1 ? (
            <button
              type="button"
              className={styles.medTimeRemove}
              aria-label="حذف این ساعت"
              onClick={() => setTimes(times.filter((_, at) => at !== index))}
            >
              ×
            </button>
          ) : null}
        </div>
      ))}
      {times.length < 6 ? (
        <button
          type="button"
          className={`${styles.medAddTime} t-caption`}
          onClick={() => setTimes([...times, ''])}
        >
          ساعت دیگر
        </button>
      ) : null}

      <span className={`${styles.field} t-caption`}>برای چه روزهایی</span>
      <div className={styles.choices}>
        {([
          ['today', 'امروز'],
          ['tomorrow', 'فردا'],
          ['week', 'یک هفته'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`${styles.choice} t-body`}
            aria-pressed={days === value}
            onClick={() => setDays(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <label className={`${styles.field} t-caption`}>
        توضیح، اگر لازم است
        <textarea
          className={styles.text}
          rows={2}
          value={note}
          aria-label="توضیح دارو"
          placeholder="مثلاً: بعد از ناهار"
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}

      <button
        type="button"
        className={`${styles.primary} t-body`}
        disabled={!ready || busy}
        onClick={() => void submit()}
      >
        اعلام به مهد
      </button>
    </Shell>
  )
}

/* ── اعلام غیبت — بخش ۶.۴ ───────────────────────────────────── */

function AbsenceTab({ childId, childName, onBack }: {
  childId: string
  childName: string
  onBack: () => void
}) {
  const data = useData()
  const [reason, setReason] = useState('')
  const [when, setWhen] = useState<'today' | 'tomorrow'>('tomorrow')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const date = (() => {
    const day = new Date()
    if (when === 'tomorrow') day.setDate(day.getDate() + 1)
    return toIsoDate(day)
  })()

  const submit = async () => {
    try {
      await data.declareAbsence({ childId, date, reason: reason.trim() || null })
      setDone(true)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
    }
  }

  if (done) {
    return (
      <Shell title="اعلام غیبت" onBack={onBack}>
        <p className={`${styles.done} t-body`}>
          <CheckIcon size={20} />
          غیبت {childName} برای {formatJalali(new Date(`${date}T09:00:00`), 'weekday')} اعلام شد.
        </p>
        <p className={`${styles.hint} t-caption`}>
          مربی همان روز روی صفحه «امروز» می‌بیند و دیگر دنبالتان نمی‌گردد.
        </p>
      </Shell>
    )
  }

  return (
    <Shell title="اعلام غیبت" onBack={onBack}>
      <div className={styles.choices}>
        {(['today', 'tomorrow'] as const).map((choice) => (
          <button
            key={choice}
            type="button"
            className={`${styles.choice} t-body`}
            aria-pressed={when === choice}
            onClick={() => setWhen(choice)}
          >
            {choice === 'today' ? 'امروز' : 'فردا'}
          </button>
        ))}
      </div>

      <label className={`${styles.field} t-caption`}>
        علت، اگر می‌خواهید بنویسید
        <textarea
          className={styles.text}
          rows={3}
          value={reason}
          aria-label="علت غیبت"
          placeholder="مثلاً: سرماخوردگی"
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <p className={`${styles.hint} t-caption`}>
        نوشتن علت اختیاری است. مهد برای غیبت اعلام‌شده دنبالتان نمی‌گردد.
      </p>

      {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}

      <button type="button" className={`${styles.primary} t-body`} onClick={() => void submit()}>
        اعلام غیبت
      </button>
    </Shell>
  )
}


/* ── اطلاعیه‌ها ──────────────────────────────────────────────── */

function NoticesTab({ onBack }: { onBack: () => void }) {
  const data = useData()
  const [notices, setNotices] = useState<Notice[] | null>(null)

  useEffect(() => {
    data.listMyNotices().then(setNotices).catch(() => setNotices([]))
  }, [data])

  return (
    <Shell title="اطلاعیه‌ها" onBack={onBack}>
      {notices === null ? (
        <EmptyState text="در حال خواندن…" />
      ) : notices.length === 0 ? (
        <EmptyState text="اطلاعیه‌ای نیست." />
      ) : (
        notices.map((notice) => (
          <article key={notice.id} className={styles.card}>
            <p className={`${styles.noticeTitle} t-body`}>{notice.title}</p>
            <p className={`${styles.noticeBody} t-body`}>{notice.body}</p>
            {notice.publishedAt ? (
              <span className={`${styles.hint} t-caption`}>
                {formatJalali(new Date(notice.publishedAt), 'short')}
                {notice.smsSentCount > 0 ? ' · با پیامک هم فرستاده شد' : ''}
              </span>
            ) : null}
          </article>
        ))
      )}
    </Shell>
  )
}

/* ── پیام با ساعت کاری — بخش ۶.۶ ────────────────────────────── */

function MessagesTab({ childId, onBack }: { childId: string; onBack: () => void }) {
  const data = useData()
  const [thread, setThread] = useState<MessageThread | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setThread(await data.getThread(childId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'خوانده نشد.')
    }
  }, [data, childId])

  useEffect(() => {
    void load()
  }, [load])

  const send = async () => {
    try {
      await data.sendMessage(childId, draft)
      setDraft('')
      setError(null)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'فرستاده نشد.')
    }
  }

  return (
    <Shell title="پیام به مربی" onBack={onBack}>
      {thread ? (
        <>
          <p className={`${styles.hint} t-caption`}>
            ساعت کاری پیام: {toPersianDigits(thread.hours.start)} تا {toPersianDigits(thread.hours.end)}.
            بیرون از این ساعت پیام فرستاده می‌شود ولی صبح تحویل می‌شود.
          </p>

          {thread.messages.length === 0 ? (
            <EmptyState text="هنوز پیامی رد و بدل نشده." />
          ) : (
            <div className={styles.thread}>
              {thread.messages.map((message) => (
                <div
                  key={message.id}
                  className={`${styles.bubble} ${message.mine ? styles.bubbleMine : ''}`}
                >
                  <p className={`${styles.bubbleBody} t-body`}>{message.body}</p>
                  <span className={`${styles.bubbleMeta} t-caption`}>
                    {message.sentAt ? (
                      formatTime(new Date(message.sentAt))
                    ) : (
                      <>
                        <AlertIcon size={14} />
                        در صف تا {message.queuedUntil
                          ? formatTime(new Date(message.queuedUntil))
                          : 'صبح'}
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}

          <div className={styles.composer}>
            <textarea
              className={styles.text}
              rows={2}
              value={draft}
              aria-label="متن پیام"
              placeholder="پیامتان را بنویسید"
              onChange={(event) => setDraft(event.target.value)}
            />
            <button
              type="button"
              className={`${styles.primary} t-body`}
              disabled={draft.trim().length === 0}
              onClick={() => void send()}
            >
              فرستادن
            </button>
          </div>
        </>
      ) : (
        <EmptyState text="در حال خواندن…" />
      )}
    </Shell>
  )
}

/* ── پوسته مشترک ────────────────────────────────────────────── */

export function Shell({ title, onBack, children }: {
  title: string
  onBack: () => void
  children: React.ReactNode
}) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="بازگشت">
          <Chevron />
        </button>
        <span className={`${styles.title} t-h2`}>{title}</span>
      </header>
      <div className={styles.body}>{children}</div>
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
