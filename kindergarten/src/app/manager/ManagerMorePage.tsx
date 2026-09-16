import { EmptyState } from '../../design-system/index.ts'
import { formatCount } from '../../i18n/index.ts'
import type { ManagerPage } from './ManagerApp.tsx'
import styles from './ManagerMorePage.module.css'

/**
 * «بیشتر» پنل مدیر.
 *
 * پنج خانه نوار برای کارهای روزانه‌اند؛ اینجا کارهایی می‌نشینند که مدیر
 * هفته‌ای یا ماهی یک‌بار سراغشان می‌رود — اطلاع‌رسانی، پرونده کارکنان،
 * و پرونده بازرسی.
 *
 * نشان عددی فقط وقتی می‌آید که کاری هست. نشانی که همیشه روشن باشد،
 * خوانده نمی‌شود.
 */
export function ManagerMorePage({ onGo, gaps }: {
  onGo: (page: ManagerPage) => void
  /** شمار کاستی‌های پرونده بازرسی. */
  gaps: number
}) {
  return (
    <div className={styles.page}>
      <ul className={styles.menu}>
        <Item
          label="اطلاع‌رسانی به خانواده‌ها"
          hint="تعطیلی، تأخیر بازگشایی، و خبر فوری"
          onClick={() => onGo('notice')}
        />
        <Item
          label="کارکنان"
          hint="پرونده مربیان، مدارک و کارتابل"
          onClick={() => onGo('staff')}
        />
        <Item
          label="پرونده بازرسی"
          hint="آنچه بازرس می‌خواهد، از پیش آماده"
          badge={gaps}
          onClick={() => onGo('audit')}
        />
      </ul>

      {/*
        آنچه اینجا نیست و عمدی است: هیچ گزینه‌ای برای حذف داده کودک.
        بند ۱۱ سرصفحه — حذف واقعی ممنوع است، و دکمه‌ای که بعداً «نمی‌شود»
        بگوید بدتر از نبودنش است.
      */}
      <p className={`${styles.hint} t-caption`}>
        برای خروج از حساب، کلید حساب کاربری در بالای صفحه.
      </p>
    </div>
  )
}

function Item({ label, hint, badge, onClick }: {
  label: string
  hint: string
  badge?: number
  onClick: () => void
}) {
  return (
    <li>
      <button type="button" className={styles.item} onClick={onClick}>
        <span className={styles.main}>
          <span className={`${styles.label} t-body`}>{label}</span>
          <span className={`${styles.hintLine} t-caption`}>{hint}</span>
        </span>
        {badge ? <span className={styles.badge}>{formatCount(badge)}</span> : null}
        <Chevron />
      </button>
    </li>
  )
}

function Chevron() {
  return (
    <svg className="mirror" width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

/** حالت خالی مشترک، برای صفحه‌هایی که هنوز داده‌ای ندارند. */
export const NothingYet = EmptyState
