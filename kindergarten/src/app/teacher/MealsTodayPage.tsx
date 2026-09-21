import { useEffect, useState } from 'react'
import { AlertIcon, EmptyState } from '../../design-system/index.ts'
import { formatCount, formatJalali, toIsoDate } from '../../i18n/index.ts'
import { useData } from '../../core/auth/index.ts'
import type { MealPlate, MealSlot } from '../../core/data/index.ts'
import styles from './MealsTodayPage.module.css'

/**
 * غذای امروز و فردا — از دید مربی و آشپزخانه. ماژول ۰۰۳۶.
 *
 * سؤال واقعیِ سر ظهر دوتاست: «چند بشقاب؟» و «برای چه کسانی؟». پس
 * شمارش بالای فهرست می‌آید و نام‌ها زیرش.
 *
 * فقط رزروهای **نهایی‌شده** شمرده می‌شوند. رزروِ پرداخت‌نشده غذا نیست و
 * اگر اینجا می‌آمد، آشپزخانه بشقابی می‌پخت که پولش نیامده.
 *
 * هشدار آلرژی کنار نام هر کودک تکرار می‌شود، هرچند مهد خودش منو را
 * نوشته: کسی که بشقاب را دستش می‌گیرد مربی است، و او نباید برای دیدن
 * آلرژی به صفحه دیگری برود.
 */
const SLOT_TEXT: Record<MealSlot, string> = {
  snack_morning: 'میان‌وعده صبح',
  lunch: 'ناهار',
  snack_afternoon: 'میان‌وعده عصر',
}

export function MealsTodayPage({ onBack }: { onBack: () => void }) {
  const data = useData()
  const [day, setDay] = useState(() => toIsoDate(new Date()))
  const [plates, setPlates] = useState<MealPlate[] | null>(null)

  useEffect(() => {
    setPlates(null)
    data.listMealsForDay(day).then(setPlates).catch(() => setPlates([]))
  }, [data, day])

  const tomorrow = (() => {
    const at = new Date()
    at.setDate(at.getDate() + 1)
    return toIsoDate(at)
  })()

  /* یک گروه برای هر وعده: آشپزخانه ناهار و میان‌وعده را جدا می‌پزد. */
  const bySlot = new Map<string, MealPlate[]>()
  for (const plate of plates ?? []) {
    const key = `${plate.slot}|${plate.title}`
    bySlot.set(key, [...(bySlot.get(key) ?? []), plate])
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="بازگشت به منو">
          ‹
        </button>
        <span className={`${styles.title} t-h2`}>غذای رزروشده</span>
      </header>

      <div className={styles.body}>
        <div className={styles.days} role="tablist">
          <button
            type="button"
            className={`${styles.dayTab} t-body`}
            aria-pressed={day === toIsoDate(new Date())}
            onClick={() => setDay(toIsoDate(new Date()))}
          >
            امروز
          </button>
          <button
            type="button"
            className={`${styles.dayTab} t-body`}
            aria-pressed={day === tomorrow}
            onClick={() => setDay(tomorrow)}
          >
            فردا
          </button>
          <span className={`${styles.dayName} t-caption`}>
            {formatJalali(new Date(day), 'short')}
          </span>
        </div>

        {plates === null ? (
          <EmptyState text="در حال خواندن…" />
        ) : bySlot.size === 0 ? (
          <EmptyState text="برای این روز غذایی رزرو نشده." />
        ) : (
          [...bySlot.entries()].map(([key, list]) => {
            const first = list[0]
            if (!first) return null
            return (
              <section key={key} className={styles.card} aria-label={first.title}>
                <p className={`${styles.cardTop} t-body-lg`}>
                  <b>{first.title}</b>
                  <span className={styles.muted}>{SLOT_TEXT[first.slot]}</span>
                  {/*
                    شمارش، بزرگ و بالا. اولین چیزی که آشپزخانه می‌خواهد
                    عدد است، نه فهرست.
                  */}
                  <span className={styles.count}>{formatCount(list.length)} بشقاب</span>
                </p>

                {list.map((plate) => (
                  <p key={plate.childId} className={`${styles.row} t-body`}>
                    <span>{plate.childName}</span>
                    {plate.className ? (
                      <span className={styles.muted}>{plate.className}</span>
                    ) : null}
                    {plate.allergyHits.length > 0 ? (
                      <span className={styles.hit}>
                        <span aria-hidden><AlertIcon size={15} /></span>
                        {plate.allergyHits.join('، ')}
                      </span>
                    ) : null}
                  </p>
                ))}
              </section>
            )
          })
        )}
      </div>
    </div>
  )
}
