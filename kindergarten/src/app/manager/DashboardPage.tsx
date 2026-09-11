import { useCallback, useEffect, useState } from 'react'
import { AlertIcon, EmptyState, QuickAction } from '../../design-system/index.ts'
import { formatCount, formatJalali, formatTime, toIsoDate, toPersianDigits } from '../../i18n/index.ts'
import { ROLE_LABEL, useAuth, useData } from '../../core/auth/index.ts'
import type { IncidentDecision, ManagerDashboard } from '../../core/data/index.ts'
import type { ManagerPage } from './ManagerApp.tsx'
import styles from './DashboardPage.module.css'

/**
 * داشبورد صبح مدیر — بخش ۱۳.۳.
 *
 * ترتیب از سند می‌آید و تصادفی نیست: «بنر رویداد همیشه بالاتر از
 * همه‌چیز». مدیر روز را با تصمیم درباره رویداد شروع می‌کند، نه با آمار.
 *
 * آنچه عمداً اینجا نیست: هیچ عددی درباره تک‌تک کودکان، و هیچ مقایسه‌ای
 * بین کلاس‌ها. «وضعیت ثبت مربی‌ها» شمار گزارش کامل است، نه نمره مربی.
 */
const DECISIONS: { value: IncidentDecision; label: string; tone: 'primary' | 'plain' }[] = [
  { value: 'send_to_family', label: 'ارسال به خانواده', tone: 'primary' },
  { value: 'call_then_send', label: 'تماس و سپس ارسال', tone: 'plain' },
  { value: 'archive', label: 'بایگانی بدون اطلاع', tone: 'plain' },
]

const INCIDENT_TEXT: Record<string, string> = {
  fall: 'زمین خوردن',
  conflict: 'درگیری',
  bite: 'گاز گرفتن',
  fever: 'تب',
  vomit: 'استفراغ',
  other: 'رویداد',
}

const LOCATION_TEXT: Record<string, string> = {
  classroom: 'کلاس',
  yard: 'حیاط',
  kitchen: 'آشپزخانه',
  restroom: 'سرویس',
  stairs: 'پله',
  other: 'جای دیگر',
}

