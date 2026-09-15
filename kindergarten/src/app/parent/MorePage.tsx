import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertIcon, CheckIcon, EmptyState } from '../../design-system/index.ts'
import {
  formatClock,
  formatJalali,
  formatRial,
  formatTime,
  toIsoDate,
  toLatinDigits,
  toPersianDigits,
} from '../../i18n/index.ts'
import { useData } from '../../core/auth/index.ts'
import type {
  Invoice,
  MedicationRequest,
  PaymentResult,
  MessageThread,
  Notice,
  ParentFinance,
} from '../../core/data/index.ts'
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
type Tab = 'menu' | 'absence' | 'medication' | 'finance' | 'notices' | 'messages'

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
    if (tab === 'finance') return <FinanceTab childId={childId} onBack={back} />
    if (tab === 'notices') return <NoticesTab onBack={back} />
    return <MessagesTab childId={childId} onBack={back} />
  }

  return (
    <Shell title="بیشتر" onBack={onBack}>
      <ul className={styles.menu}>
        <MenuItem label="اعلام غیبت" hint="وقتی کودک فردا نمی‌آید" onClick={() => setTab('absence')} />
        <MenuItem
          label="درخواست مصرف دارو"
          hint="از شب قبل بنویسید، مربی صبح تحویل می‌گیرد"
          onClick={() => setTab('medication')}
        />
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
  /** صورتحسابی که والد دارد آنلاین پرداختش می‌کند — ارتقای ۱. */
  const [paying, setPaying] = useState<Invoice | null>(null)

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
                {/*
                  ارتقای ۱: پرداخت آنلاین مسیر اصلی است.
                  ثبت دستی فیش به یک گزینه فرعی تبدیل شده — برای چک،
                  واریز نقدی، و مواقعی که درگاه در دسترس نیست.
                */}
                {settled ? null : claim ? (
                  <p className={`${styles.claimState} t-caption`}>
                    {claim.status === 'pending'
                      ? 'اعلام پرداخت شما ثبت شد و منتظر تأیید مهد است.'
                      : 'مهد پرداخت شما را تأیید کرد.'}
                  </p>
                ) : (
                  <>
                    <button
                      type="button"
                      className={`${styles.payOnline} t-body`}
                      onClick={() => setPaying(invoice)}
                    >
                      پرداخت آنلاین
                    </button>
                    <button
                      type="button"
                      className={`${styles.declare} t-caption`}
                      onClick={() => setDeclaring(invoice)}
                    >
                      پرداخت کردم، ولی نه از اینجا
                    </button>
                  </>
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

      {paying ? (
        <OnlinePaySheet
          invoice={paying}
          onClose={() => setPaying(null)}
          onDone={async () => {
            setPaying(null)
            await load()
          }}
        />
      ) : null}
    </Shell>
  )
}

/**
 * پرداخت آنلاین — ارتقای ۱ سند بررسی طراحی.
 *
 * قاعده سفت معماری که این شیت باید صادقانه نشانش دهد:
 *
 *   وضعیت صورتحساب فقط با تأیید سمت سرور عوض می‌شود، هرگز با بازگشت
 *   مرورگر.
 *
 * پس شیت پس از بازگشت از درگاه، «پرداخت شد» نمی‌گوید؛ می‌گوید «در حال
 * تأیید» و از سرور می‌پرسد. سه پایان دارد و هر سه متن خودشان را دارند،
 * چون «در انتظار» هم یک پایان واقعی است: والد باید بداند پولش کجاست.
 */
function OnlinePaySheet({
  invoice,
  onClose,
  onDone,
}: {
  invoice: Invoice
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const data = useData()
  const [phase, setPhase] = useState<'start' | 'gateway' | 'checking' | 'done'>('start')
  const [result, setResult] = useState<PaymentResult | null>(null)
  const [key, setKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const due = invoice.amount - invoice.discount + invoice.lateFee - invoice.paid

  const start = async () => {
    setError(null)
    try {
      const intent = await data.startOnlinePayment(invoice.id)
      setKey(intent.key)
      setPhase('gateway')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'شروع نشد.')
    }
  }

  /*
   * بازگشت از درگاه.
   *
   * در نسخه واقعی، درگاه کاربر را به اپ برمی‌گرداند و همین‌جا شروع
   * می‌شود. اینکه کاربر برگشته هیچ چیزی درباره موفقیت نمی‌گوید — پس
   * فقط از سرور می‌پرسیم، و تا ده ثانیه هم دوباره می‌پرسیم چون وب‌هوک
   * ممکن است دیر برسد.
   */
  const backFromGateway = () => {
    setPhase('checking')
  }

  useEffect(() => {
    if (phase !== 'checking' || !key) return
    let stop = false
    let tries = 0
    const ask = async () => {
      try {
        const answer = await data.checkOnlinePayment(key)
        if (stop) return
        if (answer.state === 'pending' && tries < 10) {
          tries += 1
          setTimeout(() => void ask(), 1000)
          return
        }
        setResult(answer)
        setPhase('done')
      } catch (cause) {
        if (stop) return
        setError(cause instanceof Error ? cause.message : 'بررسی نشد.')
        setPhase('done')
      }
    }
    void ask()
    return () => {
      stop = true
    }
  }, [phase, key, data])

  return (
    <div className={styles.sheetBackdrop} role="dialog" aria-label="پرداخت آنلاین">
      <div className={styles.sheet}>
        <h2 className={`${styles.sheetTitle} t-h2`}>پرداخت آنلاین</h2>

        {phase === 'start' ? (
          <>
            <p className={`${styles.payAmount} t-h2`}>{formatRial(due)}</p>
            <p className={`${styles.hint} t-caption`}>
              شهریه {invoice.period} · {invoice.childName}
            </p>
            <p className={`${styles.hint} t-caption`}>
              به درگاه بانکی منتقل می‌شوید. پس از پرداخت، رسید با کد رهگیری
              همین‌جا صادر می‌شود.
            </p>
            {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}
            <button type="button" className={`${styles.primary} t-body`} onClick={() => void start()}>
              رفتن به درگاه
            </button>
            <button type="button" className={`${styles.ghost} t-body`} onClick={onClose}>
              انصراف
            </button>
          </>
        ) : null}

        {phase === 'gateway' ? (
          <>
            <p className={`${styles.hint} t-body`}>
              در درگاه بانک هستید. پس از پرداخت، به اپ برمی‌گردید.
            </p>
            <button type="button" className={`${styles.primary} t-body`} onClick={backFromGateway}>
              بازگشت از درگاه
            </button>
          </>
        ) : null}

        {phase === 'checking' ? (
          <p className={`${styles.hint} t-body`} role="status" aria-live="polite">
            در حال تأیید پرداخت…
          </p>
        ) : null}

        {phase === 'done' && result ? (
          <>
            {result.state === 'paid' ? (
              <>
                <p className={`${styles.payDone} t-body`}>
                  <CheckIcon size={20} />
                  پرداخت {formatRial(result.amount)} تأیید شد.
                </p>
                <p className={`${styles.trackingCode} t-body`}>
                  کد رهگیری: {toPersianDigits(result.trackingCode)}
                </p>
                <p className={`${styles.hint} t-caption`}>
                  این کد را نگه دارید. در فهرست پرداخت‌ها هم می‌ماند.
                </p>
              </>
            ) : result.state === 'failed' ? (
              <p className={`${styles.error} t-body`}>{result.reason}</p>
            ) : (
              <p className={`${styles.hint} t-body`}>
                پرداخت شما در حال بررسی است. تا چند دقیقه دیگر وضعیت به‌روز
                می‌شود. اگر مبلغ کسر شده و تا ۷۲ ساعت برنگشت، با مهد تماس بگیرید.
              </p>
            )}
            {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}
            <button type="button" className={`${styles.primary} t-body`} onClick={() => void onDone()}>
              بستن
            </button>
          </>
        ) : null}
      </div>
    </div>
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
