import type { ReactNode } from 'react'
import styles from './QuickAction.module.css'

/**
 * دکمه بزرگ چسبیده پایین. هر صفحه پنل مربی حداکثر یکی دارد، چون بخش ۱۲.۲
 * می‌گوید فیروزه‌ای فقط برای کنش اصلی است.
 *
 * برچسب باید دقیقاً بگوید چه اتفاقی می‌افتد — بخش ۱۲.۱۰. «ثبت گروهی امروز»
 * نه «ادامه».
 */
type Props = {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  /**
   * کنش ثانویه که یک ردیف بالای کنش اصلی می‌نشیند، داخل همان نوار.
   *
   * دلیل اینکه داخل نوار است نه شناور روی صفحه: دکمه‌ای که تمام روز روی
   * صفحه است، در هر موقعیت اسکرول روی نام یا عکس یکی از کودکان می‌افتد.
   * داخل نوار، جای خودش را در جریان صفحه می‌گیرد و هرگز چیزی را نمی‌پوشاند.
   */
  aside?: ReactNode
}

export function QuickAction({ children, onClick, disabled, aside }: Props) {
  return (
    <div className={styles.bar}>
      {aside ? <div className={styles.aside}>{aside}</div> : null}
      <button
        type="button"
        className={`${styles.button} t-body-lg`}
        onClick={onClick}
        disabled={disabled}
      >
        {children}
      </button>
    </div>
  )
}
