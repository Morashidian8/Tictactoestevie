import { useCallback, useEffect, useState } from 'react'
import { AlertIcon, BottomSheet, EmptyState } from '../../design-system/index.ts'
import {
  formatCount,
  formatJalali,
  formatTime,
  formatRial,
  jalaliYearMonth,
  toIsoDate,
  toPersianDigits,
} from '../../i18n/index.ts'
import { useData } from '../../core/auth/index.ts'
import { BirthdayCard } from '../shared/BirthdayCard.tsx'
import type {
  AuditReadiness,
  Child,
  FinanceOverview,
  PendingLeave,
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

const LEAVE_KIND_TEXT: Record<string, string> = {
  personal: 'شخصی',
  sick: 'بیماری',
  family: 'خانوادگی',
  other: 'سایر',
}

const LOCATION_TEXT: Record<string, string> = {
  classroom: 'کلاس',
  yard: 'حیاط',
  kitchen: 'آشپزخانه',
  restroom: 'سرویس',
  stairs: 'پله',
  other: 'جای دیگر',
}

export function DashboardPage({ onGo, onCounts, onOpenStaff }: {
  onGo: (page: ManagerPage) => void
  /** رفتن مستقیم به پرونده یک مربی، بی گذر از فهرست کارکنان. */
  onOpenStaff?: (staffId: string) => void
  /**
   * نشان‌های نوار پایین را به پوسته می‌دهد.
   *
   * داشبورد این دو عدد را برای خودش می‌خواند؛ خواندن دوباره‌شان در
   * پوسته یعنی دو درخواست برای یک حقیقت، که می‌توانند با هم نخوانند.
   */
  onCounts?: (counts: { claims: number; gaps: number }) => void
}) {
  const data = useData()
  const [board, setBoard] = useState<ManagerDashboard | null>(null)
  const [leave, setLeave] = useState<PendingLeave[]>([])
  const [onLeave, setOnLeave] = useState<{ staffId: string; fullName: string }[]>([])
  const [rejecting, setRejecting] = useState<PendingLeave | null>(null)
  const [error, setError] = useState<string | null>(null)
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
    // صف مرخصی جدا خوانده می‌شود: نبودش نباید کل داشبورد را خالی کند.
    try {
      setLeave(await data.listPendingLeave())
    } catch {
      setLeave([])
    }
    try {
      setOnLeave(await data.listStaffOnLeave(date))
    } catch {
      setOnLeave([])
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

  const claims = board?.pendingClaims ?? 0
  useEffect(() => {
    onCounts?.({ claims, gaps })
  }, [claims, gaps, onCounts])

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

  const decideLeave = async (requestId: string, approve: boolean, note?: string) => {
    setBusy(requestId)
    try {
      await data.decideLeave(requestId, approve, note)
      setRejecting(null)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={styles.page}>
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

        {/*
          صف مرخصی، زیر رویدادها و بالای شاخص‌ها.

          جایش عمدی است: رویداد کودک همیشه اولِ همه‌چیز می‌ماند (بخش
          ۱۳.۳)، ولی مرخصیِ فردا پیش از آمارِ امروز تصمیم می‌خواهد —
          مدیری که صبح شیفت را می‌چیند باید بداند چند نفر کم دارد.

          «نزدیک‌ترین روزِ شروع اول» است نه «تازه‌ترین درخواست»: مرخصیِ
          فردا از مرخصیِ ماه بعد فوری‌تر است، هرچند دیرتر ثبت شده باشد.
        */}
        {leave.length > 0 ? (
          <section className={styles.queue} aria-label="درخواست‌های مرخصی">
            <p className={`${styles.queueHead} t-body-lg`}>
              {formatCount(leave.length)} درخواست مرخصی
            </p>
            {leave.map((row) => (
              <article key={row.id} className={styles.incident}>
                <p className={`${styles.incidentTop} t-body`}>
                  <b>{row.fullName}</b>
                  <span>
                    {formatJalali(new Date(row.starts), 'short')}
                    {row.days > 1 ? ` تا ${formatJalali(new Date(row.ends), 'short')}` : ''}
                  </span>
                  <span>{formatCount(row.days)} روز</span>
                </p>
                <p className={`${styles.incidentKind} t-body`}>
                  {LEAVE_KIND_TEXT[row.kind] ?? row.kind}
                </p>
                {row.reason ? (
                  <blockquote className={`${styles.incidentText} t-body`}>{row.reason}</blockquote>
                ) : null}
                <div className={styles.decisions}>
                  <button
                    type="button"
                    className={`${styles.decide} ${styles.decidePrimary} t-body`}
                    disabled={busy === row.id}
                    onClick={() => void decideLeave(row.id, true)}
                  >
                    تأیید
                  </button>
                  {/*
                    رد، شیت باز می‌کند نه ثبتِ مستقیم: دلیل لازم است و
                    مربی‌ای که بی دلیل «نه» می‌شنود، دفعه بعد اصلاً
                    درخواست نمی‌دهد و همان روز غیبت می‌کند.
                  */}
                  <button
                    type="button"
                    className={`${styles.decide} t-body`}
                    disabled={busy === row.id}
                    onClick={() => setRejecting(row)}
                  >
                    رد با دلیل
                  </button>
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
                      {formatRial(finance.collected)}
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
                      از {formatRial(finance.issued)} صادرشده
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
                  {/*
                    ویرگول فارسی، نه «·».
                    نقطه‌چین میان دو رقم، «۰» خوانده می‌شود: «۶ واکسن ·
                    ۳ کد ملی» روی گوشی «۶ واکسن ۳۰ کد ملی» دیده می‌شد.
                  */}
                  <span className={`${styles.complianceText} t-caption`}>
                    {formatCount(ready.incompleteVaccination)} واکسن،{' '}
                    {formatCount(ready.missingNationalId)} کد ملی،{' '}
                    {formatCount(ready.expiringHealthCards)} کارت بهداشت
                  </span>
                </span>
                <span className={`${styles.complianceGo} t-caption`}>بررسی</span>
              </button>
            ) : null}

            {/*
              تولدهای پیشِ رو، بالای پراکندگی سنی.

              هر دو دربارهٔ سن‌اند، ولی این یکی کاری است که همین هفته
              باید انجام شود و آن یکی یک آمار. کارِ نزدیک‌تر، بالاتر.
            */}
            <BirthdayCard />

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

            {/*
              وضعیت ثبت، با نامِ مربیِ شیفت زیر هر کلاس.

              مدیری که می‌بیند «گل‌ها: ۳ از ۸ کامل»، سؤال بعدی‌اش «چه
              کسی امروز گل‌هاست؟» است. تا امروز جواب سه ضربه دورتر بود —
              بیشتر، کارکنان، گشتن در فهرست. حالا خودِ نام اینجاست و یک
              ضربه پرونده‌اش را باز می‌کند.

              نام، کنار عددِ ثبت می‌نشیند ولی به آن **چسبیده نیست**:
              «۳ از ۸» کارِ کلاس است نه کارنامه آن مربی، و خط قرمز ۱۰
              می‌گوید هیچ عددی به نام یک مربی وصل نمی‌شود.
            */}
            {/*
              مرخصی‌های امروز، کنارِ وضعیت ثبت.

              بی این، تأیید مرخصی فقط یک ردیف در پایگاه داده است که
              هیچ‌جا دیده نمی‌شود — و مدیری که صبح شیفت را می‌چیند هنوز
              نمی‌داند چه کسی نیست.
            */}
            {onLeave.length > 0 ? (
              <section className={styles.card} aria-label="مرخصی امروز">
                <span className={`${styles.cardLabel} t-caption`}>امروز مرخصی‌اند</span>
                {onLeave.map((person) => (
                  <p key={person.staffId} className={`${styles.row} t-body`}>
                    <span>{person.fullName}</span>
                    <button
                      type="button"
                      className={`${styles.staffLink} t-caption`}
                      onClick={() => onOpenStaff?.(person.staffId)}
                    >
                      پرونده
                    </button>
                  </p>
                ))}
              </section>
            ) : null}

            <section className={styles.card} aria-label="وضعیت ثبت کلاس‌ها">
              <span className={`${styles.cardLabel} t-caption`}>وضعیت ثبت</span>
              {board.classes.map((room) => (
                <div key={room.classId}>
                  <p className={`${styles.row} t-body`}>
                    <span>{room.name}</span>
                    <span className={room.complete === room.total ? styles.ok : styles.partial}>
                      {room.sent
                        ? 'فرستاده شد'
                        : `${toPersianDigits(room.complete)} از ${toPersianDigits(room.total)} کامل`}
                    </span>
                  </p>
                  {room.ratio.onDuty.length > 0 ? (
                    <p className={styles.onDuty}>
                      {room.ratio.onDuty.map((person) => (
                        <button
                          key={person.staffId}
                          type="button"
                          className={`${styles.staffLink} t-caption`}
                          onClick={() => onOpenStaff?.(person.staffId)}
                        >
                          {person.fullName}
                        </button>
                      ))}
                    </p>
                  ) : null}
                </div>
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

      {rejecting ? (
        <RejectLeaveSheet
          request={rejecting}
          busy={busy === rejecting.id}
          onClose={() => setRejecting(null)}
          onDone={(note) => void decideLeave(rejecting.id, false, note)}
        />
      ) : null}
    </div>
  )
}

/* ── شیت رد مرخصی ───────────────────────────────────────────── */

/**
 * رد، دلیل می‌خواهد — و دلیل، شیت می‌خواهد.
 *
 * ردِ یک‌ضربه‌ای بی متن، مربی را با «نه»ی بی‌توضیح تنها می‌گذارد؛ دفعه
 * بعد اصلاً درخواست نمی‌دهد و همان روز غیبت می‌کند. پس دکمه ثبت تا
 * وقتی چیزی نوشته نشده کار نمی‌کند.
 */
function RejectLeaveSheet({ request, busy, onClose, onDone }: {
  request: PendingLeave
  busy: boolean
  onClose: () => void
  onDone: (note: string) => void
}) {
  const [note, setNote] = useState('')

  return (
    <BottomSheet
      title={`رد مرخصی ${request.fullName}`}
      onClose={onClose}
      footer={
        <button
          type="button"
          className={`${styles.decide} ${styles.decidePrimary} t-body-lg`}
          disabled={busy || note.trim() === ''}
          onClick={() => onDone(note)}
        >
          ثبت رد
        </button>
      }
    >
      <p className={`${styles.incidentKind} t-body`}>
        {formatJalali(new Date(request.starts), 'short')}
        {request.days > 1 ? ` تا ${formatJalali(new Date(request.ends), 'short')}` : ''}
      </p>
      <label className={`${styles.rejectField} t-caption`}>
        چرا نمی‌شود؟ مربی همین را می‌بیند.
        <textarea
          className={styles.rejectText}
          rows={3}
          value={note}
          aria-label="دلیل رد مرخصی"
          onChange={(event) => setNote(event.target.value)}
          autoFocus
        />
      </label>
    </BottomSheet>
  )
}

