import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { CrossIcon } from './icons.tsx'
import styles from './BottomSheet.module.css'

/**
 * شیت پایین‌رونده — بخش ۱۲.۹ سند.
 *
 * «ویرایش سریع بدون خروج از صفحه. برای استثناهای ثبت گروهی.» مربی وسط
 * کار است و نباید صفحه‌اش را از دست بدهد.
 */
type Props = {
  title: string
  onClose: () => void
  children: ReactNode
  /** نوار پایین شیت. کنش اصلی اینجا می‌نشیند. */
  footer?: ReactNode
}

export function BottomSheet({ title, onClose, children, footer }: Props) {
  const sheet = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)

    // صفحه پشت شیت نباید بلغزد.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // فوکوس به داخل شیت می‌رود، وگرنه صفحه‌خوان پشت شیت می‌ماند.
    sheet.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  return (
    <div
      className={styles.scrim}
      onPointerDown={(event) => {
        // ضربه بیرون شیت می‌بندد، ولی کشیدن از داخل به بیرون نه.
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={sheet}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <span className={styles.grip} aria-hidden />

        <div className={styles.head}>
          <h2 className={`${styles.title} t-h2`}>{title}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="بستن">
            <CrossIcon size={20} />
          </button>
        </div>

        <div className={styles.body}>{children}</div>

        {footer ? <div className={styles.foot}>{footer}</div> : null}
      </div>
    </div>
  )
}
