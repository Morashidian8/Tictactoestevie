import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckIcon,
  AlertIcon,
  ChildGrid,
  EmptyState,
  PillIcon,
  QuickAction,
  StatusChip,
  SyncBadge,
  type ChildGridItem,
} from '../../design-system/index.ts'
import { formatClock, formatCount, formatJalali, formatTime, toIsoDate } from '../../i18n/index.ts'
import { ROLE_LABEL, useAuth, useData } from '../../core/auth/index.ts'
import type { PickupPlan } from '../../core/data/index.ts'
import {
  indexAbsences,
  indexAttendance,
  resolveState,
  tally,
  type ClassDay,
  type ClassRoom,
} from '../../core/data/index.ts'
import { ArrivalSheet, type ArrivalResult } from './ArrivalSheet.tsx'
import { CheckOutSheet } from './CheckOutSheet.tsx'
import { IncidentSheet } from './IncidentSheet.tsx'
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
  onOpenBulk,
  onCloseDay,
}: {
  onOpenBulk: () => void
  onCloseDay: () => void
}) {
  const data = useData()
  const { queue, session, signOut, selectAccount } = useAuth()

  const [classes, setClasses] = useState<ClassRoom[]>([])
  const [classId, setClassId] = useState<string | null>(null)
  const [day, setDay] = useState<ClassDay | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
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

  // ساعت جاری در حالت نگه داشته می‌شود چون مرز ۹:۰۰ ستون سوم نوار خلاصه
  // را عوض می‌کند و صفحه باید بدون نوسازی دستی رد شود.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => queue.subscribe((status) => setPending(status.pending)), [queue])

  useEffect(() => {
    let cancelled = false
    data
      .listClasses()
      .then((list) => {
        if (cancelled) return
        setClasses(list)
        setClassId((current) => current ?? list[0]?.id ?? null)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(messageOf(cause))
      })
    return () => {
      cancelled = true
    }
  }, [data])

  const date = toIsoDate(now)

  const load = useCallback(async () => {
    if (!classId) return
    try {
      const [classDay, todayPlans] = await Promise.all([
        data.getClassDay(classId, date),
        data.listPlans(classId, date),
      ])
      setDay(classDay)
      setPlans(todayPlans)
    } catch (cause) {
      setError(messageOf(cause))
    }
  }, [classId, data, date])

  useEffect(() => {
    void load()
  }, [load])

  const attendance = useMemo(() => indexAttendance(day?.attendance ?? []), [day])
  const absences = useMemo(() => indexAbsences(day?.absences ?? []), [day])

  const counts = useMemo(
    () => tally(day?.children.map((c) => c.id) ?? [], attendance, absences, now),
    [day, attendance, absences, now],
  )

  const items = useMemo<ChildGridItem[]>(
    () =>
      (day?.children ?? []).map((child) => {
        const state = resolveState(child.id, attendance, absences, now)
        const row = attendance.get(child.id)
        const checkIn = row?.checkInAt ? new Date(row.checkInAt) : null
        return {
          id: child.id,
          firstName: child.firstName,
          photoUrl: child.photoUrl,
          state,
          caption: checkIn ? formatTime(checkIn) : undefined,
          actionLabel:
            state === 'present'
              ? `ثبت خروج ${child.firstName}`
              : state === 'left'
                ? `${child.firstName}، رفته`
                : `ثبت ورود ${child.firstName}`,
        }
      }),
    [day, attendance, absences, now],
  )

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
    await load()
  }

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

  const openChild = (childId: string) => {
    const state = resolveState(childId, attendance, absences, now)
    if (state === 'left') return
    if (state === 'present') setCheckOutFor(childId)
    else void quickCheckIn(childId)
  }

  /** نگه‌داشتن انگشت: مستقیم شیت استثناها، بی‌آنکه اول ورودی ثبت شود. */
  const openArrivalSheet = (childId: string) => {
    const state = resolveState(childId, attendance, absences, now)
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
    await load()
  }

  const sheetChild = day?.children.find((c) => c.id === sheetFor) ?? null
  const checkOutChild = day?.children.find((c) => c.id === checkOutFor) ?? null

  const outstandingNames = (day?.children ?? [])
    .filter((child) => {
      const state = resolveState(child.id, attendance, absences, now)
      return state === 'notArrived' || state === 'unaccounted'
    })
    .map((child) => child.firstName)

  // مرتب بر اساس ساعت مصرف. داروی بی‌ساعت ته فهرست می‌رود، نه اولش.
  const pendingMedication = (day?.medications ?? [])
    .filter((m) => !m.givenAt)
    .sort((a, b) => (a.scheduledTime ?? '99:99').localeCompare(b.scheduledTime ?? '99:99'))
  const nextMedicationTime = pendingMedication.find((m) => m.scheduledTime)?.scheduledTime ?? null
  const activeClass = classes.find((c) => c.id === classId)

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerStart}>
          {classes.length > 1 ? (
            <button
              type="button"
              className={`${styles.classSwitch} t-body-lg`}
              onClick={() => {
                const index = classes.findIndex((c) => c.id === classId)
                setClassId(classes[(index + 1) % classes.length]!.id)
              }}
            >
              {activeClass?.name ?? '—'}
            </button>
          ) : (
            <span className={`${styles.className} t-body-lg`}>{activeClass?.name ?? '—'}</span>
          )}
        </div>

        <span className={`${styles.date} t-body-lg`}>{formatJalali(now, 'short')}</span>
        <SyncBadge pending={pending} />

        {/* بخش ۳.۲: جابه‌جایی بین حساب‌ها از منو، بدون خروج و ورود مجدد. */}
        <div className={styles.account}>
          <button
            type="button"
            className={`${styles.accountButton} t-caption`}
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
          >
            {session?.active ? ROLE_LABEL[session.active.role] : '—'}
          </button>

          {menuOpen && session?.active ? (
            <div className={styles.menu}>
              <p className={`${styles.menuName} t-caption`}>{session.active.displayName}</p>
              {session.accounts
                .filter((account) => account.id !== session.active!.id)
                .map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    className={`${styles.menuItem} t-body`}
                    onClick={() => {
                      setMenuOpen(false)
                      void selectAccount(account.id)
                    }}
                  >
                    رفتن به حساب {ROLE_LABEL[account.role]}
                  </button>
                ))}
              <button
                type="button"
                className={`${styles.menuItem} t-body`}
                onClick={() => void signOut()}
              >
                خروج
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <div className={styles.tally}>
        <StatusChip tone="turquoise">{formatCount(counts.present)} حاضر</StatusChip>
        <StatusChip tone="neutral">
          {formatCount(counts.absenceDeclared)} غیبت اعلام‌شده
        </StatusChip>
        {/*
          بخش ۵.۳: ساعت ۹:۰۰ فهرست غایبان بی‌خبر نشان داده می‌شود.
          پیش‌تر همین را یک بنر قرمز جداگانه هم می‌گفت؛ تکرار همان جمله
          بود و جای شبکه کودکان را می‌گرفت. حالا خودِ تراشه لمسی است و
          فهرست را باز می‌کند.
        */}
        <button
          type="button"
          className={styles.tallyAction}
          onClick={() => setShowOutstanding((open) => !open)}
          disabled={counts.outstanding === 0}
          aria-expanded={showOutstanding}
        >
          <StatusChip
            tone={counts.isAfterNine && counts.outstanding > 0 ? 'brick' : 'neutral'}
            icon={counts.isAfterNine && counts.outstanding > 0 ? <AlertIcon size={14} /> : undefined}
          >
            {formatCount(counts.outstanding)} {counts.isAfterNine ? 'بی‌خبر' : 'نیامده'}
          </StatusChip>
        </button>
      </div>

      {showOutstanding && outstandingNames.length > 0 ? (
        <div className={styles.outstanding}>
          <span className={`${styles.outstandingLabel} t-caption`}>
            {counts.isAfterNine ? 'بدون اطلاع نیامده‌اند' : 'هنوز نیامده‌اند'}
          </span>
          <span className={`${styles.outstandingNames} t-body-lg`}>
            {outstandingNames.join(' · ')}
          </span>
        </div>
      ) : null}

      {/*
        بخش ۵.۸: اعلام خانواده برای امروز. بالای شبکه می‌نشیند چون اگر
        مربی آن را ساعت چهار ببیند دیر است.
      */}
      {plans.length > 0 ? (
        <div className={styles.plans}>
          <span className={`${styles.plansLabel} t-caption`}>امروز فرق دارد</span>
          {plans.map((plan) => {
            const child = day?.children.find((c) => c.id === plan.childId)
            return (
              <p key={plan.id} className={`${styles.plan} t-body-lg`}>
                <b className={styles.planChild}>{child?.firstName ?? '—'}</b>
                <span>
                  {plan.direction === 'drop_off' ? 'را می‌آورد: ' : 'را می‌برد: '}
                  {plan.personName}
                </span>
                <span className={`${styles.planHow} t-caption`}>
                  {plan.code ? 'با کد تحویل' : 'در فهرست مجاز'}
                </span>
              </p>
            )
          })}
        </div>
      ) : null}

      {/*
        بخش ۵.۳: یادآور دارو باید بگوید چه ساعتی، نه فقط چند تا. نزدیک‌ترین
        ساعت روی خود نوار می‌آید و بقیه با یک ضربه باز می‌شوند؛ مربی وسط
        صبح وقت خواندن فهرست ندارد ولی باید بداند ساعت بعدی کی است.
      */}
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
                          .then(() => load())
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

      <div className={styles.grid}>
        {day && day.children.length === 0 ? (
          <EmptyState text="هنوز کودکی به این کلاس تخصیص نیافته است." />
        ) : counts.present === 0 && !counts.isAfterNine ? (
          <>
            <EmptyState text="هنوز کسی وارد نشده. با ضربه روی عکس هر کودک، ورودش را ثبت کنید." />
            <ChildGrid items={items} onSelect={openChild} onHold={openArrivalSheet} />
          </>
        ) : (
          <ChildGrid items={items} onSelect={openChild} onHold={openArrivalSheet} />
        )}
      </div>

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
          <button type="button" className={fab.fab} onClick={() => setIncidentOpen(true)}>
            <span className={fab.fabIcon} aria-hidden>
              <AlertIcon size={20} />
            </span>
            ثبت رویداد
          </button>
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
          onClose={() => setCheckOutFor(null)}
          onDone={() => void load()}
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
