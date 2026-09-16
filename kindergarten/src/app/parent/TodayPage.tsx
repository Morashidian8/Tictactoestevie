import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertIcon,
  AppShell,
  CheckIcon,
  ChevronIcon,
  ChildFace,
  CalendarIcon,
  ChatIcon,
  HomeIcon,
  ImageIcon,
  WalletIcon,
  MoreIcon,
  ShieldCheckIcon,
  TabBar,
  type TabItem,
} from '../../design-system/index.ts'
import { formatClock, formatCount, formatJalali, formatTime, toIsoDate } from '../../i18n/index.ts'
import { ROLE_LABEL, useAuth, useData } from '../../core/auth/index.ts'
import type {
  Child,
  MealAmount,
  MedicationRequest,
  Mood,
  ParentDay,
} from '../../core/data/index.ts'
import { DayTimeline, type DayStep } from './DayTimeline.tsx'
import { MorePage } from './MorePage.tsx'
import { TomorrowCard } from './TomorrowCard.tsx'
import styles from './TodayPage.module.css'

/**
 * صفحه «امروز» پنل والد — بخش ۶.۳ و ۱۳.۲ سند.
 *
 * ترتیب بخش‌ها ترتیب اهمیت است و تصادفی نیست: «عکس‌های امروز، بالای صفحه.
 * تنها چیزی است که والد واقعاً برایش می‌آید.»
 *
 * آنچه عمداً در این صفحه نیست: فهرست بلند فعالیت‌ها، درصد، نمودار، و
 * هرگونه مقایسه با سایر کودکان. بند ۱۰.۱ مقایسه در هر خروجی‌ای که به
 * خانواده می‌رود را ممنوع کرده، و بخش ۶.۳ همین را تکرار می‌کند.
 *
 * معیار موفقیت اینجا سرعت نیست، باز شدن روزانه است (بخش ۶.۱).
 */

const MEAL_TEXT: Record<MealAmount, string> = {
  all: 'همه‌اش را خورد',
  most: 'بیشترش را خورد',
  little: 'کمی خورد',
  none: 'چیزی نخورد',
}

/** همان چهار حالت، در دو کلمه — زیر یک نقطه خط زمان جا شود. */
const MEAL_SHORT: Record<MealAmount, string> = {
  all: 'همه',
  most: 'بیشتر',
  little: 'کمی',
  none: 'نخورد',
}

const MOOD_TEXT: Record<Mood, string> = {
  good: 'خوب',
  normal: 'عادی',
  restless: 'بی‌قرار',
  sad: 'گریان',
}

const INCIDENT_TEXT: Record<string, string> = {
  fall: 'زمین خوردن',
  conflict: 'درگیری',
  bite: 'گاز گرفتن',
  fever: 'تب',
  vomit: 'استفراغ',
  other: 'رویداد',
}

