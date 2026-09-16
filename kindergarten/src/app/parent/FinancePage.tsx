import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckIcon, EmptyState } from '../../design-system/index.ts'
import {
  formatJalali,
  formatPeriod,
  formatRial,
  toLatinDigits,
  toPersianDigits,
} from '../../i18n/index.ts'
import { useData } from '../../core/auth/index.ts'
import { invoiceDue } from '../../core/data/index.ts'
import type {
  FeeItemOffer,
  FeeYearMonth,
  Invoice,
  ParentFinance,
  PaymentResult,
} from '../../core/data/index.ts'
import { compressImage } from '../../core/media/compress.ts'
import { Shell } from './MorePage.tsx'
import shared from './MorePage.module.css'
import styles from './FinancePage.module.css'

/**
 * مالی خانواده — بخش ۶.۵، و خواسته‌های شهریه سال.
 *
 * چیدمان از بالا به پایین، به ترتیبِ چیزی که خانواده وقتی این صفحه را
 * باز می‌کند دنبالش است:
 *
 *   ۱. چقدر بدهکارم و تا کِی
 *   ۲. کل سال چطور است — دوازده ماه، پرداخت‌شده و نشده
 *   ۳. چیزی هست که باید جوابش بدهم (اردو)
 *   ۴. صورتحساب باز، با اقلامش
 *   ۵. آنچه تا حالا داده‌ام، با سندش
 *   ۶. چه یادآوری‌هایی برایم رفته
 *
 * دو قاعده‌ای که این صفحه نباید بشکند:
 *
 * الف) **ماهی که صورتحساب ندارد، بدهی نیست.** مبلغش برآورد است و
 *      همین‌طور هم نوشته می‌شود. اگر دوازده ماه را جمع می‌زدیم و به
 *      خانواده نشان می‌دادیم، مهر ماهِ ترس می‌شد.
 *
 * ب) **قلم اختیاریِ بی‌جواب، بدهی نیست.** اردو تا وقتی خانواده
 *      نپذیرفته در هیچ جمعی نمی‌آید.
 */

const STATUS_TEXT: Record<string, string> = {
  issued: 'پرداخت نشده',
  partially_paid: 'بخشی پرداخت شده',
  paid: 'تسویه',
  overdue: 'سررسید گذشته',
  cancelled: 'لغو شده',
  not_issued: 'صادر نشده',
}

const REMINDER_TEXT: Record<string, string> = {
  due_soon: 'یادآوری پیش از سررسید',
  due_today: 'یادآوری روز سررسید',
  overdue: 'یادآوری دیرکرد',
}

const monthTotal = (m: FeeYearMonth): number =>
  m.amount - m.discount + m.extras + m.lateFee + m.overdueFee

