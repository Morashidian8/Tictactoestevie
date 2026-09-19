import { useState } from 'react'
import { AlertIcon, ChildFace, BottomSheet } from '../../design-system/index.ts'
import { useData } from '../../core/auth/index.ts'
import type {
  Child,
  Incident,
  IncidentLocation,
  IncidentSeverity,
  IncidentType,
  MinorCategory,
} from '../../core/data/index.ts'
import styles from './IncidentSheet.module.css'

/**
 * ثبت رویداد — بخش ۵.۶ و ۱۳.۱ سند.
 *
 * چهار مرحله در یک شیت: کودک ← نوع ← شدت ← محل و توضیح و اقدام.
 * هدف پذیرش بخش ۱۷: زیر ۴۵ ثانیه.
 *
 * دو قاعده که رابط باید حملشان کند:
 *
 * ۱. در انتخاب شدت، پیامدش همان‌جا دیده شود. مربی باید بداند «جزئی»
 *    یعنی مستقیم به خانواده می‌رود و «متوسط» یعنی اول به مدیر.
 * ۲. دسته‌بندی رویداد جزئی بسته است. متن آزاد خارج از این دسته‌ها شدت را
 *    خودکار بالا می‌برد، و مربی باید ببیند که این اتفاق افتاده.
 *
 * ── دو چیزی که مالک محصول گرفت و اصلاح شد ───────────────────
 *
 * **پرسش تکراری.** مرحله شدت دوباره می‌پرسید «کدام‌یک؟» با فهرستی که
 * همان مرحله نوع بود: «زمین خوردن بدون آسیب» در برابر «زمین خوردن»،
 * «دعوای کلامی» در برابر «درگیری». حالا دسته جزئی از نوعِ انتخاب‌شده
 * **مشتق** می‌شود و پرسشی تکرار نمی‌شود.
 *
 * **بن‌بستِ «سایر».** قید پایگاه داده می‌گوید رویداد جزئی باید دسته
 * داشته باشد و فهرست دسته‌ها بسته است؛ پس «سایر» هیچ دسته جزئی‌ای
 * نداشت و دکمه ادامه خاموش می‌ماند — بی آنکه بگوید چرا. حالا برای
 * نوع‌هایی که دسته جزئی ندارند، «جزئی» اصلاً پیشنهاد نمی‌شود و دلیلش
 * نوشته می‌شود. این همان قاعده بخش ۵.۶ است: چیزی بیرون از فهرست بسته،
 * رویداد روتین نیست.
 */

const TYPES: { value: IncidentType; label: string }[] = [
  { value: 'fall', label: 'زمین خوردن' },
  { value: 'conflict', label: 'درگیری' },
  { value: 'bite', label: 'گاز گرفتن' },
  { value: 'fever', label: 'تب' },
  { value: 'vomit', label: 'استفراغ' },
  { value: 'other', label: 'سایر' },
]

const LOCATIONS: { value: IncidentLocation; label: string }[] = [
  { value: 'classroom', label: 'کلاس' },
  { value: 'yard', label: 'حیاط' },
  { value: 'restroom', label: 'سرویس بهداشتی' },
  { value: 'kitchen', label: 'آشپزخانه' },
  { value: 'stairs', label: 'راه‌پله' },
  { value: 'other', label: 'بیرون از مهد' },
]

/**
 * دسته جزئی، مشتق از نوع — نه یک پرسش تازه.
 *
 * بخش ۵.۶ فهرست دسته‌های جزئی را بسته کرده، ولی همان فهرست تقریباً
 * همان فهرست نوع‌هاست. پرسیدنش دو بار، از مربی می‌خواهد یک چیز را دو
 * جور نام ببرد.
 *
 * نوعی که اینجا نیست (تب، استفراغ، سایر) دسته جزئی ندارد، پس اصلاً
 * جزئی ثبت نمی‌شود — همان چیزی که قید پایگاه داده هم می‌گوید.
 */
const MINOR_OF: Partial<Record<IncidentType, MinorCategory>> = {
  fall: 'fall_no_injury',
  bite: 'surface_scratch',
  conflict: 'verbal_dispute',
}

const SEVERITY: { value: IncidentSeverity; name: string; what: string }[] = [
  {
    value: 'minor',
    name: 'جزئی',
    what: 'مستقیم به خانواده اطلاع داده می‌شود. مدیر خلاصه‌اش را می‌بیند.',
  },
  {
    value: 'notify_parent',
    name: 'نیازمند اطلاع والد',
    what: 'اول برای مدیر می‌رود. تا تأیید نکند، به خانواده نمی‌رسد.',
  },
  {
    value: 'medical_attention',
    name: 'نیازمند مراجعه پزشکی',
    what: 'فوری برای مدیر می‌رود. تا تأیید نکند، به خانواده نمی‌رسد.',
  },
]

type Step = 'child' | 'type' | 'severity' | 'detail' | 'done'

type Props = {
  children: Child[]
  onClose: () => void
}

