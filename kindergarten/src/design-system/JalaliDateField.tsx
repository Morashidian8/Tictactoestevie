import { useState } from 'react'
import { JALALI_MONTHS, jalaliParts, jalaliToIso, toPersianDigits } from '../i18n/index.ts'
import styles from './JalaliDateField.module.css'

/**
 * انتخاب تاریخ از تقویم جلالی.
 *
 * چرا تقویم و نه ورودی متنی: تاریخ تایپ‌شده سه راه خطا دارد و هر سه در
 * همین محصول دیده شد — ارقام لاتین به‌جای فارسی، جداکننده متفاوت، و
 * روزی که وجود ندارد (۳۰ اسفندِ سال غیرکبیسه). هیچ‌کدام با اعتبارسنجی
 * حل نمی‌شود؛ فقط پیام خطا می‌دهد. تقویم اصلاً اجازه ساختنشان را
 * نمی‌دهد.
 *
 * مقدار بیرونی همیشه تاریخ میلادی ISO است، چون ستون پایگاه داده
 * `date` است و با `current_date` مقایسه می‌شود. آنچه کاربر می‌بیند
 * جلالی است و آنچه ذخیره می‌شود میلادی — و تبدیل یک جا انجام می‌شود.
 */
export function JalaliDateField({ label, value, onChange, allowClear = true }: {
  label: string
  /** تاریخ میلادی ISO، یا خالی. */
  value: string | null
  onChange: (iso: string | null) => void
  allowClear?: boolean
}) {
  const today = jalaliParts(new Date())
  const selected = value ? jalaliParts(new Date(`${value}T12:00:00`)) : null

  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(selected?.year ?? today.year)
  const [month, setMonth] = useState(selected?.month ?? today.month)

  /*
   * طول ماه، از خودِ تبدیل پرسیده می‌شود نه از جدول کبیسه.
   *
   * ۳۱ را امتحان می‌کند، بعد ۳۰، بعد ۲۹. اولین روزی که ساخته شود، طول
   * ماه است — پس قواعد کبیسه از همان منبعی می‌آید که بقیه اپ می‌آید و
   * جدول دومی نیست که با آن نخواند.
   */
  const daysInMonth = (() => {
    for (const day of [31, 30, 29]) {
      if (jalaliToIso(year, month, day)) return day
    }
    return 29
  })()

  const firstIso = jalaliToIso(year, month, 1)
  /*
   * هفته ایرانی شنبه شروع می‌شود. getDay شنبه را ۶ می‌گیرد، پس
   * جابه‌جا می‌شود — بی این، کل شبکه یک ستون جابه‌جاست.
   */
  const leading = firstIso ? (new Date(`${firstIso}T12:00:00`).getDay() + 1) % 7 : 0

  const step = (by: number) => {
    let nextMonth = month + by
    let nextYear = year
    if (nextMonth > 12) {
      nextMonth = 1
      nextYear += 1
    }
    if (nextMonth < 1) {
      nextMonth = 12
      nextYear -= 1
    }
    setMonth(nextMonth)
    setYear(nextYear)
  }

  const pick = (day: number) => {
    const iso = jalaliToIso(year, month, day)
    if (!iso) return
    onChange(iso)
    setOpen(false)
  }

  const shown = selected
    ? `${toPersianDigits(selected.day)} ${JALALI_MONTHS[selected.month - 1]} ${toPersianDigits(selected.year)}`
    : 'انتخاب نشده'

  return (
    <div className={styles.field}>
      <span className={`${styles.label} t-caption`}>{label}</span>

      <button
        type="button"
        className={styles.trigger}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {shown}
      </button>

      {open ? (
        <div className={styles.calendar}>
          <div className={styles.head}>
            {/* ماه قبل در سمت راست — جهت خواندن، نه جهت فلش. */}
            <button type="button" className={styles.step} onClick={() => step(-1)}>
              ‹
            </button>
            <span className={`${styles.month} t-body`}>
              {JALALI_MONTHS[month - 1]} {toPersianDigits(year)}
            </span>
            <button type="button" className={styles.step} onClick={() => step(1)}>
              ›
            </button>
          </div>

          <div className={styles.weekdays}>
            {['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map((day, index) => (
              <span key={day} className={index >= 5 ? styles.weekend : undefined}>
                {day}
              </span>
            ))}
          </div>

          <div className={styles.grid}>
            {Array.from({ length: leading }, (_, i) => (
              <span key={`pad-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const isSelected =
                selected?.year === year && selected.month === month && selected.day === day
              const isToday =
                today.year === year && today.month === month && today.day === day
              return (
                <button
                  key={day}
                  type="button"
                  className={`${styles.day} ${isSelected ? styles.daySelected : ''} ${
                    isToday ? styles.dayToday : ''
                  }`}
                  onClick={() => pick(day)}
                >
                  {toPersianDigits(day)}
                </button>
              )
            })}
          </div>

          <div className={styles.foot}>
            <button
              type="button"
              className={styles.quick}
              onClick={() => {
                setYear(today.year)
                setMonth(today.month)
              }}
            >
              امروز
            </button>
            {/*
              «بدون تاریخ» یک انتخاب واقعی است، نه انصراف.
              مدرک تحصیلی انقضا ندارد و مدیر باید بتواند همین را بگوید.
            */}
            {allowClear ? (
              <button
                type="button"
                className={styles.quick}
                onClick={() => {
                  onChange(null)
                  setOpen(false)
                }}
              >
                بدون تاریخ
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
