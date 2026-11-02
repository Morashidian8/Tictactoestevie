import styles from './ChoiceGroup.module.css'

/**
 * انتخاب یکی از چند گزینه.
 *
 * چرا جزء مشترک شد: هر صفحه نسخه خودش را داشت و استایلش را از فایل
 * CSS همان صفحه می‌گرفت. یکی از آن فایل‌ها کلاس را نداشت — CSS Modules
 * برای کلاس ناموجود `undefined` می‌دهد، پس دکمه‌ها بی‌استایل به هم
 * چسبیدند و «کارت بهداشتمدرک تحصیلیگواهی دوره» خوانده می‌شد. خطایی که
 * نه تایپ‌اسکریپت می‌گیردش نه تست، چون صفحه سالم رندر می‌شود.
 */
export function ChoiceGroup<T extends string>({ label, options, value, onChange }: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <fieldset className={styles.group}>
      <legend className={`${styles.legend} t-caption`}>{label}</legend>
      <div className={styles.options}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={styles.option}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
