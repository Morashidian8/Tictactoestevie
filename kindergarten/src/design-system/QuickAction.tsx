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
}

export function QuickAction({ children, onClick, disabled }: Props) {
  return (
    <div className={styles.bar}>
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
