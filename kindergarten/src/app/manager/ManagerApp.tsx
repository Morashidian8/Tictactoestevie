import { useState } from 'react'
import {
  AppShell,
  FolderIcon,
  HomeIcon,
  MegaphoneIcon,
  PeopleIcon,
  WalletIcon,
  type TabItem,
} from '../../design-system/index.ts'
import { ROLE_LABEL, useAuth } from '../../core/auth/index.ts'
import { formatJalali } from '../../i18n/index.ts'
import { AuditPage } from './AuditPage.tsx'
import { ChildrenPage } from './ChildrenPage.tsx'
import { DashboardPage } from './DashboardPage.tsx'
import { FinancePage } from './FinancePage.tsx'
import { NoticePage } from './NoticePage.tsx'

/**
 * پنل مدیر — بخش ۱۳.۳.
 *
 * همان قالب دو پنل دیگر: سرصفحه سلام، کلید حساب کاربری در همان گوشه، و
 * نوار پنج‌خانه‌ای پایین. تا اینجا پنل مدیر تنها پنلی بود که نوار نداشت
 * — دکمه‌هایش ته داشبورد بودند و راه برگشت از هر صفحه فقط یک فلش.
 *
 * هر پنج خانه مقصد واقعی‌اند. «بیشتر» ساخته نشد چون چیزی برایش نمانده
 * بود، و دکمه‌ای که کار نکند بدتر از نبودنش است.
 */
export type ManagerPage = 'dashboard' | 'finance' | 'children' | 'notice' | 'audit'

export function ManagerApp() {
  const { session, signOut } = useAuth()
  const [page, setPage] = useState<ManagerPage>('dashboard')
  /*
   * نشان‌های نوار از داشبورد بالا می‌آیند، نه از یک خواندن دوم.
   *
   * داشبورد این دو عدد را برای خودش می‌خواند؛ خواندن دوباره‌شان اینجا
   * یعنی دو درخواست برای یک حقیقت، که می‌توانند با هم نخوانند.
   */
  const [counts, setCounts] = useState({ claims: 0, gaps: 0 })

  const NAV: TabItem[] = [
    { id: 'dashboard', label: 'خانه', icon: <HomeIcon size={22} /> },
    { id: 'finance', label: 'مالی', icon: <WalletIcon size={22} />, badge: counts.claims },
    { id: 'children', label: 'کودکان', icon: <PeopleIcon size={22} /> },
    { id: 'audit', label: 'بازرسی', icon: <FolderIcon size={22} />, badge: counts.gaps },
  ]
  /*
   * اطلاع‌رسانی کنش مرکزی است چون تنها کاری است که فوریت دارد؛ بقیه
   * رفتن به صفحه‌اند، نه انجام دادن کاری.
   */
  const CENTER: TabItem = {
    id: 'notice',
    label: 'اطلاع‌رسانی به خانواده‌ها',
    icon: <MegaphoneIcon size={24} />,
  }

  const back = () => setPage('dashboard')

  /*
   * اطلاع‌رسانی تمام‌صفحه است، بی نوار — مثل «ثبت گروهی» مربی.
   *
   * همان قاعده پوسته: کارِ متمرکز چندمرحله‌ای (نوشتن، بررسی، فرستادن)
   * کنش اصلی خودش را در پایین قاب دارد، و نوار ناوبری روی همان جا
   * می‌نشیند. وسط نوشتن اطلاعیه، نواری که به جای دیگری می‌برد فقط
   * راهِ گم شدن است.
   */
  if (page === 'notice') return <NoticePage onBack={back} />

  const onHome = page === 'dashboard'

  return (
    <AppShell
      greeting={onHome ? 'صبح بخیر' : undefined}
      subtitle={`${formatJalali(new Date(), 'weekday')} · اینجا خلاصه امروز مهد است`}
      roleLabel={session?.active ? ROLE_LABEL[session.active.role] : '—'}
      onSignOut={() => void signOut()}
      hasAlert={counts.claims > 0 || counts.gaps > 0}
      nav={NAV}
      center={CENTER}
      active={page}
      onSelect={(id: string) => setPage(id as ManagerPage)}
    >
      {page === 'finance' ? (
        <FinancePage onBack={back} />
      ) : page === 'children' ? (
        <ChildrenPage onBack={back} />
      ) : page === 'audit' ? (
        <AuditPage onBack={back} />
      ) : (
        <DashboardPage onGo={setPage} onCounts={setCounts} />
      )}
    </AppShell>
  )
}
