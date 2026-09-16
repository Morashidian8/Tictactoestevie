import { useCallback, useEffect, useState } from 'react'
import {
  AppShell,
  ChatIcon,
  HomeIcon,
  MoreIcon,
  PeopleIcon,
  WalletIcon,
  type TabItem,
} from '../../design-system/index.ts'
import { ROLE_LABEL, useAuth, useData } from '../../core/auth/index.ts'
import { formatJalali } from '../../i18n/index.ts'
import { AuditPage } from './AuditPage.tsx'
import { ChildrenPage } from './ChildrenPage.tsx'
import { DashboardPage } from './DashboardPage.tsx'
import { FinancePage } from './FinancePage.tsx'
import { ManagerMorePage } from './ManagerMorePage.tsx'
import { NoticePage } from './NoticePage.tsx'
import { StaffPage } from './StaffPage.tsx'
import { MessagesPage } from '../shared/MessagesPage.tsx'

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
export type ManagerPage =
  | 'dashboard'
  | 'finance'
  | 'children'
  | 'notice'
  | 'audit'
  | 'staff'
  | 'messages'
  | 'more'

export function ManagerApp() {
  const data = useData()
  const { session, signOut } = useAuth()
  const [page, setPage] = useState<ManagerPage>('dashboard')
  /*
   * نشان‌های نوار از داشبورد بالا می‌آیند، نه از یک خواندن دوم.
   *
   * داشبورد این دو عدد را برای خودش می‌خواند؛ خواندن دوباره‌شان اینجا
   * یعنی دو درخواست برای یک حقیقت، که می‌توانند با هم نخوانند.
   */
  const [counts, setCounts] = useState({ claims: 0, gaps: 0 })
  const [unread, setUnread] = useState(0)

  /*
   * شمار پیام‌های نخوانده.
   *
   * با هر جابه‌جایی صفحه دوباره خوانده می‌شود، نه با تایمر: عددی که
   * عوض نشده، درخواست شبکه نمی‌خواهد.
   */
  const refreshUnread = useCallback(() => {
    data
      .listConversations()
      .then((list) => setUnread(list.reduce((sum, c) => sum + c.unread, 0)))
      .catch(() => setUnread(0))
  }, [data])

  const NAV: TabItem[] = [
    { id: 'dashboard', label: 'خانه', icon: <HomeIcon size={22} /> },
    { id: 'finance', label: 'مالی', icon: <WalletIcon size={22} />, badge: counts.claims },
    { id: 'children', label: 'کودکان', icon: <PeopleIcon size={22} /> },
    { id: 'more', label: 'بیشتر', icon: <MoreIcon size={22} />, badge: counts.gaps },
  ]
  /*
   * پیام‌ها کنش مرکزی هر سه پنل است.
   *
   * اطلاع‌رسانی به «بیشتر» رفت: کاری است که مدیر ماهی یک‌بار می‌کند، و
   * گفتگو کاری که هر روز. جای کنش مرکزی، مالِ کارِ روزانه است.
   */
  const CENTER: TabItem = {
    id: 'messages',
    label: 'پیام‌ها',
    icon: <ChatIcon size={24} />,
    badge: unread,
  }

  /*
   * بالای هر بازگشتِ شرطی.
   *
   * قلاب پس از `return` شرطی اجرا نمی‌شود و React همان‌جا می‌شکند —
   * صفحه سفید، بی هیچ پیامی. تست e2e این را گرفت، نه بازبینی.
   */
  useEffect(() => {
    refreshUnread()
  }, [page, refreshUnread])

  const back = () => setPage('dashboard')

  /*
   * اطلاع‌رسانی تمام‌صفحه است، بی نوار — مثل «ثبت گروهی» مربی.
   *
   * همان قاعده پوسته: کارِ متمرکز چندمرحله‌ای (نوشتن، بررسی، فرستادن)
   * کنش اصلی خودش را در پایین قاب دارد، و نوار ناوبری روی همان جا
   * می‌نشیند. وسط نوشتن اطلاعیه، نواری که به جای دیگری می‌برد فقط
   * راهِ گم شدن است.
   */
  if (page === 'notice') return <NoticePage onBack={() => setPage('more')} />

  const onHome = page === 'dashboard' || page === 'messages' || page === 'more'

  return (
    <AppShell
      greeting={onHome ? 'صبح بخیر' : undefined}
      subtitle={`${formatJalali(new Date(), 'weekday')} · اینجا خلاصه امروز مهد است`}
      roleLabel={session?.active ? ROLE_LABEL[session.active.role] : '—'}
      onSignOut={() => void signOut()}
      hasAlert={counts.claims > 0 || counts.gaps > 0 || unread > 0}
      nav={NAV}
      center={CENTER}
      active={page}
      onSelect={(id: string) => setPage(id as ManagerPage)}
    >
      {page === 'messages' ? (
        <MessagesPage onCountChanged={setUnread} />
      ) : page === 'more' ? (
        <ManagerMorePage onGo={setPage} gaps={counts.gaps} />
      ) : page === 'staff' ? (
        <StaffPage onBack={() => setPage('more')} />
      ) : page === 'finance' ? (
        <FinancePage onBack={back} />
      ) : page === 'children' ? (
        <ChildrenPage onBack={back} />
      ) : page === 'audit' ? (
        <AuditPage onBack={() => setPage('more')} />
      ) : (
        <DashboardPage onGo={setPage} onCounts={setCounts} />
      )}
    </AppShell>
  )
}
