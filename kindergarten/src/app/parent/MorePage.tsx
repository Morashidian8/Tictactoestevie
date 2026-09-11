import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertIcon, CheckIcon, EmptyState } from '../../design-system/index.ts'
import { formatJalali, formatRial, formatTime, toIsoDate, toLatinDigits, toPersianDigits } from '../../i18n/index.ts'
import { useData } from '../../core/auth/index.ts'
import type { Invoice, MessageThread, Notice, ParentFinance } from '../../core/data/index.ts'
import { compressImage } from '../../core/media/compress.ts'
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
type Tab = 'menu' | 'absence' | 'finance' | 'notices' | 'messages'

export function MorePage({ childId, childName, onBack }: {
  childId: string
  childName: string
  onBack: () => void
}) {
  const [tab, setTab] = useState<Tab>('menu')

  if (tab !== 'menu') {
    const back = () => setTab('menu')
    if (tab === 'absence') return <AbsenceTab childId={childId} childName={childName} onBack={back} />
    if (tab === 'finance') return <FinanceTab childId={childId} onBack={back} />
    if (tab === 'notices') return <NoticesTab onBack={back} />
    return <MessagesTab childId={childId} onBack={back} />
  }

  return (
    <Shell title="بیشتر" onBack={onBack}>
      <ul className={styles.menu}>
        <MenuItem label="اعلام غیبت" hint="وقتی کودک فردا نمی‌آید" onClick={() => setTab('absence')} />
        <MenuItem label="پیام به مربی" hint="در ساعت کاری مهد" onClick={() => setTab('messages')} />
        <MenuItem label="اطلاعیه‌ها" hint="پیام‌های مهد" onClick={() => setTab('notices')} />
        <MenuItem label="مالی" hint="شهریه و پرداخت‌ها" onClick={() => setTab('finance')} />
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

/* ── مالی — بخش ۶.۵ ─────────────────────────────────────────── */

const STATUS_TEXT: Record<string, string> = {
  issued: 'پرداخت نشده',
  partially_paid: 'بخشی پرداخت شده',
  paid: 'تسویه',
  overdue: 'سررسید گذشته',
  cancelled: 'لغو شده',
}

function FinanceTab({ childId, onBack }: { childId: string; onBack: () => void }) {
  const data = useData()
  const [finance, setFinance] = useState<ParentFinance | null>(null)
  const [declaring, setDeclaring] = useState<Invoice | null>(null)

  const load = useCallback(async () => {
    try {
      setFinance(await data.getParentFinance(childId))
    } catch {
      setFinance(null)
    }
  }, [data, childId])

  useEffect(() => {
    void load()
  }, [load])

  if (!finance) return <Shell title="مالی" onBack={onBack}><EmptyState text="در حال خواندن…" /></Shell>

  // بخش ۶.۵: سرپرستی که پرداخت‌کننده نیست، این بخش را اصلاً نمی‌بیند.
  if (!finance.isPayer) {
    return (
      <Shell title="مالی" onBack={onBack}>
        <p className={`${styles.hint} t-body`}>
          بخش مالی فقط برای سرپرستی است که پرداخت‌کننده ثبت شده.
        </p>
      </Shell>
    )
  }

  return (
    <Shell title="مالی" onBack={onBack}>
      <section className={styles.card}>
        <span className={`${styles.cardLabel} t-caption`}>مانده</span>
        <p className={`${styles.big} ${finance.outstanding > 0 ? styles.owed : styles.clear}`}>
          {formatRial(finance.outstanding)}
        </p>
      </section>

      <section className={styles.card} aria-label="صورتحساب‌ها">
        <span className={`${styles.cardLabel} t-caption`}>صورتحساب‌ها</span>
        {finance.invoices.length === 0 ? (
          <p className={`${styles.hint} t-body`}>هنوز صورتحسابی صادر نشده.</p>
        ) : (
          finance.invoices.map((invoice) => {
            const claim = finance.claims.find(
              (c) => c.invoiceId === invoice.id && c.status !== 'rejected',
            )
            const settled = invoice.status === 'paid' || invoice.status === 'cancelled'
            return (
              <div key={invoice.id} className={styles.invoice}>
                <p className={`${styles.row} t-body`}>
                  <span>{toPersianDigits(invoice.period)}</span>
                  <span className={`${styles.hint} t-caption`}>{STATUS_TEXT[invoice.status]}</span>
                  <b className={styles.amount}>
                    {formatRial(invoice.amount - invoice.discount + invoice.lateFee)}
                  </b>
                </p>

                {/*
                  بخش ۸: خانواده کارت‌به‌کارت می‌کند و باید بتواند همین‌جا
                  خبر دهد. این هنوز پرداخت نیست؛ تا مدیر رسید را ندیده،
                  هیچ ریالی در دفتر مالی ثبت نمی‌شود.
                */}
                {settled ? null : claim ? (
                  <p className={`${styles.claimState} t-caption`}>
                    {claim.status === 'pending'
                      ? 'اعلام پرداخت شما ثبت شد و منتظر تأیید مهد است.'
                      : 'مهد پرداخت شما را تأیید کرد.'}
                  </p>
                ) : (
                  <button
                    type="button"
                    className={`${styles.declare} t-body`}
                    onClick={() => setDeclaring(invoice)}
                  >
                    پرداخت کردم
                  </button>
                )}
              </div>
            )
          })
        )}
      </section>

      {finance.claims.some((c) => c.status === 'rejected') ? (
        <section className={`${styles.card} ${styles.rejected}`} aria-label="اعلام‌های رد شده">
          <span className={`${styles.cardLabel} t-caption`}>اعلام رد شده</span>
          {finance.claims
            .filter((c) => c.status === 'rejected')
            .map((claim) => (
              <p key={claim.id} className={`${styles.hint} t-body`}>
                {toPersianDigits(claim.period)} · {formatRial(claim.amount)} —{' '}
                {claim.rejectReason}
              </p>
            ))}
        </section>
      ) : null}

      {finance.payments.length > 0 ? (
        <section className={styles.card} aria-label="پرداخت‌ها">
          <span className={`${styles.cardLabel} t-caption`}>پرداخت‌های ثبت‌شده</span>
          {finance.payments.map((payment) => (
            <p key={payment.id} className={`${styles.row} t-body`}>
              <span>{formatJalali(new Date(payment.paidAt), 'short')}</span>
              <span className={`${styles.hint} t-caption`}>
                {payment.receiptNo ? `رسید ${toPersianDigits(payment.receiptNo)}` : (payment.method ?? '')}
              </span>
              <b className={styles.amount}>{formatRial(payment.amount)}</b>
            </p>
          ))}
        </section>
      ) : null}

      {declaring ? (
        <DeclareSheet
          invoice={declaring}
          onClose={() => setDeclaring(null)}
          onDone={async () => {
            setDeclaring(null)
            await load()
          }}
        />
      ) : null}
    </Shell>
  )
}

/** اعلام پرداخت با عکس رسید — بخش ۸. */
function DeclareSheet({
  invoice,
  onClose,
  onDone,
}: {
  invoice: Invoice
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const data = useData()
  const remaining = invoice.amount - invoice.discount + invoice.lateFee - invoice.paid
  const [amount, setAmount] = useState(String(Math.round(remaining / 10)))
  const [receipt, setReceipt] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const pick = async (file: File | undefined) => {
    if (!file) return
    try {
      // همان فشرده‌سازی عکس‌های کلاس. رسید هم عکس موبایل است و خام
      // فرستادنش آپلود را روی اینترنت خانه کند می‌کند.
      const image = await compressImage(file)
      setReceipt(image.previewUrl)
    } catch {
      setError('عکس خوانده نشد.')
    }
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await data.declarePayment({
        invoiceId: invoice.id,
        amount: Number(toLatinDigits(amount).replace(/\D/g, '')) * 10,
        receiptUrl: receipt,
        note,
      })
      await onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
      setBusy(false)
    }
  }

  return (
    <div className={styles.sheetBackdrop} role="dialog" aria-label="اعلام پرداخت">
      <div className={styles.sheet}>
        <p className={`${styles.sheetTitle} t-h2`}>پرداخت کردم</p>
        <p className={`${styles.hint} t-body`}>
          {toPersianDigits(invoice.period)} · باقی‌مانده{' '}
          <b className={styles.amount}>{formatRial(remaining)}</b>
        </p>

        <label className={`${styles.field} t-caption`}>
          مبلغی که پرداخت کردید، به تومان
          <input
            className={styles.input}
            value={amount}
            inputMode="numeric"
            aria-label="مبلغ پرداختی"
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>

        {receipt ? (
          <img className={styles.receipt} src={receipt} alt="رسید پرداخت" />
        ) : null}

        <button
          type="button"
          className={`${styles.pickReceipt} ${receipt ? styles.pickReceiptDone : ''} t-body`}
          onClick={() => fileInput.current?.click()}
        >
          {receipt ? 'عکس دیگری انتخاب کنید' : 'عکس رسید را بگذارید'}
        </button>
        <input
          ref={fileInput}
          className={styles.hiddenInput}
          type="file"
          accept="image/*"
          aria-label="عکس رسید"
          onChange={(event) => {
            void pick(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        <p className={`${styles.hint} t-caption`}>
          بدون رسید هم می‌توانید اعلام کنید، ولی با رسید زودتر تأیید می‌شود.
        </p>

        <label className={`${styles.field} t-caption`}>
          توضیح، اگر لازم است
          <input
            className={styles.input}
            value={note}
            aria-label="توضیح پرداخت"
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

        {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}

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
            اعلام به مهد
          </button>
        </div>
      </div>
    </div>
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

function Shell({ title, onBack, children }: {
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
