import { useCallback, useEffect, useState } from 'react'
import { AlertIcon, ChildFace, EmptyState } from '../../design-system/index.ts'
import { formatCount, toPersianDigits } from '../../i18n/index.ts'
import { useData } from '../../core/auth/index.ts'
import type {
  Child,
  ChildProfile,
  ConsentType,
  ProfileChange,
  ProfileField,
} from '../../core/data/index.ts'
import styles from './ChildrenPage.module.css'

/**
 * پرونده کودک — ماژول M1.
 *
 * بخش ۷.۱: «آلرژی غذایی باید همیشه در دید مربی باشد». پس آلرژی اولین
 * چیز پرونده است، نه یک ردیف در ته فهرست اطلاعات پزشکی.
 *
 * ویرایش پرونده از این صفحه انجام نمی‌شود؛ درخواست‌های خانواده بالای
 * همین فهرست می‌نشینند و مدیر آن‌ها را تأیید یا رد می‌کند. تا آن تصمیم،
 * پرونده کودک دست‌نخورده می‌ماند و مربی مقدار قبلی را می‌بیند.
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
  /** درخواست‌های تغییر پرونده از سوی خانواده‌ها. */
  const [changes, setChanges] = useState<ProfileChange[]>([])
  const [rejecting, setRejecting] = useState<ProfileChange | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const loadChanges = useCallback(() => {
    data.listProfileChanges().then(setChanges).catch(() => setChanges([]))
  }, [data])

  useEffect(() => {
    loadChanges()
  }, [loadChanges])

  const decide = async (change: ProfileChange, approve: boolean, why?: string) => {
    setBusy(true)
    try {
      await data.decideProfileChange(change.id, approve, why)
      setNote(
        approve
          ? `«${change.label}» برای ${change.childName} ثبت شد.`
          : `درخواست رد شد و دلیلش برای خانواده رفت.`,
      )
      setRejecting(null)
      loadChanges()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
    } finally {
      setBusy(false)
    }
  }

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
        onChanged={() => void open(openId)}
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
        {note ? <p className={`${styles.note} t-body`}>{note}</p> : null}

        {/*
          درخواست‌های خانواده، بالای فهرست.

          میدان‌های ایمنی اول صف‌اند و این ترتیب از سرور می‌آید، نه از
          اینجا: تا مدیر آلرژی تازه را تأیید نکرده، مربی فهرست قدیمی را
          می‌بیند و آن فاصله باید کوتاه بماند.
        */}
        {changes.length > 0 ? (
          <section className={styles.changes} aria-label="درخواست‌های تغییر پرونده">
            <p className={`${styles.changesHead} t-body`}>
              <AlertIcon size={20} />
              {formatCount(changes.length)} درخواست تغییر پرونده از خانواده‌ها
            </p>
            {changes.map((change) => (
              <article key={change.id} className={styles.change}>
                <p className={`${styles.changeTop} t-body`}>
                  <b>{change.childName}</b>
                  <span className={styles.muted}>{change.label}</span>
                  {change.safetyCritical ? (
                    <span className={styles.safety}>ایمنی</span>
                  ) : null}
                </p>
                {/*
                  از چه، به چه. مدیر بی این نمی‌داند چه چیزی را از دست
                  می‌دهد و فقط «تأیید» را می‌زند.
                */}
                <p className={`${styles.changeDiff} t-caption`}>
                  <span className={styles.was}>{change.oldValue ?? 'ثبت نشده'}</span>
                  {' ← '}
                  <b>{change.newValue ?? 'پاک شود'}</b>
                </p>
                <div className={styles.changeActions}>
                  <button
                    type="button"
                    className={`${styles.decide} ${styles.decidePrimary} t-body`}
                    disabled={busy}
                    onClick={() => void decide(change, true)}
                  >
                    تأیید و ثبت
                  </button>
                  <button
                    type="button"
                    className={`${styles.decide} t-body`}
                    disabled={busy}
                    onClick={() => {
                      setRejecting(change)
                      setReason('')
                    }}
                  >
                    رد
                  </button>
                </div>
              </article>
            ))}
          </section>
        ) : null}

        <input
          className={styles.search}
          value={query}
          placeholder="جست‌وجوی نام"
          aria-label="جست‌وجوی نام کودک"
          onChange={(event) => setQuery(event.target.value)}
        />

        {/*
          رد بدون دلیل، خانواده را سردرگم می‌گذارد — همان قاعده اعلام
          پرداخت. پایگاه داده هم بی دلیل ردش نمی‌کند.
        */}
        {rejecting ? (
          <div className={styles.sheetBackdrop} role="dialog" aria-label="رد درخواست تغییر">
            <div className={styles.sheet}>
              <p className={`${styles.sheetTitle} t-h2`}>
                رد «{rejecting.label}» — {rejecting.childName}
              </p>
              <label className={`${styles.field} t-caption`}>
                دلیل، تا خانواده بداند چه شد
                <input
                  className={styles.input}
                  value={reason}
                  aria-label="دلیل رد"
                  placeholder="مثلاً: کد ملی با شناسنامه نمی‌خواند."
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <div className={styles.sheetActions}>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => setRejecting(null)}
                >
                  انصراف
                </button>
                <button
                  type="button"
                  className={`${styles.primary} t-body`}
                  disabled={reason.trim().length === 0 || busy}
                  onClick={() => void decide(rejecting, false, reason)}
                >
                  رد درخواست
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {shown.length === 0 ? (
          <EmptyState text="کودکی با این نام پیدا نشد." />
        ) : (
          <ul className={styles.list}>
            {shown.map((child) => (
              <li key={child.id}>
                <button type="button" className={styles.item} onClick={() => void open(child.id)}>
                  <span className={styles.avatar}>
                    <ChildFace id={child.id} photoUrl={child.photoUrl} />
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

function Profile({ profile, onBack, onChanged }: {
  profile: ChildProfile
  onBack: () => void
  onChanged: () => void
}) {
  const { child, medical } = profile
  const [editing, setEditing] = useState(false)
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
        {/*
          ویرایش، بالای پرونده.

          تا اینجا پرونده فقط خواندنی بود و مدیر هیچ راهی برای وارد
          کردن داده نداشت — پرونده بازرسی می‌گفت «۳ کودک کد ملی
          ثبت‌نشده دارند» و هیچ جای اپ نمی‌شد کد ملی را نوشت.
        */}
        <button type="button" className={styles.action} onClick={() => setEditing(true)}>
          ویرایش اطلاعات کودک
        </button>

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

      {editing ? (
        <EditSheet
          childId={child.id}
          onClose={() => setEditing(false)}
          onDone={async () => {
            setEditing(false)
            onChanged()
          }}
        />
      ) : null}
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
/* ── ویرایش مدیر ────────────────────────────────────────────── */

/**
 * ویرایش پرونده، به دست مدیر.
 *
 * دو چیزی که این شیت از ویرایش خانواده جدایش می‌کند:
 *
 * ۱. **صف تأیید ندارد.** مدیر خودش تأییدکننده است؛ گذاشتنِ درخواستِ او
 *    در صفِ خودش یک حلقه بی‌معنی است.
 * ۲. **همان فهرست بسته.** کلاس و شهریه از این راه عوض نمی‌شوند — نه
 *    برای خانواده و نه برای مدیر. آن‌ها جای دیگری تصمیم خودشان را
 *    دارند.
 */
function EditSheet({ childId, onClose, onDone }: {
  childId: string
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const data = useData()
  const [fields, setFields] = useState<ProfileField[] | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    data
      .listProfileFields(childId)
      .then((list) => {
        setFields(list)
        setDraft(Object.fromEntries(list.map((f) => [f.key, f.value])))
      })
      .catch(() => setFields([]))
  }, [data, childId])

  const submit = async () => {
    if (!fields) return
    setBusy(true)
    setError(null)
    try {
      /*
       * فقط میدان‌هایی که واقعاً عوض شده‌اند.
       *
       * فرستادن همه، یازده سطر بی‌معنی در لاگ دسترسی می‌گذارد — و آن
       * لاگ وقتی به درد می‌خورد که بشود خواندش.
       */
      for (const field of fields) {
        const next = (draft[field.key] ?? '').trim()
        if (next === field.value.trim()) continue
        await data.editProfileField(childId, field.key, next)
      }
      await onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ذخیره نشد.')
      setBusy(false)
    }
  }

  return (
    <div className={styles.sheetBackdrop} role="dialog" aria-label="ویرایش اطلاعات کودک">
      <div className={styles.sheet}>
        <p className={`${styles.sheetTitle} t-h2`}>ویرایش اطلاعات کودک</p>

        {fields === null ? (
          <p className={`${styles.muted} t-body-sm`}>در حال خواندن…</p>
        ) : (
          fields.map((field) => (
            <label key={field.key} className={`${styles.field} t-caption`}>
              {field.label}
              {/*
                درخواست بازِ خانواده، همین‌جا دیده می‌شود.
                مدیری که نداند خانواده چیزی خواسته، ممکن است مقداری
                بنویسد که فردا دوباره درخواست شود.
              */}
              {field.pending !== null ? (
                <span className={styles.pendingHint}>
                  خانواده پیشنهاد داده: {field.pending || '—'}
                </span>
              ) : null}
              <input
                className={styles.input}
                value={draft[field.key] ?? ''}
                aria-label={field.label}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, [field.key]: event.target.value }))
                }
              />
            </label>
          ))
        )}

        {/*
          آنچه از این راه عوض نمی‌شود، صریح گفته می‌شود.
          وگرنه مدیر دنبال «کلاس» می‌گردد و فکر می‌کند اپ ناقص است.
        */}
        <p className={`${styles.muted} t-caption`}>
          کلاس، شهریه و سرپرست پرداخت‌کننده از این فرم عوض نمی‌شوند؛ هرکدام جای خودشان را
          دارند.
        </p>

        {error ? <p className={`${styles.error} t-body-sm`}>{error}</p> : null}

        <div className={styles.sheetActions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            انصراف
          </button>
          <button
            type="button"
            className={`${styles.primary} t-body-sm`}
            disabled={busy || fields === null}
            onClick={() => void submit()}
          >
            ذخیره
          </button>
        </div>
      </div>
    </div>
  )
}

function Chevron({ flip }: { flip?: boolean }) {
  return (
    <svg className="mirror" width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={flip ? 'm9 18 6-6-6-6' : 'm15 18-6-6 6-6'} />
    </svg>
  )
}
