import { useCallback, useEffect, useState } from 'react'
import { EmptyState } from '../../design-system/index.ts'
import {
  formatCount,
  formatJalali,
  formatPeriod,
  jalaliToIso,
  jalaliYearMonth,
  toIsoDate,
} from '../../i18n/index.ts'
import { useData } from '../../core/auth/index.ts'
import type { InterestMap, MonthlyReport } from '../../core/data/index.ts'
import { Shell } from './MorePage.tsx'
import shared from './MorePage.module.css'
import styles from './MonthlyReportPage.module.css'

/**
 * گزارش ماهانه، از دید خانواده.
 *
 * خواسته مالک محصول: «این گزارش ماهانه خیلی مهمه و برای والدین جلسه
 * می‌گذاریم … از همه جنبه‌ها».
 *
 * سه چیزی که این صفحه صادقانه می‌گوید:
 *
 * ۱. **تا مربی نفرستاده، چیزی نیست.** گزارشِ نیمه‌کاره نشان داده
 *    نمی‌شود؛ خانواده‌ای که پیش‌نویس را ببیند، درباره جمله‌ای قضاوت
 *    می‌کند که هنوز نوشته نشده.
 *
 * ۲. **جمع‌بندی را یک آدم نوشته.** این تنها متن تحلیلی گزارش است و
 *    نامِ نویسنده‌اش پای آن می‌آید.
 *
 * ۳. **هیچ مقایسه‌ای.** نه با کودک دیگر، نه با میانگین کلاس. ارقام
 *    واقعیت‌اند، نه نمره.
 */
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

