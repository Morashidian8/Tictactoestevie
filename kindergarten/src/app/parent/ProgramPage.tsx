import { useCallback, useEffect, useState } from 'react'
import { AlertIcon, EmptyState } from '../../design-system/index.ts'
import { formatCount, formatJalali, toIsoDate } from '../../i18n/index.ts'
import { useData } from '../../core/auth/index.ts'
import type { CalendarEvent, MealSlot, MenuEntry, Survey } from '../../core/data/index.ts'
import styles from './ProgramPage.module.css'

/**
 * برنامه مهد، از دید خانواده — ماژول M14.
 *
 * ── چرا این صفحه هست ────────────────────────────────────────
 *
 * تنها دلیلِ واقعیِ وجود منو در یک سامانه (و نه روی تابلوی راهرو)،
 * تطبیق با آلرژیِ همین کودک است. بی آن، منو یک تصویر تزئینی است و
 * خانواده باید خودش مواد را با آلرژی بچه‌اش مقابله کند.
 *
 * تقاطعِ آلرژی **در سرور** حساب می‌شود، نه اینجا: اگر کلاینت حسابش
 * می‌کرد، یک باگ رابط می‌توانست هشدار را خاموش کند.
 *
 * ── دو چیز که این صفحه نمی‌کند ──────────────────────────────
 *
 * ۱. نتیجه نظرسنجی را وقتی مدیر منتشر نکرده نشان نمی‌دهد.
 * ۲. رویداد داخلی مهد را نشان نمی‌دهد — جلسه کارکنان به خانواده
 *    مربوط نیست، و سیاست سطر-محور هم همین را می‌بندد.
 */
const SLOT_TEXT: Record<MealSlot, string> = {
  snack_morning: 'میان‌وعده صبح',
  lunch: 'ناهار',
  snack_afternoon: 'میان‌وعده عصر',
}

const KIND_TEXT: Record<string, string> = {
  holiday: 'تعطیلی',
  trip: 'اردو',
  ceremony: 'جشن',
  meeting: 'جلسه',
  photo_day: 'روز عکاسی',
  other: 'رویداد',
}

