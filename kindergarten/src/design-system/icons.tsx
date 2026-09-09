/**
 * آیکون‌های پایه.
 *
 * بخش ۱۲.۲: رنگ هرگز تنها حامل معنا نیست، همیشه آیکون یا متن همراهش است.
 * بخش ۱۲.۶: آیکون جهت‌دار قرینه می‌شود، آیکون غیرجهت‌دار نه. هیچ‌کدام از
 * این‌ها جهت‌دار نیستند، پس هیچ‌کدام کلاس `mirror` نمی‌گیرند.
 */
type IconProps = { size?: number }

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 16 16',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
})

/** حاضر، تکمیل‌شده، رفته */
export function CheckIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M3 8.5 6.5 12 13 4.5" />
    </svg>
  )
}

/** غایب */
export function CrossIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

/** توجه، بی‌خبر، سررسید */
export function AlertIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M8 2.5 15 14H1z" />
      <path d="M8 6.5v3.5" />
      <path d="M8 12h.01" />
    </svg>
  )
}

/** همگام‌سازی. غیرجهت‌دار است و قرینه نمی‌شود. */
export function SyncIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M14 8a6 6 0 1 1-1.8-4.3" />
      <path d="M14 2v3h-3" />
    </svg>
  )
}

/** هنوز نیامده */
export function DashIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 8h8" />
    </svg>
  )
}

/** دارو، یادآور خورانده‌نشده */
export function PillIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="1.5" y="5.5" width="13" height="5" rx="2.5" />
      <path d="M8 5.5v5" />
    </svg>
  )
}
