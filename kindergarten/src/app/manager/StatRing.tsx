import { toPersianDigits } from '../../i18n/index.ts'
import styles from './StatRing.module.css'

/**
 * یک نسبت، به شکل حلقه — داشبورد مدیر.
 *
 * این نمودار نیست، یک عدد شاخص است با نشانگر پیشرفت. برای «۹۴٪ حاضر»
 * نموداری لازم نیست؛ خودِ عدد جواب است و حلقه فقط می‌گوید نسبت به کل
 * کجاست.
 *
 * لحن از خودِ عدد می‌آید، نه از سلیقه: حضور پایین یعنی اتفاقی افتاده و
 * باید دیده شود. متن درصد همیشه هست، پس رنگ تنها حامل معنا نیست.
 */
type Props = {
  value: number
  total: number
  label: string
  /** وقتی زیر این نسبت بیفتد، حلقه انبه‌ای می‌شود. */
  warnBelow?: number
}

export function StatRing({ value, total, label, warnBelow = 0.85 }: Props) {
  const share = total > 0 ? value / total : 0
  const percent = Math.round(share * 100)
  const warn = total > 0 && share < warnBelow

  const R = 16
  const C = 2 * Math.PI * R
  const filled = C * share

  return (
    <div className={styles.wrap}>
      <div className={styles.chart}>
        <svg viewBox="0 0 40 40" className={styles.svg} role="img" aria-label={label}>
          <circle cx="20" cy="20" r={R} fill="none" stroke="var(--card-border)" strokeWidth="6" />
          <circle
            cx="20"
            cy="20"
            r={R}
            fill="none"
            stroke={warn ? 'var(--mango)' : 'var(--mint)'}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${C - filled}`}
            transform="rotate(-90 20 20)"
          />
        </svg>
        <span className={styles.center}>
          <span className={`${styles.percent} t-h2 tabular`}>{toPersianDigits(percent)}٪</span>
        </span>
      </div>
      <span className={`${styles.label} t-caption`}>{label}</span>
      <span className={`${styles.detail} t-caption tabular`}>
        {toPersianDigits(value)} از {toPersianDigits(total)}
      </span>
    </div>
  )
}
