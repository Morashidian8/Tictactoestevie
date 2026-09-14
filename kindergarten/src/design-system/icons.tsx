/**
 * مجموعه آیکون.
 *
 * مسیرها از Lucide گرفته شده‌اند (پروانه ISC) و فقط آن‌هایی که استفاده
 * می‌شوند اینجا نوشته‌اند، نه کل کتابخانه. دلیل انتخاب: خطی با وزن
 * یکنواخت، شبکه ۲۴ پیکسلی، و آیکون‌های جهت‌دارش تمیز قرینه می‌شوند که
 * برای رابط راست‌به‌چپ لازم است.
 *
 * قواعدی که این فایل نگه می‌دارد:
 * - بخش ۱۲.۲: رنگ هرگز تنها حامل معنا نیست، پس آیکون همیشه کنار متن است.
 * - بخش ۱۲.۶: آیکون جهت‌دار قرینه می‌شود، غیرجهت‌دار نه. هیچ‌کدام از
 *   این‌ها جهت‌دار نیستند، پس هیچ‌کدام کلاس mirror نمی‌گیرند.
 * - ضخامت خط با وزن متن هم‌خانواده است تا آیکون در کنار متن سبک‌تر یا
 *   سنگین‌تر به نظر نرسد.
 */
type IconProps = { size?: number }

const frame = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
})

/** حاضر، تکمیل‌شده، رفته */
export function CheckIcon({ size = 16 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

/** غایب */
export function CrossIcon({ size = 16 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

/** توجه، بی‌خبر، سررسید */
export function AlertIcon({ size = 16 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}

/** همگام‌سازی. غیرجهت‌دار است و قرینه نمی‌شود. */
export function SyncIcon({ size = 16 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

/** هنوز نیامده */
export function DashIcon({ size = 16 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M5 12h14" />
    </svg>
  )
}

/** دارو، یادآور خورانده‌نشده */
export function PillIcon({ size = 16 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
      <path d="m8.5 8.5 7 7" />
    </svg>
  )
}

/** تعویض کلاس. غیرجهت‌دار، قرینه نمی‌شود. */
export function LayersIcon({ size = 16 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="m12 2 9 5-9 5-9-5 9-5Z" />
      <path d="m3 17 9 5 9-5" />
      <path d="m3 12 9 5 9-5" />
    </svg>
  )
}

/**
 * ناهار — میکروآیکون فعالیت روی کارت کودک.
 *
 * ایموجی 🍲 نشد: روی اندروید، iOS و ویندوز سه شکل متفاوت دارد، رنگش
 * از کنترل پالت بیرون است، و در ۱۰ پیکسل به یک لکه تبدیل می‌شود. این
 * مسیر همان شبکه ۲۴ و همان ضخامت خط بقیه آیکون‌ها را دارد.
 */
export function SpoonIcon({ size = 16 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M13.5 3.5c1.7 1.7 1.7 4.4 0 6.1s-4.4 1.7-6.1 0-1.7-4.4 0-6.1 4.4-1.7 6.1 0Z" />
      <path d="m9.2 12.3-5.7 7.6" />
    </svg>
  )
}

/** خواب — میکروآیکون فعالیت روی کارت کودک. */
export function MoonIcon({ size = 16 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </svg>
  )
}
