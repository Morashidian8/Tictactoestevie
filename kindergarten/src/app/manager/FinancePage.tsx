import { useCallback, useEffect, useState } from 'react'
import { AlertIcon, CheckIcon, EmptyState } from '../../design-system/index.ts'
import { formatCount, formatRial, jalaliYearMonth, toIsoDate, toLatinDigits, toPersianDigits } from '../../i18n/index.ts'
import { useData } from '../../core/auth/index.ts'
import { invoiceDue } from '../../core/data/index.ts'
import { ChoiceGroup, JalaliDateField } from '../../design-system/index.ts'
import type {
  ClassRoom,
  ExpenseCategory,
  FeeItem,
  FinanceOverview,
  IncomeVsExpense,
  Invoice,
  PaymentClaim,
} from '../../core/data/index.ts'
import styles from './FinancePage.module.css'

/**
 * مالی پایه — ماژول M5 و بخش ۸.
 *
 * آنچه سند خواسته و اینجا هست: تعریف شهریه، صدور گروهی، ثبت پرداخت
 * دستی و رسید، بدهی و یادآوری پیامکی، گزارش وصولی و معوقات.
 *
 * آنچه عمداً نیست: درگاه پرداخت آنلاین (فاز ۳)، سامانه مودیان (فاز ۳)،
 * و هر تحلیل درآمد در برابر هزینه (فاز ۳). ثبت دستی فعلاً کافی است.
 */

const STATUS_TEXT: Record<Invoice['status'], string> = {
  issued: 'صادر شده',
  partially_paid: 'بخشی پرداخت شده',
  paid: 'تسویه',
  overdue: 'معوق',
  cancelled: 'لغو شده',
}

