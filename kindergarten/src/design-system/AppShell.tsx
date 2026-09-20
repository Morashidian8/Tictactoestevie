import type { ReactNode } from 'react'
import { useState } from 'react'
import { AccountIcon } from './icons.tsx'
import { Mascot, type MascotKind } from './Mascot.tsx'
import type { ShellTone } from './tone.ts'
import { Meadow, PaperMarks, SkyScene, SkyWave } from './SkyScene.tsx'
import { TabBar, type TabItem } from './TabBar.tsx'
import styles from './AppShell.module.css'

export type { ShellTone } from './tone.ts'

const MASCOT: Record<ShellTone, MascotKind> = {
  teacher: 'sun',
  parent: 'heart',
  manager: 'star',
}

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
  tone = 'teacher',
  centreName,
  brandLogoUrl,
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
  /** لحن نقش: رنگ آسمان و شکل شخصیت. */
  tone?: ShellTone
  /**
   * نام مهد — بالای سلام، در همهٔ صفحه‌های خانه.
   *
   * وقتی یک نصب چهل مهد را می‌گرداند، خانواده‌ای که اپ را باز می‌کند
   * باید مهدِ **خودش** را ببیند. کوچک نوشته می‌شود چون کارِ امروز
   * مهم‌تر از نامِ مهد است؛ ولی هست.
   */
  centreName?: string
  /**
   * نشان مهد، جای شخصیتِ پوسته.
   *
   * تهی یعنی این مهد هنوز نشانی نگذاشته و خورشید/قلب/ستاره سر جایش
   * می‌ماند. رنگِ آسمان از این راه عوض نمی‌شود — آن رنگ می‌گوید در
   * کدام حساب هستی، نه در کدام مهد.
   */
  brandLogoUrl?: string | null
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
    <div className={`${styles.shell} ${styles[`wash${cap(tone)}`]}`}>
      {/*
        بوم، پیش از محتوا.

        هر دو `z-index: -1` دارند و `.shell` با `isolation: isolate` آن را
        به همین لایه محدود می‌کند — پس شیت پایین‌رونده با z-index ۴۰ و
        نوار با ۱۰ همچنان بالای این‌ها و نسبت به هم درست می‌مانند.
      */}
      <PaperMarks />
      <Meadow />

      <div className={styles.body}>
        {/*
          آسمانِ سرصفحه.

          سرصفحه و ردیف کنترل‌ها هر دو **داخل** گرادیان‌اند و موج پایینشان
          به بوم می‌رسد. پیش‌تر سرصفحه سفید بود روی بومِ تقریباً سفید،
          یعنی هیچ‌چیز صفحه را از یک فرم اداری جدا نمی‌کرد.
        */}
        {greeting ? (
          <div className={`${styles.sky} ${styles[tone]}`}>
            <SkyScene tone={tone} />

            <header className={styles.header}>
              <span className={styles.brand} aria-hidden>
                {brandLogoUrl ? (
                  /*
                   * نشان روی زمینهٔ سفید می‌نشیند، نه مستقیم روی آسمان.
                   *
                   * لوگوی مهدها هر رنگی دارند و بعضی‌شان روی سبز یا
                   * بنفشِ سرصفحه گم می‌شوند. قابِ سفید کاری می‌کند هر
                   * نشانی، در هر سه پنل، دیده شود — بخش ۱۲.۲.
                   */
                  <img className={styles.logo} src={brandLogoUrl} alt="" />
                ) : (
                  <Mascot kind={MASCOT[tone]} size={44} />
                )}
              </span>

              <div className={styles.greet}>
                {centreName ? (
                  <p className={`${styles.centre} t-caption`}>{centreName}</p>
                ) : null}
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

            {toolbar ? <div className={styles.toolbar}>{toolbar}</div> : null}

            <SkyWave />
          </div>
        ) : null}

        {children}
      </div>

      <TabBar items={nav} center={center} active={active} onSelect={onSelect} />
    </div>
  )
}

/** `teacher` → `Teacher`، برای ساختن نام کلاسِ ماژول CSS. */
function cap(tone: ShellTone): 'Teacher' | 'Parent' | 'Manager' {
  return (tone[0]!.toUpperCase() + tone.slice(1)) as 'Teacher' | 'Parent' | 'Manager'
}
