import styles from './DayTimeline.module.css'

/**
 * خط زمان روز کودک — بازطراحی پنل والد.
 *
 * تا اینجا ورود و خروج دو سطر جدا بودند و ناهار و خواب دو سطر دیگر،
 * پایین‌تر. والد باید صفحه را می‌خواند تا بفهمد روز کجاست.
 *
 * خط زمان همان داده را در یک نگاه می‌دهد: نقطه پر یعنی گذشته، نقطه
 * توخالی یعنی هنوز نه. هیچ داده تازه‌ای لازم ندارد.
 *
 * فقط مرحله‌هایی می‌آیند که برای این کودک معنا دارند — کودک صبحانه‌ای
 * ناهار ندارد و نباید یک نقطه خالیِ همیشگی ببیند.
 */
export type DayStep = {
  id: string
  label: string
  /** افتاده یا نه. نقطه پر از همین می‌آید. */
  done: boolean
  /**
   * زیرنویس مرحله: ساعت، مدت، یا هر چیزی که واقعاً می‌دانیم.
   *
   * جدا از `done` است چون همه مرحله‌ها ساعت ندارند. گزارش روزانه
   * می‌گوید ناهار خورده شده و چقدر خوابیده، ولی ساعتش را ثبت نمی‌کند —
   * و نوشتن ساعت ورود زیر «ناهار»، عددی می‌سازد که هیچ‌جا وجود ندارد.
   */
  value?: string | null
}

export function DayTimeline({ steps }: { steps: DayStep[] }) {
  if (steps.length === 0) return null

  return (
    <ol className={styles.line}>
      {steps.map((step) => (
        <li key={step.id} className={`${styles.step} ${step.done ? styles.done : ''}`}>
          <span className={styles.dot} aria-hidden />
          <span className={`${styles.label} t-caption`}>{step.label}</span>
          <span className={`${styles.time} t-caption tabular`}>{step.value ?? '—'}</span>
          {/* رنگ تنها حامل معنا نیست — بخش ۱۲.۲ */}
          <span className="sr-only">{step.done ? 'انجام شد' : 'هنوز نه'}</span>
        </li>
      ))}
    </ol>
  )
}
