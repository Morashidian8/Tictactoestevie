import type { ReactNode } from 'react'
import styles from './TabBar.module.css'

/**
 * نوار ناوبری پایین با کنش مرکزی — بازطراحی پنل والد.
 *
 * پنل والد تا اینجا یک صفحه بلند بود با دکمه «بیشتر» در انتها. یعنی
 * هر چیزی جز گزارش امروز، پشت یک اسکرول تا ته صفحه بود.
 *
 * دکمه گرد وسط، کنش اصلی است و از بقیه بزرگ‌تر و رنگی‌تر: در پنل والد
 * آن کنش «پیام به مربی» است، چون تنها کاری است که فوریت دارد.
 *
 * چرا پنج‌تا و نه بیشتر: در عرض ۳۲۰ پیکسل، شش خانه یعنی هدف لمسی زیر
 * ۴۸ پیکسل — کف پنل والد در بخش ۱۲.۷.
 */
export type TabItem = {
  id: string
  label: string
  icon: ReactNode
  /** نشان عددی. صفر یعنی نشانی نیست. */
  badge?: number
}

type Props = {
  items: TabItem[]
  /** خانه‌ای که وسط می‌نشیند و کنش اصلی است. */
  center: TabItem
  active: string
  onSelect: (id: string) => void
}

export function TabBar({ items, center, active, onSelect }: Props) {
  // نیمه اول راست، نیمه دوم چپ. کنش مرکزی بینشان.
  const half = Math.ceil(items.length / 2)

  return (
    <nav className={styles.bar} aria-label="ناوبری اصلی">
      {items.slice(0, half).map((item) => (
        <Tab key={item.id} item={item} active={active === item.id} onSelect={onSelect} />
      ))}

      <button
        type="button"
        className={styles.center}
        onClick={() => onSelect(center.id)}
        aria-label={center.label}
        aria-current={active === center.id ? 'page' : undefined}
      >
        <span className={styles.centerIcon} aria-hidden>
          {center.icon}
        </span>
        {center.badge ? <span className={styles.centerDot} aria-hidden /> : null}
      </button>

      {items.slice(half).map((item) => (
        <Tab key={item.id} item={item} active={active === item.id} onSelect={onSelect} />
      ))}
    </nav>
  )
}

function Tab({
  item,
  active,
  onSelect,
}: {
  item: TabItem
  active: boolean
  onSelect: (id: string) => void
}) {
  return (
    <button
      type="button"
      className={`${styles.tab} ${active ? styles.tabActive : ''}`}
      onClick={() => onSelect(item.id)}
      aria-current={active ? 'page' : undefined}
    >
      <span className={styles.icon} aria-hidden>
        {item.icon}
        {item.badge ? <span className={styles.dot} aria-hidden /> : null}
      </span>
      <span className={`${styles.label} t-caption`}>{item.label}</span>
    </button>
  )
}
