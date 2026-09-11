import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertIcon, CheckIcon } from '../../design-system/index.ts'
import { formatCount, formatJalali, formatTime, toIsoDate } from '../../i18n/index.ts'
import { ROLE_LABEL, useAuth, useData } from '../../core/auth/index.ts'
import type { Child, MealAmount, Mood, ParentDay } from '../../core/data/index.ts'
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
  const [error, setError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

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
      setDay(await data.getParentDay(childId, date))
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

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={`${styles.childName} t-h2`}>
          {day?.child.firstName ?? '—'}
        </span>

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className={`${styles.account} t-caption`}
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
          >
            {session?.active ? ROLE_LABEL[session.active.role] : '—'}
          </button>
          {menuOpen ? (
            <div
              style={{
                position: 'absolute',
                insetBlockStart: 'calc(100% + 8px)',
                insetInlineEnd: 0,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-card)',
                boxShadow: 'var(--shadow-2)',
                padding: 'var(--space-2)',
                zIndex: 20,
              }}
            >
              <button
                type="button"
                className={`${styles.switchItem} t-body`}
                style={{ border: 'none', inlineSize: '100%' }}
                onClick={() => void signOut()}
              >
                خروج
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {/* بخش ۶.۵: خانواده ممکن است بیش از یک کودک در مهد داشته باشد. */}
      {children.length > 1 ? (
        <div className={styles.switcher}>
          {children.map((child) => (
            <button
              key={child.id}
              type="button"
              className={`${styles.switchItem} t-body`}
              aria-pressed={child.id === childId}
              onClick={() => setChildId(child.id)}
            >
              {child.firstName}
            </button>
          ))}
        </div>
      ) : null}

      <article className={styles.card}>
        <h1 className={styles.dateLine}>{formatJalali(new Date(), 'weekday')}</h1>

        {/* ۱ — عکس‌های امروز */}
        {day && day.photos.length > 0 ? (
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
          <p className={`${styles.noPhotos} t-body`}>
            امروز عکسی منتشر نشده.
          </p>
        )}

        <div className={styles.rows}>
          {/* ۲ — ورود و خروج */}
          <section className={styles.gate}>
            <div className={styles.gateRow}>
              <span className={styles.gateIcon} aria-hidden>
                <ArrowIn />
              </span>
              <span className={`${styles.gateTime} t-body`}>
                {day?.checkInAt ? formatTime(new Date(day.checkInAt)) : '—'}
              </span>
              <span className={`${styles.gateWho} t-body`}>
                {day?.checkInAt ? `ورود${day.droppedByName ? ` با ${day.droppedByName}` : ''}` : 'هنوز وارد نشده'}
              </span>
            </div>

            <div className={styles.gateRow}>
              <span className={styles.gateIcon} aria-hidden>
                <ArrowOut />
              </span>
              <span className={`${styles.gateTime} t-body`}>
                {day?.checkOutAt ? formatTime(new Date(day.checkOutAt)) : '—'}
              </span>
              <span className={`${styles.gateWho} t-body`}>
                {day?.checkOutAt
                  ? `خروج${day.pickedUpByName ? ` با ${day.pickedUpByName}` : ''}`
                  : 'هنوز در مهد است'}
              </span>
            </div>
          </section>
        </div>

        {/*
          بخش ۵.۹: گزارش تا فرستاده نشدن به خانواده نمی‌رسد. تا آن موقع
          خانواده ورود و خروج را می‌بیند، نه گزارش نیم‌کاره.
        */}
        {day && !day.sent ? (
          <p className={`${styles.pending} t-body`}>
            گزارش امروز هنوز آماده نیست. آخر روز برایتان فرستاده می‌شود.
          </p>
        ) : null}

        {day?.sent ? (
          <>
            <div className={styles.rule} />
            <div className={styles.rows}>
              {/* ۳ — غذا و خواب */}
              {day.lunch ? (
                <div className={styles.fact}>
                  <span className={styles.factIcon} aria-hidden><BowlIcon /></span>
                  <span className={`${styles.factLabel} t-body`}>ناهار</span>
                  <span className={`${styles.factValue} t-body`}>{MEAL_TEXT[day.lunch]}</span>
                </div>
              ) : null}

              {day.napMinutes !== null ? (
                <div className={styles.fact}>
                  <span className={styles.factIcon} aria-hidden><MoonIcon /></span>
                  <span className={`${styles.factLabel} t-body`}>خواب</span>
                  <span className={`${styles.factValue} t-body`}>
                    {formatCount(day.napMinutes)} دقیقه
                  </span>
                </div>
              ) : null}

              {/* ۴ — خلق در سه بازه روز. سه نقطه، نه امتیاز (بخش ۱۲.۶). */}
              {hasMood ? (
                <div className={styles.fact}>
                  <span className={styles.factIcon} aria-hidden><FaceIcon /></span>
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

              {/* ۵ — یادداشت مربی */}
              {day.teacherNote ? (
                <section className={styles.note}>
                  <span className={`${styles.noteLabel} t-caption`}>یادداشت مربی</span>
                  <p className={`${styles.noteText} t-body`}>{day.teacherNote}</p>
                </section>
              ) : null}

              {/* رویدادی که خانواده حق دیدنش را دارد */}
              {day.incidents.map((incident) => (
                <section key={incident.id} className={styles.incident}>
                  <span className={styles.incidentIcon} aria-hidden><AlertIcon size={20} /></span>
                  <span className={styles.incidentBody}>
                    <span className={`${styles.incidentTitle} t-body`}>
                      {INCIDENT_TEXT[incident.type] ?? 'رویداد'} ·{' '}
                      {formatTime(new Date(incident.occurredAt))}
                    </span>
                    <span className={`${styles.incidentText} t-body`}>{incident.description}</span>
                  </span>
                </section>
              ))}

              {/* ۶ — درخواست از خانه */}
              {day.needsFromHome.length > 0 ? (
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
            </div>
          </>
        ) : null}
      </article>

      {/*
        «فردا» بعد از گزارش امروز می‌آید، چون بخش ۶.۳ می‌گوید والد برای
        دیدن امروز می‌آید. تصمیم فردا کار دوم است، نه اول.
      */}
      {childId && day ? (
        <TomorrowCard childId={childId} childName={day.child.firstName} />
      ) : null}

      {error ? (
        <p className={`${styles.loadError} t-body`}>
          {error}
        </p>
      ) : null}
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