export function ProgramPage({ childId }: { childId: string }) {
  const data = useData()
  const [menu, setMenu] = useState<MenuEntry[] | null>(null)
  const [events, setEvents] = useState<CalendarEvent[] | null>(null)
  const [surveys, setSurveys] = useState<Survey[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const from = toIsoDate(new Date())
  const to = (() => {
    const end = new Date()
    end.setDate(end.getDate() + 13)
    return toIsoDate(end)
  })()

  const load = useCallback(async () => {
    try {
      setMenu(await data.getMenu(childId, from, to))
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
  }, [data, childId, from, to])

  useEffect(() => {
    void load()
  }, [load])

  /* روزهای منو، به ترتیب — تا هر روز یک کارت شود نه یک ردیف بلند. */
  const byDay = new Map<string, MenuEntry[]>()
  for (const entry of menu ?? []) {
    byDay.set(entry.date, [...(byDay.get(entry.date) ?? []), entry])
  }

  const open = (surveys ?? []).filter((s) => s.myChoice === null)
  const answered = (surveys ?? []).filter((s) => s.myChoice !== null)

  return (
    <div className={styles.page}>
      {/* ── نظرسنجیِ بی‌جواب، اول از همه ───────────────── */}
      {open.length > 0 ? (
        <section className={styles.card} aria-label="منتظر رأی شما">
          <span className={`${styles.cardLabel} t-caption`}>منتظر رأی شما</span>
          {open.map((survey) => (
            <article key={survey.id} className={styles.survey}>
              <p className={`${styles.surveyQ} t-body-lg`}>{survey.question}</p>
              <div className={styles.options}>
                {survey.options.map((option, index) => (
                  <button
                    key={index}
                    type="button"
                    className={`${styles.option} t-body`}
                    disabled={busy === survey.id}
                    onClick={() => {
                      setBusy(survey.id)
                      void data
                        .answerSurvey(survey.id, index)
                        .then(load)
                        .finally(() => setBusy(null))
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
              {survey.closesAt ? (
                <p className={`${styles.muted} t-caption`}>
                  تا {formatJalali(new Date(survey.closesAt), 'short')} باز است.
                </p>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}

      {/* ── منوی غذایی ─────────────────────────────────── */}
      <section className={styles.card} aria-label="منوی غذایی">
        <span className={`${styles.cardLabel} t-caption`}>منوی غذایی</span>
        {menu === null ? (
          <EmptyState text="در حال خواندن…" />
        ) : byDay.size === 0 ? (
          <p className={`${styles.muted} t-body`}>هنوز منویی برای روزهای پیش رو نوشته نشده.</p>
        ) : (
          [...byDay.entries()].map(([date, meals]) => (
            <article key={date} className={styles.day}>
              <p className={`${styles.dayName} t-body-lg`}>
                {formatJalali(new Date(date), 'weekday')}
              </p>
              {meals.map((meal) => (
                <div key={meal.slot} className={styles.meal}>
                  <p className={`${styles.mealTop} t-body`}>
                    <span className={styles.muted}>{SLOT_TEXT[meal.slot]}</span>
                    <b>{meal.title}</b>
                  </p>
                  {meal.ingredients.length > 0 ? (
                    <p className={`${styles.muted} t-caption`}>{meal.ingredients.join('، ')}</p>
                  ) : null}
                  {/*
                    هشدار آلرژی، نامِ خودِ ماده — نه برچسب «آلرژی».
                    «آلرژی» به خانواده نمی‌گوید غذا را بفرستد یا نه؛
                    «گردو» می‌گوید.

                    آجری است چون بخش ۱۲.۲ آجر را رنگ ایمنی می‌داند، و
                    متن کنارش هم هست: رنگ هرگز تنها حامل معنا نیست.
                  */}
                  {meal.allergyHits.length > 0 ? (
                    <p className={`${styles.hit} t-body`}>
                      <span aria-hidden>
                        <AlertIcon size={18} />
                      </span>
                      <span>
                        {meal.allergyHits.join('، ')} — با آلرژی ثبت‌شده کودک شما می‌خورد.
                      </span>
                    </p>
                  ) : null}
                </div>
              ))}
            </article>
          ))
        )}
      </section>

      {/* ── تقویم ──────────────────────────────────────── */}
      <section className={styles.card} aria-label="تقویم مهد">
        <span className={`${styles.cardLabel} t-caption`}>تقویم دو هفته پیش رو</span>
        {events === null ? (
          <EmptyState text="در حال خواندن…" />
        ) : events.length === 0 ? (
          <p className={`${styles.muted} t-body`}>رویدادی در راه نیست.</p>
        ) : (
          events.map((event) => (
            <p key={event.id} className={`${styles.row} t-body`}>
              <span className={styles.muted}>{formatJalali(new Date(event.date), 'short')}</span>
              <b>{event.title}</b>
              <span className={styles.muted}>{KIND_TEXT[event.kind] ?? event.kind}</span>
            </p>
          ))
        )}
      </section>

      {/* ── نظرسنجی‌هایی که رأی داده‌اید ─────────────────── */}
      {answered.length > 0 ? (
        <section className={styles.card} aria-label="رأی‌های شما">
          <span className={`${styles.cardLabel} t-caption`}>رأی داده‌اید</span>
          {answered.map((survey) => (
            <article key={survey.id} className={styles.survey}>
              <p className={`${styles.surveyQ} t-body`}>{survey.question}</p>
              <p className={`${styles.muted} t-caption`}>
                رأی شما: {survey.options[survey.myChoice ?? 0] ?? '—'}
              </p>
              {/*
                نتیجه فقط وقتی مدیر منتشرش کرده.
                «۸۰٪ مخالف اردو» یعنی ۲۰٪ موافق، و آن ۲۰٪ خودشان را در
                اقلیت می‌بینند — پس انتشار یک تصمیم است نه پیش‌فرض.
              */}
              {survey.tally ? (
                survey.tally.map((line) => (
                  <p key={line.choice} className={`${styles.row} t-body`}>
                    <span>{line.label}</span>
                    <b className="tabular">{formatCount(line.votes)} رأی</b>
                  </p>
                ))
              ) : (
                <p className={`${styles.muted} t-caption`}>نتیجه هنوز منتشر نشده.</p>
              )}
            </article>
          ))}
        </section>
      ) : null}
    </div>
  )
}