export function ParentTodayPage() {
  const data = useData()
  const { session, signOut } = useAuth()

  const [children, setChildren] = useState<Child[]>([])
  const [childId, setChildId] = useState<string | null>(null)
  const [day, setDay] = useState<ParentDay | null>(null)
  const [meds, setMeds] = useState<MedicationRequest[]>([])
  const [error, setError] = useState<string | null>(null)
  /**
   * مقصد نوار پایین.
   *
   * تا اینجا پنل والد یک صفحه بلند بود با دکمه «بیشتر» در انتها: هر
   * چیزی جز گزارش امروز، پشت یک اسکرول تا ته صفحه بود.
   */
  const [nav, setNav] = useState<'home' | 'tomorrow' | 'messages' | 'finance' | 'more'>(
    'home',
  )
  /** گزارش کامل روز، پشت کارت خلاصه. بسته می‌ماند تا والد بخواهد. */
  const [detailOpen, setDetailOpen] = useState(false)

  const date = useMemo(() => toIsoDate(new Date()), [])

  useEffect(() => {
    data
      .listMyChildren()
      .then((list) => {
        setChildren(list)
        setChildId((current) => current ?? list[0]?.id ?? null)
      })
      .catch((cause: unknown) => setError(messageOf(cause)))
  }, [data])

  const load = useCallback(async () => {
    if (!childId) return
    try {
      const [today, requests] = await Promise.all([
        data.getParentDay(childId, date),
        data.listMedicationRequests(childId, date),
      ])
      setDay(today)
      setMeds(requests)
    } catch (cause) {
      setError(messageOf(cause))
    }
  }, [childId, data, date])

  useEffect(() => {
    void load()
  }, [load])

  const toggleNeed = (needId: string, done: boolean) => {
    if (!childId) return
    void data
      .setNeedDone(childId, date, needId, done)
      .then(() => load())
      .catch((cause: unknown) => setError(messageOf(cause)))
  }

  const moods: [Mood | null, string][] = [
    [day?.moodMorning ?? null, 'صبح'],
    [day?.moodNoon ?? null, 'ظهر'],
    [day?.moodAfternoon ?? null, 'عصر'],
  ]
  const hasMood = moods.some(([mood]) => mood !== null)

  /*
   * دارویی که امروز هنوز لغو نشده.
   *
   * زنجیره سه حلقه دارد و رابط هر سه را جدا می‌گوید: اعلام شد، مهد
   * تحویل گرفت، خورده شد. یکی گرفتنشان همان اشتباهی است که ارتقای ۳
   * بست.
   */
  const activeMed = meds.find((med) => !med.cancelledAt) ?? null

  /*
   * خط زمان روز — فقط مرحله‌هایی که برای این کودک معنا دارند.
   *
   * کودک صبحانه‌ای ناهار ندارد و نباید یک نقطه خالیِ همیشگی ببیند، پس
   * هر مرحله تنها وقتی می‌آید که یا افتاده باشد یا برنامه‌اش باشد.
   */
  const steps: DayStep[] = []
  if (day) {
    steps.push({
      id: 'in',
      label: 'ورود',
      done: Boolean(day.checkInAt),
      value: day.checkInAt ? formatTime(new Date(day.checkInAt)) : null,
    })
    // ناهار و خواب ساعت ندارند، مقدار دارند. همان را می‌گویند.
    if (day.lunch) {
      steps.push({ id: 'lunch', label: 'ناهار', done: true, value: MEAL_SHORT[day.lunch] })
    }
    if (day.napMinutes !== null) {
      steps.push({
        id: 'nap',
        label: 'خواب',
        done: true,
        value: `${formatCount(day.napMinutes)} دقیقه`,
      })
    }
    if (activeMed) {
      steps.push({
        id: 'med',
        label: 'دارو',
        done: Boolean(activeMed.receivedAt),
        value: activeMed.times[0] ? formatClock(activeMed.times[0]) : null,
      })
    }
    steps.push({
      id: 'out',
      label: 'خروج',
      done: Boolean(day.checkOutAt),
      value: day.checkOutAt ? formatTime(new Date(day.checkOutAt)) : null,
    })
  }

  const NAV: TabItem[] = [
    { id: 'home', label: 'خانه', icon: <HomeIcon size={22} /> },
    { id: 'tomorrow', label: 'فردا', icon: <CalendarIcon size={22} /> },
    /*
      مالی در نوار پایین است، نه پشت «بیشتر».
      خانواده شهریه را ماهی یک‌بار می‌بیند ولی وقتی سررسید نزدیک است
      هر روز؛ اطلاعیه برعکس، خوانده می‌شود و تمام. پس مالی مقصد شد و
      اطلاعیه به فهرست «بیشتر» برگشت.
    */
    { id: 'finance', label: 'مالی', icon: <WalletIcon size={22} /> },
    { id: 'more', label: 'بیشتر', icon: <MoreIcon size={22} /> },
  ]
  const CENTER: TabItem = { id: 'messages', label: 'پیام به مربی', icon: <ChatIcon size={24} /> }

  /*
   * هر مقصدی جز خانه، همان صفحه «بیشتر» است با تب از پیش انتخاب‌شده.
   * نوار پایین زیرشان می‌ماند تا برگشتن یک ضربه باشد.
   *
   * شرط عمداً فقط childId است و نه day.
   *
   * پیش از این `day` هم در شرط بود و نتیجه‌اش این می‌شد: تا وقتی گزارش
   * روز نیامده — و پس از هر جابه‌جایی کودک دوباره نیامده — زدن روی
   * خانه‌های نوار هیچ کاری نمی‌کرد. کاربر می‌زد، رنگ تب عوض می‌شد و
   * صفحه همان می‌ماند؛ یعنی «گیر کردن» نوار. ناوبری هرگز نباید منتظر
   * یک درخواست شبکه بماند: هر مقصد داده خودش را خودش می‌خواند.
   */
  if (nav !== 'home' && childId) {
    const tab = nav === 'more' ? 'menu' : nav === 'tomorrow' ? 'absence' : nav
    const name = children.find((c) => c.id === childId)?.firstName ?? ''
    return (
      <div className={styles.shell}>
        <div className={styles.shellBody}>
          {/*
            key: بی این، رفتن از یک مقصد نوار به مقصد دیگر هیچ کاری
            نمی‌کرد. MorePage تبِ اولیه را فقط در useState اولش
            می‌خواند و چون مونت‌شده می‌ماند، prop تازه را نادیده
            می‌گرفت — یعنی کاربر «مالی» را می‌زد و همان فهرست «بیشتر»
            را می‌دید.
          */}
          <MorePage
            key={`${childId}-${tab}`}
            childId={childId}
            childName={name}
            onBack={() => setNav('home')}
            initialTab={tab}
          />
        </div>
        <TabBar items={NAV} center={CENTER} active={nav} onSelect={(id: string) => setNav(id as typeof nav)} />
      </div>
    )
  }

  const greeting = session?.active?.displayName ?? 'خوش آمدید'

  return (
    <AppShell
      greeting={`سلام ${greeting}!`}
      subtitle="امروز هم روز خوبی برایش آرزو می‌کنیم."
      roleLabel={session?.active ? ROLE_LABEL[session.active.role] : '—'}
      onSignOut={() => void signOut()}
      nav={NAV}
      center={CENTER}
      active={nav}
      onSelect={(id: string) => setNav(id as typeof nav)}
    >
      <div className={styles.page}>
      {/*
        بخش ۶.۵: خانواده ممکن است بیش از یک کودک در مهد داشته باشد.

        چهره، نه نام: والد بچه‌اش را از عکس سریع‌تر می‌شناسد تا از متن.
        «افزودن کودک» اینجا نیست — ثبت‌نام کار مدیر است و دکمه‌ای که کار
        نکند بدتر از نبودنش است.
      */}
      {children.length > 1 ? (
        <div className={styles.switcher}>
          {children.map((child) => (
            <button
              key={child.id}
              type="button"
              className={`${styles.kid} ${child.id === childId ? styles.kidOn : ''}`}
              aria-pressed={child.id === childId}
              onClick={() => setChildId(child.id)}
            >
              <span className={styles.kidFace}>
                <ChildFace id={child.id} photoUrl={child.photoUrl} />
              </span>
              <span className={`${styles.kidName} t-caption`}>{child.firstName}</span>
            </button>
          ))}
        </div>
      ) : null}

      {/* ── برنامه روزانه ─────────────────────────────────── */}
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h1 className={`${styles.cardTitle} t-h2`}>
            روز {day?.child.firstName ?? '—'}
          </h1>
          <span className={`${styles.cardDate} t-caption`}>
            {formatJalali(new Date(), 'weekday')}
          </span>
        </div>

        <DayTimeline steps={steps} />

        {/*
          ناهار و دارو، کنار هم.

          این دو تنها چیزهایی‌اند که والد ساعت یازده صبح دنبالشان
          می‌گردد. بقیه گزارش می‌تواند صبر کند تا آخر روز.
        */}
        {day?.sent && day.lunch ? (
          <div className={styles.meal}>
            <span className={styles.mealIcon} aria-hidden>
              <BowlIcon />
            </span>
            <span className={styles.mealBody}>
              <span className={`${styles.mealTitle} t-body-lg`}>ناهار</span>
              <span className={`${styles.mealText} t-body`}>{MEAL_TEXT[day.lunch]}</span>
            </span>
            <span className={`${styles.mealChip} t-caption`}>
              <CheckIcon size={14} />
            </span>
          </div>
        ) : null}

        {activeMed ? (
          <div className={`${styles.med} ${activeMed.receivedAt ? styles.medOn : ''}`}>
            <span className={styles.medIcon} aria-hidden>
              <ShieldCheckIcon size={22} />
            </span>
            <span className={styles.mealBody}>
              <span className={`${styles.mealTitle} t-body-lg`}>
                {activeMed.name}
                {activeMed.dose ? ` · ${activeMed.dose}` : ''}
              </span>
              {/*
                ارتقای ۳: اعلام، تحویل نیست. تا مهد شیشه دارو را نگرفته،
                صفحه نباید وانمود کند که کار تمام است.
              */}
              <span className={`${styles.mealText} t-body`}>
                {activeMed.receivedAt
                  ? `مهد تحویل گرفت · ${formatTime(new Date(activeMed.receivedAt))}`
                  : 'هنوز تحویل نگرفته‌اند'}
              </span>
            </span>
          </div>
        ) : null}
      </section>

      {/* ── سه کارت کوچک وضعیت روز ─────────────────────────── */}
      {day?.sent ? (
        <div className={styles.tiles}>
          <Tile
            label="خواب امروز"
            value={
              day.napMinutes !== null ? `${formatCount(day.napMinutes)} دقیقه` : 'ثبت نشده'
            }
            icon={<MoonIcon />}
          />
          {/*
            حال روز، هر سه بازه.

            نسخه اول فقط بازه اول را نشان می‌داد و دو بازه دیگر را به
            «گزارش کامل» می‌فرستاد. بخش ۶.۳ حال را سه‌بازه‌ای خواسته چون
            نکته همان تغییر بین بازه‌هاست: کودکی که صبح خوب بوده و عصر
            گریان، همان چیزی است که والد باید ببیند.
          */}
          <div className={styles.tile}>
            <span className={styles.tileIcon} aria-hidden>
              <FaceIcon />
            </span>
            <span className={`${styles.tileLabel} t-caption`}>حال امروز</span>
            {hasMood ? (
              <span className={styles.tileMoods}>
                {moods.map(([mood, band]) =>
                  mood ? (
                    <span key={band} className={styles.tileMood}>
                      <MoodMark mood={mood} />
                      <span className="sr-only">
                        {band} {MOOD_TEXT[mood]}
                      </span>
                    </span>
                  ) : null,
                )}
              </span>
            ) : (
              <span className={`${styles.tileValue} t-body`}>ثبت نشده</span>
            )}
          </div>

          <Tile
            label="یادداشت مربی"
            value={day.teacherNote ? 'نوشته شده' : 'ندارد'}
            icon={<NoteIcon />}
          />
        </div>
      ) : null}

      {/* ── گالری امروز ────────────────────────────────────── */}
      {day && day.photos.length > 0 ? (
        <button
          type="button"
          className={styles.gallery}
          onClick={() => setDetailOpen((open) => !open)}
          aria-expanded={detailOpen}
        >
          <span className={styles.galleryThumb}>
            <img src={day.photos[0]?.previewUrl} alt="" />
          </span>
          <span className={styles.galleryBody}>
            <span className={`${styles.galleryTitle} t-body-lg`}>گالری امروز</span>
            <span className={`${styles.gallerySub} t-caption`}>
              {formatCount(day.photos.length)} عکس از امروز
            </span>
          </span>
          <span className={styles.galleryIcon} aria-hidden>
            <ImageIcon size={20} />
          </span>
          <span className={styles.galleryGo} aria-hidden>
            <ChevronIcon size={18} />
          </span>
        </button>
      ) : null}

      {/*
        بخش ۵.۹: گزارش تا فرستاده نشدن به خانواده نمی‌رسد. تا آن موقع
        خانواده ورود و خروج را می‌بیند، نه گزارش نیم‌کاره.
      */}
      {day && !day.sent ? (
        <p className={`${styles.pending} t-body`}>
          گزارش امروز هنوز آماده نیست. آخر روز برایتان فرستاده می‌شود.
        </p>
      ) : null}

      {/*
        رویداد و درخواست از خانه، بیرون از کارت‌های خلاصه.
        این دو کنش می‌خواهند، پس نباید لای آمار روز گم شوند.
      */}
      {day?.sent
        ? day.incidents.map((incident) => (
            <section key={incident.id} className={styles.incident}>
              <span className={styles.incidentIcon} aria-hidden>
                <AlertIcon size={20} />
              </span>
              <span className={styles.incidentBody}>
                <span className={`${styles.incidentTitle} t-body`}>
                  {INCIDENT_TEXT[incident.type] ?? 'رویداد'} ·{' '}
                  {formatTime(new Date(incident.occurredAt))}
                </span>
                <span className={`${styles.incidentText} t-body`}>{incident.description}</span>
              </span>
            </section>
          ))
        : null}

      {day?.sent && day.needsFromHome.length > 0 ? (
        <section className={styles.needs}>
          <span className={`${styles.noteLabel} t-caption`}>از خانه</span>
          {day.needsFromHome.map((need) => (
            <button
              key={need.id}
              type="button"
              className={styles.need}
              onClick={() => toggleNeed(need.id, !need.done)}
              aria-pressed={need.done}
            >
              <span
                className={`${styles.needBox} ${need.done ? styles.needBoxDone : ''}`}
                aria-hidden
              >
                {need.done ? <CheckIcon size={16} /> : null}
              </span>
              <span
                className={`${styles.needText} ${need.done ? styles.needTextDone : ''} t-body`}
              >
                {need.text}
              </span>
              <span className={`${styles.noteLabel} t-caption`}>
                {need.done ? 'انجام شد' : 'انجام شد؟'}
              </span>
            </button>
          ))}
        </section>
      ) : null}

      {/* ── گزارش کامل، پشت یک ضربه ─────────────────────────── */}
      {day?.sent ? (
        <>
          <button
            type="button"
            className={`${styles.detailToggle} t-body`}
            onClick={() => setDetailOpen((open) => !open)}
            aria-expanded={detailOpen}
          >
            {detailOpen ? 'بستن گزارش کامل' : 'گزارش کامل امروز'}
          </button>

          {detailOpen ? (
            <article className={styles.detail}>
              {day.photos.length > 0 ? (
                <div
                  className={`${styles.photos} ${
                    day.photos.length === 1 ? styles.photosOne : styles.photosMany
                  }`}
                >
                  {day.photos.map((photo) => (
                    <img key={photo.id} className={styles.photo} src={photo.previewUrl} alt="" />
                  ))}
                </div>
              ) : (
                <p className={`${styles.noPhotos} t-body`}>امروز عکسی منتشر نشده.</p>
              )}

              <section className={styles.gate}>
                <div className={styles.gateRow}>
                  <span className={styles.gateIcon} aria-hidden>
                    <ArrowIn />
                  </span>
                  <span className={`${styles.gateTime} t-body`}>
                    {day.checkInAt ? formatTime(new Date(day.checkInAt)) : '—'}
                  </span>
                  <span className={`${styles.gateWho} t-body`}>
                    {day.checkInAt
                      ? `ورود${day.droppedByName ? ` با ${day.droppedByName}` : ''}`
                      : 'هنوز وارد نشده'}
                  </span>
                </div>

                {/*
                  نام مربیِ تحویل‌گیرنده. مهد چند مربی دارد و شیفت‌هایشان
                  با بازه‌ها یکی نیست، پس «مربی کلاس» جواب روشنی نیست.
                */}
                {day.checkedInByName ? (
                  <p className={`${styles.gateStaff} t-body`}>
                    تحویل گرفت: {day.checkedInByName}
                  </p>
                ) : null}

                <div className={styles.gateRow}>
                  <span className={styles.gateIcon} aria-hidden>
                    <ArrowOut />
                  </span>
                  <span className={`${styles.gateTime} t-body`}>
                    {day.checkOutAt ? formatTime(new Date(day.checkOutAt)) : '—'}
                  </span>
                  <span className={`${styles.gateWho} t-body`}>
                    {day.checkOutAt
                      ? `خروج${day.pickedUpByName ? ` با ${day.pickedUpByName}` : ''}`
                      : 'هنوز در مهد است'}
                  </span>
                </div>

                {day.checkedOutByName ? (
                  <p className={`${styles.gateStaff} t-body`}>
                    تحویل داد: {day.checkedOutByName}
                  </p>
                ) : null}
              </section>

              {/* خلق در سه بازه روز. سه نقطه، نه امتیاز (بخش ۱۲.۶). */}
              {hasMood ? (
                <div className={styles.fact}>
                  <span className={styles.factIcon} aria-hidden>
                    <FaceIcon />
                  </span>
                  <span className={`${styles.factLabel} t-body`}>حال</span>
                  <span className={styles.moods}>
                    {moods.map(([mood, band]) =>
                      mood ? (
                        <span key={band} className={styles.mood}>
                          <MoodMark mood={mood} />
                          <span className={`${styles.moodBand} t-body`}>
                            {band} {MOOD_TEXT[mood]}
                          </span>
                        </span>
                      ) : null,
                    )}
                  </span>
                </div>
              ) : null}

              {day.teacherNote ? (
                <section className={styles.note}>
                  <span className={`${styles.noteLabel} t-caption`}>یادداشت مربی</span>
                  <p className={`${styles.noteText} t-body`}>{day.teacherNote}</p>
                </section>
              ) : null}
            </article>
          ) : null}
        </>
      ) : null}

      {/*
        «فردا» بعد از گزارش امروز می‌آید، چون بخش ۶.۳ می‌گوید والد برای
        دیدن امروز می‌آید. تصمیم فردا کار دوم است، نه اول.
      */}
      {childId && day ? (
        <TomorrowCard childId={childId} childName={day.child.firstName} />
      ) : null}

      {error ? <p className={`${styles.loadError} t-body`}>{error}</p> : null}
      </div>
    </AppShell>
  )
}

