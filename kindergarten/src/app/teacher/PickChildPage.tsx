import { useEffect, useState } from 'react'
import { EmptyState } from '../../design-system/index.ts'
import { toIsoDate } from '../../i18n/index.ts'
import { useData } from '../../core/auth/index.ts'
import styles from './PickChildPage.module.css'

/**
 * انتخاب کودک برای مشاهده و گزارش ماهانه.
 *
 * پیش‌تر این فهرست داخل صفحه «بیشتر» بود، لای مدارک و بازخورد مدیر.
 * با جدا شدن «منو» از پرونده شخصی، جای خودش را گرفت.
 *
 * عمداً روی شبکه کودکانِ «امروز» ننشست: آنجا ضربه یعنی ثبت ورود یا
 * خروج، و آن مسیر باید سریع‌ترین چیز پنل بماند.
 */
export function PickChildPage({ classId, onBack, onOpen }: {
  classId: string | null
  onBack: () => void
  onOpen: (childId: string, childName: string) => void
}) {
  const data = useData()
  const [children, setChildren] = useState<{ id: string; name: string }[] | null>(null)

  useEffect(() => {
    if (!classId) {
      setChildren([])
      return
    }
    data
      .getClassDay(classId, toIsoDate(new Date()))
      .then((day) =>
        setChildren(day.children.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}` }))),
      )
      .catch(() => setChildren([]))
  }, [data, classId])

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="بازگشت به منو">
          ‹
        </button>
        <span className={`${styles.title} t-h2`}>مشاهده و گزارش ماهانه</span>
      </header>

      <div className={styles.body}>
        {children === null ? (
          <EmptyState text="در حال خواندن…" />
        ) : children.length === 0 ? (
          <EmptyState text="کودکی در کلاس امروز نیست." />
        ) : (
          <ul className={styles.list}>
            {children.map((child) => (
              <li key={child.id}>
                <button
                  type="button"
                  className={`${styles.item} t-body`}
                  onClick={() => onOpen(child.id, child.name)}
                >
                  {child.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
