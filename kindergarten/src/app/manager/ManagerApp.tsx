import { useState } from 'react'
import { DashboardPage } from './DashboardPage.tsx'
import { NoticePage } from './NoticePage.tsx'

/**
 * پنل مدیر — بخش ۱۳.۳.
 *
 * سند ناوبری پایین چهارتایی دارد (خانه، مالی، کودکان، بیشتر). از آن
 * چهارتا فقط «خانه» ساخته شده و مالی و کودکان هنوز صفحه ندارند، پس
 * نوار ناوبری ساخته نمی‌شود: نواری که سه دکمه‌اش کار نکند بدتر از
 * نداشتن نوار است. جایش دو صفحه‌ای که واقعاً هست به هم وصل شده‌اند.
 */
export function ManagerApp() {
  const [page, setPage] = useState<'dashboard' | 'notice'>('dashboard')

  if (page === 'notice') return <NoticePage onBack={() => setPage('dashboard')} />
  return <DashboardPage onNotice={() => setPage('notice')} />
}
