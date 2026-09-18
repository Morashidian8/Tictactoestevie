import type { ReactNode } from 'react'
import styles from './MenuGrid.module.css'

/**
 * فهرست کامل قابلیت‌های یک پنل — «منو».
 *
 * چرا ساخته شد: نامش «بیشتر» بود و فقط سه چیزی که جایی در نوار پایین
 * نداشتند در آن می‌نشست. یعنی کاربر برای رسیدن به هر قابلیتی باید
 * می‌دانست آن یکی در نوار است و آن یکی در فهرست — و برای چیزهایی مثل
 * «پرونده کودک» که هیچ‌کدام نبود، باید در صفحه‌ها می‌گشت.
 *
 * حالا **همه‌چیز** اینجاست، از جمله مقصدهایی که در نوار پایین هم خانه
 * دارند. دو راه به یک صفحه، ایراد نیست وقتی یکی از آن دو «فهرستِ همه
 * کارها» باشد: کاربری که نمی‌داند دنبال چه می‌گردد، جایی لازم دارد که
 * همه‌چیز را یک‌جا ببیند.
 *
 * چیدمان کاشی است نه سطر: در دو ستون، دوازده قابلیت در یک پرده جا
 * می‌شود؛ با سطرهای تمام‌عرض، همان دوازده‌تا دو پرده می‌شد.
 */
export type MenuTile = {
  id: string
  label: string
  /** یک خط، چه کاری آنجا انجام می‌شود. بی این، نام تنها کافی نیست. */
  hint?: string
  icon: ReactNode
  /** لحن لکهٔ پشت گلیف. فقط دسته‌بندی بصری است، نه معنا. */
  tone?: 'mint' | 'mango' | 'sky' | 'grape' | 'coral' | 'bubble'
  /** شمار کارِ منتظر. صفر یعنی نشانی نیست. */
  badge?: number
}

export type MenuSection = {
  title: string
  items: MenuTile[]
}

export function MenuGrid({
  sections,
  onSelect,
}: {
  sections: MenuSection[]
  onSelect: (id: string) => void
}) {
  return (
    <div className={styles.page}>
      {sections.map((section) => (
        <section key={section.title} className={styles.section} aria-label={section.title}>
          <h2 className={`${styles.title} t-caption`}>{section.title}</h2>
          <ul className={styles.grid}>
            {section.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={styles.tile}
                  onClick={() => onSelect(item.id)}
                >
                  <span className={`${styles.blob} ${styles[item.tone ?? 'mint']}`} aria-hidden>
                    {item.icon}
                  </span>
                  <span className={`${styles.label} t-body`}>{item.label}</span>
                  {item.hint ? (
                    <span className={`${styles.hint} t-caption`}>{item.hint}</span>
                  ) : null}
                  {/*
                    نشان عددی با کلمه همراه است، نه تنها یک نقطه رنگی:
                    بخش ۱۲.۲ — رنگ هرگز تنها حامل معنا نیست.
                  */}
                  {item.badge ? (
                    <span className={`${styles.badge} t-caption`}>
                      {item.badge.toLocaleString('fa-IR')} کار
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
