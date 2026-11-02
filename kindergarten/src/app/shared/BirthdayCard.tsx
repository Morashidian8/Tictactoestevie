import { useEffect, useState } from 'react'
import { ChildFace } from '../../design-system/index.ts'
import { formatCount, formatJalali } from '../../i18n/index.ts'
import { useData } from '../../core/auth/index.ts'
import { birthdaysTomorrow, type Birthday } from '../../core/data/index.ts'
import styles from './BirthdayCard.module.css'

/**
 * تولدهای پیشِ رو — برای مربی و مدیر.
 *
 * خواسته مالک محصول: «یک روز قبل برای مربی‌ها و مدیر اعلان بیاید که
 * اگر خواستند تبریک بگویند یا برنامه بچینند».
 *
 * ── اعلانِ یک‌روز‌قبل، اینجاست ──────────────────────────────────
 *
 * این اپ هنوز اعلانِ سیستمی ندارد و عمداً هم ندارد: روی iOS وب‌اپ است
 * و اعلانش مشروط به «افزودن به صفحه خانه» و اجازهٔ کاربر — یعنی برای
 * بخشی از کاربران هرگز نمی‌رسد و ما نمی‌دانیم کدام بخش (همان استدلالی
 * که `core/notify/critical.ts` برای پیامکِ پشتیبان می‌آورد).
 *
 * پس «اعلان» اینجا یک نوارِ مرجانی بالای همین کارت است که فقط فردا
 * روشن می‌شود. مربی صبح که اپ را باز می‌کند می‌بیندش، و همان‌جا هم
 * هست که تصمیم می‌گیرد کیک بیاورد یا نه. اگر روزی اعلانِ واقعی وصل
 * شد، منبعِ درستی‌اش همین `listBirthdays` است.
 *
 * ── چیزی که عمداً نیست ─────────────────────────────────────────
 *
 * هیچ مقایسه‌ای میان کودکان. «چند سالش می‌شود» یک واقعیت دربارهٔ خودِ
 * اوست، نه جایگاهش میان بقیه (بند ۱۰.۱).
 */
export function BirthdayCard({ withinDays = 14 }: { withinDays?: number }) {
  const data = useData()
  const [rows, setRows] = useState<Birthday[] | null>(null)

  useEffect(() => {
    let cancelled = false
    data
      .listBirthdays(withinDays)
      .then((list) => {
        if (!cancelled) setRows(list)
      })
      .catch(() => {
        if (!cancelled) setRows([])
      })
    return () => {
      cancelled = true
    }
  }, [data, withinDays])

  /* تا وقتی چیزی نیست، کارت هم نیست. کارتِ خالی جا می‌گیرد و خبر نمی‌دهد. */
  if (rows === null || rows.length === 0) return null

  const tomorrow = birthdaysTomorrow(rows)

  return (
    <section className={styles.card} aria-label="تولدهای پیش رو">
      <span className={`${styles.label} t-caption`}>
        تولدهای پیش رو ({formatCount(rows.length)})
      </span>

      {tomorrow.length > 0 ? (
        <p className={`${styles.alert} t-body`}>
          <span className={styles.alertIcon} aria-hidden>
            <Cake />
          </span>
          <span>
            <b>فردا</b> تولد {tomorrow.map((r) => r.firstName).join(' و ')} است
            {tomorrow.length === 1 && tomorrow[0] ? ` — ${formatCount(tomorrow[0].turning)} ساله می‌شود` : ''}.
          </span>
        </p>
      ) : null}

      <ul className={styles.list}>
        {rows.map((row) => (
          <li key={row.childId} className={styles.row}>
            <span className={styles.face} aria-hidden>
              <ChildFace id={row.childId} photoUrl={row.photoUrl} />
            </span>
            <span className={styles.who}>
              <span className={`${styles.name} t-body`}>{row.firstName}</span>
              <span className={`${styles.meta} t-caption`}>
                {formatCount(row.turning)} ساله می‌شود
                {row.className ? `، ${row.className}` : ''}
              </span>
            </span>
            <span className={`${styles.when} t-caption`}>
              {row.inDays === 0 ? (
                <b className={styles.today}>امروز</b>
              ) : row.inDays === 1 ? (
                <b className={styles.soon}>فردا</b>
              ) : (
                formatJalali(new Date(`${row.date}T12:00:00`), 'short')
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** کیک. غیرجهت‌دار است و قرینه نمی‌شود — بخش ۱۲.۶. */
function Cake() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden focusable="false">
      <path
        d="M4 13.5A2.5 2.5 0 0 1 6.5 11h11a2.5 2.5 0 0 1 2.5 2.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z"
        fill="currentColor"
      />
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none">
        <path d="M8.5 11V7.5M12 11V7.5M15.5 11V7.5" />
      </g>
      <g fill="currentColor">
        <circle cx="8.5" cy="5.6" r="1.5" />
        <circle cx="12" cy="5.6" r="1.5" />
        <circle cx="15.5" cy="5.6" r="1.5" />
      </g>
    </svg>
  )
}
