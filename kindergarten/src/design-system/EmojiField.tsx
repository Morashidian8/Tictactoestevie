import { useRef, useState } from 'react'
import styles from './EmojiField.module.css'

/**
 * کادر نوشتن با انتخابگر اموجی.
 *
 * خواسته مالک محصول: «توی قابلیت پیام فقط متن می‌شه داد. اموجی هم
 * اضافه کن».
 *
 * ── چرا فهرست کوتاه و دست‌چین ───────────────────────────────────
 *
 * صفحه‌کلید گوشی خودش اموجی دارد. آنچه ندارد، **سرعت** است: مربی وسط
 * شیفت برای گذاشتن یک ❤️ باید صفحه‌کلید را عوض کند، بگردد، و برگردد.
 * این فهرست همان چند تایی است که در گفتگوی مهد و خانواده واقعاً به کار
 * می‌آید — نه یک انتخابگرِ کاملِ یونیکد که خودش یک صفحه می‌شود.
 *
 * ── دو چیزی که رعایت می‌شود ─────────────────────────────────────
 *
 * ۱. **اموجی جای کلمه را نمی‌گیرد.** هیچ‌جای اپ معنایی فقط با اموجی
 *    گفته نمی‌شود؛ این فقط در متنِ آزادِ پیام است، همان‌جا که آدم‌ها
 *    خودشان می‌نویسند. شخصیتِ برند همچنان SVG است، نه اموجی — اموجی
 *    روی هر سیستم‌عامل شکل دیگری دارد و شخصیتی که ثابت نیست، شخصیت
 *    نیست (همان استدلال `Mascot.tsx`).
 *
 * ۲. **جای مکان‌نما حفظ می‌شود.** اموجی آخرِ متن نمی‌چسبد؛ همان‌جایی
 *    درج می‌شود که مکان‌نما بود، و مکان‌نما بعدش می‌ایستد.
 */
const GROUPS: { title: string; items: string[] }[] = [
  {
    title: 'حال و احساس',
    items: ['🙂', '😊', '😍', '🥰', '😂', '😢', '😟', '😴', '🤒', '🙏', '❤️', '👍'],
  },
  {
    title: 'روز کودک',
    items: ['🎂', '🎈', '🎉', '🍎', '🥪', '🥛', '🧸', '🎨', '⚽', '📚', '🌙', '☀️'],
  },
  {
    title: 'مهد',
    items: ['✅', '📝', '📷', '🚌', '🏠', '🩹', '💊', '🧴', '👕', '🎒', '⏰', '📌'],
  },
]

type Props = {
  value: string
  onChange: (next: string) => void
  label: string
  placeholder?: string
  rows?: number
  disabled?: boolean
}

export function EmojiField({ value, onChange, label, placeholder, rows = 2, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)

  const insert = (emoji: string) => {
    const el = box.current
    if (!el) {
      onChange(value + emoji)
      return
    }
    /*
     * درج سرِ مکان‌نما.
     *
     * چسباندن به انتهای متن، ساده‌تر بود و غلط: کسی که وسط جمله‌اش
     * اموجی می‌خواهد، بعدش باید دستی جابه‌جایش کند.
     */
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    const next = value.slice(0, start) + emoji + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      const at = start + emoji.length
      el.setSelectionRange(at, at)
    })
  }

  return (
    <div className={styles.field}>
      <div className={styles.row}>
        <textarea
          ref={box}
          className={styles.input}
          value={value}
          rows={rows}
          aria-label={label}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className={styles.toggle}
          aria-label={open ? 'بستن اموجی' : 'افزودن اموجی'}
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen((was) => !was)}
        >
          <SmileIcon />
        </button>
      </div>

      {open ? (
        <div className={styles.panel}>
          {GROUPS.map((group) => (
            <div key={group.title} className={styles.group}>
              <span className={`${styles.groupTitle} t-caption`}>{group.title}</span>
              <div className={styles.grid}>
                {group.items.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className={styles.emoji}
                    aria-label={`افزودن ${emoji}`}
                    onClick={() => insert(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** صورتک. غیرجهت‌دار است و قرینه نمی‌شود — بخش ۱۲.۶. */
function SmileIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
      <path d="M9.2 9.5h.01M14.8 9.5h.01" />
    </svg>
  )
}
