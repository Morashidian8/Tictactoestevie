import { NavIcon, type NavShape } from './NavIcons.tsx'
import styles from './TabBar.module.css'

/**
 * نوار ناوبری پایین با کنش مرکزی.
 *
 * دکمه وسط، کنش اصلی است و از بقیه بزرگ‌تر و رنگی‌تر: در پنل والد و
 * مدیر «پیام‌ها»، و در پنل مربی «ثبت گروهی».
 *
 * چرا پنج‌تا و نه بیشتر: در عرض ۳۲۰ پیکسل، شش خانه یعنی هدف لمسی زیر
 * ۴۸ پیکسل — کف پنل والد در بخش ۱۲.۷.
 *
 * ── دو چیزی که مالک محصول گرفت و اصلاح شد ───────────────────────
 *
 * **هر آیکون شکل و رنگ خودش.** پیش‌تر همه خطی و هم‌رنگ بودند و «مالی»
 * از «کودکان» فقط با برچسبش فرق می‌کرد. حالا کیف پول کیف پول است.
 * رنگ اینجا هویت است نه معنا: برچسبِ متنی سر جایش ماند و هیچ اطلاعاتی
 * فقط با رنگ گفته نمی‌شود (بخش ۱۲.۲).
 *
 * **خانه فعال هم‌تراز بقیه.** نسخه‌ای که خانه فعال را بالا می‌برد، دو
 * چیز را از خطِ نوار بیرون می‌زد — کنشِ مرکزی و خانه فعال — و نوار کج
 * دیده می‌شد. حالا فقط کنشِ مرکزی بالا می‌آید، چون کنش است نه مقصد.
 */

/** رنگِ خانه. فهرست بسته است و از توکن‌های `--nav-*` می‌آید. */
export type NavTone = 'mint' | 'sky' | 'bubble' | 'mango' | 'grape' | 'neutral'

export type TabItem = {
  id: string
  label: string
  shape: NavShape
  tone: NavTone
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
        {/*
          گلیفِ کنشِ مرکزی روی گرادیانِ انبه‌ای --ink است، نه سفید:
          سفید روی #F5B733 نسبت ۲٫۱ می‌دهد و در هیچ اندازه‌ای مجاز نیست.
        */}
        <NavIcon shape={center.shape} size={26} fill="var(--ink)" cut="var(--nav-mango)" />
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
  /*
   * دو ستونِ رنگ، و کدام‌یک می‌آید به حالت بستگی دارد:
   *   غیرفعال — بدنهٔ روشن روی نوارِ سبزِ تیره.
   *   فعال — بدنهٔ سیر روی قرصِ کرم.
   * جزئیاتِ داخلِ آیکون همیشه رنگِ چیزی است که آیکون رویش نشسته.
   */
  const fill = active ? `var(--nav-${item.tone}-deep)` : `var(--nav-${item.tone})`
  const cut = active ? 'var(--paper)' : 'var(--nav-bg)'

  return (
    <button
      type="button"
      className={`${styles.tab} ${active ? styles.tabActive : ''}`}
      onClick={() => onSelect(item.id)}
      aria-current={active ? 'page' : undefined}
    >
      <span className={styles.icon}>
        <NavIcon shape={item.shape} fill={fill} cut={cut} />
        {item.badge ? <span className={styles.dot} aria-hidden /> : null}
      </span>
      <span className={`${styles.label} t-caption`}>{item.label}</span>
    </button>
  )
}
