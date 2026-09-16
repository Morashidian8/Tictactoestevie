import { useEffect, useState } from 'react'
import { EmptyState } from '../../design-system/index.ts'
import { ROLE_LABEL, useAuth, useData } from '../../core/auth/index.ts'
import type { ClassRoom } from '../../core/data/index.ts'
import styles from './TeacherMorePage.module.css'

/**
 * «بیشتر» پنل مربی — پروفایل خودش.
 *
 * چرا این صفحه وجود دارد: نوار پایین هر سه پنل حالا پنج خانه دارد و
 * خانه چهارم در پنل والد «بیشتر» است. خالی گذاشتنش در پنل مربی یعنی
 * دکمه‌ای که کار نمی‌کند — و دکمه مرده بدتر از نبودن دکمه است.
 *
 * آنچه اینجا **نیست** و عمدی است: هیچ عددی درباره عملکرد خود مربی.
 * شمار رویداد و گزارش، معیار ارزیابی نیست؛ اگر مربی ببیند رویداد ثبت
 * کردن به ضررش تمام می‌شود، کمتر ثبت می‌کند و آسیب به کودک می‌رسد.
 */
export function TeacherMorePage() {
  const data = useData()
  const { session } = useAuth()
  const [classes, setClasses] = useState<ClassRoom[] | null>(null)

  useEffect(() => {
    data.listClasses().then(setClasses).catch(() => setClasses([]))
  }, [data])

  const me = session?.active
  if (!me) return <EmptyState text="در حال خواندن…" />

  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <span className={`${styles.label} t-caption`}>حساب من</span>
        <p className={`${styles.name} t-h2`}>{me.displayName}</p>
        <p className={`${styles.muted} t-body`}>{ROLE_LABEL[me.role]}</p>
      </section>

      <section className={styles.card}>
        <span className={`${styles.label} t-caption`}>کلاس‌های من</span>
        {classes === null ? (
          <p className={`${styles.muted} t-body`}>در حال خواندن…</p>
        ) : classes.length === 0 ? (
          <p className={`${styles.muted} t-body`}>هنوز کلاسی به شما داده نشده.</p>
        ) : (
          classes.map((klass) => (
            <p key={klass.id} className={`${styles.row} t-body`}>
              {klass.name}
            </p>
          ))
        )}
      </section>

      {/*
        مدارک مربی هنوز رابط ندارد و اینجا وعده‌اش داده نمی‌شود.
        جدول staff_document ساخته شده ولی تا صفحه‌اش نیاید، نوشتن
        «مدارک من» یعنی دکمه‌ای که کاری نمی‌کند.
      */}
      <p className={`${styles.muted} t-caption`}>
        برای خروج از حساب، کلید حساب کاربری در بالای صفحه.
      </p>
    </div>
  )
}
