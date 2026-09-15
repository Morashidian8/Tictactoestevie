import { useCallback, useEffect, useState } from 'react'
import { AlertIcon, EmptyState, QuickAction } from '../../design-system/index.ts'
import {
  formatCount,
  formatJalali,
  formatTime,
  formatToman,
  jalaliYearMonth,
  toIsoDate,
  toPersianDigits,
} from '../../i18n/index.ts'
import { ROLE_LABEL, useAuth, useData } from '../../core/auth/index.ts'
import type {
  AuditReadiness,
  Child,
  FinanceOverview,
  IncidentDecision,
  ManagerDashboard,
} from '../../core/data/index.ts'
import { AgeDonut, type AgeBand } from './AgeDonut.tsx'
import { StatRing } from './StatRing.tsx'
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

  /*
   * آمادگی بازرسی — ارتقای ۲.
   *
   * مدیر باید هفته‌ها پیش از بازرسی بداند کجا لنگ است. عدد روی دکمه
   * بازرسی همان است: کارت واکسیناسیون ناقص، کد ملی ثبت‌نشده، و کارت
   * بهداشت نزدیک انقضا.
   */
  const [ready, setReady] = useState<AuditReadiness | null>(null)
  useEffect(() => {
    data
      .getAuditReadiness()
      .then(setReady)
      .catch(() => setReady(null))
  }, [data])
  const gaps = ready
    ? ready.incompleteVaccination + ready.missingNationalId + ready.expiringHealthCards
    : 0

  /*
   * وصولی ماه و پراکندگی سنی.
   *
   * هیچ‌کدام داده تازه‌ای لازم ندارند: مالی از قبل در پنل مالی خوانده
   * می‌شد و سن از تاریخ تولدی می‌آید که ستونش از مهاجرت ۰۰۰۳ در
   * پایگاه داده بود و فقط پرونده بازرسی می‌خواندش.
   */
  const [finance, setFinance] = useState<FinanceOverview | null>(null)
  const [roster, setRoster] = useState<Child[]>([])
  useEffect(() => {
    data
      .getFinance(jalaliYearMonth(new Date()))
      .then(setFinance)
      .catch(() => setFinance(null))
    data
      .listCenterChildren()
      .then(setRoster)
      .catch(() => setRoster([]))
  }, [data])

  /*
   * سه گروه سنی مهدکودک. مرزها از خودِ محصول می‌آیند، نه از داده:
   * گروه‌بندی بر اساس داده، هر ماه مرزها را جابه‌جا می‌کرد و نمودار
   * ماه پیش با این ماه قابل مقایسه نبود.
   *
   * کودکی که تاریخ تولد ندارد شمرده نمی‌شود، ولی گم هم نمی‌شود:
   * پرونده بازرسی همان را به عنوان شکاف فهرست می‌کند.
   */
  const ageBands: AgeBand[] = (() => {
    const now = new Date()
    const bands: AgeBand[] = [
      { id: 'b3', label: '۳ تا ۴ سال', count: 0 },
      { id: 'b4', label: '۴ تا ۵ سال', count: 0 },
      { id: 'b5', label: '۵ سال و بالاتر', count: 0 },
    ]
    for (const child of roster) {
      if (!child.birthDate) continue
      const born = new Date(child.birthDate)
      if (Number.isNaN(born.getTime())) continue
      let years = now.getFullYear() - born.getFullYear()
      const beforeBirthday =
        now.getMonth() < born.getMonth() ||
        (now.getMonth() === born.getMonth() && now.getDate() < born.getDate())
      if (beforeBirthday) years -= 1
      const slot = years <= 3 ? 0 : years === 4 ? 1 : 2
      const band = bands[slot]
      if (band) band.count += 1
    }
    return bands.filter((band) => band.count > 0)
  })()

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
        {/*
          سرصفحه سلام — بازطراحی.
          پیش‌تر فقط «مهد» بود. مدیر روزش را با این صفحه شروع می‌کند و
          سرصفحه باید بگوید امروز چه خبر است، نه اینکه کجاست.
        */}
        <span className={styles.greet}>
          <span className={`${styles.centerName} t-h2`}>صبح بخیر</span>
          <span className={`${styles.date} t-body-sm`}>
            {formatJalali(new Date(), 'weekday')} · اینجا خلاصه امروز مهد است
          </span>
        </span>
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
            {/*
              ردیف شاخص‌ها — بازطراحی.

              سه عدد خام جایش را به دو نسبت و یک شمار داد. «۱۸۸ از ۲۰۰»
              به مدیر نمی‌گفت امروز خوب است یا بد؛ «۹۴٪» می‌گوید. عدد
              خام هم سر جایش زیر حلقه می‌ماند.
            */}
            <section className={styles.hero} aria-label="شاخص‌های امروز">
              <StatRing value={board.present} total={board.enrolled} label="حضور امروز" />

              <div className={styles.heroSide}>
                {/*
                  ماهی که هنوز صورتحسابی ندارد، کارت وصولی هم ندارد.
                  «۰ از ۰ تومان» به مدیر چیزی نمی‌گوید و فقط جای یک
                  سنجه واقعی را می‌گیرد.
                */}
                {finance && finance.issued > 0 ? (
                  <div className={styles.metric}>
                    <span className={`${styles.metricLabel} t-caption`}>وصولی این ماه</span>
                    <span className={`${styles.metricValue} t-body-lg tabular`}>
                      {formatToman(finance.collected)}
                    </span>
                    {/*
                      نوار پیشرفت، نه نمودار: یک نسبت است و عددش کنارش
                      نوشته شده، پس نوار فقط جای آن عدد را روی محور
                      نشان می‌دهد.
                    */}
                    <span className={styles.barTrack} aria-hidden>
                      <span
                        className={styles.barFill}
                        style={{
                          inlineSize: `${
                            finance.issued > 0
                              ? Math.min(100, Math.round((finance.collected / finance.issued) * 100))
                              : 0
                          }%`,
                        }}
                      />
                    </span>
                    <span className={`${styles.metricFoot} t-caption tabular`}>
                      از {formatToman(finance.issued)} صادرشده
                    </span>
                  </div>
                ) : null}

                <div className={styles.metric}>
                  <span className={`${styles.metricLabel} t-caption`}>بی‌خبر</span>
                  <span
                    className={`${styles.metricValue} t-body-lg tabular ${
                      board.unaccounted.length > 0 ? styles.partial : styles.ok
                    }`}
                  >
                    {formatCount(board.unaccounted.length)} کودک
                  </span>
                  <span className={`${styles.metricFoot} t-caption`}>
                    در {formatCount(board.classes.length)} کلاس
                  </span>
                </div>
              </div>
            </section>

            {/*
              ارتقای ۲: آمادگی بازرسی، روی داشبورد نه پشت یک دکمه.
              روز بازرسی برای پر کردن پرونده دیر است.
            */}
            {ready && gaps > 0 ? (
              <button
                type="button"
                className={styles.compliance}
                onClick={() => onGo('audit')}
              >
                <span className={styles.complianceIcon} aria-hidden>
                  <AlertIcon size={20} />
                </span>
                <span className={styles.complianceBody}>
                  <span className={`${styles.complianceTitle} t-body-lg`}>
                    پرونده بازرسی: {formatCount(gaps)} مورد ناقص
                  </span>
                  <span className={`${styles.complianceText} t-caption`}>
                    {formatCount(ready.incompleteVaccination)} واکسن ·{' '}
                    {formatCount(ready.missingNationalId)} کد ملی ·{' '}
                    {formatCount(ready.expiringHealthCards)} کارت بهداشت
                  </span>
                </span>
                <span className={`${styles.complianceGo} t-caption`}>بررسی</span>
              </button>
            ) : null}

            {ageBands.length > 0 ? (
              <section className={styles.card} aria-label="پراکندگی سنی">
                <span className={`${styles.cardLabel} t-caption`}>پراکندگی سنی</span>
                <AgeDonut bands={ageBands} />
              </section>
            ) : null}

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

            {/*
              بخش ۷: نسبت مربی به کودک در همین لحظه.
              فقط کلاسی که از حد گذشته نشان داده می‌شود. نسبت سالم خبر
              نیست و جای خبر بد را می‌گیرد؛ مدیر باید در یک نگاه ببیند
              کجا کم آورده‌اند. بحرانی‌ترین لحظه مرز دو بازه است، وقتی
              هر دو گروه با هم‌اند و شیفت صبح دارد تمام می‌شود.
            */}
            {board.classes.some((room) => room.ratio.breached) ? (
              <section className={styles.alert} aria-label="نسبت مربی به کودک">
                <span className={`${styles.cardLabel} t-caption`}>نسبت مربی به کودک</span>
                {board.classes
                  .filter((room) => room.ratio.breached)
                  .map((room) => (
                    <p key={room.classId} className={`${styles.row} t-body`}>
                      <span>{room.name}</span>
                      <span className={styles.partial}>
                        {toPersianDigits(room.ratio.children)} کودک با{' '}
                        {toPersianDigits(room.ratio.staff)} مربی · حد{' '}
                        {toPersianDigits(room.ratio.maxAllowed)}
                      </span>
                    </p>
                  ))}
              </section>
            ) : null}

            {/*
              ارتقای ۴: سهمیه پیامک دو سطل جداست.
              یک عدد به مدیر نمی‌گفت که آیا فردا می‌تواند حادثه را خبر
              دهد یا نه؛ دو عدد می‌گوید. هشدار روی آستانه هشتاد درصد
              می‌آید (بخش ۱۵.۴)، نه روی عددی دلبخواه.
            */}
            <section className={styles.card} aria-label="سهمیه پیامک">
              <span className={`${styles.cardLabel} t-caption`}>سهمیه پیامک این ماه</span>
              {board.smsQuota.map((line) => (
                <p key={line.bucket} className={`${styles.row} t-body`}>
                  <span>{line.label}</span>
                  <span className={line.warn ? styles.partial : styles.ok}>
                    {toPersianDigits(line.remaining)} از {toPersianDigits(line.allocated)}
                  </span>
                </p>
              ))}
              <p className={`${styles.quotaWhy} t-caption`}>
                سطل رخداد حیاتی فقط برای کد تحویل، حادثه تأییدشده و هشدار دارویی
                است و با اطلاعیه خرج نمی‌شود.
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
            {/*
              ارتقای ۲: پرونده بازرسی.
              نشان عددی وقتی می‌آید که کاری هست — روز بازرسی دیر است.
            */}
            <button type="button" className={styles.navItem} onClick={() => onGo('audit')}>
              <FolderIcon />
              <span>بازرسی</span>
              {gaps > 0 ? <span className={styles.navBadge}>{formatCount(gaps)}</span> : null}
            </button>
          </div>
        }
      >
        اطلاع‌رسانی به خانواده‌ها
      </QuickAction>
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

/** پوشه پرونده. برای مدخل بازرسی — ارتقای ۲. */
function FolderIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h6a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <path d="M3 11h18" />
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
