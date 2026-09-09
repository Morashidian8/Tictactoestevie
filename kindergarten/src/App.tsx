import { useMemo } from 'react'
import './design-system/index.ts'
import { AuthProvider, createLocalAuthAdapter, useAuth } from './core/auth/index.ts'
import { AccountPicker } from './app/auth/AccountPicker.tsx'
import { SignIn } from './app/auth/SignIn.tsx'
import { TeacherApp } from './app/teacher/TeacherApp.tsx'

/**
 * پوسته اپ.
 *
 * پنل از روی نقش حساب فعال انتخاب می‌شود، نه از روی مسیر. بخش ۳.۲
 * می‌گوید دسترسی‌ها هرگز ترکیب نمی‌شوند، پس مسیر نباید بتواند کاربر را
 * به پنلی ببرد که نقشش اجازه‌اش را ندارد.
 *
 * فقط پنل مربی ساخته شده. نقش‌های دیگر عمداً صفحه‌ای ندارند.
 */
export function App() {
  const adapter = useMemo(() => createLocalAuthAdapter(), [])
  return (
    <AuthProvider adapter={adapter}>
      <Routes />
    </AuthProvider>
  )
}

function Routes() {
  const { session, loading } = useAuth()

  if (loading) return <main />
  if (!session) return <SignIn />
  // بخش ۳.۲: بیش از یک حساب یعنی تا انتخاب نشده، هیچ پنلی باز نمی‌شود.
  if (!session.active) return <AccountPicker />

  switch (session.active.role) {
    case 'teacher':
    case 'assistant':
      return <TeacherApp />
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
