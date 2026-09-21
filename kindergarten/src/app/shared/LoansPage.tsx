import { useCallback, useEffect, useState } from 'react'
import {
  AlertIcon,
  BottomSheet,
  ChoiceGroup,
  EmptyState,
  JalaliDateField,
} from '../../design-system/index.ts'
import { formatCount, formatJalali, toIsoDate } from '../../i18n/index.ts'
import { useData } from '../../core/auth/index.ts'
import type { Loan, LoanKind, OpenLoan } from '../../core/data/index.ts'
import styles from './LoansPage.module.css'

/**
 * دفتر امانت — ماژول ۰۰۳۵.
 *
 * کودک کتاب یا اسباب‌بازی مهد را خانه می‌برد. امروز مربی این را روی یک
 * کاغذ می‌نویسد یا اصلاً نمی‌نویسد، و هفته بعد هیچ‌کس نمی‌داند «قصه‌های
 * خوب» کجاست — و بدتر: خانواده‌ای که آن را برگردانده، دوباره ازش
 * پرسیده می‌شود.
 *
 * ── چهار قاعده که این صفحه نگه می‌دارد ──────────────────────
 *
 * ۱. **دفتر است، نه انبار.** پیوست ج انبارداری را صریح رد کرده: نه
 *    موجودی، نه قیمت، نه سفارش. فقط «چه چیزی دست کیست».
 *
 * ۲. **بازگشت، تاریخ است نه تیک.** «برگشت؟ بله» به سؤالِ «کِی پس
 *    داد؟» جواب نمی‌دهد.
 *
 * ۳. **هیچ جریمه و بدهی‌ای ساخته نمی‌شود.** وسیله‌ای که برنگشته یک
 *    یادآوری است، نه یک قلم مالی. وصل کردنش به صورتحساب یعنی مهد سر
 *    یک کتاب با خانواده طرف حساب می‌شود.
 *
 * ۴. **شمارش تأخیر، معیارِ کودک نیست.** خط قرمز ۱۰: هیچ عددی که بشود
 *    کودکان را با آن رتبه کرد. پس نه شمارنده‌ای روی پرونده کودک، و نه
 *    فهرستی که کودکان را بر اساس تأخیر مرتب کند.
 *
 * نمای مشترک مربی و مدیر است: سؤالشان یکی است و ساختن دو صفحه برای یک
 * سؤال، یعنی روزی یکی‌شان از قلم می‌افتد.
 */
export const LOAN_KINDS: { value: LoanKind; label: string }[] = [
  { value: 'book', label: 'کتاب' },
  { value: 'toy', label: 'اسباب‌بازی' },
  { value: 'clothing', label: 'لباس یا کفش' },
  { value: 'equipment', label: 'وسیله آموزشی' },
  { value: 'other', label: 'سایر' },
]

export const LOAN_KIND_TEXT: Record<string, string> = Object.fromEntries(
  LOAN_KINDS.map((k) => [k.value, k.label]),
)