/** کاشی کوچک وضعیت روز. سه‌تا در یک ردیف، در عرض ۳۲۰ پیکسل هم. */
function Tile({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon: React.ReactNode
}) {
  return (
    <div className={styles.tile}>
      <span className={styles.tileIcon} aria-hidden>
        {icon}
      </span>
      <span className={`${styles.tileLabel} t-caption`}>{label}</span>
      <span className={`${styles.tileValue} t-body`}>{value}</span>
    </div>
  )
}

/* آیکون‌های جهت‌دار ورود و خروج. بخش ۱۲.۶: قرینه می‌شوند. */
function ArrowIn() {
  return (
    <svg className="mirror" width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14" /><path d="m19 12-7 7-7-7" />
    </svg>
  )
}

function ArrowOut() {
  return (
    <svg className="mirror" width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 19V5" /><path d="m5 12 7-7 7 7" />
    </svg>
  )
}

/* آیکون‌های غیرجهت‌دار. قرینه نمی‌شوند. */
function BowlIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 11h18" /><path d="M4 11a8 8 0 0 0 16 0" /><path d="M12 3v4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  )
}

function FaceIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <path d="M9 9h.01" /><path d="M15 9h.01" />
    </svg>
  )
}

/* یادداشت مربی. غیرجهت‌دار، پس قرینه نمی‌شود. */
function NoteIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 4h14v12l-4 4H5z" /><path d="M15 20v-4h4" /><path d="M9 9h6M9 13h3" />
    </svg>
  )
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'گزارش امروز خوانده نشد.'
}


