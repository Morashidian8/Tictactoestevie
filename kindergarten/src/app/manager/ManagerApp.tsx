import { useCallback, useEffect, useState } from 'react'
import {
  AppShell,
  type TabItem,
} from '../../design-system/index.ts'
import { ROLE_LABEL, useAuth, useData } from '../../core/auth/index.ts'
import { useCentre } from '../../core/centre/index.ts'
import { formatJalali } from '../../i18n/index.ts'
import { ProgramPage } from './ProgramPage.tsx'
import { LoansPage } from '../shared/LoansPage.tsx'
import shell from './ProgramPage.module.css'
import { AuditPage } from './AuditPage.tsx'
import { BrandPage } from './BrandPage.tsx'
import { ChildrenPage } from './ChildrenPage.tsx'
import { DashboardPage } from './DashboardPage.tsx'
import { FinancePage } from './FinancePage.tsx'
import { ManagerMorePage } from './ManagerMorePage.tsx'
import { NoticePage } from './NoticePage.tsx'
import { StaffPage } from './StaffPage.tsx'
import { MessagesPage } from '../shared/MessagesPage.tsx'
import { DemoRoleSwitch } from '../shared/DemoRoleSwitch.tsx'

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
  | 'program'
  /* هویت مهد — نام و نشانی که خانواده می‌بیند. */
  | 'brand'
  | 'loans'
  /* نامِ دومِ همان صفحه برنامه — کاشیِ «منوی غذایی» در منو. */
  | 'meals'
  | 'messages'
  | 'more'

export function ManagerApp() {
  const data = useData()
  const { session, signOut } = useAuth()
  const { centre } = useCentre()
  const [page, setPage] = useState<ManagerPage>('dashboard')
  /*
   * پرونده‌ای که باید مستقیم باز شود.
   *
   * مدیر از داشبورد روی نام مربیِ شیفت می‌زند و می‌خواهد همان پرونده
   * را ببیند، نه فهرست کارکنان را و بعد گشتن در آن.
   */
  const [openStaff, setOpenStaff] = useState<string | null>(null)
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

  /* «منو» وسط، مثل دو پنل دیگر. ترتیب از راست: خانه، مالی، منو، پیام‌ها، کودکان. */
  const NAV: TabItem[] = [
    { id: 'dashboard', label: 'خانه', shape: 'home', tone: 'mint' },
    { id: 'finance', label: 'مالی', shape: 'wallet', tone: 'mango', badge: counts.claims },
    { id: 'messages', label: 'پیام‌ها', shape: 'bubble', tone: 'bubble', badge: unread },
    { id: 'children', label: 'کودکان', shape: 'people', tone: 'grape' },
  ]
  /*
   * پیام‌ها کنش مرکزی هر سه پنل است.
   *
   * اطلاع‌رسانی به «بیشتر» رفت: کاری است که مدیر ماهی یک‌بار می‌کند، و
   * گفتگو کاری که هر روز. جای کنش مرکزی، مالِ کارِ روزانه است.
   */
  const CENTER: TabItem = {
    id: 'more',
    label: 'منو',
    shape: 'grid',
    tone: 'mango',
    badge: counts.gaps,
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
      centreName={centre?.name}
      brandLogoUrl={centre?.logoUrl}
      tone="manager"
      greeting={onHome ? 'صبح بخیر' : undefined}
      subtitle={`${formatJalali(new Date(), 'weekday')} · اینجا خلاصه امروز مهد است`}
      roleLabel={session?.active ? ROLE_LABEL[session.active.role] : '—'}
      onSignOut={() => void signOut()}
      hasAlert={counts.claims > 0 || counts.gaps > 0 || unread > 0}
      menuExtra={<DemoRoleSwitch />}
      nav={NAV}
      center={CENTER}
      active={page}
      onSelect={(id: string) => setPage(id as ManagerPage)}
    >
      {page === 'messages' ? (
        <MessagesPage onCountChanged={setUnread} />
      ) : page === 'more' ? (
        <ManagerMorePage onGo={setPage} gaps={counts.gaps} claims={counts.claims} />
      ) : page === 'staff' ? (
        <StaffPage
          openStaffId={openStaff}
          onBack={() => {
            setOpenStaff(null)
            setPage('more')
          }}
        />
      ) : page === 'finance' ? (
        <FinancePage onBack={back} />
      ) : page === 'children' ? (
        <ChildrenPage onBack={back} />
      ) : page === 'loans' ? (
        <LoanShell onBack={() => setPage('more')} />
      ) : page === 'program' || page === 'meals' ? (
        <ProgramPage onBack={() => setPage('more')} />
      ) : page === 'audit' ? (
        <AuditPage onBack={() => setPage('more')} />
      ) : page === 'brand' ? (
        <BrandPage onBack={() => setPage('more')} />
      ) : (
        <DashboardPage
          onGo={setPage}
          onCounts={setCounts}
          unread={unread}
          onOpenStaff={(id) => {
            setOpenStaff(id)
            setPage('staff')
          }}
        />
      )}
    </AppShell>
  )
}

/**
 * دفتر امانت با سرصفحه و کلید بازگشت.
 *
 * `LoansPage` خودش سرصفحه ندارد: پنل مربی آن را داخل پوسته مشترک
 * می‌نشاند و آنجا سرصفحه از پیش هست. اینجا از «بیشتر» باز می‌شود و
 * بی کلید بازگشت، مدیر در آن گیر می‌کند.
 */
function LoanShell({ onBack }: { onBack: () => void }) {
  return (
    <div className={shell.page}>
      <header className={shell.header}>
        <button
          type="button"
          className={shell.back}
          onClick={onBack}
          aria-label="بازگشت به داشبورد"
        >
          ‹
        </button>
        <span className={`${shell.title} t-h2`}>دفتر امانت</span>
      </header>
      <div className={shell.body}>
        <LoansPage />
      </div>
    </div>
  )
}
