import { useEffect, useState } from 'react'
import './design-system/index.ts'
import { AuthProvider, createAuthAdapter, useAuth } from './core/auth/index.ts'
import type { AuthAdapter } from './core/auth/index.ts'
import { AccountPicker } from './app/auth/AccountPicker.tsx'
import { SignIn } from './app/auth/SignIn.tsx'
import { ManagerApp } from './app/manager/ManagerApp.tsx'
import { ParentTodayPage } from './app/parent/TodayPage.tsx'
import { TeacherApp } from './app/teacher/TeacherApp.tsx'

/**
 * پوسته اپ.
 *
 * پنل از روی نقش حساب فعال انتخاب می‌شود، نه از روی مسیر. بخش ۳.۲
 * می‌گوید دسترسی‌ها هرگز ترکیب نمی‌شوند، پس مسیر نباید بتواند کاربر را
 * به پنلی ببرد که نقشش اجازه‌اش را ندارد.
 *
 * پنل مربی، خانواده و مدیر ساخته شده. کمک‌مربی همان پنل مربی را
 * می‌بیند؛ پشتیبانی محصول صفحه‌ای ندارد.
 */
export function App() {
  /*
   * لایه احراز هویت با import پویا انتخاب می‌شود تا شاخه انتخاب‌نشده و
   * داده نمونه‌اش وارد بیلد نشود؛ پس ساختنش ناهمگام است.
   */
  const [adapter, setAdapter] = useState<AuthAdapter | null>(null)
  useEffect(() => {
    let cancelled = false
    void createAuthAdapter().then((made) => {
      if (!cancelled) setAdapter(made)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!adapter) return <main />
  return (
    <AuthProvider adapter={adapter}>
      <Routes />
    </AuthProvider>
  )
}

function Routes() {
  const { session, loading, data } = useAuth()

  if (loading) return <main />
  if (!session) return <SignIn />
  // بخش ۳.۲: بیش از یک حساب یعنی تا انتخاب نشده، هیچ پنلی باز نمی‌شود.
  if (!session.active) return <AccountPicker />
  // مخزن ناهمگام ساخته می‌شود؛ تا آماده نشده هیچ پنلی داده نمی‌خواند.
  if (!data) return <main />

  switch (session.active.role) {
    case 'teacher':
    case 'assistant':
      return <TeacherApp />
    case 'manager':
      return <ManagerApp />
    case 'guardian':
      return <ParentTodayPage />
    default:
      return <NotBuiltYet role={session.active.role} />
  }
}

function NotBuiltYet({ role }: { role: string }) {
  const { signOut } = useAuth()
  return (
    <main
      style={{
        minBlockSize: '100dvh',
        display: 'grid',
        placeContent: 'center',
        gap: 'var(--space-4)',
        padding: 'var(--space-6)',
        textAlign: 'center',
      }}
    >
      <p className="t-body-lg">
        پنل این نقش ({role}) هنوز ساخته نشده. در این مرحله فقط صفحه «امروز» پنل مربی
        وجود دارد.
      </p>
      <button
        type="button"
        className="t-body-lg"
        style={{
          minBlockSize: 'var(--touch-teacher)',
          borderRadius: 'var(--r-input)',
          background: 'var(--turquoise-dark)',
          color: 'var(--surface)',
          fontWeight: 'var(--weight-bold)',
        }}
        onClick={() => void signOut()}
      >
        خروج
      </button>
    </main>
  )
}