/*
 * چهار چهره برای چهار حال. خودِ شکل معنا را می‌رساند، پس رنگ لازم نیست
 * و همه یک رنگ خنثی می‌گیرند — بند ۱۰ و بخش ۱۲.۲.
 */
const MOUTH: Record<Mood, string> = {
  good: 'M8.5 14.5c1 1.4 2.2 2 3.5 2s2.5-.6 3.5-2',
  normal: 'M8.75 14.75h6.5',
  restless: 'M8.5 15.5c1-.9 2.2-1.35 3.5-1.35s2.5.45 3.5 1.35',
  sad: 'M8.5 16c1-1.4 2.2-2 3.5-2s2.5.6 3.5 2',
}

function MoodMark({ mood }: { mood: Mood }) {
  return (
    <svg
      className={styles.moodMark}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={MOOD_TEXT[mood]}
    >
      <circle cx="12" cy="12" r="9" />
      <path d={MOUTH[mood]} />
      <path d="M9 9.6v.8" />
      <path d="M15 9.6v.8" />
      {/* «گریان» یک قطره اشک هم دارد تا از «بی‌قرار» جدا باشد. */}
      {mood === 'sad' ? <path d="M9 12.4c0 .9-.7 1.4-.7 2.1" /> : null}
    </svg>
  )
}
