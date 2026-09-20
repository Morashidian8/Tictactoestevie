import { useCallback, useEffect, useState } from 'react'
import {
  AppShell,
  type TabItem,
} from '../../design-system/index.ts'
import { ROLE_LABEL, useAuth, useData } from '../../core/auth/index.ts'
import { useCentre } from '../../core/centre/index.ts'
import { formatJalali } from '../../i18n/index.ts'
import type { ClassRoom } from '../../core/data/index.ts'
import { TodayPage } from './TodayPage.tsx'
import { BulkEntryPage } from './BulkEntryPage.tsx'
import { CloseDayPage } from './CloseDayPage.tsx'
import { MessagesPage } from '../shared/MessagesPage.tsx'
import { LoansPage } from '../shared/LoansPage.tsx'
import { DemoRoleSwitch } from '../shared/DemoRoleSwitch.tsx'
import { FreePlayPage } from './FreePlayPage.tsx'
import { ObservationsPage } from './ObservationsPage.tsx'
import { TeacherMorePage } from './TeacherMorePage.tsx'
import { TeacherProfilePage } from './TeacherProfilePage.tsx'
import { PickChildPage } from './PickChildPage.tsx'
import { MealsTodayPage } from './MealsTodayPage.tsx'
import styles from './TeacherApp.module.css'

/**
 * پوسته پنل مربی.
 *
 * همان قالب پنل والد: سرصفحه سلام، کلید حساب کاربری، و نوار پنج‌خانه‌ای
 * پایین. آنچه فرق می‌کند نام و نشان خانه‌هاست، نه جایشان — مربی و مدیر
 * گاهی یک نفرند و نباید دو ساختار یاد بگیرند.
 *
 * نشان مرجانی روی «پیام‌ها» وقتی می‌آید که خانواده‌ای پرسیده و جوابی
 * نرفته. نشانی که همیشه روشن باشد، خوانده نمی‌شود.
 */
type Screen =
  | 'today' | 'bulk' | 'close' | 'inbox' | 'more'
  | 'observations' | 'pickChild' | 'play' | 'loans' | 'account' | 'meals'

