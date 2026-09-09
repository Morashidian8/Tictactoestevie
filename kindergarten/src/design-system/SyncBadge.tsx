import { SyncIcon } from './icons.tsx'
import { formatCount } from '../i18n/index.ts'
import styles from './SyncBadge.module.css'

/**
 * وضعیت صف آفلاین — بخش ۱۲.۹ و ۱۴.۲.
 *
 * وقتی صف خالی است هیچ‌چیز نشان داده نمی‌شود. نشانگر همیشه‌روشن معنایش را
 * از دست می‌دهد و مربی دیگر نگاهش نمی‌کند.
 */
type Props = { pending: number }

export function SyncBadge({ pending }: Props) {
  if (pending <= 0) return null

  return (
    <span className={`${styles.badge} t-caption`}>
      <span className={styles.spin} aria-hidden>
        <SyncIcon size={14} />
      </span>
      <span className="tabular">{formatCount(pending)} ثبت در صف</span>
    </span>
  )
}
