import { useCallback, useEffect, useState } from 'react'
import { AlertIcon, CheckIcon, EmptyState } from '../../design-system/index.ts'
import { formatCount, formatRial, jalaliYearMonth, toIsoDate, toLatinDigits, toPersianDigits } from '../../i18n/index.ts'
import { useData } from '../../core/auth/index.ts'
import type { FinanceOverview, Invoice } from '../../core/data/index.ts'
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
  const [paying, setPaying] = useState<Invoice | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setView(await data.getFinance(period))
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'خوانده نشد.')
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

function InvoiceRow({ invoice, onPay }: { invoice: Invoice; onPay: () => void }) {
  const due = invoice.amount - invoice.discount + invoice.lateFee - invoice.paid
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
  const remaining = invoice.amount - invoice.discount + invoice.lateFee - invoice.paid
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
      <span className={`${styles.tileLabel} t-caption`}>{label}</span>
      <span className={`${styles.tileValue} ${tone === 'ok' ? styles.ok : ''}`}>{formatRial(value)}</span>
    </div>
  )
}
