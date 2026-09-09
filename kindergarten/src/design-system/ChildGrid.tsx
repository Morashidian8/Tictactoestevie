import { useRef } from 'react'
import { ChildAvatar, type AttendanceState, type AvatarSize } from './ChildAvatar.tsx'
import styles from './ChildGrid.module.css'

export type ChildGridItem = {
  id: string
  firstName: string
  photoUrl?: string | null
  state: AttendanceState
  caption?: string
  /** برچسب کنش برای صفحه‌خوان، مثل «ثبت ورود سارا». */
  actionLabel: string
}

type Props = {
  items: ChildGridItem[]
  avatarSize?: AvatarSize
  /** ضربه کوتاه. در صفحه «امروز» یعنی ثبت سریع با پیش‌فرض‌ها. */
  onSelect: (id: string) => void
  /** نگه‌داشتن انگشت. شیت استثناها را باز می‌کند (بخش ۵.۳ اصلاح‌شده). */
  onHold?: (id: string) => void
}

const HOLD_MS = 450

export function ChildGrid({ items, avatarSize, onSelect, onHold }: Props) {
  return (
    <ul className={styles.grid}>
      {items.map((item) => (
        <li key={item.id}>
          <GridCell
            item={item}
            avatarSize={avatarSize}
            onSelect={onSelect}
            onHold={onHold}
          />
        </li>
      ))}
    </ul>
  )
}

function GridCell({
  item,
  avatarSize,
  onSelect,
  onHold,
}: {
  item: ChildGridItem
  avatarSize?: AvatarSize
  onSelect: (id: string) => void
  onHold?: (id: string) => void
}) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const held = useRef(false)

  const startHold = () => {
    if (!onHold) return
    held.current = false
    timer.current = setTimeout(() => {
      held.current = true
      onHold(item.id)
    }, HOLD_MS)
  }

  const cancelHold = () => clearTimeout(timer.current)

  const handleClick = () => {
    // نگه‌داشتن انگشت شیت را باز کرده؛ رها کردن نباید ثبت سریع هم بزند.
    if (held.current) {
      held.current = false
      return
    }
    onSelect(item.id)
  }

  return (
    <button
      type="button"
      className={styles.cell}
      onClick={handleClick}
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      onContextMenu={(event) => {
        // نگه‌داشتن انگشت در موبایل منوی متن مرورگر را باز می‌کند.
        if (onHold) event.preventDefault()
      }}
      aria-label={item.actionLabel}
    >
      <ChildAvatar
        id={item.id}
        firstName={item.firstName}
        photoUrl={item.photoUrl}
        state={item.state}
        size={avatarSize}
        caption={item.caption}
      />
    </button>
  )
}
