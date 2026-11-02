import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckIcon,
  AlertIcon,
  ChildGrid,
  EmptyState,
  MoonIcon,
  PillIcon,
  QuickAction,
  SpoonIcon,
  StatusChip,
  SyncBadge,
  type ChildGridItem,
} from '../../design-system/index.ts'
import {
  formatAge,
  formatClock,
  formatCount,
  formatTime,
  toIsoDate,
} from '../../i18n/index.ts'
import { useAuth, useData } from '../../core/auth/index.ts'
import type { Child, ChildInSession, PickupPlan } from '../../core/data/index.ts'
import {
  indexAbsences,
  indexAttendance,
  resolveState,
  tally,
  type ClassDay,
} from '../../core/data/index.ts'
import {
  announceLocal,
  createLocalLiveChannel,
  FALLBACK_POLL_MS,
  type LiveEvent,
  type LiveStatus,
} from '../../core/sync/index.ts'
import { ArrivalSheet, type ArrivalResult } from './ArrivalSheet.tsx'
import { CheckOutSheet } from './CheckOutSheet.tsx'
import { IncidentSheet } from './IncidentSheet.tsx'
import { BirthdayCard } from '../shared/BirthdayCard.tsx'
import fab from './IncidentSheet.module.css'
import styles from './TodayPage.module.css'

/**
 * صفحه «امروز» پنل مربی — بخش ۱۳.۱ سند.
 *
 * ضربه کوتاه روی عکس = ثبت ورود با پیش‌فرض‌ها: ساعت جاری، آورنده سرپرست
 * پیش‌فرض، وضعیت عادی (بخش ۵.۳).
 *
 * نگه‌داشتن انگشت = شیت استثناها. شیت هنوز ساخته نشده و این جلسه در دامنه
 * نبود، پس فعلاً فقط اعلام می‌کند که کجاست.
 */
