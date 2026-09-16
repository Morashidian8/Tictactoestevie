import type { ReactNode } from 'react'
import { useState } from 'react'
import { AccountIcon, LeafIcon } from './icons.tsx'
import { TabBar, type TabItem } from './TabBar.tsx'
import styles from './AppShell.module.css'

/**
 * پوسته مشترک هر سه پنل — سرصفحه سلام، بدنه، نوار پایین.
 *
 * چرا یکی است و سه‌تا نیست: مربی و مدیر گاهی یک نفرند و با یک شماره وارد
 * می‌شوند. سه ساختار متفاوت یعنی همان آدم باید سه‌بار یاد بگیرد کجا را
 * بزند. آنچه بین نقش‌ها عوض می‌شود نام و نشان خانه‌هاست، نه جای آن‌ها.
 *
 * چیزی که این پوسته **نمی‌سازد**: صفحه‌های تمام‌صفحهِ کارِ متمرکز، مثل
 * «ثبت گروهی» مربی یا شیت پرداخت. آن‌ها عمداً نوار ندارند — وسط کار،
 * نواری که به جای دیگری می‌برد فقط راهِ گم شدن است.
 */
export function AppShell({
  greeting,
  subtitle,
  roleLabel,
  onSignOut,
  menuExtra,
  hasAlert,
  toolbar,
  nav,
  center,
  active,
  onSelect,
  children,
}: {
  /**
   * سرصفحه سلام. نبودنش یعنی مقصد، سرصفحه خودش را دارد.
   *
   * مقصدهایی مثل صندوق پیام یا پرونده بازرسی عنوان و کلید بازگشت خودشان
   * را می‌آورند؛ گذاشتن سرصفحه سلام روی آن‌ها یعنی دو سرصفحه روی هم.
   */
  greeting?: string
  subtitle?: string
  /** نقش حساب فعال، در منوی حساب. */
  roleLabel?: string
  onSignOut?: () => void
  /** گزینه‌های افزوده منوی حساب — هر نقش چیز خودش را دارد. */
  menuExtra?: ReactNode
  /** نشان روی کلید حساب: «چیزی هست»، نه چندتا. */
  hasAlert?: boolean
  /**
   * ردیف کنترل‌های ویژه نقش، زیر سرصفحه.
   *
   * مربی وسط شیفت باید بداند کدام کلاس و همگام‌سازی چه وضعی دارد؛ مدیر
   * باید دوره مالی را ببیند. این‌ها را در سرصفحه مشترک نمی‌شود گنجاند
   * ولی جایشان هم نباید در هر نقش جای دیگری باشد.
   */
  toolbar?: ReactNode
  nav: TabItem[]
  center: TabItem
  active: string
  onSelect: (id: string) => void
  children: ReactNode
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className={styles.shell}>
      <div className={styles.body}>
        {greeting ? (
        <header className={styles.header}>
          <span className={styles.brand} aria-hidden>
            <LeafIcon size={22} />
          </span>

          <div className={styles.greet}>
            <p className={`${styles.hello} t-h2`}>{greeting}</p>
            <p className={`${styles.helloSub} t-body`}>{subtitle}</p>
          </div>

          <div className={styles.headerEnd}>
            <button
              type="button"
              className={styles.account}
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-label="حساب کاربری"
            >
              <AccountIcon size={24} />
              {hasAlert ? <span className={styles.accountDot} aria-hidden /> : null}
            </button>
            {menuOpen ? (
              <div className={styles.menu}>
                <p className={`${styles.menuRole} t-caption`}>{roleLabel ?? '—'}</p>
                {menuExtra}
                <button
                  type="button"
                  className={`${styles.menuItem} t-body`}
                  onClick={() => onSignOut?.()}
                >
                  خروج
                </button>
              </div>
            ) : null}
          </div>
        </header>
        ) : null}

        {greeting && toolbar ? <div className={styles.toolbar}>{toolbar}</div> : null}

        {children}
      </div>

      <TabBar items={nav} center={center} active={active} onSelect={onSelect} />
    </div>
  )
}
