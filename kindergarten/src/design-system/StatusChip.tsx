import type { ReactNode } from 'react'
import styles from './StatusChip.module.css'

/**
 * رنگ‌ها معنای ثابت دارند — بخش ۱۲.۲:
 * زعفران در انتظار و سررسید نزدیک، آجر خطر و ایمنی، مریم‌گلی تکمیل.
 */
export type ChipTone = 'neutral' | 'turquoise' | 'saffron' | 'brick' | 'sage'

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
