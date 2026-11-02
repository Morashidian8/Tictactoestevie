import { useCallback, useEffect, useState } from 'react'
import { AlertIcon, BackIcon, CheckIcon, EmptyState } from '../../design-system/index.ts'
import {
  formatCount,
  formatJalali,
  formatPeriod,
  jalaliToIso,
  jalaliYearMonth,
  toIsoDate,
} from '../../i18n/index.ts'
import { useData } from '../../core/auth/index.ts'
import type { InterestMap, MonthlyReport, ObservationLens } from '../../core/data/index.ts'
import styles from './ObservationsPage.module.css'

/**
 * مشاهده‌های مربی و گزارش ماهانه.
 *
 * خواسته مالک محصول: «مشاهداتش که راجع به هر کودک می‌نویسه جمع بشه و
 * تو گزارش ماهانه بشه استفاده بشه»، و گزارشی «از همه جنبه‌ها … که بچه
 * را از همه نظر بررسی کنه».
 *
 * ── چهار قاعده‌ای که این صفحه نمی‌شکند ─────────────────────────
 *
 * ۱. **عدسی، برچسبِ کودک نیست.** «چالش» یعنی جایی که امروز سخت بود،
 *    نه ویژگیِ کودک. متن‌های صفحه همه به روز و رویداد اشاره می‌کنند،
 *    نه به شخصیت.
 *
 * ۲. **هم‌بازی از مشاهده می‌آید، نه از حدس.** هم‌کلاس بودن دوستی نیست؛
 *    شمردن هم‌حضوری رابطه‌ای می‌سازد که هیچ‌کس ندیده.
 *
 * ۳. **پیش‌نویس ماشین، گزارش نیست.** مدل فقط جمله‌های خودِ مربی را
 *    می‌بیند و خروجی‌اش تا ویرایش و امضای مربی، به خانواده نمی‌رود.
 *
 * ۴. **هیچ نمره و مقایسه‌ای.** نه بین کودکان، نه با میانگین کلاس.
 *    شمار روزهای حضور یک واقعیت است؛ «بالاتر از میانگین» یک قضاوت.
 */

const LENSES: { value: ObservationLens; title: string; prompt: string }[] = [
  { value: 'interest', title: 'علاقه', prompt: 'چه چیزی امروز جذبش کرد؟' },
  { value: 'skill', title: 'مهارت', prompt: 'چه کاری را تازه توانست؟' },
  { value: 'social', title: 'با دیگران', prompt: 'با چه کسی بود و چطور؟' },
  { value: 'challenge', title: 'چالش', prompt: 'کجا سخت بود؟' },
  { value: 'moment', title: 'لحظه', prompt: 'چه چیزی ارزش گفتن به خانواده دارد؟' },
  { value: 'care', title: 'خواب و غذا', prompt: 'الگوی تازه‌ای دیدید؟' },
]

const LENS_TITLE: Record<string, string> = Object.fromEntries(
  LENSES.map((l) => [l.value, l.title]),
)

