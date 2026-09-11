import { useState } from 'react'
import { ChildrenPage } from './ChildrenPage.tsx'
import { DashboardPage } from './DashboardPage.tsx'
import { FinancePage } from './FinancePage.tsx'
import { NoticePage } from './NoticePage.tsx'

/**
 * پنل مدیر — بخش ۱۳.۳.
 *
 * سند ناوبری پایین چهارتایی خواسته: خانه، مالی، کودکان، بیشتر. سه‌تای
 * اول ساخته شده‌اند و «بیشتر» هنوز محتوایی ندارد، پس نوار سه‌خانه‌ای
 * است نه چهارخانه: دکمه‌ای که کار نکند بدتر از نبودنش است.
 */
export type ManagerPage = 'dashboard' | 'finance' | 'children' | 'notice'

export function ManagerApp() {
  const [page, setPage] = useState<ManagerPage>('dashboard')
  const back = () => setPage('dashboard')

  switch (page) {
    case 'notice':
      return <NoticePage onBack={back} />
    case 'finance':
      return <FinancePage onBack={back} />
    case 'children':
      return <ChildrenPage onBack={back} />
    default:
      return <DashboardPage onGo={setPage} />
  }
}
