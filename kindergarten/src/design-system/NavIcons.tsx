/**
 * آیکون‌های نوار پایین — هرکدام شکل و رنگ خودش.
 *
 * چرا خانواده‌ای جدا از `icons.tsx`: آن‌ها خطی‌اند با `currentColor` و در
 * سراسر اپ کنار متن می‌نشینند. این‌ها فقط در نوار پایین‌اند و قاعده‌شان
 * فرق دارد.
 *
 * ── دو تصمیم که این فایل نگه می‌دارد ────────────────────────────
 *
 * ۱. **شکلِ توپر، نه خطِ نازک.** خطِ دو پیکسلی در قابِ ۲۲ پیکسلی روی
 *    گوشی واقعی محو می‌شود. اینجا بدنه توپر است و جزئیاتِ داخلش با
 *    **رنگِ پس‌زمینه** بریده می‌شود، پس در هر اندازه‌ای تیز می‌ماند.
 *
 * ۲. **رنگ هویت است، نه معنا — بخش ۱۲.۲.** برچسبِ متنی همیشه زیر
 *    آیکون هست و هیچ اطلاعاتی فقط با رنگ گفته نمی‌شود. رنگ اینجا فقط
 *    کمک می‌کند مربی بدون خواندن بفهمد کدام خانه کجاست.
 *
 * ── کنتراست ─────────────────────────────────────────────────────
 *
 * دو حالت، و هر دو سنجیده‌اند (معیار ۱.۴.۱۱، کف ۳:۱ برای گرافیکِ
 * معنادار):
 *   · غیرفعال — بدنهٔ روشن روی `--nav-bg`. کم‌رنگ‌ترینشان ۴٫۹ می‌دهد.
 *   · فعال — بدنهٔ تیره روی قرصِ `--paper`. نعنایی سیر ۳٫۳۶ می‌دهد.
 * `contrast.test.ts` هر دو ستون را می‌سنجد.
 */

/** فهرست بسته. شکلی که اینجا نیست، در نوار پایین نمی‌نشیند. */
export type NavShape =
  | 'home'
  | 'door'
  | 'clipboard'
  | 'bubble'
  | 'wallet'
  | 'people'
  | 'calendar'
  | 'grid'
  | 'pen'

type Props = {
  shape: NavShape
  size?: number
  /** بدنهٔ آیکون. */
  fill: string
  /** رنگِ پس‌زمینه‌ای که جزئیات با آن بریده می‌شود. */
  cut: string
}

export function NavIcon({ shape, size = 22, fill, cut }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      {body(shape, fill, cut)}
    </svg>
  )
}

