import type { ReactNode } from 'react'
import { AlertIcon, ChevronIcon } from '../../design-system/index.ts'
import { formatCount } from '../../i18n/index.ts'
import styles from './Cartable.module.css'

/**
 * «جا نماند» — آنچه دیده نشده و کاری می‌خواهد، یک‌جا و در صفحه اول.
 *
 * خواسته مالک محصول: «می‌خوام اعلان هرچی که داره و دیده نشده به‌صورت
 * خلاصه تو صفحه اول بگه که با کلیک کردن روش وارد اون صفحه بشه … بتونه
 * همون صفحه اول ببینه چه چیزهایی جا مونده.»
 *
 * ── چرا خلاصه، نه خودِ کارت‌ها ──────────────────────────────────
 *
 * صفحه اول مدیر پیش از این کارتِ کاملِ تولدها را داشت، با چهره و نام و
 * تاریخِ هر کودک. یک کارتِ کامل برای خبری که اغلب روزها خالی است، و
 * هیچ‌چیز برای پنج خبرِ دیگری که همان روز منتظر بودند.
 *
 * اینجا برعکس است: هر خبر **یک سطر** است و خودِ صفحه‌اش جای کامل
 * دیدنش. صفحه اول می‌گوید «چه چیزی مانده»، نه «چه چیزی هست».
 *
 * ── سه قاعده که این جزء نمی‌شکند ────────────────────────────────
 *
 * ۱. **سطرِ صفر نوشته نمی‌شود.** فهرستی که همیشه همان شش خط را نشان
 *    بدهد، بعد از یک هفته خوانده نمی‌شود. فقط آنچه واقعاً مانده.
 *
 * ۲. **رنگ تزئین است، نه معنا.** هر سطر متنِ خودش را دارد و شمارش را
 *    با رقم می‌گوید؛ رنگ فقط کمک می‌کند سطرها از هم جدا دیده شوند —
 *    بخش ۱۲.۲.
 *
 * ۳. **هر سطر مقصد دارد.** سطری که با لمس کاری نکند، خبر نیست؛ یادآورِ
 *    بی‌فایده است.
 */
export type CartableTone = 'mint' | 'sky' | 'bubble' | 'mango' | 'grape' | 'coral'

export type CartableItem = {
  id: string
  /** متن کامل سطر، همان‌طور که خوانده می‌شود: «تولد دو کودک فرداست». */
  text: string
  /** شمار، اگر عدد داشته باشد. صفر یعنی سطر اصلاً ساخته نمی‌شود. */
  count?: number
  /**
   * عدد را کنار سطر ننویس.
   *
   * برای سطرهایی که خودِ متنشان شمار را می‌گوید — «تولد دو کودک
   * فرداست». نوشتن دوباره‌اش، همان عدد را دو بار در یک خط می‌آورد.
   */
  quiet?: boolean
  tone: CartableTone
  /** نشانِ کنار سطر. */
  icon?: ReactNode
  /** کجا می‌برد — نام مقصد، برای خواننده صفحه‌خوان. */
  goLabel: string
  onGo: () => void
  /**
   * خبری که نمی‌شود عقب انداخت.
   *
   * فقط برای ایمنی کودک به کار می‌رود (بخش ۱۳.۳)؛ اگر هر سطری فوری
   * باشد، هیچ سطری فوری نیست.
   */
  urgent?: boolean
}

export function Cartable({ items, title = 'جا نماند' }: {
  items: CartableItem[]
  title?: string
}) {
  const shown = items.filter((item) => item.count === undefined || item.count > 0)

  return (
    <section className={styles.card} aria-label={title}>
      <span className={`${styles.label} t-caption`}>{title}</span>

      {shown.length === 0 ? (
        /*
         * حالت خالی هم خبر است: «چیزی نمانده» همان چیزی است که مدیر
         * صبح می‌خواهد بداند. جای خالی این را نمی‌گوید.
         */
        <p className={`${styles.calm} t-body`}>چیزی جا نمانده. همه‌چیز رسیدگی شده.</p>
      ) : (
        <ul className={styles.list}>
          {shown.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`${styles.row} ${item.urgent ? styles.rowUrgent : ''}`}
                onClick={item.onGo}
                aria-label={`${item.text} — ${item.goLabel}`}
              >
                <span className={`${styles.dot} ${styles[item.tone]}`} aria-hidden>
                  {item.icon ?? (item.urgent ? <AlertIcon size={16} /> : null)}
                </span>
                <span className={`${styles.text} t-body`}>{item.text}</span>
                {item.count !== undefined && !item.quiet ? (
                  <span className={`${styles.count} t-caption`} aria-hidden>
                    {formatCount(item.count)}
                  </span>
                ) : null}
                {/* پیکان در RTL خودش قرینه می‌شود — بخش ۱۲.۶. */}
                <ChevronIcon size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
