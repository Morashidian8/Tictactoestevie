import { useEffect, useState } from 'react'
import { useAuth } from '../../core/auth/index.ts'
import type { AccountRole } from '../../core/data/index.ts'
import styles from './DemoRoleSwitch.module.css'

/**
 * جابه‌جایی سریع بین سه نقش — فقط در نسخه نمایشی.
 *
 * خواسته مالک محصول: «همش بخوام رمز بزنم و سوییچ کنم سخته». مسیر واقعی
 * سه مرحله دارد — خروج، شماره، کد — و برای کسی که دارد اپ را نشان
 * می‌دهد یعنی هر بار ده ثانیه.
 *
 * ── دو چیزی که این فایل تضمین می‌کند ───────────────────────────
 *
 * ۱. **در بیلد تولید وجود ندارد.** شماره‌ها با `import` پویا و پشت
 *    `IS_DEMO` می‌آیند، همان الگوی `DevNote` در صفحه ورود. تست
 *    `build.test.ts` نبودِ «۰۹۱۲۰۰۰۰۰۰۱» را در خروجی بیلد می‌سنجد و
 *    `import` ثابت همین‌جا آن را می‌شکست.
 *
 * ۲. **راهِ میان‌بُرِ احراز هویت نمی‌سازد.** همان `verifyCode` عمومی
 *    را با کدِ نمونه صدا می‌زند، نه چیزی زیرِ آن. در نسخه واقعی که
 *    آداپتور Supabase است، این کد هرگز جواب نمی‌دهد — و این کامپوننت
 *    اصلاً آنجا نیست.
 */
const IS_DEMO = import.meta.env.DEV || import.meta.env.VITE_DEMO === '1'

type Role = {
  role: AccountRole
  label: string
  phoneKey: 'teacher' | 'teacherAndManager' | 'guardian' | 'platform'
}

const ROLES: Role[] = [
  { role: 'teacher', label: 'مربی', phoneKey: 'teacher' },
  { role: 'manager', label: 'مدیر', phoneKey: 'teacherAndManager' },
  { role: 'guardian', label: 'خانواده', phoneKey: 'guardian' },
  { role: 'platform_admin', label: 'پشتیبانی', phoneKey: 'platform' },
]

export function DemoRoleSwitch() {
  const { session, requestCode, verifyCode, selectAccount } = useAuth()
  const [demo, setDemo] = useState<{ phones: Record<string, string>; code: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!IS_DEMO) return
    let cancelled = false
    void import('../../core/auth/localAuthAdapter.ts').then((mod) => {
      if (!cancelled) setDemo({ phones: mod.DEV_PHONES, code: mod.DEV_CODE })
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!IS_DEMO || !demo) return null

  const active = session?.active?.role ?? null

  const go = async (item: Role) => {
    const phone = demo.phones[item.phoneKey]
    if (!phone) return
    setBusy(item.role)
    try {
      await requestCode(phone)
      /*
       * حساب را با نقش برمی‌داریم، نه با شناسه.
       *
       * شماره «مربی و مدیر» دو حساب دارد و شناسه‌شان داده نمونه است؛
       * نوشتنش اینجا یعنی همان داده دوباره در کد برنامه.
       */
      const accounts = await verifyCode(phone, demo.code)
      const pick = accounts.find((a) => a.role === item.role) ?? accounts[0]
      if (pick) await selectAccount(pick.id)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={styles.box}>
      <p className={`${styles.title} t-caption`}>جابه‌جایی سریع (نمایشی)</p>
      <div className={styles.row}>
        {ROLES.map((item) => (
          <button
            key={item.role}
            type="button"
            className={`${styles.chip} ${active === item.role ? styles.chipOn : ''} t-caption`}
            disabled={busy !== null}
            aria-current={active === item.role ? 'true' : undefined}
            onClick={() => void go(item)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
