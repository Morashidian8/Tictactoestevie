import { AvatarFace } from './AvatarFace.tsx'
import { CheckIcon, CrossIcon } from './icons.tsx'
import styles from './ChildAvatar.module.css'

/**
 * وضعیت حضور کودک در یک روز.
 *
 * `unaccounted` حالت داده‌ای جدایی نیست؛ همان `notArrived` است پس از ساعت
 * ۹:۰۰ (بخش ۵.۳ سند). تفکیکش اینجا انجام می‌شود چون فقط بر نمایش اثر دارد.
 */
export type AttendanceState =
  | 'notArrived'
  | 'absenceDeclared'
  | 'present'
  | 'left'
  | 'unaccounted'

export type AvatarSize = 'sm' | 'md' | 'lg'

/**
 * متن وضعیت. رنگ تنها حامل معنا نیست، پس هر حالت متن هم دارد.
 *
 * دو نسخه لازم است. زیر آواتار جا برای یک کلمه است و دو خط شدن، سطرهای
 * شبکه را ناهم‌تراز می‌کند؛ مربی باید شبکه را در یک نگاه بخواند. عبارت
 * کامل به صفحه‌خوان می‌رود و در نوار خلاصه بالای صفحه هم دیده می‌شود.
 */
const STATE_LABEL: Record<AttendanceState, string> = {
  notArrived: 'نیامده',
  absenceDeclared: 'غایب',
  present: 'حاضر',
  left: 'رفته',
  unaccounted: 'بی‌خبر',
}

const STATE_LABEL_FULL: Record<AttendanceState, string> = {
  ...STATE_LABEL,
  absenceDeclared: 'غیبت اعلام‌شده',
}

type Props = {
  /** شناسه کودک. چهره جایگزین عکس از همین ساخته می‌شود. */
  id: string
  firstName: string
  photoUrl?: string | null
  state: AttendanceState
  size?: AvatarSize
  /** خط زیر نام. در صفحه «امروز» ساعت ورود است. */
  caption?: string
  /** نشان استثنا — تصمیم ۰۴ سند بررسی طراحی. */
  flagged?: boolean
  flagLabel?: string
  /**
   * شکل قاب.
   *
   * `circle` شکل تاریخی شبکه چهارستونه است. `rounded` مربعِ گوشه‌نرم
   * بازطراحی کارت‌محور: در یک کارت افقی، عکس مربع لبه‌اش را با لبه کارت
   * هم‌راستا می‌کند و دایره نمی‌کند.
   */
  shape?: 'circle' | 'rounded'
  /**
   * `frame` فقط قاب را می‌دهد: عکس، نشان حالت، نقطه استثنا.
   *
   * کارت، نام و ساعت را خودش کنار قاب می‌چیند نه زیرش، پس نمی‌تواند از
   * چیدمان ستونی این کامپوننت استفاده کند. جدا کردنش بهتر از دو نسخه
   * موازی از منطق نشان‌هاست.
   */
  layout?: 'stack' | 'frame'
}

export function ChildAvatar({
  id,
  firstName,
  photoUrl,
  state,
  size = 'md',
  caption,
  flagged = false,
  flagLabel,
  shape = 'circle',
  layout = 'stack',
}: Props) {
  const frame = (
    <span
      className={`${styles.frame} ${styles[size]} ${styles[state]} ${
        shape === 'rounded' ? styles.rounded : ''
      }`}
    >
        {photoUrl ? (
          <img className={styles.photo} src={photoUrl} alt="" />
        ) : (
          <AvatarFace seed={id} />
        )}
        <StateBadge state={state} />
        {/*
          نقطه انبه‌ای گوشه دور از شروع، با حلقه سطح تا روی هر عکسی دیده
          شود. حالت حضور گوشه مقابل می‌نشیند، پس دو نشان با هم جا دارند.
        */}
        {flagged ? <span className={styles.flag} aria-hidden /> : null}
    </span>
  )

  if (layout === 'frame') return frame

  return (
    <span className={styles.root}>
      {frame}

      <span className={`${styles.name} t-body-lg`}>{firstName}</span>
      <span className={`${styles.caption} t-caption tabular`}>
        {caption ?? STATE_LABEL[state]}
      </span>
      <span className="sr-only">
        {STATE_LABEL_FULL[state]}
        {flagged && flagLabel ? `، ${flagLabel}` : ''}
      </span>
    </span>
  )
}

/**
 * نشان حالت روی گوشه عکس.
 *
 * در شبکه چهارستونه پیشین، حاضر و نیامده نشان نداشتند و حلقه دور آواتار
 * کار تفکیک را می‌کرد. روی کارت، حلقه زیر سایه و مرز گم می‌شود، پس هر
 * پنج حالت نشان خودشان را می‌گیرند:
 *
 *   حاضر      تیک روی پرکننده نعنایی — بلندترین نشانه شبکه
 *   رفته      همان تیک، ولی روی سطح؛ کارت هم کم‌رنگ‌تر است
 *   نیامده    دایره توخالی. چیزی نیفتاده، پس چیزی هم نباید جیغ بزند
 *   غایب      ضربدر
 *   بی‌خبر    نقطه آجری
 *
 * گلیف همیشه --ink است، حتی روی نعنایی: نسبتش ۷٫۰۴ است.
 */
function StateBadge({ state }: { state: AttendanceState }) {
  if (state === 'present') {
    return (
      <span className={`${styles.badge} ${styles.badgePresent}`} aria-hidden>
        <CheckIcon size={12} />
      </span>
    )
  }

  if (state === 'notArrived') {
    return <span className={`${styles.badge} ${styles.badgeHollow}`} aria-hidden />
  }

  if (state === 'unaccounted') {
    return <span className={`${styles.badge} ${styles.badgeDot}`} aria-hidden />
  }

  return (
    <span className={styles.badge} aria-hidden>
      {state === 'left' ? <CheckIcon size={12} /> : <CrossIcon size={12} />}
    </span>
  )
}
