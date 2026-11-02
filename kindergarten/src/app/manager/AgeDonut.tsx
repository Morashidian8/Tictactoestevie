import { formatCount, toPersianDigits } from '../../i18n/index.ts'
import styles from './AgeDonut.module.css'

/**
 * پراکندگی سنی کودکان — داشبورد مدیر.
 *
 * چرا یک رنگ در سه پله و نه سه رنگ: گروه سنی دسته‌بندی نیست، ترتیبی
 * است. سه تا چهار کمتر از چهار تا پنج است و رنگ باید همین را بگوید.
 * به‌علاوه نعنایی، انبه‌ای و آجری در این محصول معنای وضعیت دارند و اگر
 * سری نمودار بشوند، دیگر «در انتظار» و «ایمنی» را نمی‌گویند.
 *
 * هر سه پله با اعتبارسنج رمپ ترتیبی سنجیده شده‌اند. سرِ روشن رمپ روی
 * سطح ۲٫۴۷ می‌دهد که زیر کف ۳:۱ عناصر غیرمتنی است، پس برچسب مستقیم
 * الزامی است نه تزئینی: هر ردیف عدد و درصد خودش را دارد و رنگ هرگز
 * تنها حامل معنا نیست.
 *
 * فاصله دو پیکسلی بین قطعه‌ها از جنس سطح است، تا دو قطعه هم‌رنگِ کنار
 * هم به یک لکه تبدیل نشوند.
 */
export type AgeBand = {
  id: string
  label: string
  count: number
}

const RAMP = ['var(--mint)', 'var(--mint-mid)', 'var(--mint-deep)']
/** فاصله بین قطعه‌ها، بر حسب درصد محیط. */
const GAP = 1.2

export function AgeDonut({ bands }: { bands: AgeBand[] }) {
  const total = bands.reduce((sum, band) => sum + band.count, 0)
  if (total === 0) {
    return <p className={`${styles.empty} t-body`}>هنوز کودکی ثبت‌نام نشده.</p>
  }

  // محیط دایره با شعاع ۱۶ در مختصات ۴۰×۴۰: کشیدن با stroke-dasharray.
  const R = 16
  const C = 2 * Math.PI * R
  let offset = 0

  return (
    <div className={styles.wrap}>
      <div className={styles.chart}>
        <svg viewBox="0 0 40 40" className={styles.svg} role="img" aria-label="پراکندگی سنی">
          {bands.map((band, index) => {
            const share = (band.count / total) * 100
            const length = Math.max(0, (share * C) / 100 - (GAP * C) / 100)
            const dash = `${length} ${C - length}`
            const rotation = -90 + (offset * 360) / 100
            offset += share
            return (
              <circle
                key={band.id}
                cx="20"
                cy="20"
                r={R}
                fill="none"
                stroke={RAMP[index % RAMP.length]}
                strokeWidth="7"
                strokeDasharray={dash}
                transform={`rotate(${rotation} 20 20)`}
              />
            )
          })}
        </svg>
        <span className={styles.center}>
          <span className={`${styles.centerNum} t-h1 tabular`}>{toPersianDigits(total)}</span>
          <span className={`${styles.centerLabel} t-caption`}>کودک</span>
        </span>
      </div>

      {/*
        برچسب مستقیم، نه فقط راهنمای رنگی: سرِ روشن رمپ کف ۳:۱ را رد
        نمی‌کند و بی این اعداد، قطعه‌های روشن خوانده نمی‌شوند.
      */}
      <ul className={styles.legend}>
        {bands.map((band, index) => (
          <li key={band.id} className={`${styles.row} t-body-sm`}>
            <span
              className={styles.swatch}
              style={{ background: RAMP[index % RAMP.length] }}
              aria-hidden
            />
            <span className={styles.rowLabel}>{band.label}</span>
            <span className={`${styles.rowValue} tabular`}>
              {formatCount(band.count)}
              <span className={styles.rowShare}>
                {' '}
                ({toPersianDigits(Math.round((band.count / total) * 100))}٪)
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
