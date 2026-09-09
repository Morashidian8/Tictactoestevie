import { useState } from 'react'
import { TodayPage } from './TodayPage.tsx'
import { BulkEntryPage } from './BulkEntryPage.tsx'
import { CloseDayPage } from './CloseDayPage.tsx'

/**
 * پوسته پنل مربی.
 *
 * سه صفحه ساخته شده، پس مسیریاب کامل هنوز وزنش را توجیه نمی‌کند. وقتی
 * تب‌های بخش ۱۳.۱ آمدند (امروز، ثبت، کودکان، پیام‌ها) این جا عوض می‌شود.
 */
type Screen = 'today' | 'bulk' | 'close'

export function TeacherApp() {
  const [screen, setScreen] = useState<Screen>('today')

  switch (screen) {
    case 'bulk':
      return <BulkEntryPage onBack={() => setScreen('today')} />
    case 'close':
      return (
        <CloseDayPage
          onBack={() => setScreen('today')}
          // «تکمیل» مربی را به همان صفحه‌ای می‌برد که گزارش ناقص را پر
          // می‌کند، نه به فهرستی از خطا. بخش ۱۲.۱۰: حالت خالی و هشدار
          // دعوت به کنش‌اند.
          onFixReports={() => setScreen('bulk')}
        />
      )
    default:
      return (
        <TodayPage
          onOpenBulk={() => setScreen('bulk')}
          onCloseDay={() => setScreen('close')}
        />
      )
  }
}