export function LoansPage() {
  const data = useData()
  const [rows, setRows] = useState<OpenLoan[] | null>(null)
  const [lending, setLending] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setRows(await data.listOpenLoans())
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'خوانده نشد.')
      setRows([])
    }
  }, [data])

  useEffect(() => {
    void load()
  }, [load])

  const give = async (loan: OpenLoan) => {
    setBusy(loan.id)
    try {
      await data.returnItem(loan.id)
      setNote(`«${loan.title}» برگشت.`)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={styles.page}>
      {note ? <p className={`${styles.note} t-body`}>{note}</p> : null}

      <section className={styles.card} aria-label="امانت‌های بیرون">
        <span className={`${styles.cardLabel} t-caption`}>هنوز برنگشته</span>
        {rows === null ? (
          <EmptyState text="در حال خواندن…" />
        ) : rows.length === 0 ? (
          <p className={`${styles.muted} t-body`}>هیچ وسیله‌ای بیرون نیست.</p>
        ) : (
          rows.map((loan) => (
            <article key={loan.id} className={styles.row}>
              <div className={styles.main}>
                {/*
                  نامِ وسیله بالا و نام کودک زیرش، چون سؤالِ واقعیِ این
                  صفحه «این کتاب دست کیست؟» است نه «این کودک چه دارد؟».
                  آن یکی سؤال، جایش پرونده خودِ کودک است.
                */}
                <p className={`${styles.title} t-body-lg`}>{loan.title}</p>
                <p className={`${styles.who} t-caption`}>
                  {loan.childName}
                  {loan.className ? ` · ${loan.className}` : ''} ·{' '}
                  {LOAN_KIND_TEXT[loan.kind] ?? loan.kind}
                </p>
                <p className={`${styles.when} t-caption`}>
                  {formatJalali(new Date(loan.lentOn), 'short')} ·{' '}
                  {formatCount(loan.daysOut)} روز بیرون
                </p>
                {/*
                  قرارِ گذشته، تنها چیزی است که در این صفحه رنگ می‌گیرد —
                  و کلمه هم کنارش هست: رنگ هرگز تنها حامل معنا نیست.
                */}
                {loan.overdue && loan.dueOn ? (
                  <p className={`${styles.late} t-caption`}>
                    <span aria-hidden>
                      <AlertIcon size={16} />
                    </span>
                    قرارش {formatJalali(new Date(loan.dueOn), 'short')} بود
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className={`${styles.give} t-body-sm`}
                disabled={busy === loan.id}
                onClick={() => void give(loan)}
              >
                برگشت
              </button>
            </article>
          ))
        )}
      </section>

      <button type="button" className={styles.action} onClick={() => setLending(true)}>
        ثبت امانت تازه
      </button>

      {/*
        آنچه این صفحه عمداً ندارد: شمارشِ «چه کودکی بیشترین تأخیر را
        دارد». خط قرمز ۱۰ — هیچ عددی که بشود کودکان را با آن رتبه کرد.
      */}
      <p className={`${styles.muted} t-caption`}>
        دفتر است، نه انبار: موجودی و قیمت و جریمه‌ای در کار نیست. وسیله‌ای که دیر
        برگردد هم بدهی نمی‌شود.
      </p>

      {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}

      {lending ? (
        <LendSheet
          onClose={() => setLending(false)}
          onDone={async (message) => {
            setLending(false)
            setNote(message)
            await load()
          }}
        />
      ) : null}
    </div>
  )
}

/* ── شیت ثبت امانت ──────────────────────────────────────────── */

function LendSheet({ onClose, onDone }: {
  onClose: () => void
  onDone: (message: string) => Promise<void>
}) {
  const data = useData()
  const [children, setChildren] = useState<{ id: string; name: string }[]>([])
  const [childId, setChildId] = useState<string | null>(null)
  const [kind, setKind] = useState<LoanKind>('book')
  const [title, setTitle] = useState('')
  const [lentOn, setLentOn] = useState<string | null>(toIsoDate(new Date()))
  /* قرارِ برگرداندن خالی می‌ماند: خیلی وقت‌ها قراری گذاشته نمی‌شود. */
  const [dueOn, setDueOn] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    data
      .listLendableChildren()
      .then((list) =>
        setChildren(list.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}` }))),
      )
      .catch(() => setChildren([]))
  }, [data])

  const submit = async () => {
    if (!childId) {
      setError('کودک را انتخاب کنید.')
      return
    }
    if (!lentOn) {
      setError('روز امانت را از تقویم انتخاب کنید.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await data.lendItem({ childId, kind, title: title.trim(), lentOn, dueOn, note })
      await onDone(`«${title.trim()}» ثبت شد.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
      setBusy(false)
    }
  }

  return (
    <BottomSheet
      title="امانت تازه"
      onClose={onClose}
      footer={
        <button
          type="button"
          className={`${styles.primary} t-body-lg`}
          onClick={() => void submit()}
          disabled={busy || !childId || title.trim() === ''}
        >
          ثبت در دفتر
        </button>
      }
    >
      <label className={`${styles.field} t-caption`}>
        کودک
        <select
          className={styles.select}
          value={childId ?? ''}
          aria-label="کودک"
          onChange={(event) => setChildId(event.target.value || null)}
        >
          <option value="">انتخاب کنید…</option>
          {children.map((child) => (
            <option key={child.id} value={child.id}>
              {child.name}
            </option>
          ))}
        </select>
      </label>

      <ChoiceGroup label="نوع" options={LOAN_KINDS} value={kind} onChange={setKind} />

      <label className={`${styles.field} t-caption`}>
        نام وسیله
        <input
          className={styles.input}
          value={title}
          aria-label="نام وسیله"
          placeholder="قصه‌های خوب برای بچه‌های خوب"
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      {/*
        نام است نه نوع: «کتاب» به کسی نمی‌گوید کدام کتاب، و هفته بعد
        همان سؤال سر جایش می‌ماند.
      */}
      <p className={`${styles.muted} t-caption`}>
        نامِ خودِ وسیله را بنویسید. «کتاب» بعداً به کسی نمی‌گوید کدام کتاب.
      </p>

      <JalaliDateField label="روز امانت" value={lentOn} onChange={setLentOn} allowClear={false} />
      <JalaliDateField label="قرارِ برگرداندن — اگر قراری هست" value={dueOn} onChange={setDueOn} />

      <label className={`${styles.field} t-caption`}>
        توضیح
        <input
          className={styles.input}
          value={note}
          aria-label="توضیح امانت"
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      {error ? <p className={`${styles.error} t-caption`}>{error}</p> : null}
    </BottomSheet>
  )
}

/* ── امانت‌های یک کودک ──────────────────────────────────────── */

/**
 * آنچه این کودک برده — در پرونده‌اش، نه در دفتر کل.
 *
 * دو سؤال متفاوت‌اند و دو جا جواب می‌گیرند: «این کتاب دست کیست؟» در
 * دفتر امانت، و «این کودک چه چیزی خانه دارد؟» اینجا.
 *
 * `canReturn` برای خانواده خاموش است: وسیله را مهد تحویل می‌گیرد و
 * همان‌جا ثبت می‌کند. دکمه‌ای که خانواده بزند و وسیله هنوز خانه باشد،
 * دفتر را از واقعیت جدا می‌کند.
 */
export function ChildLoans({ childId, canReturn = false }: {
  childId: string
  canReturn?: boolean
}) {
  const data = useData()
  const [rows, setRows] = useState<Loan[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    data.listChildLoans(childId).then(setRows).catch(() => setRows([]))
  }, [data, childId])

  useEffect(() => {
    load()
  }, [load])

  if (rows !== null && rows.length === 0) {
    return <p className={`${styles.muted} t-body`}>چیزی امانت نبرده.</p>
  }

  return (
    <>
      {rows === null ? (
        <p className={`${styles.muted} t-body`}>در حال خواندن…</p>
      ) : (
        rows.map((loan) => (
          <article key={loan.id} className={styles.row}>
            <div className={styles.main}>
              <p className={`${styles.title} t-body`}>{loan.title}</p>
              <p className={`${styles.who} t-caption`}>
                {LOAN_KIND_TEXT[loan.kind] ?? loan.kind} ·{' '}
                {formatJalali(new Date(loan.lentOn), 'short')}
              </p>
              {/*
                وضعیت با کلمه گفته می‌شود، نه با نبودِ یک نشان: «برگشت»
                و «هنوز خانه است» دو خبر متفاوت‌اند و هر دو باید خوانده
                شوند.
              */}
              {loan.returnedOn ? (
                <p className={`${styles.who} t-caption`}>
                  برگشت {formatJalali(new Date(loan.returnedOn), 'short')}
                </p>
              ) : loan.overdue && loan.dueOn ? (
                <p className={`${styles.late} t-caption`}>
                  <span aria-hidden>
                    <AlertIcon size={16} />
                  </span>
                  قرارش {formatJalali(new Date(loan.dueOn), 'short')} بود
                </p>
              ) : (
                <p className={`${styles.who} t-caption`}>هنوز خانه است</p>
              )}
            </div>
            {canReturn && !loan.returnedOn ? (
              <button
                type="button"
                className={`${styles.give} t-body-sm`}
                disabled={busy === loan.id}
                onClick={() => {
                  setBusy(loan.id)
                  void data
                    .returnItem(loan.id)
                    .then(load)
                    .finally(() => setBusy(null))
                }}
              >
                برگشت
              </button>
            ) : null}
          </article>
        ))
      )}
    </>
  )
}
