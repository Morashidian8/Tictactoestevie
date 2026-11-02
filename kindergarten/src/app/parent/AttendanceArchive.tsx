import { useCallback, useEffect, useState } from 'react'
import { EmptyState } from '../../design-system/index.ts'
import {
  formatCount,
  formatJalali,
  formatPeriod,
  formatTime,
  jalaliToIso,
  jalaliYearMonth,
  toPersianDigits,
} from '../../i18n/index.ts'
import { useData } from '../../core/auth/index.ts'
import type { AttendanceMonth } from '../../core/data/index.ts'
import shared from './MorePage.module.css'
import styles from './AttendanceArchive.module.css'

/**
 * بایگانی حضور و غیاب یک کودک، ماه به ماه.
 *
 * خواسته مالک محصول: «آخر ماه پروفایل کودک مشخص باشه دقیقا چه روزها و
 * ساعت‌هایی حضور داشته».
 *
 * سه چیزی که این صفحه صادقانه می‌گوید:
 *
 * ۱. **روزی که خروجش ثبت نشده، مدت ندارد.** صفر یا حدس گذاشتن یعنی
 *    دروغ گفتن درباره ساعتی که کودک آنجا بود — و همین عدد است که اگر
 *    روزی اختلافی پیش بیاید، به آن استناد می‌شود.
 *
 * ۲. **فقط روزهای کاری شمرده می‌شوند.** پنجشنبه و جمعه ردیف نمی‌سازند،
 *    وگرنه «غیبت» شامل روزهایی می‌شود که مهد اصلاً باز نبوده.
 *
 * ۳. **تأخیر گفته می‌شود ولی جریمه‌اش اینجا نیست.** مبلغ، کار بخش مالی
 *    است؛ اینجا فقط واقعیتِ ساعت است.
 */
export function AttendanceArchive({ childId }: { childId: string }) {
  const data = useData()
  const [period, setPeriod] = useState(() => jalaliYearMonth(new Date()))
  const [month, setMonth] = useState<AttendanceMonth | null>(null)

  const load = useCallback(async () => {
    const [yearText, monthText] = period.split('-')
    const year = Number(yearText)
    const index = Number(monthText)
    const from = jalaliToIso(year, index, 1)
    // یکم ماه بعد، منهای یک روز — تا آخرین روز ماه، کبیسه یا نه، درست دربیاید.
    const nextMonth = index === 12 ? 1 : index + 1
    const nextYear = index === 12 ? year + 1 : year
    const firstOfNext = jalaliToIso(nextYear, nextMonth, 1)
    if (!from || !firstOfNext) {
      setMonth(null)
      return
    }
    const to = new Date(`${firstOfNext}T12:00:00`)
    to.setDate(to.getDate() - 1)

    try {
      setMonth(await data.getAttendanceMonth(childId, from, to.toISOString().slice(0, 10)))
    } catch {
      setMonth(null)
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

  const hours = month ? Math.floor(month.totalMinutes / 60) : 0

  return (
    <div className={styles.wrap}>
      <div className={styles.monthBar}>
        {/* ماه قبل در سمت راستِ نوار — جهت خواندن، نه جهت فلش. */}
        <button type="button" className={styles.step} onClick={() => shift(-1)}>
          ماه قبل
        </button>
        <span className={`${styles.period} t-body`}>{formatPeriod(period)}</span>
        <button type="button" className={styles.step} onClick={() => shift(1)}>
          ماه بعد
        </button>
      </div>

      {month === null ? (
        <EmptyState text="در حال خواندن…" />
      ) : month.days.length === 0 ? (
        <EmptyState text="برای این ماه چیزی ثبت نشده." />
      ) : (
        <>
          <div className={styles.tiles}>
            <Tile label="روز حاضر" value={formatCount(month.presentDays)} />
            <Tile label="روز غایب" value={formatCount(month.absentDays)} />
            <Tile label="مجموع ساعت" value={toPersianDigits(hours)} />
          </div>

          {month.lateDays > 0 ? (
            <p className={`${shared.hint} t-caption`}>
              {formatCount(month.lateDays)} روز با تأخیر در تحویل گرفتن. مبلغش، اگر باشد،
              در بخش مالی می‌آید.
            </p>
          ) : null}

          <ul className={styles.days}>
            {month.days.map((day) => (
              <li key={day.date} className={`${styles.day} t-body-sm`}>
                <span className={styles.date}>{formatJalali(new Date(day.date), 'short')}</span>
                {day.absent ? (
                  <span className={styles.absent}>
                    غایب{day.absenceReason ? ` — ${day.absenceReason}` : ''}
                  </span>
                ) : (
                  <span className={styles.clock}>
                    {day.checkInAt ? formatTime(new Date(day.checkInAt)) : '—'}
                    {' تا '}
                    {day.checkOutAt ? formatTime(new Date(day.checkOutAt)) : '—'}
                  </span>
                )}
                {/*
                  مدت، فقط وقتی هر دو سر ثبت شده. روزی که خروجش ثبت
                  نشده «۰ ساعت» نمی‌شود — می‌گوید که ثبت نشده.
                */}
                <span className={styles.minutes}>
                  {day.absent
                    ? ''
                    : day.minutes === null
                      ? 'خروج ثبت نشده'
                      : `${toPersianDigits(Math.floor(day.minutes / 60))}:${toPersianDigits(
                          String(day.minutes % 60).padStart(2, '0'),
                        )}`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.tile}>
      <span className={`${styles.tileLabel} t-caption`}>{label}</span>
      <b className={`${styles.tileValue} t-h2`}>{value}</b>
    </div>
  )
}