export function MonthlyReportPage({ childId, childName, onBack }: {
  childId: string
  childName: string
  onBack: () => void
}) {
  const data = useData()
  const [period, setPeriod] = useState(() => jalaliYearMonth(new Date()))
  const [report, setReport] = useState<MonthlyReport | null>(null)
  const [interest, setInterest] = useState<InterestMap | null>(null)

  const load = useCallback(async () => {
    try {
      setReport(await data.getMonthlyReport(childId, period))
      const range = periodRange(period)
      setInterest(await data.getInterestMap(childId, range.from, range.to))
    } catch {
      setReport(null)
    }
  }, [data, childId, period])

  useEffect(() => {
    void load()
  }, [load])

  const shift = (by: number) => {
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
    setPeriod(`${year}-${String(index).padStart(2, '0')}`)
  }

  return (
    <Shell title={`گزارش ماهانه ${childName}`} onBack={onBack}>
      <div className={styles.monthBar}>
        <button type="button" className={styles.step} onClick={() => shift(-1)}>
          ماه قبل
        </button>
        <span className={`${styles.period} t-body`}>{formatPeriod(period)}</span>
        <button type="button" className={styles.step} onClick={() => shift(1)}>
          ماه بعد
        </button>
      </div>

      {report === null ? (
        <EmptyState text="در حال خواندن…" />
      ) : report.status !== 'shared' ? (
        /*
          گزارشِ نیمه‌کاره نشان داده نمی‌شود.
          خانواده‌ای که پیش‌نویس را ببیند، درباره جمله‌ای قضاوت می‌کند
          که هنوز نوشته نشده — و مربی دیگر نمی‌تواند آزادانه بنویسد.
        */
        <EmptyState text="گزارش این ماه هنوز آماده نشده. وقتی مربی بفرستد، همین‌جا می‌آید." />
      ) : (
        <>
          <section className={shared.card}>
            <span className={`${shared.cardLabel} t-caption`}>جمع‌بندی مربی</span>
            <p className={`${styles.summary} t-body`}>{report.teacherSummary}</p>
          </section>

          {report.observations.length > 0 ? (
            <section className={shared.card} aria-label="آنچه مربی دیده">
              <span className={`${shared.cardLabel} t-caption`}>آنچه مربی این ماه دیده</span>
              {report.observations.map((o) => (
                <p key={o.id} className={`${styles.observation} t-body`}>
                  <span className={styles.date}>{formatJalali(new Date(o.date), 'short')}</span>
                  {o.body}
                </p>
              ))}
            </section>
          ) : null}

          {/* ── نقشه علایق ───────────────────────────────── */}
          <section className={shared.card} aria-label="نقشه علایق">
            <span className={`${shared.cardLabel} t-caption`}>چه چیزی را بیشتر انتخاب کرد</span>
            {interest === null || interest.sample < (interest?.threshold ?? 8) ? (
              /*
                آستانه انتشار — بخش ۹.
                نمودارِ سه‌نقطه‌ای الگو نیست؛ و خانواده آن را الگو
                می‌خواند. پس به‌جایش همین جمله می‌آید.
              */
              <p className={`${shared.hint} t-body`}>
                داده کافی برای این ماه ثبت نشده.
              </p>
            ) : (
              <>
                {interest.corners
                  .filter((corner) => corner.times > 0)
                  .map((corner) => (
                    <p key={corner.id} className={`${shared.row} t-body`}>
                      <span>
                        {corner.glyph ? `${corner.glyph} ` : ''}
                        {corner.title}
                      </span>
                      <b>{formatCount(corner.times)} بار</b>
                    </p>
                  ))}
                {/*
                  «هنوز نرفته» گفته می‌شود، ولی نه به‌عنوان کاستی.
                  گوشه‌ای که کودک نرفته یعنی هنوز کشفش نکرده — نه اینکه
                  چیزی کم دارد. متن عمداً دعوت است، نه گزارشِ نقص.
                */}
                {interest.corners.some((corner) => corner.times === 0) ? (
                  <p className={`${shared.hint} t-caption`}>
                    هنوز سراغ این‌ها نرفته:{' '}
                    {interest.corners
                      .filter((corner) => corner.times === 0)
                      .map((corner) => corner.title)
                      .join('، ')}
                    . شاید در خانه امتحانشان کنید.
                  </p>
                ) : null}
              </>
            )}
          </section>

          {report.peers.length > 0 ? (
            <section className={shared.card} aria-label="هم‌بازی‌ها">
              <span className={`${shared.cardLabel} t-caption`}>بیشتر با چه کسانی بوده</span>
              <p className={`${styles.peers} t-body`}>
                {report.peers.map((p) => p.firstName).join('، ')}
              </p>
              {/* فقط نام کوچک: گزارش این کودک، مشخصات کودک دیگر را نمی‌برد. */}
              <p className={`${shared.hint} t-caption`}>
                از مشاهده‌های مربی، نه از اینکه چه کسی هم‌کلاسش است.
              </p>
            </section>
          ) : null}

          <section className={shared.card} aria-label="واقعیت‌های ماه">
            <span className={`${shared.cardLabel} t-caption`}>واقعیت‌های ماه</span>
            <p className={`${shared.row} t-body`}>
              <span>روز حاضر</span>
              <b>{formatCount(report.facts.presentDays)}</b>
            </p>
            <p className={`${shared.row} t-body`}>
              <span>روز غایب</span>
              <b>{formatCount(report.facts.absentDays)}</b>
            </p>
            {/*
              جمله‌ای که این صفحه عمداً می‌گوید.
              بی آن، خانواده خودش مقایسه می‌سازد — با کودک همسایه، با
              خواهر بزرگ‌تر، با آنچه در ذهنش «طبیعی» است.
            */}
            <p className={`${shared.hint} t-caption`}>
              این ارقام با هیچ کودک دیگری و با میانگین کلاس مقایسه نمی‌شوند.
            </p>
          </section>

          {report.meetingNotes ? (
            <section className={shared.card} aria-label="جلسه">
              <span className={`${shared.cardLabel} t-caption`}>آنچه در جلسه قرار شد</span>
              <p className={`${styles.summary} t-body`}>{report.meetingNotes}</p>
            </section>
          ) : null}
        </>
      )}
    </Shell>
  )
}
