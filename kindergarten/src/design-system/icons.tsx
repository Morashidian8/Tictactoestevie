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

/** خانه — نوار ناوبری پنل والد. */
export function HomeIcon({ size = 16 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
    </svg>
  )
}

/** پیام — کنش مرکزی نوار والد. */
export function ChatIcon({ size = 16 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-3.6-.7L3 21l1.9-5A8.2 8.2 0 0 1 4 11.5 8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z" />
    </svg>
  )
}

/** تقویم — «فردا» در پنل والد. */
export function CalendarIcon({ size = 16 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  )
}

/** بلندگو — اطلاعیه‌های مهد. */
export function MegaphoneIcon({ size = 16 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M3 11v2a1 1 0 0 0 1 1h2l6 4V6L6 10H4a1 1 0 0 0-1 1Z" />
      <path d="M16 9a4 4 0 0 1 0 6" />
    </svg>
  )
}

/** آدمک — «بیشتر» و پروفایل. */
export function PersonIcon({ size = 16 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  )
}

/** زنگ — اعلان‌های سرصفحه. */
export function BellIcon({ size = 16 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6Z" />
      <path d="M13.7 20a2 2 0 0 1-3.4 0" />
    </svg>
  )
}

/** برگ — نشان مهد در سرصفحه پنل والد. */
export function LeafIcon({ size = 16 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M11 20A7 7 0 0 1 20 4c0 9-5.5 12-9 12v4Z" />
      <path d="M8 17c0-3 2-6 5-8" />
    </svg>
  )
}

/** سپر با تیک — زنجیره ایمنی دارو. */
export function ShieldCheckIcon({ size = 16 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M12 3 5 6v5.5c0 4.2 3 7.4 7 8.5 4-1.1 7-4.3 7-8.5V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

/** تصویر — کارت گالری امروز. */
export function ImageIcon({ size = 16 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4 18 5-5 4 4 2.5-2.5L20 18" />
    </svg>
  )
}

/** پیکان ادامه. جهت‌دار است، پس در راست‌به‌چپ قرینه می‌شود. */
export function ChevronIcon({ size = 16 }: IconProps) {
  return (
    <svg {...frame(size)} className="mirror">
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}
