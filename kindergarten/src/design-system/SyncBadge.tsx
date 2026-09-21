import { SyncIcon } from './icons.tsx'
import { formatCount } from '../i18n/index.ts'
import styles from './SyncBadge.module.css'

/**
 * وضعیت صف آفلاین و اتصال زنده — بخش ۱۲.۹ و ۱۴.۲، و ارتقای ۴.
 *
 * وقتی صف خالی است و اتصال برقرار، هیچ‌چیز نشان داده نمی‌شود. نشانگر
 * همیشه‌روشن معنایش را از دست می‌دهد و مربی دیگر نگاهش نمی‌کند — پس
 * «متصل» حالتِ سکوت است، نه یک برچسب سبز.
 *
 * سه حالت دیده می‌شود:
 *   ـ در حال اتصال دوباره: چرخ می‌چرخد. هنوز کاری از دست نرفته.
 *   ـ آفلاین: چرخ نمی‌چرخد. صفحه هر نیم‌دقیقه خودش را می‌خواند و مربی
 *     باید بداند که چیزی که می‌بیند تازه‌ترین نیست.
 *   ـ صف پر: همان نشانگر پیشین.
 *
 * اگر هر دو همزمان باشند، اتصال مقدم است: صفِ پر روی خط قطع، مسئله
 * دوم است.
 */
type Props = { pending: number; live?: 'connected' | 'reconnecting' | 'offline' }

export function SyncBadge({ pending, live = 'connected' }: Props) {
  if (live === 'reconnecting') {
    return (
      <span className={`${styles.badge} t-caption`}>
        <span className={styles.spin} aria-hidden>
          <SyncIcon size={14} />
        </span>
        <span>در حال اتصال دوباره</span>
      </span>
    )
  }

  if (live === 'offline') {
    return (
      <span className={`${styles.badge} ${styles.offline} t-caption`} role="status">
        <span aria-hidden>
          <SyncIcon size={14} />
        </span>
        <span>آفلاین</span>
      </span>
    )
  }

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