export function TodayPage({
  classId,
  onOpenBulk,
  onCloseDay,
}: {
  /**
   * کلاس از پوسته می‌آید، نه از خودِ صفحه.
   *
   * پیش از این هر سه صفحه مربی خودشان `listClasses()[0]` را برمی‌داشتند.
   * مربیِ دو کلاسه روی «امروز» کلاس دوم را انتخاب می‌کرد و «ثبت گروهی»
   * همچنان کلاس اول را نشان می‌داد — یعنی ثبت روی کلاس اشتباه.
   */
  classId: string | null
  onOpenBulk: () => void
  onCloseDay: () => void
}) {
  const data = useData()
  const { queue } = useAuth()
  const [day, setDay] = useState<ClassDay | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(0)
  // کودکی که شیت استثناهایش باز است، به‌علاوه سرپرستانش که با باز شدن
  // شیت خوانده می‌شوند نه پیش از آن.
  const [sheetFor, setSheetFor] = useState<string | null>(null)
  // کودکی که شیت خروجش باز است — بخش ۵.۸.
  const [checkOutFor, setCheckOutFor] = useState<string | null>(null)
  /** کودکی که همین الان با یک ضربه واردش کردیم، برای تراشه «تغییر». */
  const [justIn, setJustIn] = useState<{ childId: string; name: string | null } | null>(null)
  /*
   * اعلام‌های خانواده برای امروز — بخش ۵.۸ و ۶.۴.
   *
   * مربی این را می‌بیند ولی نمی‌سازد: تصمیم اینکه فردا چه کسی می‌آورد
   * یا می‌برد، تصمیم خانواده است. دیدنش پیش از ساعت خروج مهم است، نه
   * وقتی فرد دم در ایستاده.
   */
  const [plans, setPlans] = useState<PickupPlan[]>([])
  /** یادآور دارو باز شده است یا نه — بخش ۵.۳. */
  const [medsOpen, setMedsOpen] = useState(false)
  // بخش ۱۳.۱: دکمه شناور ثبت رویداد، در همه تب‌ها.
  const [incidentOpen, setIncidentOpen] = useState(false)
  // فهرست کودکانی که نیامده‌اند، وقتی مربی روی تراشه بزند.
  const [showOutstanding, setShowOutstanding] = useState(false)
  /*
   * کودکانی که امروز روزشان نیست — بخش ۲ و ۴ سند تازه.
   *
   * از شبکه بیرونند، نه اینکه کم‌رنگ باشند: کودک سه‌روزه روز چهارم
   * اصلاً قرار نیست بیاید و دیدنش هر روز یعنی مربی چهار غیبت دروغین
   * می‌بیند. ولی استثنا واقعی است، پس راه افزودن دستی باز می‌ماند.
   */
  const [offDay, setOffDay] = useState<Child[]>([])
  const [offDayOpen, setOffDayOpen] = useState(false)
  /** فهرست بازه‌های هم‌پوشان، پشت نشانگر «+۱ شیفت». */
  const [periodsOpen, setPeriodsOpen] = useState(false)
  /** نام بازه‌ای که تازه پنجره‌اش باز شده. پنج ثانیه می‌ماند. */
  const [banner, setBanner] = useState<string | null>(null)

  // ساعت جاری در حالت نگه داشته می‌شود چون مرز ۹:۰۰ ستون سوم نوار خلاصه
  // را عوض می‌کند و صفحه باید بدون نوسازی دستی رد شود.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => queue.subscribe((status) => setPending(status.pending)), [queue])

  const date = toIsoDate(now)

  const load = useCallback(async () => {
    if (!classId) return
    try {
      const [classDay, todayPlans, off] = await Promise.all([
        data.getClassDay(classId, date),
        data.listPlans(classId, date),
        data.listOffDayChildren(classId, date),
      ])
      setDay(classDay)
      setPlans(todayPlans)
      setOffDay(off)
    } catch (cause) {
      setError(messageOf(cause))
    }
  }, [classId, data, date])

  /*
   * همگام‌سازی بین مربیان — ارتقای ۴ سند بررسی طراحی.
   *
   * مهد چند مربی دارد و هر کدام گوشی خودش را دارد. وقتی یکی کودکی را
   * تحویل می‌گیرد، بقیه باید همان را ببینند، وگرنه دو نفر یک ورود را
   * ثبت می‌کنند یا یکی دنبال کودکی می‌گردد که همکارش تحویلش گرفته.
   *
   * تا نسخه پیش، صفحه هر سی ثانیه خودش را می‌خواند. صبح مهد، سی ثانیه
   * یعنی همان دو ثبت تکراری. حالا اتصال پایدار خبر می‌دهد و نوسازی
   * دوره‌ای فقط لایه پشتیبان است.
   */
  const live = useMemo(() => createLocalLiveChannel(), [])
  useEffect(() => () => live.close(), [live])

  const [liveStatus, setLiveStatus] = useState<LiveStatus>(() => live.getStatus())
  useEffect(() => live.watch(setLiveStatus), [live])

  useEffect(() => {
    if (!classId) return
    return live.subscribe(classId, () => {
      void load()
    })
  }, [classId, live, load])

  /*
   * یک خواندن کامل در آغاز، و یک خواندن کامل پس از هر اتصال دوباره.
   *
   * رویدادهای حین قطعی از دست رفته‌اند و هیچ سوکتی آن‌ها را برنمی‌گرداند؛
   * پس epoch — نه رویداد بعدی — مرجع تازه‌سازی است.
   */
  useEffect(() => {
    void load()
  }, [liveStatus.epoch, load])

  /*
   * لایه پشتیبان: فقط وقتی اتصال نیست.
   *
   * روی اتصال سالم، تایمر خاموش است — باتری و سهمیه اینترنت مربی برای
   * خواندنی که چیزی تازه ندارد خرج نمی‌شود.
   */
  useEffect(() => {
    if (liveStatus.state === 'connected') return
    const timer = setInterval(() => {
      void load()
    }, FALLBACK_POLL_MS)
    return () => clearInterval(timer)
  }, [liveStatus.state, load])

  /**
   * خواندن دوباره پس از یک نوشتن، به‌علاوه خبر دادن به بقیه دستگاه‌ها.
   *
   * در پیاده‌سازی واقعی خبر دادن لازم نیست — نوشتن در پایگاه داده خودش
   * رویداد Realtime می‌سازد. اینجا چون سروری نیست، نویسنده خبر می‌دهد و
   * رفتار صفحه دقیقاً همانی می‌شود که با سوکت خواهد بود.
   */
  const reload = useCallback(
    async (event?: LiveEvent) => {
      if (event && classId) announceLocal(classId, event)
      await load()
    },
    [classId, load],
  )

  const attendance = useMemo(() => indexAttendance(day?.attendance ?? []), [day])
  const absences = useMemo(() => indexAbsences(day?.absences ?? []), [day])

  /*
   * سه گروه، نه یک شبکه — تصمیم ۰۳ سند بررسی طراحی.
   *
   * شبکه اصلی فقط کودکان بازه جاری را دارد. کودکی که بازه‌اش تا نیم‌ساعت
   * دیگر شروع می‌شود و کودکی که بازه‌اش تازه تمام شده، هر کدام بخش
   * تفکیک‌شده خودشان را می‌گیرند. بی این، ساعت ۱۳ نیمی از چهره‌ها یکباره
   * می‌رفتند و نیمی یکباره می‌آمدند.
   */
  const inSession = useMemo(
    () => (day?.children ?? []).filter((c) => c.phase === 'current'),
    [day],
  )
  const upcoming = useMemo(
    () => (day?.children ?? []).filter((c) => c.phase === 'upcoming'),
    [day],
  )
  const departing = useMemo(
    () => (day?.children ?? []).filter((c) => c.phase === 'departing'),
    [day],
  )

  const counts = useMemo(
    () => tally(inSession, attendance, absences, now),
    [inSession, attendance, absences, now],
  )

  /*
   * گزارش‌های امروز، برای میکروآیکون‌های ناهار و خواب روی کارت.
   *
   * داده‌اش از قبل در ClassDay بود و کسی نگاهش نمی‌کرد: مربی برای
   * فهمیدن اینکه ناهار سارا ثبت شده یا نه، باید به صفحه ثبت گروهی
   * می‌رفت. حالا روی همان کارت است.
   */
  const reports = useMemo(
    () => new Map((day?.reports ?? []).map((report) => [report.childId, report])),
    [day],
  )

  const toItems = useCallback(
    (list: ChildInSession[]): ChildGridItem[] =>
      list.map((child) => {
        const state = resolveState(child, attendance, absences, now)
        const row = attendance.get(child.id)
        const checkIn = row?.checkInAt ? new Date(row.checkInAt) : null
        const report = reports.get(child.id)
        return {
          id: child.id,
          firstName: child.firstName,
          photoUrl: child.photoUrl,
          state,
          // تصمیم ۰۴: نشان استثنا روی حاشیه آواتار، تا مربی بی‌باز کردن
          // شیت بفهمد این کودک وضعیت متفاوتی دارد.
          flagged: child.addedException,
          flagLabel: 'استثنا',
          /*
           * «ورود» پیش از ساعت، عمدی است.
           *
           * جداکنندهٔ «·» میان دو رقم فارسی در اندازهٔ ۱۱ پیکسل عملاً
           * «۰» خوانده می‌شود: «۵ سال و ۴ ماه · ۹:۲۰» روی گوشی
           * «... ماه ۰ ۹:۲۰» دیده می‌شد. یک کلمه دو طرفِ نقطه را حرف
           * می‌کند، و هم‌زمان می‌گوید این ساعت، ساعتِ چیست.
           */
          caption: checkIn ? `ورود ${formatTime(checkIn)}` : undefined,
          age: formatAge(child.birthDate, now),
          // بخش ۷.۱: آلرژی در دید مربی، نه در پرونده کودک.
          /*
           * اولین آلرژی، به‌علاوه شمار بقیه.
           *
           * چسباندن همه با «،» در کارت ۱۷۳ پیکسلی به «تخم‌مرغ، بادام…»
           * تبدیل می‌شد — یعنی مربی نه اولی را کامل می‌دید نه می‌فهمید
           * دومی هم هست. «تخم‌مرغ +۱» هر دو را می‌گوید.
           */
          allergy:
            child.allergies.length === 0
              ? null
              : child.allergies.length === 1
                ? (child.allergies[0] ?? null)
                : `${child.allergies[0]} +${formatCount(child.allergies.length - 1)}`,
          lunchLogged: report?.lunch != null,
          napLogged: report?.napStart != null,
          /*
           * تحویل امروز فرق دارد — بخش ۵.۸.
           *
           * فقط `pickup`: «چه کسی می‌آورد» برای مربی کنشی ندارد. او با
           * دانستنش هیچ کار متفاوتی نمی‌کند، و هر خطِ بی‌کنش، خطِ
           * باکنشِ کنارش را کم‌رنگ می‌کند.
           */
          pickupBy:
            plans.find((p) => p.childId === child.id && p.direction === 'pickup')
              ?.personName ?? null,
          actionLabel:
            state === 'present'
              ? `ثبت خروج ${child.firstName}`
              : state === 'left'
                ? `${child.firstName}، رفته`
                : `ثبت ورود ${child.firstName}`,
        }
      }),
    [attendance, absences, now, reports, plans],
  )

  /*
   * چقدر از گزارش امروز ثبت شده.
   *
   * فقط کودکان همین بازه شمرده می‌شوند، نه کل کلاس: مربی صبح نمی‌تواند
   * ناهار کودک بعدازظهری را ثبت کند و شمردنش، عددی می‌سازد که هرگز
   * کامل نمی‌شود.
   */
  const loggedLunch = useMemo(
    () => inSession.filter((child) => reports.get(child.id)?.lunch != null).length,
    [inSession, reports],
  )
  const loggedNap = useMemo(
    () => inSession.filter((child) => reports.get(child.id)?.napStart != null).length,
    [inSession, reports],
  )

  const items = useMemo(() => toItems(inSession), [toItems, inSession])
  const upcomingItems = useMemo(() => toItems(upcoming), [toItems, upcoming])
  const departingItems = useMemo(() => toItems(departing), [toItems, departing])

  /**
   * ضربه کوتاه روی کودک — بخش ۵.۳.
   *
   * ورود همان‌جا و با سرپرست پیش‌فرض ثبت می‌شود، بدون هیچ صفحه واسط.
   * چهار ثانیه یک تراشه «<نام> · تغییر» می‌ماند؛ اگر آورنده کس دیگری
   * بود یا کودک حالش خوب نبود یا دارو آورده بودند، همان تراشه شیت
   * سه‌بخشی را باز می‌کند. نگه‌داشتن انگشت هم مستقیم همان شیت را
   * باز می‌کند، برای مربی‌ای که از قبل می‌داند استثناست.
   *
   * چرا پیش‌فرض و بعد تغییر، نه پرسش و بعد ثبت: صبح مهد بیست‌وپنج کودک
   * در ده دقیقه می‌آیند و حالت غالب «مادر آورد، حالش خوب است» است.
   * پرسیدن از همه برای گرفتن استثنای دو نفر، هزینه را روی بیست‌وسه نفر
   * دیگر می‌گذارد.
   */
  const quickCheckIn = async (childId: string) => {
    const options = await data.listPickupOptions(childId)
    const first = options[0] ?? null
    await queue.submit('text', () =>
      data.checkIn({
        childId,
        at: new Date(),
        droppedByGuardianId: first?.kind === 'guardian' ? first.id : null,
        arrivalCondition: 'normal',
      }),
    )
    setJustIn({ childId, name: first?.fullName ?? null })
    await reload('attendance')
  }

  /*
   * بنر پنجره انتقال — تصمیم ۰۳.
   *
   * تنها وقتی می‌آید که بازه تازه‌ای پنجره‌اش باز شده باشد، و فقط یک بار
   * برای هر بازه. پنج ثانیه بعد خودش می‌رود.
   *
   * seenRef لازم است چون صفحه هر سی ثانیه تازه می‌شود؛ بی آن، بنر تا
   * پایان پنجره هر نیم‌دقیقه دوباره می‌آمد.
   */
  const seenUpcoming = useRef<string | null>(null)
  useEffect(() => {
    const next = day?.upcomingPeriod ?? null
    if (!next) {
      seenUpcoming.current = null
      return
    }
    if (seenUpcoming.current === next.id) return
    seenUpcoming.current = next.id
    setBanner(next.title)
  }, [day?.upcomingPeriod])

  useEffect(() => {
    if (!banner) return
    const timer = setTimeout(() => setBanner(null), 5000)
    return () => clearTimeout(timer)
  }, [banner])

  /*
   * تراشه پس از چهار ثانیه خودش می‌رود. عدد از سند نمی‌آید؛ کوتاه‌ترین
   * زمانی است که مربی فرصت خواندن و ضربه زدن دارد بدون اینکه تراشه
   * روی ورود بعدی بیفتد.
   */
  useEffect(() => {
    if (!justIn) return
    const timer = setTimeout(() => setJustIn(null), 4000)
    return () => clearTimeout(timer)
  }, [justIn])

  const stateOf = (childId: string) => {
    const child = day?.children.find((c) => c.id === childId)
    if (!child) return 'notArrived' as const
    return resolveState(child, attendance, absences, now)
  }

  const openChild = (childId: string) => {
    const state = stateOf(childId)
    if (state === 'left') return
    if (state === 'present') setCheckOutFor(childId)
    else void quickCheckIn(childId)
  }

  /** نگه‌داشتن انگشت: مستقیم شیت استثناها، بی‌آنکه اول ورودی ثبت شود. */
  const openArrivalSheet = (childId: string) => {
    const state = stateOf(childId)
    if (state === 'left') return
    setJustIn(null)
    setSheetFor(childId)
  }

  const submitSheet = async (result: ArrivalResult) => {
    if (!sheetFor) return
    const childId = sheetFor
    await queue.submit('text', async () => {
      await data.checkIn({
        childId,
        at: new Date(),
        droppedByGuardianId: result.droppedByGuardianId,
        arrivalCondition: result.arrivalCondition,
      })
      if (result.medication) {
        await data.addMedication({
          childId,
          date,
          name: result.medication.name,
          dose: result.medication.dose || null,
          scheduledTime: result.medication.scheduledTime || null,
          handedByGuardianId: result.medication.handedById,
        })
      }
    })
    // بخش ۱۴.۲: صف عکس از صف متن جداست، تا آپلود سنگین ثبت متنی را عقب
    // نیندازد. عکس پس از ثبت متن و با اولویت پایین‌تر می‌رود.
    if (result.photo) {
      void queue.submit('photo', async () => {
        // آپلود واقعی وقتی استوریج وصل شود. صف مسیرش را نگه می‌دارد.
      })
    }
    await reload('attendance')
  }

  const sheetChild = day?.children.find((c) => c.id === sheetFor) ?? null
  const checkOutChild = day?.children.find((c) => c.id === checkOutFor) ?? null

  /*
   * فهرست پشت تراشه سوم.
   *
   * وقتی بی‌خبر داریم، فقط بی‌خبرها را می‌آورد: نام کودکی که هنوز مهلتش
   * نگذشته در کنار نام کودکی که باید دنبالش گشت، هر دو را بی‌اثر می‌کند.
   */
  const outstandingNames = inSession
    .filter((child) => {
      const state = resolveState(child, attendance, absences, now)
      if (counts.unaccounted > 0) return state === 'unaccounted'
      return state === 'notArrived'
    })
    .map((child) => child.firstName)

  /*
   * نام بازه جاری. در مرز، هر دو با «و» می‌آیند؛ بیرون ساعت کار هیچ
   * بازه‌ای باز نیست و همان را می‌گوییم، نه اینکه جای خالی بماند.
   *
   * هیچ‌جا فرض نشده که دو بازه هست: هر تعداد بازه که مهد تعریف کند،
   * همین جمله ساخته می‌شود.
   */
  /*
   * تصمیم ۰۲ سند بررسی طراحی: چیدن اسامی بازه با «و» ممنوع است.
   *
   * بازه جاری با برچسب پررنگ می‌آید و بقیه بازه‌های هم‌پوشان در یک
   * نشانگر عددی فشرده می‌شوند. در عرض ۳۲۰ پیکسل، «صبح و بعدازظهر و
   * عصرانه» جا نمی‌شد و متن بریده می‌شد.
   *
   * هیچ‌جا فرض نشده دو بازه هست: هر تعدادی که مرکز تعریف کند، اولی
   * نوشته می‌شود و بقیه شمرده.
   */
  const activePeriod = day?.currentPeriods[0] ?? null
  const periodLabel = activePeriod?.title ?? 'بیرون از ساعت کار'
  const extraPeriods = Math.max((day?.currentPeriods.length ?? 0) - 1, 0)

  // مرتب بر اساس ساعت مصرف. داروی بی‌ساعت ته فهرست می‌رود، نه اولش.
  const pendingMedication = (day?.medications ?? [])
    .filter((m) => !m.givenAt)
    .sort((a, b) => (a.scheduledTime ?? '99:99').localeCompare(b.scheduledTime ?? '99:99'))
  const nextMedicationTime = pendingMedication.find((m) => m.scheduledTime)?.scheduledTime ?? null

  /*
   * درخواست‌هایی که خانواده اعلام کرده ولی شیشه دارو هنوز به مهد نرسیده
   * — ارتقای ۳ سند بررسی طراحی.
   *
   * این‌ها یادآور نیستند، چون چیزی برای خوراندن وجود ندارد. جدا و بالاتر
   * می‌نشینند تا مربی صبح که خانواده دم در است بداند چه بخواهد.
   */
  const awaitingHandover = (day?.medicationRequests ?? []).filter((r) => !r.receivedAt)

  return (
    <div className={styles.page}>
      {/*
        نشان همگام‌سازی اینجا می‌ماند و به نوار مشترک نمی‌رود: چیزی که
        می‌گوید «همین شبکه زنده است یا نه»، باید کنار همان شبکه باشد.
      */}
      <div className={styles.syncRow}>
        <SyncBadge pending={pending} live={liveStatus.state} />
      </div>

      {/*
        بخش ۴ سند تازه: سرصفحه می‌گوید الان کدام بازه است و چند کودک در
        همین بازه‌اند. بدون این، مربی نمی‌فهمد چرا شبکه ساعت ۱۳ عوض شد.
        در مرز دو بازه هر دو نام می‌آید، چون واقعاً هر دو گروه با هم‌اند.
      */}
      <div className={styles.periodBar}>
        <span className={`${styles.periodName} t-body-lg`}>{periodLabel}</span>
        {extraPeriods > 0 ? (
          <button
            type="button"
            className={`${styles.periodMore} t-caption`}
            onClick={() => setPeriodsOpen((open) => !open)}
            aria-expanded={periodsOpen}
          >
            +{formatCount(extraPeriods)} شیفت
          </button>
        ) : null}
        <span className={`${styles.periodCount} t-caption`}>
          {formatCount(inSession.length)} کودک در این بازه
        </span>
        {day ? (
          <span className={`${styles.periodStaff} t-caption`}>
            {formatCount(day.ratio.staff)} مربی سر کار
          </span>
        ) : null}
      </div>

      {periodsOpen && day ? (
        <ul className={styles.periodList}>
          {day.currentPeriods.map((period) => (
            <li key={period.id} className={`${styles.periodItem} t-body`}>
              <b>{period.title}</b>
              <span className="tabular">
                {formatClock(period.startTime)} تا {formatClock(period.endTime)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {/*
        تصمیم ۰۳: بنر موقت پنجره انتقال.
        پنج ثانیه می‌ماند. منبع حقیقت عنوان بخش پایین شبکه است، نه این
        بنر؛ کسی که ندیدش چیزی از دست نمی‌دهد. role=status تا صفحه‌خوان
        یک بار بخواندش.
      */}
      {banner ? (
        <p className={`${styles.transitionBanner} t-body`} role="status" aria-live="polite">
          کودکان بازه {banner} به شبکه اضافه شدند
        </p>
      ) : null}

      {/*
        بخش ۷ سند تازه: نسبت مربی به کودک در همین لحظه. مرز دو بازه
        بحرانی‌ترین نقطه روز است چون هر دو گروه با هم‌اند و مربی صبح
        هنوز نرفته یا رفته.
      */}
      {day?.ratio.breached ? (
        <div className={styles.ratioWarning}>
          <span aria-hidden>
            <AlertIcon size={18} />
          </span>
          <span className="t-body">
            {formatCount(day.ratio.children)} کودک با {formatCount(day.ratio.staff)} مربی.
            حد مجاز {formatCount(day.ratio.maxAllowed)} کودک برای هر مربی است.
          </span>
        </div>
      ) : null}

      <div className={styles.tally}>
        <StatusChip tone="mint">{formatCount(counts.present)} حاضر</StatusChip>
        <StatusChip tone="neutral">
          {formatCount(counts.absenceDeclared)} غیبت اعلام‌شده
        </StatusChip>
        {/*
          بخش ۵.۳: فهرست غایبان بی‌خبر. مهلت هر کودک از آغاز بازه خودش
          شمرده می‌شود، نه از ساعت ثابت ۹، وگرنه کودک بعدازظهری صبح
          بی‌خبر به نظر می‌رسید. تراشه لمسی است و فهرست را باز می‌کند.
        */}
        <button
          type="button"
          className={styles.tallyAction}
          onClick={() => setShowOutstanding((open) => !open)}
          disabled={counts.outstanding === 0}
          aria-expanded={showOutstanding}
        >
          <StatusChip
            tone={counts.unaccounted > 0 ? 'brick' : 'neutral'}
            icon={counts.unaccounted > 0 ? <AlertIcon size={14} /> : undefined}
          >
            {counts.unaccounted > 0
              ? `${formatCount(counts.unaccounted)} بی‌خبر`
              : `${formatCount(counts.notArrived)} نیامده`}
          </StatusChip>
        </button>
      </div>

      {showOutstanding && outstandingNames.length > 0 ? (
        <div className={styles.outstanding}>
          <span className={`${styles.outstandingLabel} t-caption`}>
            {counts.unaccounted > 0 ? 'بدون اطلاع نیامده‌اند' : 'هنوز نیامده‌اند'}
          </span>
          <span className={`${styles.outstandingNames} t-body-lg`}>
            {outstandingNames.join(' · ')}
          </span>
        </div>
      ) : null}

      {/*
        بنر «امروز فرق دارد» برداشته شد — و دو دلیل داشت.
        بخش ۵.۸ همچنان برقرار است؛ فقط جایش عوض شد.

        یک: با بیست کودک، این بنر نیمی از صفحه می‌شد و مربی صبح شلوغ
        از رویش رد می‌شد — یعنی دقیقاً همان چیزی که قرار بود جلویش را
        بگیرد.

        دو: نامِ کودک از کودکانِ **بازه جاری** خوانده می‌شد، پس اعلامِ
        کودک صبحانه‌ای در بعدازظهر «—» نشان می‌داد. یک باگ واقعی که
        همین شلوغی پنهانش کرده بود.

        حالا نشانِ کوچک روی کارت خودِ کودک می‌نشیند و متن کامل در شیت
        تحویل می‌آید — همان لحظه‌ای که مربی واقعاً تصمیم می‌گیرد.
      */}
      {/*
        بخش ۵.۳: یادآور دارو باید بگوید چه ساعتی، نه فقط چند تا. نزدیک‌ترین
        ساعت روی خود نوار می‌آید و بقیه با یک ضربه باز می‌شوند؛ مربی وسط
        صبح وقت خواندن فهرست ندارد ولی باید بداند ساعت بعدی کی است.
      */}
      {/*
        ارتقای ۳: اعلام خانواده، پیش از تحویل گرفتن.
        «داده شد» اینجا اصلاً وجود ندارد — والد می‌تواند فرم را پر کند و
        شیشه دارو را در خانه جا بگذارد.
      */}
      {awaitingHandover.length > 0 ? (
        <section className={styles.handover} aria-label="داروهای اعلام‌شده از خانه">
          <p className={`${styles.handoverHead} t-body`}>
            {formatCount(awaitingHandover.length)} دارو از خانه اعلام شده، هنوز تحویل نگرفته‌ایم
          </p>
          <ul className={styles.handoverList}>
            {awaitingHandover.map((request) => {
              const child = day?.children.find((c) => c.id === request.childId)
              return (
                <li key={request.id} className={styles.handoverItem}>
                  <span className={styles.handoverWho}>
                    <span className={styles.medicationChild}>{child?.firstName ?? '—'}</span>
                    <span className={`${styles.medicationName} t-body`}>
                      {request.name} · {request.dose}
                    </span>
                    <span className={styles.medicationTime}>
                      {request.times.map((t) => formatClock(t)).join('، ')}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={`${styles.handoverTake} t-caption`}
                    onClick={() => {
                      void queue
                        .submit('text', () => data.receiveMedication(request.id, date))
                        .then(() => reload('medication'))
                        .catch((cause: unknown) => setError(messageOf(cause)))
                    }}
                  >
                    تحویل گرفتم
                  </button>
                </li>
              )
            })}
          </ul>
          <p className={`${styles.handoverWhy} t-caption`}>
            تا تحویل نگرفتن، ثبت مصرف ممکن نیست.
          </p>
        </section>
      ) : null}

      {pendingMedication.length > 0 ? (
        <div className={styles.medication}>
          <button
            type="button"
            className={styles.medicationBar}
            aria-expanded={medsOpen}
            onClick={() => setMedsOpen((open) => !open)}
          >
            <span className={styles.medicationIcon} aria-hidden>
              <PillIcon size={20} />
            </span>
            <span className="t-body-lg">
              {formatCount(pendingMedication.length)} دارو هنوز داده نشده
              {nextMedicationTime ? ` · نزدیک‌ترین ${formatClock(nextMedicationTime)}` : ''}
            </span>
            <span className={`${styles.medicationMore} t-caption`}>
              {medsOpen ? 'بستن' : 'جزئیات'}
            </span>
          </button>

          {medsOpen ? (
            <ul className={styles.medicationList}>
              {pendingMedication.map((med) => {
                const child = day?.children.find((c) => c.id === med.childId)
                return (
                  <li key={med.id} className={styles.medicationItem}>
                    <span className={styles.medicationChild}>{child?.firstName ?? '—'}</span>
                    <span className={`${styles.medicationName} t-body`}>
                      {med.name}
                      {med.dose ? ` · ${med.dose}` : ''}
                    </span>
                    <span className={styles.medicationTime}>
                      {med.scheduledTime ? formatClock(med.scheduledTime) : 'بدون ساعت'}
                    </span>
                    <button
                      type="button"
                      className={`${styles.medicationDone} t-caption`}
                      onClick={() => {
                        void queue
                          .submit('text', () => data.markMedicationGiven(med.id))
                          .then(() => reload('medication'))
                          .catch((cause: unknown) => setError(messageOf(cause)))
                      }}
                    >
                      داده شد
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className={styles.banner}>
          <span className={`${styles.bannerText} t-body-lg`}>{error}</span>
        </div>
      ) : null}

      {/*
        بخش ۵.۳: ورود با یک ضربه ثبت شد؛ این تراشه فقط راه تغییرش را باز
        نگه می‌دارد. چهار ثانیه می‌ماند و خودش می‌رود.
      */}
      {justIn ? (
        <button
          type="button"
          className={`${styles.justIn} t-body`}
          onClick={() => openArrivalSheet(justIn.childId)}
        >
          <CheckIcon />
          <span>{justIn.name ? `ورود با ${justIn.name}` : 'ورود ثبت شد'}</span>
          <span className={styles.justInChange}>تغییر</span>
        </button>
      ) : null}

      {/*
        تولدهای پیشِ رو — **بیرون** از شاخهٔ شبکه.

        اول داخلش گذاشته شد و بیرون از ساعتِ بازه ناپدید می‌شد: همان
        ساعتی که مربی می‌نشیند و برای فردا برنامه می‌چیند. تولد به
        بازهٔ حضور ربطی ندارد.
      */}
      <BirthdayCard />

      <div className={styles.grid}>
        {day && day.children.length === 0 ? (
          <EmptyState
            text={
              day.currentPeriods.length === 0
                ? 'الان بازه‌ای باز نیست. شبکه با شروع بازه بعدی پر می‌شود.'
                : `در بازه ${periodLabel} کودکی نیست.`
            }
          />
        ) : (
          <>
            {counts.present === 0 && counts.unaccounted === 0 && items.length > 0 ? (
              <EmptyState text="هنوز کسی وارد نشده. با ضربه روی عکس هر کودک، ورودش را ثبت کنید." />
            ) : null}

            <ChildGrid items={items} onSelect={openChild} onHold={openArrivalSheet} />

            {/*
              تصمیم ۰۳: کودکان بازه بعد، جدا و کم‌رنگ.
              عنوان این بخش منبع حقیقت است؛ بنر بالای صفحه فقط تقویتش
              می‌کند و می‌رود.
            */}
            {upcoming.length > 0 && day?.upcomingPeriod ? (
              <section className={styles.phaseGroup} aria-label="کودکان بازه بعد">
                <h2 className={`${styles.phaseTitle} t-caption`}>
                  ورودی‌های بازه {day.upcomingPeriod.title}
                </h2>
                <div className={styles.phaseDim}>
                  <ChildGrid
                    items={upcomingItems}
                    onSelect={openChild}
                    onHold={openArrivalSheet}
                  />
                </div>
              </section>
            ) : null}

            {departing.length > 0 ? (
              <section className={styles.phaseGroup} aria-label="کودکان بازه پیش">
                <h2 className={`${styles.phaseTitle} t-caption`}>
                  رفته‌های بازه {departing[0]?.periods.at(-1)?.title ?? 'پیشین'}
                </h2>
                <div className={styles.phaseDim}>
                  <ChildGrid
                    items={departingItems}
                    onSelect={openChild}
                    onHold={openArrivalSheet}
                  />
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>

      {/*
        بخش ۴ سند تازه: کودکی که امروز روزش نیست از شبکه بیرون است، ولی
        اگر استثنائاً آمد باید بشود افزودش. این تنها راه افزودن است و
        عمداً یک لایه پایین‌تر نشسته تا مسیر روزمره را شلوغ نکند.
      */}
      {offDay.length > 0 ? (
        <div className={styles.offDay}>
          <button
            type="button"
            className={`${styles.offDayBar} t-body`}
            aria-expanded={offDayOpen}
            onClick={() => setOffDayOpen((open) => !open)}
          >
            <span>{formatCount(offDay.length)} کودک امروز روزشان نیست</span>
            <span className={`${styles.offDayMore} t-caption`}>
              {offDayOpen ? 'بستن' : 'اگر استثنا آمد'}
            </span>
          </button>

          {offDayOpen ? (
            <ul className={styles.offDayList}>
              {offDay.map((child) => (
                <li key={child.id} className={styles.offDayItem}>
                  <span className="t-body-lg">
                    {child.firstName} {child.lastName}
                  </span>
                  <button
                    type="button"
                    className={`${styles.offDayAdd} t-caption`}
                    onClick={() => {
                      void queue
                        .submit('text', () => data.addChildToday(child.id, date))
                        .then(() => reload('session_extra'))
                        .catch((cause: unknown) => setError(messageOf(cause)))
                    }}
                  >
                    افزودن به فهرست امروز
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <p className={`${styles.footerNote} t-caption`}>
        ضربه: ورود یا خروج · نگه‌داشتن: آورنده، حال کودک، دارو
      </p>

      {/*
        بخش ۵.۹: ساعت ۱۶:۳۰ صفحه بستن روز. پیش از آن هم در دسترس است،
        چون مربی ممکن است زودتر کارش تمام شود، ولی جای کنش اصلی را
        نمی‌گیرد.
      */}
      <button type="button" className={styles.closeDay} onClick={onCloseDay}>
        بستن روز
      </button>

      {/*
        بخش ۱۳.۱: «دکمه شناور ثابت: ثبت رویداد (در همه تب‌ها)». آجری است
        چون بخش ۱۲.۲ آجر را برای ایمنی و رویداد نگه داشته، و این تنها
        جایی است در پنل مربی که آجر معنا دارد.
      */}
      {/* کنش اصلی این صفحه، طبق وایرفریم بخش ۱۳.۱ */}
      <QuickAction
        onClick={onOpenBulk}
        aside={
          <>
            {/*
              خلاصه ثبت روز، درست بالای دکمه ثبت گروهی.
              می‌گوید چقدر از گزارش امروز مانده — تنها عددی که مربی پیش
              از زدن آن دکمه لازم دارد. سه عدد، نه بیشتر: ردیفی که
              بشکند، خوانده نمی‌شود.
            */}
            <span className={styles.daySummary}>
              <span className={`${styles.sumItem} t-caption`}>
                <span className="tabular">{formatCount(counts.present)}</span> حاضر
              </span>
              <span className={`${styles.sumItem} t-caption`}>
                <span className={styles.sumIcon} aria-hidden>
                  <SpoonIcon size={13} />
                </span>
                <span className="tabular">{formatCount(loggedLunch)}</span> غذا
              </span>
              <span className={`${styles.sumItem} t-caption`}>
                <span className={styles.sumIcon} aria-hidden>
                  <MoonIcon size={13} />
                </span>
                <span className="tabular">{formatCount(loggedNap)}</span> استراحت
              </span>
            </span>

            <button type="button" className={fab.fab} onClick={() => setIncidentOpen(true)}>
            <span className={fab.fabIcon} aria-hidden>
              <AlertIcon size={20} />
            </span>
            ثبت رویداد
            </button>
          </>
        }
      >
        ثبت گروهی امروز
      </QuickAction>

      {incidentOpen ? (
        <IncidentSheet children={day?.children ?? []} onClose={() => setIncidentOpen(false)} />
      ) : null}

      {checkOutFor && checkOutChild ? (
        <CheckOutSheet
          child={checkOutChild}
          attendance={attendance.get(checkOutFor) ?? null}
          plan={
            plans.find((p) => p.childId === checkOutFor && p.direction === 'pickup') ?? null
          }
          onClose={() => setCheckOutFor(null)}
          onDone={() => void reload('attendance')}
        />
      ) : null}

      {sheetFor && sheetChild ? (
        <ArrivalSheet
          child={sheetChild}
          existing={attendance.get(sheetFor) ?? null}
          onClose={() => setSheetFor(null)}
          onSubmit={submitSheet}
        />
      ) : null}
    </div>
  )
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'داده امروز خوانده نشد.'
}