export function FinancePage({ onBack }: { onBack: () => void }) {
  const data = useData()
  const [period] = useState(() => jalaliYearMonth(new Date()))
  const [view, setView] = useState<FinanceOverview | null>(null)
  /** اعلام‌های پرداخت خانواده‌ها، در انتظار تصمیم — بخش ۸. */
  const [claims, setClaims] = useState<PaymentClaim[]>([])
  /** اقلام هزینه این دوره — ناهار، اردو، کاردستی. */
  const [items, setItems] = useState<FeeItem[]>([])
  /** هزینه‌های همین دوره، در برابر وصولی — ماژول M16، بخش ۸.۳. */
  const [books, setBooks] = useState<IncomeVsExpense | null>(null)
  const [spending, setSpending] = useState(false)
  const [defining, setDefining] = useState(false)
  const [rejecting, setRejecting] = useState<PaymentClaim | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [zoom, setZoom] = useState<string | null>(null)
  const [paying, setPaying] = useState<Invoice | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [overview, pending, feeItems] = await Promise.all([
        data.getFinance(period),
        data.listPaymentClaims('pending'),
        data.listFeeItems(period),
      ])
      setView(overview)
      setClaims(pending)
      setItems(feeItems)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'خوانده نشد.')
    }
    // دفتر هزینه جدا خوانده می‌شود: نبودش نباید کل صفحه مالی را خالی کند.
    try {
      setBooks(await data.getIncomeVsExpense(period))
    } catch {
      setBooks(null)
    }
  }, [data, period])

  useEffect(() => {
    void load()
  }, [load])

  const issue = async () => {
    setBusy(true)
    try {
      // سررسید پیش‌فرض: ده روز بعد. مدیر می‌تواند بعداً تغییرش دهد.
      const due = new Date()
      due.setDate(due.getDate() + 10)
      const made = await data.issueInvoices(period, toIsoDate(due))
      setNote(
        made > 0
          ? `${formatCount(made)} صورتحساب صادر شد.`
          : 'همه کودکان صورتحساب این دوره را دارند.',
      )
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'صادر نشد.')
    } finally {
      setBusy(false)
    }
  }

  const decideClaim = async (claimId: string, approve: boolean, reason?: string) => {
    setBusy(true)
    try {
      await data.decidePaymentClaim(claimId, approve, reason)
      setNote(approve ? 'پرداخت تأیید و ثبت شد.' : 'اعلام رد شد و دلیلش برای خانواده رفت.')
      setRejecting(null)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
    } finally {
      setBusy(false)
    }
  }

  /*
   * فرستادن، برگشت‌ناپذیر است.
   *
   * پس از انتشار، قلم روی صورتحساب خانواده‌ها می‌نشیند و در اپشان
   * دیده می‌شود. همین است که ساختن و فرستادن را دو ضربه نگه می‌دارد.
   */
  const publish = async (item: FeeItem) => {
    setBusy(true)
    try {
      const made = await data.publishFeeItem(item.id)
      setNote(
        item.optional
          ? `«${item.title}» برای ${formatCount(item.childCount)} خانواده فرستاده شد. تا نپذیرند، روی صورتحساب نمی‌نشیند.`
          : `«${item.title}» روی ${formatCount(made)} صورتحساب نشست.`,
      )
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'فرستاده نشد.')
    } finally {
      setBusy(false)
    }
  }

  const remind = async () => {
    setBusy(true)
    try {
      const sent = await data.remindOverdue(period)
      setNote(
        sent > 0
          ? `${formatCount(sent)} یادآوری پیامکی فرستاده شد.`
          : 'معوقی با شماره ثبت‌شده نبود.',
      )
      await load()
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
        <span className={`${styles.title} t-h2`}>مالی</span>
        <span className={`${styles.period} t-caption`}>{toPersianDigits(period)}</span>
      </header>

      <div className={styles.body}>
        {view ? (
          <>
            <div className={styles.tiles}>
              <Tile label="صادر شده" value={view.issued} />
              <Tile label="وصول‌شده" value={view.collected} tone="ok" />
              <Tile label="مانده" value={view.outstanding} tone={view.outstanding > 0 ? 'warn' : 'plain'} />
            </div>

            {/*
              اعلام‌های خانواده بالاتر از همه‌چیز، چون تنها بخش این صفحه
              است که کس دیگری منتظر تصمیم مدیر مانده.
            */}
            {claims.length > 0 ? (
              <section className={`${styles.card} ${styles.claims}`} aria-label="اعلام‌های پرداخت">
                <p className={`${styles.warnHead} t-body`}>
                  <AlertIcon size={20} />
                  {formatCount(claims.length)} اعلام پرداخت در انتظار تأیید
                </p>
                {claims.map((claim) => (
                  <article key={claim.id} className={styles.claim}>
                    <p className={`${styles.claimTop} t-body`}>
                      <b>{claim.childName}</b>
                      <span className={styles.muted}>{toPersianDigits(claim.period)}</span>
                      <b className={styles.amount}>{formatRial(claim.amount)}</b>
                    </p>
                    {claim.note ? (
                      <p className={`${styles.muted} t-caption`}>{claim.note}</p>
                    ) : null}

                    {claim.receiptUrl ? (
                      <button
                        type="button"
                        className={styles.receiptThumb}
                        onClick={() => setZoom(claim.receiptUrl)}
                        aria-label="بزرگ‌نمایی رسید"
                      >
                        <img src={claim.receiptUrl} alt="" />
                        <span className={`${styles.muted} t-caption`}>رسید — برای بزرگ‌نمایی بزنید</span>
                      </button>
                    ) : (
                      <p className={`${styles.noReceipt} t-caption`}>رسیدی پیوست نشده.</p>
                    )}

                    <div className={styles.claimActions}>
                      <button
                        type="button"
                        className={`${styles.decide} ${styles.decidePrimary} t-body`}
                        disabled={busy}
                        onClick={() => void decideClaim(claim.id, true)}
                      >
                        تأیید و ثبت پرداخت
                      </button>
                      <button
                        type="button"
                        className={`${styles.decide} t-body`}
                        disabled={busy}
                        onClick={() => {
                          setRejecting(claim)
                          setRejectReason('')
                        }}
                      >
                        رد
                      </button>
                    </div>
                  </article>
                ))}
              </section>
            ) : null}

            {note ? (
              <p className={`${styles.note} t-body`}>
                <CheckIcon size={18} />
                {note}
              </p>
            ) : null}

            <section className={styles.card} aria-label="شهریه‌ها">
              <span className={`${styles.cardLabel} t-caption`}>شهریه‌ها</span>
              {view.plans.map((plan) => (
                <p key={plan.id} className={`${styles.row} t-body`}>
                  <span>{plan.title}</span>
                  <span className={`${styles.muted} t-caption`}>
                    {formatCount(plan.childCount)} کودک
                  </span>
                  <b className={styles.amount}>{formatRial(plan.amount)}</b>
                </p>
              ))}
              <button type="button" className={styles.action} disabled={busy} onClick={() => void issue()}>
                صدور گروهی صورتحساب این دوره
              </button>
            </section>

            {/*
              اقلام هزینه — خواسته مالک محصول: «بتونه هزینه تعریف کنه و
              بفرسته برای والدین».

              زیر «شهریه‌ها» می‌آید چون اقلام روی همان صورتحساب دوره
              می‌نشینند و بی صدور، جایی ندارند که بنشینند.
            */}
            <section className={styles.card} aria-label="اقلام هزینه">
              <span className={`${styles.cardLabel} t-caption`}>اقلام هزینه این دوره</span>
              {items.length === 0 ? (
                <p className={`${styles.muted} t-body`}>
                  قلمی تعریف نشده. ناهار، اردو، لوازم کاردستی و مانند این‌ها اینجا تعریف می‌شوند.
                </p>
              ) : (
                items.map((item) => (
                  <article key={item.id} className={styles.feeItem}>
                    <p className={`${styles.row} t-body`}>
                      <span>{item.title}</span>
                      <span className={`${styles.muted} t-caption`}>
                        {item.optional ? 'اختیاری' : 'اجباری'}
                      </span>
                      <b className={styles.amount}>{formatRial(item.amount)}</b>
                    </p>
                    {/*
                      دو عدد جدا و نه یکی: «برای چند نفر فرستاده شد» با
                      «روی چند صورتحساب نشست» فرق دارد، و تفاوتشان دقیقاً
                      همان خانواده‌هایی است که هنوز جواب نداده‌اند.
                    */}
                    <p className={`${styles.muted} t-caption`}>
                      {item.published
                        ? item.optional
                          ? `${formatCount(item.childCount)} خانواده · ${formatCount(item.acceptedCount)} پذیرفته · ${formatCount(item.declinedCount)} نپذیرفته`
                          : `روی ${formatCount(item.issuedCount)} صورتحساب از ${formatCount(item.childCount)}`
                        : `${formatCount(item.childCount)} خانواده — هنوز فرستاده نشده`}
                    </p>
                    {item.published ? null : (
                      <button
                        type="button"
                        className={styles.action}
                        disabled={busy}
                        onClick={() => void publish(item)}
                      >
                        فرستادن به خانواده‌ها
                      </button>
                    )}
                  </article>
                ))
              )}
              <button
                type="button"
                className={styles.action}
                disabled={busy}
                onClick={() => setDefining(true)}
              >
                تعریف قلم تازه
              </button>
            </section>

            {view.overdue.length > 0 ? (
              <section className={`${styles.card} ${styles.warnCard}`} aria-label="معوقات">
                <p className={`${styles.warnHead} t-body`}>
                  <AlertIcon size={20} />
                  {formatCount(view.overdue.length)} خانواده سررسید گذشته دارند
                </p>
                {view.overdue.map((invoice) => (
                  <InvoiceRow key={invoice.id} invoice={invoice} onPay={() => setPaying(invoice)} />
                ))}
                <button type="button" className={styles.action} disabled={busy} onClick={() => void remind()}>
                  یادآوری پیامکی به همه معوق‌ها
                </button>
              </section>
            ) : null}

            {/*
              درآمد در برابر هزینه — ماژول M16.

              «درآمد» یعنی پولی که واقعاً وصول شده، نه مبلغی که صادر
              شده. صورتحسابِ صادرشده هنوز پول نیست، و مهدی که آن را
              درآمد بخواند ماه بعد حقوق پرداخت نمی‌کند — پس عنوانش
              «وصول‌شده» است، نه «درآمد».

              آنچه اینجا ساخته نمی‌شود (پیوست ج): انبارداری، سفارش
              خرید، تأمین‌کننده، حسابداری. این یک دفترِ ساده است تا
              مدیر ته ماه بداند چه ماند، نه یک سامانه مالی.
            */}
            <section className={styles.card} aria-label="وصولی و هزینه">
              <span className={`${styles.cardLabel} t-caption`}>وصولی و هزینه این ماه</span>
              {books === null ? (
                <p className={`${styles.muted} t-body`}>در حال خواندن…</p>
              ) : (
                <>
                  <p className={`${styles.row} t-body`}>
                    <span>وصولی</span>
                    <b className="tabular">{formatRial(books.collected)}</b>
                  </p>
                  <p className={`${styles.row} t-body`}>
                    <span>هزینه</span>
                    <b className="tabular">{formatRial(books.spent)}</b>
                  </p>
                  {/*
                    «مانده» و نه «سود»: مهدکودک سود و زیان حساب نمی‌کند
                    و اینجا حقوق و اجاره و بیمه نیامده. کلمه‌ای که
                    بیش از داده‌اش ادعا کند، تصمیم غلط می‌سازد.
                  */}
                  <p className={`${styles.row} t-body`}>
                    <span>مانده</span>
                    <b
                      className={`tabular ${
                        books.collected - books.spent < 0 ? styles.warnText : ''
                      }`}
                    >
                      {formatRial(books.collected - books.spent)}
                    </b>
                  </p>

                  {books.byCategory.length > 0 ? (
                    <>
                      <span className={`${styles.cardLabel} t-caption`}>هزینه به تفکیک</span>
                      {books.byCategory.map((line) => (
                        <p key={line.category} className={`${styles.row} t-body`}>
                          <span>{EXPENSE_TEXT[line.category] ?? line.category}</span>
                          <b className="tabular">{formatRial(line.total)}</b>
                        </p>
                      ))}
                    </>
                  ) : (
                    <p className={`${styles.muted} t-body`}>هزینه‌ای برای این ماه ثبت نشده.</p>
                  )}
                </>
              )}
              <button type="button" className={styles.action} onClick={() => setSpending(true)}>
                ثبت هزینه
              </button>
            </section>

            <section className={styles.card} aria-label="صورتحساب‌های تسویه‌نشده">
              <span className={`${styles.cardLabel} t-caption`}>تسویه‌نشده</span>
              {view.unpaid.length === 0 ? (
                <p className={`${styles.muted} t-body`}>
                  {view.issued === 0
                    ? 'هنوز صورتحسابی برای این دوره صادر نشده.'
                    : 'همه صورتحساب‌های این دوره تسویه شده‌اند.'}
                </p>
              ) : (
                view.unpaid.map((invoice) => (
                  <InvoiceRow key={invoice.id} invoice={invoice} onPay={() => setPaying(invoice)} />
                ))
              )}
            </section>
          </>
        ) : (
          <EmptyState text="در حال خواندن…" />
        )}

        {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}
      </div>

      {spending ? (
        <ExpenseSheet
          onClose={() => setSpending(false)}
          onDone={async (message) => {
            setSpending(false)
            setNote(message)
            await load()
          }}
        />
      ) : null}

      {zoom ? (
        <button
          type="button"
          className={styles.zoomBackdrop}
          onClick={() => setZoom(null)}
          aria-label="بستن رسید"
        >
          <img className={styles.zoomImage} src={zoom} alt="رسید پرداخت" />
        </button>
      ) : null}

      {rejecting ? (
        <div className={styles.sheetBackdrop} role="dialog" aria-label="رد اعلام پرداخت">
          <div className={styles.sheet}>
            <p className={`${styles.sheetTitle} t-h2`}>رد اعلام {rejecting.childName}</p>
            {/* رد بدون دلیل، خانواده را سردرگم می‌گذارد. */}
            <label className={`${styles.field} t-caption`}>
              دلیل، تا خانواده بداند چه شد
              <input
                className={styles.input}
                value={rejectReason}
                aria-label="دلیل رد"
                placeholder="مثلاً: رسید مربوط به این دوره نیست."
                onChange={(event) => setRejectReason(event.target.value)}
              />
            </label>
            <div className={styles.sheetActions}>
              <button type="button" className={styles.secondary} onClick={() => setRejecting(null)}>
                انصراف
              </button>
              <button
                type="button"
                className={`${styles.primary} t-body-lg`}
                disabled={rejectReason.trim().length === 0 || busy}
                onClick={() => void decideClaim(rejecting.id, false, rejectReason)}
              >
                رد اعلام
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {defining ? (
        <FeeItemSheet
          period={period}
          onClose={() => setDefining(false)}
          onDone={async (title) => {
            setDefining(false)
            setNote(`«${title}» تعریف شد. هنوز فرستاده نشده.`)
            await load()
          }}
        />
      ) : null}

      {paying ? (
        <PaymentSheet
          invoice={paying}
          onClose={() => setPaying(null)}
          onDone={async () => {
            setPaying(null)
            setNote('پرداخت ثبت شد.')
            await load()
          }}
        />
      ) : null}
    </div>
  )
}

/**
 * تعریف قلم هزینه.
 *
 * دو تصمیمی که این شیت از مدیر می‌گیرد و هیچ‌کدام پیش‌فرض بی‌خطر
 * ندارند:
 *
 * ۱. **اجباری یا اختیاری.** اختیاری یعنی تا خانواده نپذیرد، روی
 *    صورتحساب نمی‌نشیند. اردو اختیاری است؛ ناهارِ کودک تمام‌روز نه.
 *    پیش‌فرض «اختیاری» است، چون اشتباه در این جهت قابل جبران است و
 *    در جهت دیگر یعنی صورتحسابی که باید تلفنی پس گرفته شود.
 *
 * ۲. **برای چه کسانی.** کل مهد یا یک کلاس. فهرست کودکان همین‌جا ثابت
 *    می‌شود، نه هنگام فرستادن.
 */
function FeeItemSheet({ period, onClose, onDone }: {
  period: string
  onClose: () => void
  onDone: (title: string) => Promise<void>
}) {
  const data = useData()
  const [classes, setClasses] = useState<ClassRoom[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [optional, setOptional] = useState(true)
  const [classId, setClassId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    data.listClasses().then(setClasses).catch(() => setClasses([]))
  }, [data])

  // ریال به تومان: مدیر تومان می‌نویسد، داده ریال نگه می‌دارد.
  const rial = Number(toLatinDigits(amount).replace(/[^0-9]/g, '')) * 10

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await data.createFeeItem({
        title,
        description,
        amount: rial,
        period,
        optional,
        scope: classId ? { kind: 'class', classId } : { kind: 'center' },
      })
      await onDone(title.trim())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ساخته نشد.')
      setBusy(false)
    }
  }

  return (
    <div className={styles.sheetBackdrop} role="dialog" aria-label="تعریف قلم هزینه">
      <div className={styles.sheet}>
        <p className={`${styles.sheetTitle} t-h2`}>قلم هزینه تازه</p>

        <label className={`${styles.field} t-caption`}>
          عنوان
          <input
            className={styles.input}
            value={title}
            aria-label="عنوان قلم"
            placeholder="مثلاً: اردوی باغ پرندگان"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <label className={`${styles.field} t-caption`}>
          مبلغ، به تومان
          <input
            className={styles.input}
            value={amount}
            inputMode="numeric"
            aria-label="مبلغ قلم"
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>

        <label className={`${styles.field} t-caption`}>
          توضیح برای خانواده — اختیاری
          <input
            className={styles.input}
            value={description}
            aria-label="توضیح قلم"
            placeholder="مثلاً: پنجشنبه، با سرویس مهد."
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>

        <fieldset className={styles.choices}>
          <legend className={`${styles.muted} t-caption`}>شرکت</legend>
          <button
            type="button"
            className={styles.choice}
            aria-pressed={optional}
            onClick={() => setOptional(true)}
          >
            اختیاری
          </button>
          <button
            type="button"
            className={styles.choice}
            aria-pressed={!optional}
            onClick={() => setOptional(false)}
          >
            اجباری
          </button>
        </fieldset>
        <p className={`${styles.muted} t-caption`}>
          {optional
            ? 'تا خانواده نپذیرد، روی صورتحساب نمی‌نشیند.'
            : 'روی صورتحساب همه کودکانِ دامنه می‌نشیند.'}
        </p>

        <fieldset className={styles.choices}>
          <legend className={`${styles.muted} t-caption`}>برای</legend>
          <button
            type="button"
            className={styles.choice}
            aria-pressed={classId === null}
            onClick={() => setClassId(null)}
          >
            کل مهد
          </button>
          {classes.map((klass) => (
            <button
              key={klass.id}
              type="button"
              className={styles.choice}
              aria-pressed={classId === klass.id}
              onClick={() => setClassId(klass.id)}
            >
              {klass.name}
            </button>
          ))}
        </fieldset>

        {error ? <p className={`${styles.error} t-caption`}>{error}</p> : null}

        <div className={styles.sheetActions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            انصراف
          </button>
          <button
            type="button"
            className={`${styles.primary} t-body-lg`}
            disabled={busy || title.trim().length === 0 || rial <= 0}
            onClick={() => void submit()}
          >
            تعریف قلم
          </button>
        </div>
      </div>
    </div>
  )
}

function InvoiceRow({ invoice, onPay }: { invoice: Invoice; onPay: () => void }) {
  const due = invoiceDue(invoice)
  return (
    <button type="button" className={styles.invoice} onClick={onPay}>
      <span className={styles.invoiceName}>{invoice.childName}</span>
      <span className={`${styles.status} ${invoice.status === 'overdue' ? styles.statusOverdue : ''} t-caption`}>
        {STATUS_TEXT[invoice.status]}
      </span>
      <b className={styles.amount}>{formatRial(due)}</b>
    </button>
  )
}

/** ثبت پرداخت دستی و رسید — بخش ۸. */
function PaymentSheet({
  invoice,
  onClose,
  onDone,
}: {
  invoice: Invoice
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const data = useData()
  const remaining = invoiceDue(invoice)
  const [amount, setAmount] = useState(String(Math.round(remaining / 10)))
  const [method, setMethod] = useState('کارت‌به‌کارت')
  const [receipt, setReceipt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      // ورودی به تومان است و ستون به ریال؛ تبدیل فقط همین‌جا.
      const rial = Number(toLatinDigits(amount).replace(/\D/g, '')) * 10
      await data.recordPayment({
        invoiceId: invoice.id,
        amount: rial,
        method,
        receiptNo: receipt.trim() || null,
      })
      await onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
      setBusy(false)
    }
  }

  return (
    <div className={styles.sheetBackdrop} role="dialog" aria-label="ثبت پرداخت">
      <div className={styles.sheet}>
        <p className={`${styles.sheetTitle} t-h2`}>{invoice.childName}</p>
        <p className={`${styles.muted} t-body`}>
          باقی‌مانده: <b className={styles.amount}>{formatRial(remaining)}</b>
        </p>

        <label className={`${styles.field} t-caption`}>
          مبلغ پرداختی، به تومان
          <input
            className={styles.input}
            value={amount}
            inputMode="numeric"
            aria-label="مبلغ پرداختی"
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>

        <div className={styles.methods}>
          {['کارت‌به‌کارت', 'نقدی', 'دستگاه کارت‌خوان'].map((choice) => (
            <button
              key={choice}
              type="button"
              className={`${styles.choice} t-body`}
              aria-pressed={method === choice}
              onClick={() => setMethod(choice)}
            >
              {choice}
            </button>
          ))}
        </div>

        <label className={`${styles.field} t-caption`}>
          شماره رسید، اگر دارد
          <input
            className={styles.input}
            value={receipt}
            aria-label="شماره رسید"
            onChange={(event) => setReceipt(event.target.value)}
          />
        </label>

        {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}

        <div className={styles.sheetActions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            انصراف
          </button>
          <button
            type="button"
            className={`${styles.primary} t-body-lg`}
            disabled={busy}
            onClick={() => void submit()}
          >
            ثبت پرداخت
          </button>
        </div>
      </div>
    </div>
  )
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' | 'plain' }) {
  return (
    <div className={`${styles.tile} ${tone === 'warn' ? styles.tileWarn : ''}`}>
      <span className={`${styles.tileLabel} t-body-sm`}>{label}</span>
      <span className={`${styles.tileValue} ${tone === 'ok' ? styles.ok : ''}`}>{formatRial(value)}</span>
    </div>
  )
}


/* ── ثبت هزینه — ماژول M16 ──────────────────────────────────── */

const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'food', label: 'خوراک' },
  { value: 'supplies', label: 'ملزومات' },
  { value: 'equipment', label: 'تجهیزات' },
  { value: 'repair', label: 'تعمیر' },
  { value: 'utilities', label: 'قبوض' },
  { value: 'other', label: 'سایر' },
]

