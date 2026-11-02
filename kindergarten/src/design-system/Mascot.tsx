/**
 * شخصیت برند — یکی برای هر نقش.
 *
 * چرا SVG و نه اموجی: اموجی روی اندروید، آی‌اواس و ویندوز سه شکل
 * متفاوت دارد. شخصیتی که در هر گوشی جور دیگری دیده شود، شخصیت نیست.
 *
 * چرا سه‌تا: مربی و مدیر گاهی یک نفرند و با یک شماره وارد می‌شوند.
 * شکلِ شخصیت، کنارِ رنگِ آسمان، در یک نگاه می‌گوید کدام حساب باز است.
 *
 * چهره‌ها عمداً ساده‌اند — دو نقطه و یک کمان. هر جزئیاتِ بیشتری در
 * اندازه ۴۶ پیکسل به لکه تبدیل می‌شود.
 */
export type MascotKind = 'sun' | 'heart' | 'star'

const FACE = (
  <>
    <circle cx="18" cy="21" r="2" fill="#152033" />
    <circle cx="28" cy="21" r="2" fill="#152033" />
    <path
      d="M18 27q5 4 10 0"
      stroke="#152033"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
    />
  </>
)

export function Mascot({ kind, size = 46 }: { kind: MascotKind; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 46 46"
      role="img"
      aria-hidden
      focusable="false"
    >
      {kind === 'sun' ? (
        <>
          <circle cx="23" cy="23" r="15" fill="#FFD166" />
          <g stroke="#FFD166" strokeWidth="3" strokeLinecap="round">
            <path d="M23 3v5M23 38v5M3 23h5M38 23h5M9 9l3.5 3.5M33.5 33.5L37 37M37 9l-3.5 3.5M12.5 33.5L9 37" />
          </g>
        </>
      ) : kind === 'heart' ? (
        <path
          d="M23 40C13 34 6 27 6 19a9 9 0 0 1 17-4 9 9 0 0 1 17 4c0 8-7 15-17 21Z"
          fill="#FFD7DE"
        />
      ) : (
        <path
          d="M23 6 25.8 17.4 37 14.5 29.6 23 37 31.5 25.8 28.6 23 40 20.2 28.6 9 31.5 16.4 23 9 14.5 20.2 17.4Z"
          fill="#FFE08A"
        />
      )}
      {FACE}
    </svg>
  )
}
