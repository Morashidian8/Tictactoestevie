import { useCallback, useEffect, useState } from 'react'
import { BottomSheet, ChoiceGroup, JalaliDateField } from '../../design-system/index.ts'
import {
  formatCount,
  formatJalali,
  formatRial,
  toIsoDate,
  toLatinDigits,
} from '../../i18n/index.ts'
import { useData } from '../../core/auth/index.ts'
import { useCentre } from '../../core/centre/index.ts'
import { BirthdayCard } from '../shared/BirthdayCard.tsx'
import type {
  CalendarEvent,
  CalendarKind,
  MealSlot,
  MenuEntry,
  PendingMealPayment,
  Survey,
} from '../../core/data/index.ts'
import styles from './ProgramPage.module.css'

/**
 * برنامه مهد — منوی غذایی، تقویم، نظرسنجی. ماژول M14.
 *
 * هر سه یک جنس‌اند: چیزی که مدیر می‌نویسد و خانواده می‌خواند. جدا
 * کردنشان به سه مقصدِ نوار، سه خانه برای کاری می‌گرفت که مدیر هفته‌ای
 * یک‌بار سراغش می‌رود.
 *
 * ── دو قاعده که این صفحه نگه می‌دارد ────────────────────────
 *
 * ۱. **نتیجه نظرسنجی پیش‌فرض پنهان است.** «۸۰٪ مخالف اردو» یعنی ۲۰٪
 *    موافق، و آن ۲۰٪ خودشان را در اقلیت می‌بینند. انتشار یک تصمیم
 *    است، نه حالت پیش‌فرض.
 *
 * ۲. **رویداد داخلی به خانواده نمی‌رسد.** جلسه کارکنان در تقویم مهد
 *    هست ولی در تقویم خانواده نه.
 */
const SLOTS: { value: MealSlot; label: string }[] = [
  { value: 'snack_morning', label: 'میان‌وعده صبح' },
  { value: 'lunch', label: 'ناهار' },
  { value: 'snack_afternoon', label: 'میان‌وعده عصر' },
]

const SLOT_TEXT: Record<string, string> = Object.fromEntries(
  SLOTS.map((s) => [s.value, s.label]),
)

const KINDS: { value: CalendarKind; label: string }[] = [
  { value: 'holiday', label: 'تعطیلی' },
  { value: 'trip', label: 'اردو' },
  { value: 'ceremony', label: 'جشن' },
  { value: 'meeting', label: 'جلسه' },
  { value: 'photo_day', label: 'روز عکاسی' },
  { value: 'other', label: 'سایر' },
]

const KIND_TEXT: Record<string, string> = Object.fromEntries(KINDS.map((k) => [k.value, k.label]))

type Sheet = 'menu' | 'event' | 'survey' | null

