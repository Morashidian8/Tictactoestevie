import type { ReactNode } from 'react'
import styles from './StatusChip.module.css'

/**
 * رنگ‌ها معنای ثابت دارند — بخش ۱۲.۲ نسخه ۲.۰:
 * مرجانی کنش و برند، انبه‌ای در انتظار و خواب، آجر ایمنی، نعنایی تکمیل.
 */
export type ChipTone = 'neutral' | 'coral' | 'mango' | 'brick' | 'mint'

type Props = {
  tone?: ChipTone
  /** آیکون اجباری نیست ولی توصیه‌شده. متن هرگز حذف نمی‌شود. */
  icon?: ReactNode
  children: ReactNode
}

export function StatusChip({ tone = 'neutral', icon, children }: Props) {
  return (
    <span className={`${styles.chip} ${styles[tone]} t-caption`}>
      {icon ? (
        <span className={styles.icon} aria-hidden>
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  )
}