export function TeacherApp() {
  const data = useData()
  const { session, signOut, selectAccount } = useAuth()
  const { centre } = useCentre()
  const [screen, setScreen] = useState<Screen>('today')
  const [waiting, setWaiting] = useState(0)

  /*
   * کلاس جاری، در پوسته — نه در هر صفحه.
   *
   * تا اینجا «امروز»، «ثبت گروهی» و «بستن روز» هرکدام خودشان اولین کلاس
   * فهرست را برمی‌داشتند. مربیِ دو کلاسه روی «امروز» کلاس دوم را انتخاب
   * می‌کرد و بعد ثبت گروهی روی کلاس اول می‌نشست. یک حالت مشترک، این را
   * از ریشه می‌بندد.
   */
  /** کودکی که مشاهده‌ها و گزارش ماهانه‌اش باز است. */
  const [openChild, setOpenChild] = useState<{ id: string; name: string } | null>(null)
  const [classes, setClasses] = useState<ClassRoom[]>([])
  const [classId, setClassId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    data
      .listClasses()
      .then((list) => {
        if (cancelled) return
        setClasses(list)
        setClassId((current) => current ?? list[0]?.id ?? null)
      })
      .catch(() => {
        if (!cancelled) setClasses([])
      })
    return () => {
      cancelled = true
    }
  }, [data])

  /*
   * شمار گفتگوهای منتظر جواب.
   *
   * با هر جابه‌جایی صفحه دوباره خوانده می‌شود، نه با یک تایمر: مربی
   * صبح شلوغ نباید برای عددی که عوض نشده، درخواست شبکه بدهد.
   */
  const refresh = useCallback(() => {
    data
      .listConversations()
      .then((list) => setWaiting(list.reduce((sum, c) => sum + c.unread, 0)))
      .catch(() => setWaiting(0))
  }, [data])

  useEffect(() => {
    refresh()
  }, [screen, refresh])

  /*
   * «ورود خروج» دَر می‌گیرد، نه خانه.
   *
   * تا اینجا همان آیکونِ خانه را داشت، یعنی همان چیزی که در دو پنل دیگر
   * مقصدِ دیگری است. کارِ این صفحه ثبت ورود و خروج است.
   */
  /*
   * «منو» وسط نشست.
   *
   * خواسته مالک محصول. معامله‌اش صریح است: جای وسط تا اینجا کنشِ اصلی
   * بود («ثبت گروهی») و حالا یک مقصد است. در عوض فهرستِ کاملِ کارها —
   * که همه‌چیز از آن باز می‌شود — با شست راست در دسترس است، و «ثبت
   * گروهی» هنوز در نوار هست، فقط یک خانه آن‌طرف‌تر.
   *
   * ترتیب از راست: ورود خروج، ثبت گروهی، منو، پیام‌ها، بستن روز.
   */
  const NAV: TabItem[] = [
    { id: 'today', label: 'ورود خروج', shape: 'door', tone: 'mint' },
    { id: 'bulk', label: 'ثبت گروهی', shape: 'pen', tone: 'mango' },
    { id: 'inbox', label: 'پیام‌ها', shape: 'bubble', tone: 'bubble', badge: waiting },
    { id: 'close', label: 'بستن روز', shape: 'clipboard', tone: 'sky' },
  ]
  const CENTER: TabItem = { id: 'more', label: 'منو', shape: 'grid', tone: 'mango' }

  /*
   * ثبت گروهی تمام‌صفحه است: کار متمرکز، بی نوار ناوبری.
   *
   * «بستن روز» برعکس، مقصد نوار شد — مربی پایان شیفت بارها بینش و
   * «ورود خروج» می‌رود و نباید هر بار از فلش برگشت استفاده کند.
   */
  if (screen === 'bulk') {
    return <BulkEntryPage classId={classId} onBack={() => setScreen('today')} />
  }

  const activeClass = classes.find((c) => c.id === classId)
  const greeting = session?.active?.displayName ?? 'خوش آمدید'

  /*
   * سرصفحه سلام فقط روی مقصدهایی که سرصفحه خودشان را ندارند.
   *
   * «بستن روز» و «پیام‌ها» عنوان و کلید بازگشت خودشان را می‌آورند؛ دو
   * سرصفحه روی هم یعنی نصف صفحه سرصفحه است.
   */
  const ownHeader =
    screen === 'close' ||
    screen === 'observations' ||
    screen === 'play' ||
    screen === 'pickChild' ||
    screen === 'meals'

  return (
    <AppShell
      centreName={centre?.name}
      brandLogoUrl={centre?.logoUrl}
      tone="teacher"
      greeting={ownHeader ? undefined : `سلام ${greeting}!`}
      subtitle={formatJalali(new Date(), 'full')}
      roleLabel={session?.active ? ROLE_LABEL[session.active.role] : '—'}
      onSignOut={() => void signOut()}
      hasAlert={waiting > 0}
      menuExtra={
        <>
          <DemoRoleSwitch />
          {/* بخش ۳.۲: جابه‌جایی بین حساب‌ها از منو، بدون خروج و ورود مجدد. */}
          {session?.accounts
          .filter((account) => account.id !== session.active?.id)
          .map((account) => (
            <button
              key={account.id}
              type="button"
              className={`${styles.switchAccount} t-body`}
              onClick={() => void selectAccount(account.id)}
            >
              رفتن به حساب {ROLE_LABEL[account.role]}
            </button>
          ))}
        </>
      }
      toolbar={
        screen !== 'today' ? null : classes.length > 1 ? (
          <button
            type="button"
            className={`${styles.classSwitch} t-body-lg`}
            onClick={() => {
              const index = classes.findIndex((c) => c.id === classId)
              setClassId(classes[(index + 1) % classes.length]?.id ?? null)
            }}
          >
            {activeClass?.name ?? '—'} · تعویض کلاس
          </button>
        ) : (
          <span className={`${styles.classQuiet} t-body-lg`}>{activeClass?.name ?? '—'}</span>
        )
      }
      nav={NAV}
      center={CENTER}
      active={screen}
      onSelect={(id: string) => setScreen(id as Screen)}
    >
      {screen === 'inbox' ? (
        /*
          onCountChanged: پس از خواندن یا جواب دادن، شمار نخوانده بی‌درنگ
          تازه می‌شود. بی این، مربی جواب می‌داد و نشان روی تب می‌ماند تا
          وقتی به «امروز» برگردد — یعنی اپ می‌گفت کاری مانده که انجام شده.
        */
        <MessagesPage onCountChanged={setWaiting} />
      ) : screen === 'close' ? (
        <CloseDayPage
          classId={classId}
          onBack={() => setScreen('today')}
          // «تکمیل» مربی را به همان صفحه‌ای می‌برد که گزارش ناقص را پر
          // می‌کند، نه به فهرستی از خطا. بخش ۱۲.۱۰.
          onFixReports={() => setScreen('bulk')}
        />
      ) : screen === 'meals' ? (
        <MealsTodayPage onBack={() => setScreen('more')} />
      ) : screen === 'loans' ? (
        <LoansPage />
      ) : screen === 'play' ? (
        <FreePlayPage classId={classId} onBack={() => setScreen('more')} />
      ) : screen === 'observations' && openChild ? (
        /*
          برگشت به فهرست کودکان، نه به منو.
          مربی مشاهده‌ها را پشت سر هم می‌نویسد؛ اگر هر بار به منو
          برگردد، برای کودک بعدی باید دو ضربه اضافه بزند.
        */
        <ObservationsPage
          childId={openChild.id}
          childName={openChild.name}
          onBack={() => setScreen('pickChild')}
        />
      ) : screen === 'account' ? (
        <TeacherProfilePage />
      ) : screen === 'pickChild' ? (
        <PickChildPage
          classId={classId}
          onBack={() => setScreen('more')}
          onOpen={(id, name) => {
            setOpenChild({ id, name })
            setScreen('observations')
          }}
        />
      ) : screen === 'more' ? (
        /*
          «منو» فهرست است، نه مقصد: هر کاشی به همان صفحه‌ای می‌رود که
          نوار پایین هم به آن می‌رود. `observe` تنها استثناست و اول
          می‌پرسد کدام کودک.
        */
        <TeacherMorePage
          onGo={(id) => setScreen(id === 'observe' ? 'pickChild' : (id as Screen))}
        />
      ) : (
        <TodayPage
          classId={classId}
          onOpenBulk={() => setScreen('bulk')}
          onCloseDay={() => setScreen('close')}
        />
      )}
    </AppShell>
  )
}