export function ProgramPage({ onBack }: { onBack: () => void }) {
  const data = useData()
  const { has } = useCentre()
  const [menu, setMenu] = useState<MenuEntry[] | null>(null)
  const [events, setEvents] = useState<CalendarEvent[] | null>(null)
  const [surveys, setSurveys] = useState<Survey[] | null>(null)
  const [mealPays, setMealPays] = useState<PendingMealPayment[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /* دو هفته پیش رو. مدیر منو را هفتگی می‌نویسد، نه ماهانه. */
  const from = toIsoDate(new Date())
  const to = (() => {
    const end = new Date()
    end.setDate(end.getDate() + 13)
    return toIsoDate(end)
  })()

  const load = useCallback(async () => {
    try {
      /*
       * منو از دید مدیر هیچ کودکی ندارد، پس شناسه خالی می‌رود:
       * `allergyHits` تقاطعِ مواد با آلرژیِ یک کودکِ مشخص است و مدیر
       * کودکِ مشخصی ندارد.
       */
      setMenu(await data.getMenu('', from, to))
    } catch {
      setMenu([])
    }
    try {
      setEvents(await data.listCalendar(from, to))
    } catch {
      setEvents([])
    }
    try {
      setSurveys(await data.listSurveys())
    } catch {
      setSurveys([])
    }
    try {
      setMealPays(await data.listPendingMealPayments())
    } catch {
      setMealPays([])
    }
  }, [data, from, to])

  useEffect(() => {
    void load()
  }, [load])

  const done = async (message: string) => {
    setSheet(null)
    setNote(message)
    await load()
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.back}
          onClick={onBack}
          aria-label="بازگشت به داشبورد"
        >
          ‹
        </button>
        <span className={`${styles.title} t-h2`}>برنامه مهد</span>
      </header>

      <div className={styles.body}>
        {note ? <p className={`${styles.note} t-body`}>{note}</p> : null}

        {/*
          رسیدهای کارت‌به‌کارتِ غذا، بالای منو.

          تا مدیر تأیید نکند، غذای آن کودک کنار گذاشته نمی‌شود — پس
          این صف کارِ امروز است، نه یک گزارش.
        */}
        {mealPays.length > 0 ? (
          <section className={styles.card} aria-label="رسیدهای غذا">
            <span className={`${styles.cardLabel} t-caption`}>
              رسید غذا، در انتظار تأیید شما
            </span>
            {mealPays.map((pay) => (
              <article key={pay.id} className={styles.survey}>
                <p className={`${styles.row} t-body`}>
                  <span>{pay.childName}</span>
                  <span className={styles.muted}>{formatCount(pay.meals)} وعده</span>
                  <b className="tabular">{formatRial(pay.amount)}</b>
                </p>
                {pay.receiptUrl ? (
                  <img className={styles.receipt} src={pay.receiptUrl} alt="رسید پرداخت" />
                ) : null}
                <button
                  type="button"
                  className={styles.action}
                  disabled={busy === pay.id}
                  onClick={() => {
                    setBusy(pay.id)
                    void data
                      .approveMealPayment(pay.id)
                      .then(() => done(`غذای ${pay.childName} نهایی شد.`))
                      .catch((cause: unknown) =>
                        setError(cause instanceof Error ? cause.message : 'ثبت نشد.'),
                      )
                      .finally(() => setBusy(null))
                  }}
                >
                  تأیید رسید
                </button>
              </article>
            ))}
          </section>
        ) : null}

        {/* ── منوی غذایی ─────────────────────────────────── */}
        <section className={styles.card} aria-label="منوی غذایی">
          <span className={`${styles.cardLabel} t-caption`}>منوی غذایی</span>
          {menu === null ? (
            <p className={`${styles.muted} t-body`}>در حال خواندن…</p>
          ) : menu.length === 0 ? (
            <p className={`${styles.muted} t-body`}>
              برای دو هفته پیش رو منویی نوشته نشده.
            </p>
          ) : (
            menu.map((entry) => (
              <p key={`${entry.date}-${entry.slot}`} className={`${styles.row} t-body`}>
                <span className={styles.muted}>
                  {formatJalali(new Date(entry.date), 'short')}
                </span>
                <span className={styles.muted}>{SLOT_TEXT[entry.slot] ?? entry.slot}</span>
                <b>{entry.title}</b>
              </p>
            ))
          )}
          <button type="button" className={styles.action} onClick={() => setSheet('menu')}>
            نوشتن منوی یک روز
          </button>
          {/*
            چرا مواد اولیه جدا از نام غذا گرفته می‌شود: تنها دلیلِ واقعیِ
            وجود این ماژول، تطبیق با آلرژی کودک است — و «قرمه‌سبزی» به
            سامانه نمی‌گوید گردو دارد یا نه.
          */}
          <p className={`${styles.muted} t-caption`}>
            مواد اولیه را بنویسید. همین است که به خانواده هشدار آلرژی می‌دهد؛ نام غذا
            به‌تنهایی نمی‌دهد.
          </p>
        </section>

        {/*
          ── تقویم ──────────────────────────────────────────

          تولدها اینجا، بالای رویدادهای دست‌نویس.

          پیش‌تر کارت کاملشان در صفحه اول مدیر بود و آنجا را شلوغ
          می‌کرد. تولد یک رویداد تقویمی است — جایش همین‌جاست، و صفحه
          اول فقط یک سطر می‌گوید که چیزی هست.
        */}
        <BirthdayCard />

        <section className={styles.card} aria-label="تقویم مهد">
          <span className={`${styles.cardLabel} t-caption`}>تقویم</span>
          {events === null ? (
            <p className={`${styles.muted} t-body`}>در حال خواندن…</p>
          ) : events.length === 0 ? (
            <p className={`${styles.muted} t-body`}>رویدادی برای دو هفته پیش رو ثبت نشده.</p>
          ) : (
            events.map((event) => (
              <p key={event.id} className={`${styles.row} t-body`}>
                <span className={styles.muted}>
                  {formatJalali(new Date(event.date), 'short')}
                </span>
                <b>{event.title}</b>
                <span className={styles.muted}>{KIND_TEXT[event.kind] ?? event.kind}</span>
                {/*
                  «داخلی» فقط وقتی نوشته می‌شود که واقعاً داخلی است.
                  برچسبی که روی همه‌چیز باشد، خوانده نمی‌شود.
                */}
                {!event.visibleToFamily ? <span className={styles.internal}>داخلی</span> : null}
              </p>
            ))
          )}
          <button type="button" className={styles.action} onClick={() => setSheet('event')}>
            افزودن رویداد
          </button>
        </section>

        {/* ── نظرسنجی ────────────────────────────────────── */}
        {/*
          مهدی که نظرسنجی را نخریده، کارتش را هم نمی‌بیند — مهاجرت
          ۰۰۴۳. بقیهٔ این صفحه (منوی غذا، تقویم) پرچم ندارد.
        */}
        {has('survey') ? (
        <section className={styles.card} aria-label="نظرسنجی‌ها">
          <span className={`${styles.cardLabel} t-caption`}>نظرسنجی</span>
          {surveys === null ? (
            <p className={`${styles.muted} t-body`}>در حال خواندن…</p>
          ) : surveys.length === 0 ? (
            <p className={`${styles.muted} t-body`}>هنوز نظرسنجی‌ای نساخته‌اید.</p>
          ) : (
            surveys.map((survey) => (
              <article key={survey.id} className={styles.survey}>
                <p className={`${styles.surveyQ} t-body-lg`}>{survey.question}</p>
                {survey.tally ? (
                  survey.tally.map((line) => (
                    <p key={line.choice} className={`${styles.row} t-body`}>
                      <span>{line.label}</span>
                      <b className="tabular">{formatCount(line.votes)} رأی</b>
                    </p>
                  ))
                ) : (
                  <p className={`${styles.muted} t-body`}>هنوز رأیی شمرده نشده.</p>
                )}
                {/*
                  انتشار نتیجه، یک تصمیم است نه پیش‌فرض: «۸۰٪ مخالف
                  اردو» یعنی ۲۰٪ موافق، و آن ۲۰٪ خودشان را در اقلیت
                  می‌بینند.
                */}
                <button
                  type="button"
                  className={styles.action}
                  onClick={() => {
                    void data
                      .setSurveyResultsVisible(survey.id, !survey.showResults)
                      .then(() =>
                        done(
                          survey.showResults
                            ? 'نتیجه از دید خانواده‌ها برداشته شد.'
                            : 'نتیجه برای خانواده‌ها منتشر شد.',
                        ),
                      )
                      .catch((cause: unknown) =>
                        setError(cause instanceof Error ? cause.message : 'ثبت نشد.'),
                      )
                  }}
                >
                  {survey.showResults ? 'برداشتن نتیجه از دید خانواده' : 'انتشار نتیجه برای خانواده'}
                </button>
              </article>
            ))
          )}
          <button type="button" className={styles.action} onClick={() => setSheet('survey')}>
            نظرسنجی تازه
          </button>
        </section>
        ) : null}

        {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}
      </div>

      {sheet === 'menu' ? (
        <MenuSheet onClose={() => setSheet(null)} onDone={done} />
      ) : sheet === 'event' ? (
        <EventSheet onClose={() => setSheet(null)} onDone={done} />
      ) : sheet === 'survey' ? (
        <SurveySheet onClose={() => setSheet(null)} onDone={done} />
      ) : null}
    </div>
  )
}

