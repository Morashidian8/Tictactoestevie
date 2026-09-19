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
 * عمداً روی شبکه کودکانِ «ورود خروج» ننشست: آنجا ضربه یعنی ثبت ورود یا
 * خروج، و آن مسیر باید سریع‌ترین چیز پنل بماند.
 *
 * ── چرا کل کلاس، نه کودکانِ همین لحظه ──────────────────────────
 *
 * نسخه اول فقط `getClassDay().children` را می‌گرفت، یعنی کودکانی که
 * همین دقیقه در جلسه‌اند. مربی که عصر بعد از رفتن بچه‌ها می‌نشیند
 * مشاهده‌هایش را بنویسد — یعنی همان وقتی که واقعاً وقت نوشتن دارد —
 * فهرست خالی می‌دید: «کودکی در کلاس امروز نیست»، و هیچ راهی جلوتر.
 *
 * مشاهده درباره کودک است، نه درباره اینکه این ساعت کجاست. پس کل
 * فهرست کلاس می‌آید: کودکانِ در جلسه به‌علاوه آن‌هایی که بازه‌شان الان
 * نیست (`listOffDayChildren` دقیقاً همین دومی است، در هر دو لایه داده).
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
    const date = toIsoDate(new Date())
    let cancelled = false
    Promise.all([data.getClassDay(classId, date), data.listOffDayChildren(classId, date)])
      .then(([day, rest]) => {
        if (cancelled) return
        const seen = new Set<string>()
        const list: { id: string; name: string }[] = []
        for (const child of [...day.children, ...rest]) {
          if (seen.has(child.id)) continue
          seen.add(child.id)
          list.push({ id: child.id, name: `${child.firstName} ${child.lastName}` })
        }
        list.sort((a, b) => a.name.localeCompare(b.name, 'fa'))
        setChildren(list)
      })
      .catch(() => {
        if (!cancelled) setChildren([])
      })
    return () => {
      cancelled = true
    }
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
          <EmptyState text="کودکی در این کلاس ثبت‌نام نشده." />
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