export function FinancePage({ childId, onBack }: { childId: string; onBack: () => void }) {
  const data = useData()
  const [finance, setFinance] = useState<ParentFinance | null>(null)
  const [declaring, setDeclaring] = useState<Invoice | null>(null)
  const [paying, setPaying] = useState<Invoice | null>(null)
  const [openMonth, setOpenMonth] = useState<string | null>(null)
  const [showReminders, setShowReminders] = useState(false)

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

  if (!finance) {
    return <Shell title="مالی" onBack={onBack}><EmptyState text="در حال خواندن…" /></Shell>
  }

  // بخش ۶.۵: سرپرستی که پرداخت‌کننده نیست، این بخش را اصلاً نمی‌بیند.
  if (!finance.isPayer) {
    return (
      <Shell title="مالی" onBack={onBack}>
        <p className={`${shared.hint} t-body`}>
          بخش مالی فقط برای سرپرستی است که پرداخت‌کننده ثبت شده.
        </p>
      </Shell>
    )
  }

  const open = finance.invoices.filter(
    (i) => i.status !== 'paid' && i.status !== 'cancelled',
  )
  const nextDue = open
    .map((i) => i.dueDate)
    .sort()
    .at(0)
  const waiting = finance.offers.filter((o) => o.optional && o.answer === null)

  /*
   * سه دسته، از وضعیت خودِ ماه — نه از تاریخ.
   *
   * «الان» یعنی صورتحساب صادر شده و تسویه نشده. «پیش رو» یعنی هنوز
   * صادر نشده. تکیه بر مقایسه تاریخ به‌جای وضعیت، ماهی را که مدیر دیر
   * صادر کرده در دسته اشتباه می‌نشاند.
   */
  const bucket = {
    now: finance.year.filter(
      (m) => m.issued && m.status !== 'paid' && m.status !== 'cancelled',
    ),
    ahead: finance.year.filter((m) => !m.issued),
    past: finance.year.filter((m) => m.issued && m.status === 'paid'),
  }

  return (
    <Shell title="مالی" onBack={onBack}>
      {/* ── مانده ─────────────────────────────────────────── */}
      <section className={shared.card}>
        <span className={`${shared.cardLabel} t-caption`}>مانده</span>
        <p className={`${shared.big} ${finance.outstanding > 0 ? shared.owed : shared.clear}`}>
          {formatRial(finance.outstanding)}
        </p>
        {/*
          سررسید نزدیک‌ترین صورتحساب باز، نه یک متن کلی.
          خانواده‌ای که مانده دارد اول می‌پرسد «تا کِی؟».
        */}
        {finance.outstanding > 0 && nextDue ? (
          <p className={`${shared.hint} t-caption`}>
            نزدیک‌ترین سررسید: {formatJalali(new Date(nextDue), 'full')}
          </p>
        ) : null}
      </section>

      {/* ── قلم‌های اختیاریِ بی‌جواب ────────────────────────── */}
      {waiting.length > 0 ? (
        <section className={`${shared.card} ${styles.asking}`} aria-label="منتظر جواب شما">
          <span className={`${shared.cardLabel} t-caption`}>منتظر جواب شما</span>
          {waiting.map((offer) => (
            <OfferRow
              key={offer.itemId}
              offer={offer}
              onAnswer={async (accept) => {
                await data.answerFeeItem(offer.itemId, childId, accept)
                await load()
              }}
            />
          ))}
        </section>
      ) : null}

      {/* ── برنامه شهریه سال، در سه دسته ───────────────────── */}
      {/*
        گذشته، الان، پیش رو.

        یک فهرست دوازده‌تایی به خانواده نمی‌گوید کدامش کارِ امروز است.
        سه دسته می‌گوید: چه داده‌ام، چه بدهکارم، چه در راه است — همان سه
        سؤالی که خانواده با آن‌ها این صفحه را باز می‌کند.
      */}
      <section className={shared.card} aria-label="برنامه شهریه سال">
        <span className={`${shared.cardLabel} t-caption`}>
          شهریه سال {toPersianDigits(finance.yearLabel)}
        </span>

        <MonthGroup
          title="بدهی الان"
          empty="بدهی سررسیدشده‌ای ندارید."
          months={bucket.now}
          finance={finance}
          openMonth={openMonth}
          onToggle={setOpenMonth}
        />
        <MonthGroup
          title="پیش رو"
          empty="ماه دیگری در این سال نمانده."
          months={bucket.ahead}
          finance={finance}
          openMonth={openMonth}
          onToggle={setOpenMonth}
        />
        <MonthGroup
          title="پرداخت‌شده"
          empty="هنوز ماهی تسویه نشده."
          months={bucket.past}
          finance={finance}
          openMonth={openMonth}
          onToggle={setOpenMonth}
        />

        {/*
          مجموع سال عمداً نوشته نمی‌شود.
          جمع ماه‌های صادرنشده با صادرشده، عددی می‌سازد که نه بدهی است
          نه قرارداد — و همان عدد است که خانواده یادش می‌ماند.
        */}
        <p className={`${shared.hint} t-caption`}>
          ماه‌های «پیش رو» که هنوز صورتحساب ندارند، برآوردند و بدهی به حساب نمی‌آیند.
        </p>
      </section>

      {/* ── صورتحساب‌های باز ───────────────────────────────── */}
      <section className={shared.card} aria-label="صورتحساب‌های باز">
        <span className={`${shared.cardLabel} t-caption`}>صورتحساب‌های باز</span>
        {open.length === 0 ? (
          <p className={`${shared.hint} t-body`}>صورتحساب پرداخت‌نشده‌ای ندارید.</p>
        ) : (
          open.map((invoice) => {
            const claim = finance.claims.find(
              (c) => c.invoiceId === invoice.id && c.status !== 'rejected',
            )
            return (
              <div key={invoice.id} className={shared.invoice}>
                <p className={`${shared.row} t-body`}>
                  <span>{formatPeriod(invoice.period)}</span>
                  <span className={`${shared.hint} t-caption`}>{STATUS_TEXT[invoice.status]}</span>
                  <b className={shared.amount}>{formatRial(invoiceDue(invoice))}</b>
                </p>

                <Breakdown invoice={invoice} />

                {claim ? (
                  <p className={`${shared.claimState} t-caption`}>
                    {claim.status === 'pending'
                      ? 'اعلام پرداخت شما ثبت شد و منتظر تأیید مهد است.'
                      : 'مهد پرداخت شما را تأیید کرد.'}
                  </p>
                ) : (
                  <>
                    <button
                      type="button"
                      className={`${shared.payOnline} t-body`}
                      onClick={() => setPaying(invoice)}
                    >
                      پرداخت با شاپرک
                    </button>
                    <button
                      type="button"
                      className={`${shared.declare} t-caption`}
                      onClick={() => setDeclaring(invoice)}
                    >
                      کارت به کارت — با ثبت رسید
                    </button>
                  </>
                )}
              </div>
            )
          })
        )}
      </section>

      {/* ── اعلام‌های رد شده ───────────────────────────────── */}
      {finance.claims.some((c) => c.status === 'rejected') ? (
        <section className={`${shared.card} ${shared.rejected}`} aria-label="اعلام رد شده">
          <span className={`${shared.cardLabel} t-caption`}>اعلام رد شده</span>
          {finance.claims
            .filter((c) => c.status === 'rejected')
            .map((claim) => (
              <p key={claim.id} className={`${shared.hint} t-body`}>
                {formatPeriod(claim.period)} · {formatRial(claim.amount)} — {claim.rejectReason}
              </p>
            ))}
        </section>
      ) : null}

      {/* ── پرداخت‌های ثبت‌شده، با سند ─────────────────────── */}
      {finance.payments.length > 0 ? (
        <section className={shared.card} aria-label="پرداخت‌های ثبت‌شده">
          <span className={`${shared.cardLabel} t-caption`}>پرداخت‌های ثبت‌شده</span>
          {[...finance.payments]
            .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
            .map((payment) => {
              const period = finance.invoices.find((i) => i.id === payment.invoiceId)?.period
              return (
                <div key={payment.id} className={styles.payRow}>
                  <p className={`${shared.row} t-body`}>
                    <span>{formatJalali(new Date(payment.paidAt), 'short')}</span>
                    <span className={`${shared.hint} t-caption`}>
                      {period ? formatPeriod(period, false) : (payment.method ?? '')}
                    </span>
                    <b className={shared.amount}>{formatRial(payment.amount)}</b>
                  </p>
                  {/*
                    سند، نه فقط ردیف.
                    خواسته صریح مالک محصول بود: «گذشته به همراه مستندات
                    ثبت شده باشه که هروقت لازم داشت چک کنه».
                  */}
                  <Document
                    method={payment.method}
                    trackingCode={payment.trackingCode ?? null}
                    receiptNo={payment.receiptNo}
                    receiptUrl={payment.receiptUrl ?? null}
                  />
                </div>
              )
            })}
        </section>
      ) : null}

      {/* ── یادآوری‌هایی که رفته ───────────────────────────── */}
      {finance.reminders.length > 0 ? (
        <section className={shared.card} aria-label="یادآوری‌ها">
          <button
            type="button"
            className={`${styles.disclose} t-caption`}
            aria-expanded={showReminders}
            onClick={() => setShowReminders(!showReminders)}
          >
            {showReminders ? 'بستن یادآوری‌ها' : `یادآوری‌هایی که برای شما رفته (${toPersianDigits(finance.reminders.length)})`}
          </button>
          {showReminders
            ? finance.reminders.map((r) => (
                <p key={r.id} className={`${shared.row} t-caption`}>
                  <span>{formatJalali(new Date(r.sentAt), 'short')}</span>
                  <span className={shared.hint}>
                    {REMINDER_TEXT[r.kind]} · {r.channel === 'sms' ? 'پیامک' : 'اعلان اپ'}
                  </span>
                  <span className={shared.amount}>{formatPeriod(r.period, false)}</span>
                </p>
              ))
            : null}
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

/* ── یک دسته از سال ─────────────────────────────────────────── */

/**
 * یک دسته و ماه‌هایش.
 *
 * دسته خالی هم نوشته می‌شود و پنهان نمی‌ماند: «بدهی سررسیدشده‌ای
 * ندارید» خبرِ خوبی است که خانواده باید ببیند، نه چیزی که با ناپدید
 * شدن دسته از آن سر دربیاورد.
 */
function MonthGroup({ title, empty, months, finance, openMonth, onToggle }: {
  title: string
  empty: string
  months: FeeYearMonth[]
  finance: ParentFinance
  openMonth: string | null
  onToggle: (period: string | null) => void
}) {
  return (
    <div className={styles.group}>
      <p className={`${styles.groupTitle} t-caption`}>{title}</p>
      {months.length === 0 ? (
        <p className={`${shared.hint} t-caption`}>{empty}</p>
      ) : (
        <ul className={styles.year}>
          {months.map((month) => (
            <MonthRow
              key={month.period}
              month={month}
              open={openMonth === month.period}
              invoice={finance.invoices.find((i) => i.period === month.period) ?? null}
              onToggle={() => onToggle(openMonth === month.period ? null : month.period)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

/* ── یک ماه از سال ──────────────────────────────────────────── */

function MonthRow({ month, open, invoice, onToggle }: {
  month: FeeYearMonth
  open: boolean
  invoice: Invoice | null
  onToggle: () => void
}) {
  const total = monthTotal(month)
  const remaining = Math.max(total - month.paid, 0)

  /*
   * ماه صادرنشده دکمه نیست.
   *
   * چیزی برای باز کردن ندارد و اگر فشرده‌شدنی باشد، خانواده فشارش
   * می‌دهد و هیچ اتفاقی نمی‌افتد — که یعنی اپ خراب است.
   */
  const body = (
    <>
      <span className={styles.monthName}>{formatPeriod(month.period, false)}</span>
      <span className={`${styles.pill} ${styles[month.status] ?? ''}`}>
        {STATUS_TEXT[month.status]}
      </span>
      <b className={`${styles.monthAmount} ${month.issued ? '' : styles.estimate}`}>
        {formatRial(month.issued ? total : month.amount)}
      </b>
    </>
  )

  if (!month.issued) {
    return (
      <li className={`${styles.month} ${styles.monthQuiet} t-body-sm`}>
        {body}
      </li>
    )
  }

  return (
    <li className={`${styles.month} t-body-sm`}>
      <button
        type="button"
        className={styles.monthButton}
        aria-expanded={open}
        onClick={onToggle}
      >
        {body}
      </button>
      {open ? (
        <div className={styles.monthDetail}>
          <Line label="شهریه" value={month.amount} />
          {month.discount > 0 ? <Line label="تخفیف" value={-month.discount} /> : null}
          {invoice?.lines.map((l) => <Line key={l.id} label={l.title} value={l.amount} />)}
          {month.lateFee > 0 ? (
            <Line label="جریمه تأخیر در تحویل" value={month.lateFee} />
          ) : null}
          {month.overdueFee > 0 ? (
            <Line label="جریمه دیرکرد پرداخت" value={month.overdueFee} />
          ) : null}
          {month.paid > 0 ? <Line label="پرداخت‌شده" value={-month.paid} /> : null}
          {remaining > 0 ? <Line label="مانده" value={remaining} strong /> : null}
          {month.dueDate ? (
            <p className={`${styles.detailHint} t-caption`}>
              سررسید: {formatJalali(new Date(month.dueDate), 'full')}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

function Line({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <p className={`${styles.line} ${strong ? styles.lineStrong : ''} t-caption`}>
      <span>{label}</span>
      <span className={shared.amount}>
        {value < 0 ? `− ${formatRial(-value)}` : formatRial(value)}
      </span>
    </p>
  )
}

/** اقلامی که مبلغ صورتحساب از آن‌ها ساخته شده. */
function Breakdown({ invoice }: { invoice: Invoice }) {
  const rows: { key: string; label: string; value: number }[] = [
    { key: 'base', label: 'شهریه', value: invoice.amount },
  ]
  if (invoice.discount > 0) rows.push({ key: 'disc', label: 'تخفیف', value: -invoice.discount })
  for (const l of invoice.lines) rows.push({ key: l.id, label: l.title, value: l.amount })
  if (invoice.lateFee > 0) {
    rows.push({ key: 'late', label: 'جریمه تأخیر در تحویل', value: invoice.lateFee })
  }
  if (invoice.overdueFee > 0) {
    rows.push({ key: 'od', label: 'جریمه دیرکرد پرداخت', value: invoice.overdueFee })
  }
  if (invoice.paid > 0) rows.push({ key: 'paid', label: 'پرداخت‌شده', value: -invoice.paid })

  // یک سطر یعنی فقط شهریه؛ فهرست یک‌سطری چیزی توضیح نمی‌دهد.
  if (rows.length < 2) return null
  return (
    <div className={styles.breakdown}>
      {rows.map((r) => <Line key={r.key} label={r.label} value={r.value} />)}
    </div>
  )
}

/* ── قلم اختیاری ────────────────────────────────────────────── */

function OfferRow({ offer, onAnswer }: {
  offer: FeeItemOffer
  onAnswer: (accept: boolean) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const answer = async (accept: boolean) => {
    setBusy(true)
    setError(null)
    try {
      await onAnswer(accept)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ثبت نشد.')
      setBusy(false)
    }
  }

  return (
    <div className={styles.offer}>
      <p className={`${styles.offerTitle} t-body`}>
        {offer.title}
        <b className={shared.amount}>{formatRial(offer.amount)}</b>
      </p>
      {offer.description ? (
        <p className={`${shared.hint} t-caption`}>{offer.description}</p>
      ) : null}
      <p className={`${shared.hint} t-caption`}>
        {formatPeriod(offer.period)} · تا وقتی نپذیرید، به صورتحساب اضافه نمی‌شود.
      </p>
      <div className={styles.offerActions}>
        <button
          type="button"
          className={`${shared.primary} t-body`}
          disabled={busy}
          onClick={() => void answer(true)}
        >
          می‌پذیرم
        </button>
        <button
          type="button"
          className={`${shared.secondary} t-body`}
          disabled={busy}
          onClick={() => void answer(false)}
        >
          شرکت نمی‌کنیم
        </button>
      </div>
      {error ? <p className={`${shared.error} t-caption`}>{error}</p> : null}
    </div>
  )
}

/* ── سند پرداخت ─────────────────────────────────────────────── */

/**
 * سند یک پرداخت گذشته.
 *
 * سه حالت دارد و هر سه متن خودشان را دارند. حالت سوم — «سندی ثبت
 * نشده» — عمداً نوشته می‌شود و پنهان نمی‌ماند: خانواده باید بداند این
 * ردیف پشتوانه‌ای ندارد تا اگر روزی اختلافی شد، همان‌موقع بپرسد، نه
 * یک سال بعد.
 */
function Document({ method, trackingCode, receiptNo, receiptUrl }: {
  method: string | null
  trackingCode: string | null
  receiptNo: string | null
  receiptUrl: string | null
}) {
  if (trackingCode) {
    return (
      <p className={`${styles.doc} t-caption`}>
        <CheckIcon size={14} />
        {method ?? 'شاپرک'} · کد رهگیری{' '}
        <span className={shared.trackingCode}>{toLatinDigits(trackingCode)}</span>
      </p>
    )
  }
  if (receiptUrl) {
    return (
      <p className={`${styles.doc} t-caption`}>
        <CheckIcon size={14} />
        {method ?? 'کارت به کارت'} · تصویر فیش ثبت شده
        {receiptNo ? ` · شماره ${toLatinDigits(receiptNo)}` : ''}
      </p>
    )
  }
  return (
    <p className={`${styles.docMissing} t-caption`}>
      {method ?? 'پرداخت'} · سندی ثبت نشده
    </p>
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
    <div className={shared.sheetBackdrop} role="dialog" aria-label="پرداخت با شاپرک">
      <div className={shared.sheet}>
        <h2 className={`${shared.sheetTitle} t-h2`}>پرداخت با شاپرک</h2>

        {phase === 'start' ? (
          <>
            <p className={`${shared.payAmount} t-h2`}>{formatRial(due)}</p>
            <p className={`${shared.hint} t-caption`}>
              شهریه {invoice.period} · {invoice.childName}
            </p>
            <p className={`${shared.hint} t-caption`}>
              به درگاه بانکی شاپرک منتقل می‌شوید. پس از پرداخت، رسید با کد رهگیری
              همین‌جا صادر می‌شود.
            </p>
            {error ? <p className={`${shared.error} t-body`}>{error}</p> : null}
            <button type="button" className={`${shared.primary} t-body`} onClick={() => void start()}>
              رفتن به درگاه
            </button>
            <button type="button" className={`${shared.ghost} t-body`} onClick={onClose}>
              انصراف
            </button>
          </>
        ) : null}

        {phase === 'gateway' ? (
          <>
            <p className={`${shared.hint} t-body`}>
              در درگاه بانک هستید. پس از پرداخت، به اپ برمی‌گردید.
            </p>
            <button type="button" className={`${shared.primary} t-body`} onClick={backFromGateway}>
              بازگشت از درگاه
            </button>
          </>
        ) : null}

        {phase === 'checking' ? (
          <p className={`${shared.hint} t-body`} role="status" aria-live="polite">
            در حال تأیید پرداخت…
          </p>
        ) : null}

        {phase === 'done' && result ? (
          <>
            {result.state === 'paid' ? (
              <>
                <p className={`${shared.payDone} t-body`}>
                  <CheckIcon size={20} />
                  پرداخت {formatRial(result.amount)} تأیید شد.
                </p>
                <p className={`${shared.trackingCode} t-body`}>
                  کد رهگیری: {toPersianDigits(result.trackingCode)}
                </p>
                <p className={`${shared.hint} t-caption`}>
                  این کد را نگه دارید. در فهرست پرداخت‌ها هم می‌ماند.
                </p>
              </>
            ) : result.state === 'failed' ? (
              <p className={`${shared.error} t-body`}>{result.reason}</p>
            ) : (
              <p className={`${shared.hint} t-body`}>
                پرداخت شما در حال بررسی است. تا چند دقیقه دیگر وضعیت به‌روز
                می‌شود. اگر مبلغ کسر شده و تا ۷۲ ساعت برنگشت، با مهد تماس بگیرید.
              </p>
            )}
            {error ? <p className={`${shared.error} t-body`}>{error}</p> : null}
            <button type="button" className={`${shared.primary} t-body`} onClick={() => void onDone()}>
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
    <div className={shared.sheetBackdrop} role="dialog" aria-label="اعلام پرداخت">
      <div className={shared.sheet}>
        <p className={`${shared.sheetTitle} t-h2`}>کارت به کارت</p>
        <p className={`${shared.hint} t-body`}>
          {formatPeriod(invoice.period)} · باقی‌مانده{' '}
          <b className={shared.amount}>{formatRial(remaining)}</b>
        </p>
        {/*
          مسیر دوم، و صریح می‌گوید چرا دوم است.
          شاپرک همان لحظه تسویه می‌کند؛ این یکی تا وقتی مدیر رسید را
          ندیده، هیچ ریالی در دفتر مالی ثبت نمی‌شود.
        */}
        <p className={`${shared.hint} t-caption`}>
          پس از واریز، تصویر رسید را اینجا بگذارید. تا مدیر تأییدش نکند،
          صورتحساب همچنان پرداخت‌نشده می‌ماند.
        </p>

        <label className={`${shared.field} t-caption`}>
          مبلغی که پرداخت کردید، به تومان
          <input
            className={shared.input}
            value={amount}
            inputMode="numeric"
            aria-label="مبلغ پرداختی"
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>

        {receipt ? (
          <img className={shared.receipt} src={receipt} alt="رسید پرداخت" />
        ) : null}

        <button
          type="button"
          className={`${shared.pickReceipt} ${receipt ? shared.pickReceiptDone : ''} t-body`}
          onClick={() => fileInput.current?.click()}
        >
          {receipt ? 'عکس دیگری انتخاب کنید' : 'عکس رسید را بگذارید'}
        </button>
        <input
          ref={fileInput}
          className={shared.hiddenInput}
          type="file"
          accept="image/*"
          aria-label="عکس رسید"
          onChange={(event) => {
            void pick(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        <p className={`${shared.hint} t-caption`}>
          بدون رسید هم می‌توانید اعلام کنید، ولی با رسید زودتر تأیید می‌شود.
        </p>

        <label className={`${shared.field} t-caption`}>
          توضیح، اگر لازم است
          <input
            className={shared.input}
            value={note}
            aria-label="توضیح پرداخت"
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

        {error ? <p className={`${shared.error} t-body`}>{error}</p> : null}

        <div className={shared.sheetActions}>
          <button type="button" className={shared.secondary} onClick={onClose}>
            انصراف
          </button>
          <button
            type="button"
            className={`${shared.primary} t-body`}
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