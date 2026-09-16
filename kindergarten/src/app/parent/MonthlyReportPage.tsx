import { useCallback, useEffect, useState } from 'react'
import { EmptyState } from '../../design-system/index.ts'
import {
  formatCount,
  formatJalali,
  formatPeriod,
  jalaliYearMonth,
} from '../../i18n/index.ts'
import { useData } from '../../core/auth/index.ts'
import type { MonthlyReport } from '../../core/data/index.ts'
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
export function MonthlyReportPage({ childId, childName, onBack }: {
  childId: string
  childName: string
  onBack: () => void
}) {
  const data = useData()
  const [period, setPeriod] = useState(() => jalaliYearMonth(new Date()))
  const [report, setReport] = useState<MonthlyReport | null>(null)

  const load = useCallback(async () => {
    try {
      setReport(await data.getMonthlyReport(childId, period))
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
