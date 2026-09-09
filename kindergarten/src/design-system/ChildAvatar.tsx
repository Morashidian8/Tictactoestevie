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
  firstName: string
  photoUrl?: string | null
  state: AttendanceState
  size?: AvatarSize
  /** خط زیر نام. در صفحه «امروز» ساعت ورود است. */
  caption?: string
}

export function ChildAvatar({
  firstName,
  photoUrl,
  state,
  size = 'md',
  caption,
}: Props) {
  return (
    <span className={styles.root}>
      <span className={`${styles.frame} ${styles[size]} ${styles[state]}`}>
        {photoUrl ? (
          <img className={styles.photo} src={photoUrl} alt="" />
        ) : (
          <span className={styles.initial} aria-hidden>
            {firstName.slice(0, 1)}
          </span>
        )}
        <StateBadge state={state} />
      </span>

      <span className={`${styles.name} t-body-lg`}>{firstName}</span>
      <span className={`${styles.caption} t-caption tabular`}>
        {caption ?? STATE_LABEL[state]}
      </span>
      <span className="sr-only">{STATE_LABEL_FULL[state]}</span>
    </span>
  )
}

function StateBadge({ state }: { state: AttendanceState }) {
  if (state === 'present' || state === 'notArrived') return null

  if (state === 'unaccounted') {
    return <span className={`${styles.badge} ${styles.badgeDot}`} aria-hidden />
  }

  return (
    <span className={styles.badge} aria-hidden>
      {state === 'left' ? <CheckIcon size={12} /> : <CrossIcon size={12} />}
    </span>
  )
}