export function DashboardPage({ onGo }: { onGo: (page: ManagerPage) => void }) {
  const data = useData()
  const { session, signOut } = useAuth()
  const [board, setBoard] = useState<ManagerDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const date = toIsoDate(new Date())

  const load = useCallback(async () => {
    try {
      setBoard(await data.getManagerDashboard(date))
      // خطای خواندن قبلی باید برود، وگرنه پس از جابه‌جایی حساب یک پیام
      // مرده زیر داده درست می‌ماند.
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'خوانده نشد.')
    }
  }, [data, date])

  useEffect(() => {
    void load()
  }, [load])

  const decide = async (incidentId: string, decision: IncidentDecision) => {
    setBusy(incidentId)
    try {
      await data.decideIncident(incidentId, decision)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={`${styles.centerName} t-h2`}>مهد</span>
        <span className={`${styles.date} t-body-sm`}>{formatJalali(new Date(), 'weekday')}</span>
        <div className={styles.accountWrap}>
          <button
            type="button"
            className={`${styles.account} t-caption`}
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
          >
            {session?.active ? ROLE_LABEL[session.active.role] : '—'}
          </button>
          {menuOpen ? (
            <div className={styles.menu}>
              <button type="button" className={styles.menuItem} onClick={() => void signOut()}>
                خروج
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <div className={styles.body}>
        {/* بنر رویداد همیشه بالاتر از همه‌چیز — بخش ۱۳.۳ */}
        {board && board.pendingIncidents.length > 0 ? (
          <section className={styles.queue} aria-label="رویدادهای در انتظار تأیید">
            <p className={`${styles.queueHead} t-body-lg`}>
              <AlertIcon size={20} />
              {formatCount(board.pendingIncidents.length)} رویداد در انتظار تأیید
            </p>

            {board.pendingIncidents.map((incident) => (
              <article key={incident.id} className={styles.incident}>
                <p className={`${styles.incidentTop} t-body`}>
                  <b>{incident.childName}</b>
                  <span>{formatTime(new Date(incident.occurredAt))}</span>
                  <span>{LOCATION_TEXT[incident.location] ?? incident.location}</span>
                </p>
                <p className={`${styles.incidentKind} t-body`}>
                  {INCIDENT_TEXT[incident.type] ?? 'رویداد'}
                  {incident.escalationReason ? ' · شدت خودکار بالا رفته' : ''}
                </p>
                {/*
                  متن مربی همان‌طور که نوشته شده. بند ۱۱.۹: متن اولیه
                  هرگز بازنویسی نمی‌شود، پس اینجا هم فقط خوانده می‌شود.
                */}
                <blockquote className={`${styles.incidentText} t-body`}>
                  {incident.description || '—'}
                </blockquote>

                <div className={styles.decisions}>
                  {DECISIONS.map((choice) => (
                    <button
                      key={choice.value}
                      type="button"
                      className={
                        choice.tone === 'primary'
                          ? `${styles.decide} ${styles.decidePrimary} t-body`
                          : `${styles.decide} t-body`
                      }
                      disabled={busy === incident.id}
                      onClick={() => void decide(incident.id, choice.value)}
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </section>
        ) : null}

        {board ? (
          <>
            <div className={styles.tiles}>
              <Tile big={`${toPersianDigits(board.present)}`} small={`از ${toPersianDigits(board.enrolled)} حاضر`} />
              <Tile
                big={toPersianDigits(board.unaccounted.length)}
                small="بی‌خبر"
                tone={board.unaccounted.length > 0 ? 'alert' : 'plain'}
              />
              <Tile big={toPersianDigits(board.classes.length)} small="کلاس" />
            </div>

            {board.unaccounted.length > 0 ? (
              <section className={styles.card} aria-label="کودکان بی‌خبر">
                <span className={`${styles.cardLabel} t-caption`}>بدون اطلاع نیامده‌اند</span>
                {/*
                  فهرست کوتاه می‌ماند. مدیر این کارت را برای زنگ زدن باز
                  می‌کند و شانزده سطر یعنی هیچ‌کدام خوانده نمی‌شوند؛ بقیه
                  با یک ضربه باز می‌شوند.
                */}
                {(showAll ? board.unaccounted : board.unaccounted.slice(0, 5)).map((row) => (
                  <p key={row.childId} className={`${styles.row} t-body`}>
                    <span>{row.name}</span>
                    {row.guardianPhone ? (
                      <a className={styles.phone} href={`tel:${row.guardianPhone}`}>
                        {toPersianDigits(row.guardianPhone)}
                      </a>
                    ) : (
                      <span className={`${styles.noPhone} t-caption`}>شماره ثبت نشده</span>
                    )}
                  </p>
                ))}
                {board.unaccounted.length > 5 ? (
                  <button
                    type="button"
                    className={styles.more}
                    onClick={() => setShowAll(!showAll)}
                  >
                    {showAll
                      ? 'بستن فهرست'
                      : `${formatCount(board.unaccounted.length - 5)} نفر دیگر`}
                  </button>
                ) : null}
              </section>
            ) : null}

            <section className={styles.card} aria-label="وضعیت ثبت کلاس‌ها">
              <span className={`${styles.cardLabel} t-caption`}>وضعیت ثبت</span>
              {board.classes.map((room) => (
                <p key={room.classId} className={`${styles.row} t-body`}>
                  <span>{room.name}</span>
                  <span className={room.complete === room.total ? styles.ok : styles.partial}>
                    {room.sent
                      ? 'فرستاده شد'
                      : `${toPersianDigits(room.complete)} از ${toPersianDigits(room.total)} کامل`}
                  </span>
                </p>
              ))}
            </section>

            <section className={styles.card} aria-label="سهمیه پیامک">
              <span className={`${styles.cardLabel} t-caption`}>سهمیه پیامک این ماه</span>
              <p className={`${styles.row} t-body`}>
                <span>باقی‌مانده</span>
                <span className={board.smsRemaining < 100 ? styles.partial : styles.ok}>
                  {toPersianDigits(board.smsRemaining)}
                </span>
              </p>
            </section>
          </>
        ) : (
          <EmptyState text="در حال خواندن…" />
        )}

        {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}
      </div>

      {/*
        سه مقصد پنل مدیر. «اطلاع‌رسانی» کنش اصلی است چون تنها کاری است
        که فوریت دارد؛ بقیه رفتن به صفحه‌اند، نه انجام دادن کاری.
      */}
      <QuickAction
        onClick={() => onGo('notice')}
        aside={
          <div className={styles.nav}>
            <button type="button" className={styles.navItem} onClick={() => onGo('finance')}>
              <WalletIcon />
              <span>مالی</span>
              {board && board.pendingClaims > 0 ? (
                <span className={styles.navBadge}>{formatCount(board.pendingClaims)}</span>
              ) : null}
            </button>
            <button type="button" className={styles.navItem} onClick={() => onGo('children')}>
              <PeopleIcon />
              <span>کودکان</span>
            </button>
          </div>
        }
      >
        اطلاع‌رسانی به خانواده‌ها
      </QuickAction>
    </div>
  )
}

function Tile({ big, small, tone }: { big: string; small: string; tone?: 'alert' | 'plain' }) {
  return (
    <div className={`${styles.tile} ${tone === 'alert' ? styles.tileAlert : ''}`}>
      <span className={styles.tileBig}>{big}</span>
      <span className={`${styles.tileSmall} t-caption`}>{small}</span>
    </div>
  )
}

/* آیکون‌های دو مقصد. غیرجهت‌دارند، پس قرینه نمی‌شوند — بخش ۱۲.۶. */
function WalletIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <path d="M3 10h18" />
      <circle cx="16.5" cy="14.5" r="1.2" />
    </svg>
  )
}

function PeopleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.6" />
      <path d="M17.5 19a5.4 5.4 0 0 0-2.2-4.3" />
    </svg>
  )
}
