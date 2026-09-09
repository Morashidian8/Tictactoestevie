import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertIcon,
  ChildGrid,
  EmptyState,
  PillIcon,
  QuickAction,
  StatusChip,
  SyncBadge,
  type ChildGridItem,
} from '../../design-system/index.ts'
import { formatCount, formatJalali, formatTime, toIsoDate } from '../../i18n/index.ts'
import { ROLE_LABEL, useAuth, useData } from '../../core/auth/index.ts'
import {
  indexAbsences,
  indexAttendance,
  resolveState,
  tally,
  type ClassDay,
  type ClassRoom,
} from '../../core/data/index.ts'
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
export function TodayPage() {
  const data = useData()
  const { queue, session, signOut, selectAccount } = useAuth()

  const [classes, setClasses] = useState<ClassRoom[]>([])
  const [classId, setClassId] = useState<string | null>(null)
  const [day, setDay] = useState<ClassDay | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)

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
      setDay(await data.getClassDay(classId, date))
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
            state === 'present' || state === 'left'
              ? `${child.firstName}، گزینه‌ها`
              : `ثبت ورود ${child.firstName}`,
        }
      }),
    [day, attendance, absences, now],
  )

  const checkIn = (childId: string) => {
    const state = resolveState(childId, attendance, absences, now)
    // کودکی که وارد شده، ضربه دوم دوباره ثبتش نمی‌کند. خروج مسیر جداگانه
    // دارد که این جلسه ساخته نشده.
    if (state === 'present' || state === 'left') return

    void queue
      .submit('text', () => data.checkIn({ childId, at: new Date() }))
      .then(() => load())
      .catch((cause: unknown) => setError(messageOf(cause)))
  }

  const pendingMedication = (day?.medications ?? []).filter((m) => !m.givenAt)
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
        <StatusChip
          tone={counts.isAfterNine && counts.outstanding > 0 ? 'brick' : 'neutral'}
          icon={counts.isAfterNine && counts.outstanding > 0 ? <AlertIcon size={14} /> : undefined}
        >
          {formatCount(counts.outstanding)} {counts.isAfterNine ? 'بی‌خبر' : 'نیامده'}
        </StatusChip>
      </div>

      {/* بخش ۵.۳: ساعت ۹:۰۰ فهرست غایبان بی‌خبر نشان داده می‌شود. */}
      {counts.isAfterNine && counts.outstanding > 0 ? (
        <div className={styles.banner}>
          <span className={styles.bannerIcon} aria-hidden>
            <AlertIcon size={20} />
          </span>
          <span className={`${styles.bannerText} t-body-lg`}>
            {formatCount(counts.outstanding)} کودک بدون اطلاع نیامده‌اند.
          </span>
        </div>
      ) : null}

      {pendingMedication.length > 0 ? (
        <div className={styles.medication}>
          <span className={styles.medicationIcon} aria-hidden>
            <PillIcon size={20} />
          </span>
          <span className="t-body-lg">
            {formatCount(pendingMedication.length)} دارو هنوز داده نشده.
          </span>
        </div>
      ) : null}

      {error ? (
        <div className={styles.banner}>
          <span className={`${styles.bannerText} t-body-lg`}>{error}</span>
        </div>
      ) : null}

      <div className={styles.grid}>
        {day && day.children.length === 0 ? (
          <EmptyState text="هنوز کودکی به این کلاس تخصیص نیافته است." />
        ) : counts.present === 0 && !counts.isAfterNine ? (
          <>
            <EmptyState text="هنوز کسی وارد نشده. با ضربه روی عکس هر کودک، ورودش را ثبت کنید." />
            <ChildGrid items={items} onSelect={checkIn} />
          </>
        ) : (
          <ChildGrid items={items} onSelect={checkIn} />
        )}
      </div>

      <p className={`${styles.footerNote} t-caption`}>
        ضربه: ثبت ورود · نگه‌داشتن: گزینه‌ها
      </p>

      {/*
        کنش اصلی این صفحه طبق وایرفریم بخش ۱۳.۱ «ثبت گروهی امروز» است.
        آن صفحه در دامنه این جلسه نبود، پس دکمه هست ولی غیرفعال است. جای
        کنش اصلی با چیز دیگری پر نمی‌شود، چون بخش ۱۲.۲ می‌گوید فیروزه‌ای
        فقط برای کنش اصلی هر صفحه است.
      */}
      <QuickAction onClick={() => undefined} disabled>
        ثبت گروهی امروز
      </QuickAction>
    </div>
  )
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'داده امروز خوانده نشد.'
}