/* ── شیت منوی یک روز ────────────────────────────────────────── */

function MenuSheet({ onClose, onDone }: {
  onClose: () => void
  onDone: (message: string) => Promise<void>
}) {
  const data = useData()
  const [date, setDate] = useState<string | null>(toIsoDate(new Date()))
  const [slot, setSlot] = useState<MealSlot>('lunch')
  const [title, setTitle] = useState('')
  const [ingredients, setIngredients] = useState('')
  /*
   * قیمت خالی یعنی این وعده رزروی نیست — مهدی که غذا را داخل شهریه
   * حساب می‌کند منو را می‌نویسد و قیمت نمی‌گذارد، و هیچ دکمه رزروی
   * هم ساخته نمی‌شود.
   */
  const [price, setPrice] = useState('')
  const [capacity, setCapacity] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rial = Number(toLatinDigits(price).replace(/\D/g, '')) * 10
  const seats = Number(toLatinDigits(capacity).replace(/\D/g, ''))

  const submit = async () => {
    if (!date) {
      setError('روز را از تقویم انتخاب کنید.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await data.setMenuDay({
        date,
        slot,
        title: title.trim(),
        /* با «،» جدا می‌شود — همان جداکننده‌ای که در آلرژی کودک هم هست. */
        ingredients: ingredients
          .split('،')
          .map((part) => part.trim())
          .filter((part) => part !== ''),
      })
      /*
       * قیمت جدا از منو ثبت می‌شود چون شناسه وعده تازه پس از نوشتنِ
       * منو وجود دارد. فهرست دوباره خوانده می‌شود تا شناسه پیدا شود.
       */
      if (rial > 0) {
        const written = (await data.getMenu('', date, date)).find((m) => m.slot === slot)
        if (written?.menuDayId) {
          await data.setMealPrice({
            menuDayId: written.menuDayId,
            price: rial,
            capacity: seats > 0 ? seats : null,
          })
        }
      }
      await onDone(`منوی ${SLOT_TEXT[slot]} ثبت شد.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
      setBusy(false)
    }
  }

  return (
    <BottomSheet
      title="منوی یک روز"
      onClose={onClose}
      footer={
        <button
          type="button"
          className={`${styles.primary} t-body-lg`}
          onClick={() => void submit()}
          disabled={busy || title.trim() === ''}
        >
          ثبت منو
        </button>
      }
    >
      <JalaliDateField label="روز" value={date} onChange={setDate} allowClear={false} />
      <ChoiceGroup label="وعده" options={SLOTS} value={slot} onChange={setSlot} />

      <label className={`${styles.field} t-caption`}>
        نام غذا
        <input
          className={styles.input}
          value={title}
          aria-label="نام غذا"
          placeholder="مثلاً: قرمه‌سبزی"
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>

      <label className={`${styles.field} t-caption`}>
        مواد اولیه — با «،» جدا کنید
        <textarea
          className={styles.textarea}
          rows={3}
          value={ingredients}
          aria-label="مواد اولیه"
          placeholder="لوبیا، سبزی، گوشت، لیمو عمانی"
          onChange={(event) => setIngredients(event.target.value)}
        />
      </label>

      <p className={`${styles.muted} t-caption`}>
        هشدار آلرژی از همین فهرست ساخته می‌شود. نام غذا به‌تنهایی نمی‌گوید گردو دارد یا نه.
      </p>

      <label className={`${styles.field} t-caption`}>
        قیمت هر پرس، به تومان — خالی یعنی رزروی نیست
        <input
          className={styles.input}
          value={price}
          inputMode="numeric"
          aria-label="قیمت غذا"
          onChange={(event) => setPrice(event.target.value)}
        />
      </label>

      <label className={`${styles.field} t-caption`}>
        ظرفیت — خالی یعنی بی‌حد
        <input
          className={styles.input}
          value={capacity}
          inputMode="numeric"
          aria-label="ظرفیت غذا"
          onChange={(event) => setCapacity(event.target.value)}
        />
      </label>

      {rial > 0 ? (
        <p className={`${styles.muted} t-caption`}>
          خانواده‌ها می‌توانند تا روزِ قبل رزرو کنند. رزروِ پرداخت‌نشده غذا حساب نمی‌شود.
        </p>
      ) : null}

      {error ? <p className={`${styles.error} t-caption`}>{error}</p> : null}
    </BottomSheet>
  )
}

/* ── شیت رویداد تقویم ───────────────────────────────────────── */

function EventSheet({ onClose, onDone }: {
  onClose: () => void
  onDone: (message: string) => Promise<void>
}) {
  const data = useData()
  const [date, setDate] = useState<string | null>(toIsoDate(new Date()))
  /* پایان خالی یعنی همان یک روز — حالت غالب. */
  const [endDate, setEndDate] = useState<string | null>(null)
  const [kind, setKind] = useState<CalendarKind>('trip')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [visible, setVisible] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!date) {
      setError('روز را از تقویم انتخاب کنید.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await data.addCalendarEvent({
        date,
        endDate,
        kind,
        title: title.trim(),
        note,
        visibleToFamily: visible,
      })
      await onDone(`«${title.trim()}» به تقویم اضافه شد.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
      setBusy(false)
    }
  }

  return (
    <BottomSheet
      title="رویداد تقویم"
      onClose={onClose}
      footer={
        <button
          type="button"
          className={`${styles.primary} t-body-lg`}
          onClick={() => void submit()}
          disabled={busy || title.trim() === ''}
        >
          افزودن
        </button>
      }
    >
      <ChoiceGroup label="نوع" options={KINDS} value={kind} onChange={setKind} />

      <label className={`${styles.field} t-caption`}>
        عنوان
        <input
          className={styles.input}
          value={title}
          aria-label="عنوان رویداد"
          placeholder="اردوی باغ پرندگان"
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>

      <JalaliDateField label="از روز" value={date} onChange={setDate} allowClear={false} />
      <JalaliDateField
        label="تا روز — خالی یعنی همان یک روز"
        value={endDate}
        onChange={setEndDate}
      />

      <label className={`${styles.field} t-caption`}>
        توضیح
        <textarea
          className={styles.textarea}
          rows={2}
          value={note}
          aria-label="توضیح رویداد"
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      {/*
        دیدنِ خانواده پیش‌فرض روشن است: تقویمی که خانواده نبیند، تقویم
        داخلی است و آن استثناست نه قاعده.
      */}
      <label className={`${styles.check} t-body`}>
        <input
          type="checkbox"
          checked={visible}
          onChange={(event) => setVisible(event.target.checked)}
        />
        خانواده‌ها این را ببینند
      </label>
      {!visible ? (
        <p className={`${styles.muted} t-caption`}>
          فقط کارکنان می‌بینندش. جلسه داخلی به خانواده مربوط نیست.
        </p>
      ) : null}

      {error ? <p className={`${styles.error} t-caption`}>{error}</p> : null}
    </BottomSheet>
  )
}