export function ObservationsPage({ childId, childName, onBack }: {
  childId: string
  childName: string
  onBack: () => void
}) {
  const data = useData()
  const [period, setPeriod] = useState(() => jalaliYearMonth(new Date()))
  const [report, setReport] = useState<MonthlyReport | null>(null)
  const [interest, setInterest] = useState<InterestMap | null>(null)
  const [writing, setWriting] = useState<ObservationLens | null>(null)
  const [summary, setSummary] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const next = await data.getMonthlyReport(childId, period)
      setReport(next)
      setSummary(next.teacherSummary ?? '')
      const range = periodRange(period)
      setInterest(await data.getInterestMap(childId, range.from, range.to))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'خوانده نشد.')
    }
  }, [data, childId, period])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (job: () => Promise<void>, ok: string) => {
    setBusy(true)
    setError(null)
    try {
      await job()
      setNote(ok)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'انجام نشد.')
    } finally {
      setBusy(false)
    }
  }

  const empty = report?.gaps.filter((g) => g.seen === 0) ?? []

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="بازگشت">
          <BackIcon size={22} />
        </button>
        <span className={`${styles.title} t-h2`}>{childName}</span>
        <span className={`${styles.period} t-caption`}>{formatPeriod(period)}</span>
      </header>

      <div className={styles.body}>
        {note ? (
          <p className={`${styles.note} t-body`}>
            <CheckIcon size={18} />
            {note}
          </p>
        ) : null}

        {/* ── ثبت مشاهده تازه ──────────────────────────────── */}
        <section className={styles.card}>
          <span className={`${styles.cardLabel} t-caption`}>مشاهده تازه</span>
          {/*
            شش دکمه، نه یک فرم. چیزی که مربی در بیست ثانیه بین دو کار
            می‌نویسد، فرم پر کردنی نیست.
          */}
          <div className={styles.lenses}>
            {LENSES.map((lens) => (
              <button
                key={lens.value}
                type="button"
                className={styles.lens}
                onClick={() => setWriting(lens.value)}
              >
                {lens.title}
              </button>
            ))}
          </div>
          {/*
            عدسیِ ندیده، کاستیِ کودک نیست — جایی است که مربی هنوز
            ننوشته. جمله عمداً درباره خودِ مربی است، نه درباره کودک.
          */}
          {empty.length > 0 ? (
            <p className={`${styles.muted} t-caption`}>
              هنوز درباره {empty.map((g) => LENS_TITLE[g.lens]).join('، ')} چیزی ننوشته‌اید.
            </p>
          ) : null}
        </section>

        {/* ── مشاهده‌های ماه ───────────────────────────────── */}
        <section className={styles.card}>
          <span className={`${styles.cardLabel} t-caption`}>
            مشاهده‌های این ماه ({formatCount(report?.observations.length ?? 0)})
          </span>
          {report === null ? (
            <EmptyState text="در حال خواندن…" />
          ) : report.observations.length === 0 ? (
            <p className={`${styles.muted} t-body`}>
              هنوز مشاهده‌ای ثبت نشده. یکی از شش دکمه بالا را بزنید.
            </p>
          ) : (
            LENSES.map((lens) => {
              const rows = report.observations.filter((o) => o.lens === lens.value)
              if (rows.length === 0) return null
              return (
                <div key={lens.value} className={styles.group}>
                  <p className={`${styles.groupTitle} t-caption`}>{lens.title}</p>
                  {rows.map((o) => (
                    <p key={o.id} className={`${styles.observation} t-body`}>
                      <span className={styles.obsDate}>
                        {formatJalali(new Date(o.date), 'short')}
                      </span>
                      {o.body}
                      {o.peers.length > 0 ? (
                        <span className={styles.peers}> — با {o.peers.join('، ')}</span>
                      ) : null}
                    </p>
                  ))}
                </div>
              )
            })
          )}
        </section>

        {/* ── نقشه علایق ───────────────────────────────────── */}
        <section className={styles.card}>
          <span className={`${styles.cardLabel} t-caption`}>نقشه علایق</span>
          {interest === null ? (
            <p className={`${styles.muted} t-body`}>در حال خواندن…</p>
          ) : interest.sample < interest.threshold ? (
            /*
              آستانه انتشار — بخش ۹.
              نمودارِ سه‌نقطه‌ای الگو نیست؛ نویز است. و خانواده آن را
              الگو می‌خواند، پس اصلاً ساخته نمی‌شود.
            */
            <p className={`${styles.muted} t-body`}>
              داده کافی برای این ماه ثبت نشده — {formatCount(interest.sample)} ثبت از{' '}
              {formatCount(interest.threshold)} لازم. در «بازی آزاد» ثبت کنید.
            </p>
          ) : (
            <>
              {interest.corners
                .filter((corner) => corner.times > 0)
                .map((corner) => (
                  <p key={corner.id} className={`${styles.row} t-body`}>
                    <span>
                      {corner.glyph ? `${corner.glyph} ` : ''}
                      {corner.title}
                    </span>
                    <b>{formatCount(corner.times)} بار</b>
                  </p>
                ))}
              {/*
                گوشه‌های انتخاب‌نشده، خودشان یک خط گزارش‌اند (بخش ۹):
                جایی که کودک هنوز نرفته، به‌اندازه جایی که رفته معنا دارد.
              */}
              {interest.corners.some((corner) => corner.times === 0) ? (
                <p className={`${styles.muted} t-caption`}>
                  هنوز نرفته:{' '}
                  {interest.corners
                    .filter((corner) => corner.times === 0)
                    .map((corner) => corner.title)
                    .join('، ')}
                </p>
              ) : null}
            </>
          )}
        </section>

        {/* ── با چه کسانی بوده ─────────────────────────────── */}
        {report && report.peers.length > 0 ? (
          <section className={styles.card}>
            <span className={`${styles.cardLabel} t-caption`}>بیشتر با چه کسانی بوده</span>
            {report.peers.map((peer) => (
              <p key={peer.firstName} className={`${styles.row} t-body`}>
                <span>{peer.firstName}</span>
                <b>{formatCount(peer.times)} بار</b>
              </p>
            ))}
            {/*
              از مشاهده، نه از هم‌کلاسی. اگر روزی این از هم‌حضوری حساب
              شود، رابطه‌ای ساخته می‌شود که هیچ‌کس ندیده.
            */}
            <p className={`${styles.muted} t-caption`}>
              این فهرست از مشاهده‌های خودتان می‌آید، نه از اینکه چه کسی هم‌کلاسش است.
            </p>
          </section>
        ) : null}

        {/* ── واقعیت‌های ماه ───────────────────────────────── */}
        {report ? (
          <section className={styles.card}>
            <span className={`${styles.cardLabel} t-caption`}>واقعیت‌های ماه</span>
            <p className={`${styles.row} t-body`}>
              <span>روز حاضر</span>
              <b>{formatCount(report.facts.presentDays)}</b>
            </p>
            <p className={`${styles.row} t-body`}>
              <span>روز غایب</span>
              <b>{formatCount(report.facts.absentDays)}</b>
            </p>
            <p className={`${styles.muted} t-caption`}>
              این ارقام با هیچ کودک دیگری و با میانگین کلاس مقایسه نمی‌شوند.
            </p>
          </section>
        ) : null}

        {/* ── جمع‌بندی و ارسال ─────────────────────────────── */}
        <section className={styles.card}>
          <span className={`${styles.cardLabel} t-caption`}>جمع‌بندی شما</span>

          {report?.assistedDraft ? (
            <div className={styles.draft}>
              <p className={`${styles.draftLabel} t-caption`}>
                پیش‌نویس، از جمله‌های خودتان
              </p>
              <p className={`${styles.draftBody} t-body`}>{report.assistedDraft}</p>
              <button
                type="button"
                className={styles.action}
                onClick={() => setSummary(report.assistedDraft ?? '')}
              >
                برداشتن در جمع‌بندی، برای ویرایش
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={styles.action}
              disabled={busy}
              onClick={() =>
                void run(
                  async () => {
                    await data.buildAssistedDraft(childId, period)
                  },
                  'پیش‌نویس ساخته شد. بخوانید و به قلم خودتان درستش کنید.',
                )
              }
            >
              ساختن پیش‌نویس از مشاهده‌ها
            </button>
          )}

          {/*
            مرزی که این صفحه نگه می‌دارد: مدل فقط جمله‌های خودِ مربی را
            می‌بیند — نه حضور، نه خلق، نه غذا، نه نام کودکان دیگر. از
            عدد نتیجه‌گیری درمی‌آید و از جمله مربی، فقط ویرایش.
          */}
          <p className={`${styles.muted} t-caption`}>
            پیش‌نویس فقط از جمله‌های خودتان ساخته می‌شود؛ هیچ عددی — حضور، خلق، غذا — و
            هیچ نام کودک دیگری به آن داده نمی‌شود.
          </p>

          <textarea
            className={styles.textarea}
            value={summary}
            rows={6}
            aria-label="جمع‌بندی گزارش ماهانه"
            placeholder="به قلم خودتان بنویسید…"
            onChange={(event) => setSummary(event.target.value)}
          />

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.action}
              disabled={busy}
              onClick={() =>
                void run(
                  () => data.saveMonthlyReport(childId, period, { teacherSummary: summary }),
                  'جمع‌بندی ذخیره شد.',
                )
              }
            >
              ذخیره
            </button>
            <button
              type="button"
              className={`${styles.action} ${styles.primary}`}
              disabled={busy || summary.trim().length === 0}
              onClick={() =>
                void run(async () => {
                  await data.saveMonthlyReport(childId, period, { teacherSummary: summary })
                  await data.shareMonthlyReport(childId, period)
                }, 'گزارش برای خانواده فرستاده شد.')
              }
            >
              فرستادن به خانواده
            </button>
          </div>

          {/*
            وعده‌ای که این صفحه نمی‌دهد: «گزارش آماده است».
            تا مربی جمع‌بندی ننویسد، چیزی برای فرستادن نیست — و پایگاه
            داده هم همین را می‌بندد، نه فقط این دکمه.
          */}
          {summary.trim().length === 0 ? (
            <p className={`${styles.warn} t-caption`}>
              <AlertIcon size={16} />
              تا جمع‌بندی خودتان را ننویسید، گزارش به خانواده نمی‌رود — پیش‌نویس ماشین
              جایش را نمی‌گیرد.
            </p>
          ) : null}

          {report?.status === 'shared' ? (
            <p className={`${styles.shared} t-caption`}>این گزارش با خانواده در میان گذاشته شده.</p>
          ) : null}
        </section>

        {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}

        <div className={styles.monthBar}>
          <button type="button" className={styles.action} onClick={() => setPeriod(shiftPeriod(period, -1))}>
            ماه قبل
          </button>
          <button type="button" className={styles.action} onClick={() => setPeriod(shiftPeriod(period, 1))}>
            ماه بعد
          </button>
        </div>
      </div>

      {writing ? (
        <WriteSheet
          lens={writing}
          childName={childName}
          onClose={() => setWriting(null)}
          onDone={async (text) => {
            setWriting(null)
            await run(
              () => data.addObservation({ childId, lens: writing, body: text }),
              'مشاهده ثبت شد.',
            )
          }}
        />
      ) : null}
    </div>
  )
}