export function IncidentSheet({ children, onClose }: Props) {
  const data = useData()
  const [step, setStep] = useState<Step>('child')
  const [childId, setChildId] = useState<string | null>(null)
  const [type, setType] = useState<IncidentType | null>(null)
  const [severity, setSeverity] = useState<IncidentSeverity | null>(null)
  const [location, setLocation] = useState<IncidentLocation | null>(null)
  const [description, setDescription] = useState('')
  const [action, setAction] = useState('')
  const [saved, setSaved] = useState<Incident | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const child = children.find((c) => c.id === childId) ?? null

  /* دسته جزئی از نوع مشتق می‌شود، نه از یک پرسش دوم. */
  const minorCategory = type ? (MINOR_OF[type] ?? null) : null

  /*
   * «جزئی» فقط وقتی پیشنهاد می‌شود که دسته‌ای برایش وجود داشته باشد.
   *
   * درگیری بین دو کودک هرگز جزئی نیست (بخش ۵.۶). تب، استفراغ و «سایر»
   * هم دسته جزئی ندارند، پس نمی‌شود جزئی ثبتشان کرد — و این همان
   * قاعده است، نه یک محدودیت فنی: چیزی بیرون از فهرست بسته، رویداد
   * روتین نیست.
   */
  const canBeMinor = type !== null && type !== 'conflict' && minorCategory !== null
  const severityChoices = canBeMinor ? SEVERITY : SEVERITY.filter((s) => s.value !== 'minor')

  const submit = async () => {
    if (!childId || !type || !severity || !location) return
    setBusy(true)
    setError(null)
    try {
      const incident = await data.createIncident({
        childId,
        occurredAt: new Date(),
        type,
        severity,
        location,
        minorCategory: severity === 'minor' ? minorCategory : null,
        description: description.trim(),
        actionTaken: action.trim(),
      })
      setSaved(incident)
      setStep('done')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
    } finally {
      setBusy(false)
    }
  }

  const title =
    step === 'done' ? 'رویداد ثبت شد' : child ? `رویداد · ${child.firstName}` : 'ثبت رویداد'

  return (
    <BottomSheet title={title} onClose={onClose} footer={footer()}>
      {step !== 'done' ? (
        <p className={`${styles.progress} t-caption`}>{stepLabel(step)}</p>
      ) : null}

      {step === 'child' ? (
        <section className={styles.step}>
          <h3 className={`${styles.legend} t-caption`}>برای کدام کودک؟</h3>
          <div className={styles.children}>
            {children.map((item) => (
              <button
                key={item.id}
                type="button"
                className={styles.childCell}
                aria-pressed={childId === item.id}
                onClick={() => {
                  setChildId(item.id)
                  setStep('type')
                }}
              >
                <span className={styles.childFace}>
                  <ChildFace id={item.id} photoUrl={item.photoUrl} />
                </span>
                <span className={`${styles.childName} t-caption`}>{item.firstName}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {step === 'type' ? (
        <section className={styles.step}>
          <h3 className={`${styles.legend} t-caption`}>چه اتفاقی افتاد؟</h3>
          <div className={styles.grid}>
            {TYPES.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`${styles.option} t-body-lg`}
                aria-pressed={type === item.value}
                onClick={() => {
                  setType(item.value)
                  // نوعی که دسته جزئی ندارد، انتخابِ «جزئی» قبلی را باطل می‌کند.
                  if (!MINOR_OF[item.value] && severity === 'minor') setSeverity(null)
                  // «سایر» همین‌جا می‌پرسد چه بود؛ بقیه مستقیم جلو می‌روند.
                  if (item.value !== 'other') setStep('severity')
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/*
            «سایر» بدون جای نوشتن، بن‌بست بود.

            مربی گزینه را می‌زد و هیچ‌جا نمی‌توانست بگوید چه شد؛ فهرست
            دسته‌ها هم چیزی برایش نداشت و دکمه ادامه خاموش می‌ماند.
            حالا همین‌جا می‌نویسد و همان متن، توضیح رویداد می‌شود.
          */}
          {type === 'other' ? (
            <>
              <h3 className={`${styles.legend} t-caption`}>چه اتفاقی افتاد؟ بنویسید.</h3>
              <textarea
                className={styles.field}
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="مثلاً: انگشتش لای در ماند."
                aria-label="شرح رویداد"
                autoFocus
              />
            </>
          ) : null}
        </section>
      ) : null}

      {step === 'severity' ? (
        <section className={styles.step}>
          <h3 className={`${styles.legend} t-caption`}>چقدر جدی بود؟</h3>

          {severityChoices.map((item) => (
            <button
              key={item.value}
              type="button"
              className={styles.severity}
              aria-pressed={severity === item.value}
              onClick={() => setSeverity(item.value)}
            >
              <span className={`${styles.severityName} t-body-lg`}>{item.name}</span>
              <span className={`${styles.severityWhat} t-caption`}>{item.what}</span>
            </button>
          ))}

          {/*
            پرسشِ «کدام‌یک؟» برداشته شد: فهرستش تقریباً همان فهرست نوع
            بود و از مربی می‌خواست یک چیز را دو جور نام ببرد.
          */}
          {!canBeMinor && type !== null ? (
            <p className={`${styles.escalated} t-body`}>
              <span className={styles.escalatedIcon} aria-hidden><AlertIcon size={18} /></span>
              <span>
                {type === 'conflict'
                  ? 'درگیری بین دو کودک هرگز جزئی ثبت نمی‌شود، حتی کلامی.'
                  : 'این نوع رویداد جزئی ثبت نمی‌شود؛ دست‌کم به اطلاع والد می‌رسد.'}
              </span>
            </p>
          ) : null}

        </section>
      ) : null}

      {step === 'detail' ? (
        <section className={styles.step}>
          <h3 className={`${styles.legend} t-caption`}>کجا؟</h3>
          <div className={styles.grid}>
            {LOCATIONS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`${styles.option} t-body-lg`}
                aria-pressed={location === item.value}
                onClick={() => setLocation(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <h3 className={`${styles.legend} t-caption`}>چه دیدید؟</h3>
          <textarea
            className={styles.field}
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="هنگام دویدن زمین خورد."
            aria-label="توضیح رویداد"
          />

          <h3 className={`${styles.legend} t-caption`}>چه کردید؟</h3>
          <textarea
            className={styles.field}
            rows={2}
            value={action}
            onChange={(event) => setAction(event.target.value)}
            placeholder="شست‌وشو و پانسمان شد."
            aria-label="اقدام انجام‌شده"
          />

          {/*
            «ناحیه سر یا صورت» برداشته شد.

            یک کلید دوحالته بود که مربی باید کنار توضیحِ خودش هم می‌زد —
            یعنی همان حرف، دو بار. مربی در «چه دیدید؟» می‌نویسد کجای
            بدن بوده، و مدیر همان را می‌خواند.
          */}

          {error ? (
            <p className={`${styles.escalated} t-body`}>
              <span className={styles.escalatedIcon} aria-hidden><AlertIcon size={18} /></span>
              <span>{error}</span>
            </p>
          ) : null}
        </section>
      ) : null}

      {step === 'done' && saved ? (
        <div className={styles.done}>
          <span className={`${styles.doneTitle} t-h2`}>
            {saved.requiresApproval
              ? 'برای مدیر فرستاده شد'
              : 'به خانواده اطلاع داده شد'}
          </span>
          <span className={`${styles.doneWhat} t-body`}>
            {saved.requiresApproval
              ? 'تا مدیر تأیید نکند، به خانواده نمی‌رسد.'
              : 'مدیر خلاصه‌اش را در داشبورد می‌بیند.'}
          </span>
          {saved.escalationReason ? (
            <p className={`${styles.escalated} t-body`}>
              <span className={styles.escalatedIcon} aria-hidden><AlertIcon size={18} /></span>
              <span>شدت خودکار بالا رفت: {escalationText(saved.escalationReason)}</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </BottomSheet>
  )

  function footer() {
    if (step === 'done') {
      return (
        <button type="button" className={`${styles.primary} t-body-lg`} onClick={onClose}>
          بستن
        </button>
      )
    }

    if (step === 'type' && type === 'other') {
      return (
        <button
          type="button"
          className={`${styles.primary} t-body-lg`}
          onClick={() => setStep('severity')}
          disabled={!description.trim()}
        >
          ادامه
        </button>
      )
    }

    if (step === 'severity') {
      return (
        <>
          <button
            type="button"
            className={`${styles.primary} t-body-lg`}
            onClick={() => setStep('detail')}
            disabled={!severity}
          >
            ادامه
          </button>
          <button
            type="button"
            className={`${styles.secondary} t-body-lg`}
            onClick={() => setStep('type')}
          >
            برگشت
          </button>
        </>
      )
    }

    if (step === 'detail') {
      return (
        <>
          <button
            type="button"
            className={`${styles.primary} t-body-lg`}
            onClick={() => void submit()}
            disabled={busy || !location || !description.trim()}
          >
            ثبت رویداد
          </button>
          <button
            type="button"
            className={`${styles.secondary} t-body-lg`}
            onClick={() => setStep('severity')}
          >
            برگشت
          </button>
        </>
      )
    }

    return undefined
  }
}

function stepLabel(step: Step): string {
  const order: Step[] = ['child', 'type', 'severity', 'detail']
  const names = ['کودک', 'نوع', 'شدت', 'جزئیات']
  const index = order.indexOf(step)
  return `مرحله ${'۱۲۳۴'[index]} از ۴ · ${names[index]}`
}

function escalationText(reason: NonNullable<Incident['escalationReason']>): string {
  switch (reason) {
    case 'photo_attached':
      return 'عکس ضمیمه شده است.'
    case 'head_or_face':
      return 'ناحیه سر یا صورت است.'
    default:
      return 'برای این کودک در هفت روز گذشته بیش از دو رویداد جزئی ثبت شده.'
  }
}
