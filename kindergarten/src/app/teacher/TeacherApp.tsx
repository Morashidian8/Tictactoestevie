import { useState } from 'react'
import { TodayPage } from './TodayPage.tsx'
import { BulkEntryPage } from './BulkEntryPage.tsx'

/**
 * پوسته پنل مربی.
 *
 * دو صفحه ساخته شده، پس مسیریاب کامل هنوز وزنش را توجیه نمی‌کند. وقتی
 * تب‌های بخش ۱۳.۱ آمدند (امروز، ثبت، کودکان، پیام‌ها) این جا عوض می‌شود.
 */
type Screen = 'today' | 'bulk'

export function TeacherApp() {
  const [screen, setScreen] = useState<Screen>('today')

  return screen === 'bulk' ? (
    <BulkEntryPage onBack={() => setScreen('today')} />
  ) : (
    <TodayPage onOpenBulk={() => setScreen('bulk')} />
  )
}