const EXPENSE_TEXT: Record<string, string> = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.value, c.label]),
)

/**
 * ثبت یک هزینه.
 *
 * مبلغ به **تومان** گرفته می‌شود و به ریال ذخیره — همان قاعده‌ای که
 * بقیه این صفحه دارد. مردم به تومان حرف می‌زنند و ستون پایگاه داده
 * ریال است؛ ضربدر ده فقط یک جا انجام می‌شود.
 *
 * آنچه اینجا نیست و عمدی است (پیوست ج): تأمین‌کننده، سفارش خرید،
 * انبار. این یک دفترِ ساده است تا مدیر ته ماه بداند چه ماند، نه یک
 * سامانه حسابداری.
 */
function ExpenseSheet({ onClose, onDone }: {
  onClose: () => void
  onDone: (message: string) => Promise<void>
}) {
  const data = useData()
  const [date, setDate] = useState<string | null>(toIsoDate(new Date()))
  const [category, setCategory] = useState<ExpenseCategory>('food')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rial = Number(toLatinDigits(amount).replace(/\D/g, '')) * 10

  const submit = async () => {
    if (!date) {
      setError('روز هزینه را از تقویم انتخاب کنید.')
      return
    }
    if (rial <= 0) {
      setError('مبلغ را بنویسید.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await data.addExpense({ date, amount: rial, category, note })
      await onDone(`هزینه ${EXPENSE_TEXT[category]} ثبت شد.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
      setBusy(false)
    }
  }

  return (
    <div className={styles.sheetBackdrop} role="dialog" aria-label="ثبت هزینه">
      <div className={styles.sheet}>
        <p className={`${styles.sheetTitle} t-h2`}>هزینه تازه</p>

        <ChoiceGroup
          label="دسته"
          options={EXPENSE_CATEGORIES}
          value={category}
          onChange={setCategory}
        />

        <JalaliDateField label="روز" value={date} onChange={setDate} allowClear={false} />

        <label className={`${styles.field} t-caption`}>
          مبلغ به تومان
          <input
            className={styles.input}
            value={amount}
            inputMode="numeric"
            aria-label="مبلغ هزینه"
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        {rial > 0 ? (
          <p className={`${styles.muted} t-caption`}>{formatRial(rial)}</p>
        ) : null}

        <label className={`${styles.field} t-caption`}>
          بابت چه
          <input
            className={styles.input}
            value={note}
            aria-label="توضیح هزینه"
            placeholder="خرید هفتگی میوه"
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

        {error ? <p className={`${styles.error} t-caption`}>{error}</p> : null}

        <div className={styles.sheetActions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            انصراف
          </button>
          <button
            type="button"
            className={`${styles.primary} t-body-sm`}
            onClick={() => void submit()}
            disabled={busy || rial <= 0}
          >
            ثبت
          </button>
        </div>
      </div>
    </div>
  )
}