/** بازه میلادیِ یک دوره جلالی. */
function periodRange(period: string): { from: string; to: string } {
  const [yearText, monthText] = period.split('-')
  const year = Number(yearText)
  const index = Number(monthText)
  const from = jalaliToIso(year, index, 1)
  const nextMonth = index === 12 ? 1 : index + 1
  const nextYear = index === 12 ? year + 1 : year
  const firstOfNext = jalaliToIso(nextYear, nextMonth, 1)
  if (!from || !firstOfNext) {
    const today = toIsoDate(new Date())
    return { from: today, to: today }
  }
  const end = new Date(`${firstOfNext}T12:00:00`)
  end.setDate(end.getDate() - 1)
  return { from, to: toIsoDate(end) }
}

function shiftPeriod(period: string, by: number): string {
  const [yearText, monthText] = period.split('-')
  let year = Number(yearText)
  let index = Number(monthText) + by
  if (index > 12) {
    index = 1
    year += 1
  }
  if (index < 1) {
    index = 12
    year -= 1
  }
  return `${year}-${String(index).padStart(2, '0')}`
}

function WriteSheet({ lens, childName, onClose, onDone }: {
  lens: ObservationLens
  childName: string
  onClose: () => void
  onDone: (text: string) => Promise<void>
}) {
  const [text, setText] = useState('')
  const info = LENSES.find((l) => l.value === lens)

  return (
    <div className={styles.sheetBackdrop} role="dialog" aria-label="ثبت مشاهده">
      <div className={styles.sheet}>
        <p className={`${styles.sheetTitle} t-h2`}>
          {info?.title} — {childName}
        </p>
        {/*
          پرسش، نه برچسب. «کجا سخت بود؟» درباره امروز می‌پرسد؛
          «چالش‌های کودک» درباره خودِ کودک حرف می‌زند.
        */}
        <p className={`${styles.muted} t-body`}>{info?.prompt}</p>

        <textarea
          className={styles.textarea}
          value={text}
          rows={4}
          aria-label="متن مشاهده"
          placeholder="یک یا دو جمله، به زبان خودتان…"
          onChange={(event) => setText(event.target.value)}
        />

        <div className={styles.sheetActions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            انصراف
          </button>
          <button
            type="button"
            className={`${styles.action} ${styles.primary}`}
            disabled={text.trim().length < 3}
            onClick={() => void onDone(text)}
          >
            ثبت
          </button>
        </div>
      </div>
    </div>
  )
}
