import { useCallback, useEffect, useState } from 'react'
import { AlertIcon, AvatarFace, EmptyState } from '../../design-system/index.ts'
import { formatCount, toPersianDigits } from '../../i18n/index.ts'
import { useData } from '../../core/auth/index.ts'
import type { Child, ChildProfile, ConsentType } from '../../core/data/index.ts'
import styles from './ChildrenPage.module.css'

/**
 * پرونده کودک — ماژول M1.
 *
 * بخش ۷.۱: «آلرژی غذایی باید همیشه در دید مربی باشد». پس آلرژی اولین
 * چیز پرونده است، نه یک ردیف در ته فهرست اطلاعات پزشکی.
 *
 * پرونده فقط خوانده می‌شود. ویرایشش ثبت‌نام و قرارداد است و در این
 * مرحله از پنل انجام نمی‌شود؛ سند هم آن را جای دیگری نگذاشته.
 */

const CONSENT_TEXT: Record<ConsentType, string> = {
  photo_capture: 'عکس‌برداری',
  photo_group_publish: 'انتشار عکس گروهی',
  field_trip: 'گردش علمی',
  medication: 'دادن دارو',
  emergency_care: 'اقدام اضطراری پزشکی',
}

export function ChildrenPage({ onBack }: { onBack: () => void }) {
  const data = useData()
  const [children, setChildren] = useState<Child[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [profile, setProfile] = useState<ChildProfile | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    data
      .listClasses()
      .then(async (rooms) => {
        const days = await Promise.all(
          rooms.map((room) => data.getClassDay(room.id, new Date().toISOString().slice(0, 10))),
        )
        setChildren(days.flatMap((day) => day.children))
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'خوانده نشد.'))
  }, [data])

  const open = useCallback(
    async (childId: string) => {
      setOpenId(childId)
      setProfile(null)
      try {
        setProfile(await data.getChildProfile(childId))
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'خوانده نشد.')
      }
    },
    [data],
  )

  const shown = children.filter((child) =>
    `${child.firstName} ${child.lastName}`.includes(query.trim()),
  )

  if (openId && profile) {
    return (
      <Profile
        profile={profile}
        onBack={() => {
          setOpenId(null)
          setProfile(null)
        }}
      />
    )
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="بازگشت به داشبورد">
          <Chevron />
        </button>
        <span className={`${styles.title} t-h2`}>کودکان</span>
        <span className={`${styles.count} t-caption`}>{formatCount(children.length)}</span>
      </header>

      <div className={styles.body}>
        <input
          className={styles.search}
          value={query}
          placeholder="جست‌وجوی نام"
          aria-label="جست‌وجوی نام کودک"
          onChange={(event) => setQuery(event.target.value)}
        />

        {shown.length === 0 ? (
          <EmptyState text="کودکی با این نام پیدا نشد." />
        ) : (
          <ul className={styles.list}>
            {shown.map((child) => (
              <li key={child.id}>
                <button type="button" className={styles.item} onClick={() => void open(child.id)}>
                  <span className={styles.avatar}>
                    <AvatarFace seed={child.id} />
                  </span>
                  <span className={styles.itemName}>
                    {child.firstName} {child.lastName}
                  </span>
                  <Chevron flip />
                </button>
              </li>
            ))}
          </ul>
        )}

        {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}
      </div>
    </div>
  )
}

function Profile({ profile, onBack }: { profile: ChildProfile; onBack: () => void }) {
  const { child, medical } = profile
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="بازگشت به فهرست کودکان">
          <Chevron />
        </button>
        <span className={`${styles.title} t-h2`}>
          {child.firstName} {child.lastName}
        </span>
        {profile.className ? (
          <span className={`${styles.count} t-caption`}>{profile.className}</span>
        ) : null}
      </header>

      <div className={styles.body}>
        {/* بخش ۷.۱: آلرژی اول از همه، حتی پیش از نام سرپرستان. */}
        {medical.allergies.length > 0 ? (
          <section className={styles.allergy} aria-label="آلرژی">
            <p className={`${styles.allergyHead} t-body-lg`}>
              <AlertIcon size={20} />
              آلرژی
            </p>
            <p className={`${styles.allergyList} t-body-lg`}>{medical.allergies.join('، ')}</p>
          </section>
        ) : null}

        <section className={styles.card} aria-label="سرپرستان">
          <span className={`${styles.cardLabel} t-caption`}>سرپرستان</span>
          {profile.guardians.map((guardian) => (
            <p key={guardian.id} className={`${styles.row} t-body`}>
              <span>{guardian.fullName}</span>
              <span className={`${styles.muted} t-caption`}>{guardian.relation ?? ''}</span>
              {guardian.isPayer ? <span className={`${styles.tag} t-caption`}>پرداخت‌کننده</span> : null}
              {guardian.phone ? (
                <a className={styles.phone} href={`tel:${guardian.phone}`}>
                  {toPersianDigits(guardian.phone)}
                </a>
              ) : (
                <span className={`${styles.noPhone} t-caption`}>بدون شماره</span>
              )}
            </p>
          ))}
        </section>

        <section className={styles.card} aria-label="تحویل‌گیرندگان مجاز">
          <span className={`${styles.cardLabel} t-caption`}>تحویل‌گیرندگان مجاز</span>
          {profile.authorized.length === 0 ? (
            <p className={`${styles.muted} t-body`}>
              کسی جز سرپرستان مجاز نیست. برای فرد دیگر، خانواده باید کد تحویل بسازد.
            </p>
          ) : (
            profile.authorized.map((person) => (
              <p key={person.id} className={`${styles.row} t-body`}>
                <span>{person.fullName}</span>
                <span className={`${styles.muted} t-caption`}>{person.relation ?? ''}</span>
              </p>
            ))
          )}
        </section>

        <section className={styles.card} aria-label="اطلاعات پزشکی">
          <span className={`${styles.cardLabel} t-caption`}>اطلاعات پزشکی</span>
          <Fact label="گروه خونی" value={medical.bloodType} />
          <Fact label="بیماری زمینه‌ای" value={medical.chronicConditions} />
          <Fact label="داروی روزانه" value={medical.dailyMedication} />
          <Fact label="پزشک" value={medical.doctorName} />
          {medical.doctorPhone ? (
            <p className={`${styles.row} t-body`}>
              <span className={styles.muted}>شماره پزشک</span>
              <a className={styles.phone} href={`tel:${medical.doctorPhone}`}>
                {toPersianDigits(medical.doctorPhone)}
              </a>
            </p>
          ) : null}
        </section>

        <section className={styles.card} aria-label="رضایت‌نامه‌ها">
          <span className={`${styles.cardLabel} t-caption`}>رضایت‌نامه‌ها</span>
          {profile.consents.map((consent) => (
            <p key={consent.type} className={`${styles.row} t-body`}>
              <span>{CONSENT_TEXT[consent.type]}</span>
              <span className={consent.granted ? styles.granted : styles.notGranted}>
                {consent.granted ? 'داده شده' : 'داده نشده'}
              </span>
            </p>
          ))}
        </section>
      </div>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <p className={`${styles.row} t-body`}>
      <span className={styles.muted}>{label}</span>
      <span>{value ?? '—'}</span>
    </p>
  )
}

/** پیکان جهت‌دار — بخش ۱۲.۶: قرینه می‌شود. */
function Chevron({ flip }: { flip?: boolean }) {
  return (
    <svg className="mirror" width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={flip ? 'm9 18 6-6-6-6' : 'm15 18-6-6 6-6'} />
    </svg>
  )
}