/* ── شیت نظرسنجی تازه ───────────────────────────────────────── */

function SurveySheet({ onClose, onDone }: {
  onClose: () => void
  onDone: (message: string) => Promise<void>
}) {
  const data = useData()
  const [question, setQuestion] = useState('')
  /*
   * دو گزینه از اول روی صفحه‌اند.
   *
   * نظرسنجیِ تک‌گزینه‌ای نظرسنجی نیست و پایگاه داده هم ردش می‌کند؛
   * شروع با دو خطِ خالی، آن قاعده را پیش از خطا نشان می‌دهد.
   */
  const [options, setOptions] = useState(['', ''])
  const [closes, setCloses] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filled = options.map((o) => o.trim()).filter((o) => o !== '')

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await data.createSurvey({
        question: question.trim(),
        options: filled,
        closesAt: closes,
      })
      await onDone('نظرسنجی ساخته شد. نتیجه‌اش تا وقتی منتشر نکنید پنهان است.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
      setBusy(false)
    }
  }

  return (
    <BottomSheet
      title="نظرسنجی تازه"
      onClose={onClose}
      footer={
        <button
          type="button"
          className={`${styles.primary} t-body-lg`}
          onClick={() => void submit()}
          disabled={busy || question.trim() === '' || filled.length < 2}
        >
          ساختن
        </button>
      }
    >
      <label className={`${styles.field} t-caption`}>
        پرسش
        <textarea
          className={styles.textarea}
          rows={2}
          value={question}
          aria-label="پرسش نظرسنجی"
          placeholder="اردوی باغ پرندگان پنجشنبه برگزار شود؟"
          onChange={(event) => setQuestion(event.target.value)}
        />
      </label>

      {options.map((option, index) => (
        <label key={index} className={`${styles.field} t-caption`}>
          گزینه {index + 1}
          <input
            className={styles.input}
            value={option}
            aria-label={`گزینه ${index + 1}`}
            onChange={(event) =>
              setOptions((list) => list.map((o, i) => (i === index ? event.target.value : o)))
            }
          />
        </label>
      ))}

      <button
        type="button"
        className={styles.action}
        onClick={() => setOptions((list) => [...list, ''])}
      >
        گزینه دیگر
      </button>

      <JalaliDateField label="تا چه روزی باز باشد" value={closes} onChange={setCloses} />

      <p className={`${styles.muted} t-caption`}>
        نتیجه تا وقتی خودتان منتشر نکنید، از دید خانواده‌ها پنهان است.
      </p>

      {error ? <p className={`${styles.error} t-caption`}>{error}</p> : null}
    </BottomSheet>
  )
}