function body(shape: NavShape, fill: string, cut: string) {
  switch (shape) {
    case 'home':
      return (
        <>
          <path
            d="M11.1 2.6 3.2 9.3A2 2 0 0 0 2.5 10.8V19.4A2.1 2.1 0 0 0 4.6 21.5h14.8a2.1 2.1 0 0 0 2.1-2.1v-8.6a2 2 0 0 0-.7-1.5l-7.9-6.7a1.4 1.4 0 0 0-1.8 0Z"
            fill={fill}
          />
          <path d="M9.4 21.5v-5.1a2.6 2.6 0 0 1 5.2 0v5.1z" fill={cut} />
        </>
      )

    /*
     * ورود و خروج — دَر با فلش، نه خانه.
     *
     * تا اینجا این تب همان آیکونِ «خانه» را داشت، یعنی همان چیزی که در
     * دو پنل دیگر مقصدِ دیگری است. کارِ این صفحه ثبت ورود و خروج است و
     * آیکونش باید همان را بگوید.
     *
     * فلش از راست به دَر می‌رود، یعنی جهتِ خواندنِ فارسی. جهت‌دار است و
     * در چیدمانِ چپ‌به‌راست باید قرینه شود؛ این اپ فقط راست‌به‌چپ است.
     */
    case 'door':
      return (
        <>
          <path
            d="M4 4.6A2.1 2.1 0 0 1 6.1 2.5h5.3a2.1 2.1 0 0 1 2.1 2.1v14.8a2.1 2.1 0 0 1-2.1 2.1H6.1A2.1 2.1 0 0 1 4 19.4z"
            fill={fill}
          />
          <circle cx="6.6" cy="12" r="1.2" fill={cut} />
          <path d="M21 12h-5.4" stroke={fill} strokeWidth="2.3" strokeLinecap="round" fill="none" />
          <path
            d="M18.6 8.6 15.2 12l3.4 3.4"
            stroke={fill}
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </>
      )

    case 'clipboard':
      return (
        <>
          <path
            d="M4.4 5.9A2.2 2.2 0 0 1 6.6 3.7h10.8a2.2 2.2 0 0 1 2.2 2.2v13.4a2.2 2.2 0 0 1-2.2 2.2H6.6a2.2 2.2 0 0 1-2.2-2.2z"
            fill={fill}
          />
          <rect x="8.6" y="1.7" width="6.8" height="4.1" rx="2" fill={fill} />
          <path
            d="M8.2 13.2 10.9 15.9 15.9 10.2"
            stroke={cut}
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </>
      )

    case 'bubble':
      return (
        <>
          <path
            d="M2.8 6.6A3.1 3.1 0 0 1 5.9 3.5h12.2a3.1 3.1 0 0 1 3.1 3.1v7.8a3.1 3.1 0 0 1-3.1 3.1H9.4l-4.8 3.9a.8.8 0 0 1-1.3-.6z"
            fill={fill}
          />
          <g fill={cut}>
            <circle cx="8.4" cy="10.5" r="1.35" />
            <circle cx="12" cy="10.5" r="1.35" />
            <circle cx="15.6" cy="10.5" r="1.35" />
          </g>
        </>
      )

    case 'wallet':
      return (
        <>
          <path
            d="M2.6 8.4A3.2 3.2 0 0 1 5.8 5.2h12.4a3.2 3.2 0 0 1 3.2 3.2v8.4a3.2 3.2 0 0 1-3.2 3.2H5.8a3.2 3.2 0 0 1-3.2-3.2z"
            fill={fill}
          />
          <path d="M2.6 9.9h18.8" stroke={cut} strokeWidth="1.5" fill="none" />
          <path d="M13.5 12.8a2.5 2.5 0 0 1 2.5-2.5h5.4v5H16a2.5 2.5 0 0 1-2.5-2.5z" fill={cut} />
          <circle cx="16.9" cy="12.8" r="1.2" fill={fill} />
        </>
      )

    /*
     * دو نفر، و نفرِ جلو با خطِ بریده از نفرِ پشت جدا می‌شود. بدون آن
     * خط، دو شکلِ هم‌رنگ یک لکه می‌شوند.
     */
    case 'people':
      return (
        <>
          <circle cx="17" cy="8.9" r="2.7" fill={fill} opacity="0.72" />
          <path
            d="M12.8 20.4a4.6 4.6 0 0 1 9.2 0 1 1 0 0 1-1 1h-7.2a1 1 0 0 1-1-1z"
            fill={fill}
            opacity="0.72"
          />
          <circle cx="8.8" cy="8.2" r="3.7" fill={fill} stroke={cut} strokeWidth="1.5" />
          <path
            d="M2.2 20.3a6.6 6.6 0 0 1 13.2 0 1.1 1.1 0 0 1-1.1 1.1H3.3a1.1 1.1 0 0 1-1.1-1.1z"
            fill={fill}
            stroke={cut}
            strokeWidth="1.5"
          />
        </>
      )

    case 'calendar':
      return (
        <>
          <path
            d="M3.2 7.1A2.6 2.6 0 0 1 5.8 4.5h12.4a2.6 2.6 0 0 1 2.6 2.6v11.8a2.6 2.6 0 0 1-2.6 2.6H5.8a2.6 2.6 0 0 1-2.6-2.6z"
            fill={fill}
          />
          <path
            d="M8 2.2v4.2M16 2.2v4.2"
            stroke={fill}
            strokeWidth="2.3"
            strokeLinecap="round"
            fill="none"
          />
          <path d="M3.2 10.2h17.6" stroke={cut} strokeWidth="1.6" fill="none" />
          <rect x="13.6" y="13.2" width="4.6" height="4.4" rx="1.3" fill={cut} />
        </>
      )

    case 'grid':
      return (
        <g fill={fill}>
          <rect x="3" y="3" width="7.6" height="7.6" rx="2.5" />
          <rect x="13.4" y="3" width="7.6" height="7.6" rx="2.5" />
          <rect x="3" y="13.4" width="7.6" height="7.6" rx="2.5" />
          <rect x="13.4" y="13.4" width="7.6" height="7.6" rx="2.5" />
        </g>
      )

    case 'pen':
      return (
        <>
          <path d="M4 20.2h3.8L20.1 7.9a2.3 2.3 0 0 0-3.3-3.3L4 16.9z" fill={fill} />
          <path
            d="M15.4 6 18.7 9.3"
            stroke={cut}
            strokeWidth="1.7"
            strokeLinecap="round"
            fill="none"
          />
        </>
      )
  }
}
