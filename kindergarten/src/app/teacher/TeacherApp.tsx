import { useCallback, useEffect, useState } from 'react'
import { ChatIcon, HomeIcon, TabBar, type TabItem } from '../../design-system/index.ts'
import { useData } from '../../core/auth/index.ts'
import { TodayPage } from './TodayPage.tsx'
import { BulkEntryPage } from './BulkEntryPage.tsx'
import { CloseDayPage } from './CloseDayPage.tsx'
import { InboxPage } from './InboxPage.tsx'
import styles from './TeacherApp.module.css'

/**
 * پوسته پنل مربی.
 *
 * دو مقصد در نوار پایین: «امروز» و «پیام‌ها». ثبت گروهی و بستن روز
 * مقصد نیستند، کنش‌اند — از دکمه‌های خودِ صفحه امروز باز می‌شوند و
 * جای خانه در نوار را نمی‌گیرند.
 *
 * نشان مرجانی روی «پیام‌ها» وقتی می‌آید که خانواده‌ای پرسیده و جوابی
 * نرفته. نشانی که همیشه روشن باشد، خوانده نمی‌شود.
 */
type Screen = 'today' | 'bulk' | 'close' | 'inbox'

export function TeacherApp() {
  const data = useData()
  const [screen, setScreen] = useState<Screen>('today')
  const [waiting, setWaiting] = useState(0)

  /*
   * شمار گفتگوهای منتظر جواب.
   *
   * با هر برگشت به «امروز» دوباره خوانده می‌شود، نه با یک تایمر: مربی
   * صبح شلوغ نباید برای عددی که عوض نشده، درخواست شبکه بدهد.
   */
  const refresh = useCallback(() => {
    data
      .listThreads()
      .then((list) => setWaiting(list.filter((t) => t.awaitingReply).length))
      .catch(() => setWaiting(0))
  }, [data])

  useEffect(() => {
    refresh()
  }, [screen, refresh])

  const NAV: TabItem[] = [
    { id: 'today', label: 'امروز', icon: <HomeIcon size={22} /> },
    { id: 'inbox', label: 'پیام‌ها', icon: <ChatIcon size={22} />, badge: waiting },
  ]

  // ثبت گروهی و بستن روز تمام‌صفحه‌اند: کار متمرکز، بی نوار ناوبری.
  if (screen === 'bulk') return <BulkEntryPage onBack={() => setScreen('today')} />
  if (screen === 'close') {
    return (
      <CloseDayPage
        onBack={() => setScreen('today')}
        // «تکمیل» مربی را به همان صفحه‌ای می‌برد که گزارش ناقص را پر
        // می‌کند، نه به فهرستی از خطا. بخش ۱۲.۱۰: حالت خالی و هشدار
        // دعوت به کنش‌اند.
        onFixReports={() => setScreen('bulk')}
      />
    )
  }

  return (
    <div className={styles.shell}>
      <div className={styles.body}>
        {/*
          onChanged: پس از فرستادن جواب، شمار «منتظر جواب» بی‌درنگ تازه
          می‌شود. بی این، مربی جواب می‌داد و نشان روی تب می‌ماند تا وقتی
          به «امروز» برگردد — یعنی اپ می‌گفت کاری مانده که انجام شده.
        */}
        {screen === 'inbox' ? (
          <InboxPage onBack={() => setScreen('today')} onChanged={refresh} />
        ) : (
          <TodayPage
            onOpenBulk={() => setScreen('bulk')}
            onCloseDay={() => setScreen('close')}
          />
        )}
      </div>

      <TabBar
        items={NAV}
        center={{ id: 'bulk', label: 'ثبت گروهی امروز', icon: <PenIcon /> }}
        active={screen}
        onSelect={(id: string) => setScreen(id as Screen)}
      />
    </div>
  )
}

/* قلم — کنش مرکزی نوار مربی. */
function PenIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}
