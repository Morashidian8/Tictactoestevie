import { useEffect, useRef, useState } from 'react'
import { BottomSheet, CheckIcon } from '../../design-system/index.ts'
import { compressImage } from '../../core/media/index.ts'
import { formatTime, toIsoDate, toLatinDigits } from '../../i18n/index.ts'
import type { ArrivalCondition, Attendance, Child, Guardian } from '../../core/data/index.ts'
import styles from './ArrivalSheet.module.css'

/**
 * شیت استثناهای ورود — بخش ۵.۳ سند.
 *
 * ضربه کوتاه روی عکس کودک، ورود را با پیش‌فرض‌ها ثبت می‌کند. این شیت
 * برای همان استثناهاست و سه بخش دارد: آورنده، وضعیت هنگام ورود به‌علاوه
 * عکس، و دارو.
 *
 * وضعیت هنگام ورود دست‌کم گرفته نشود. اگر خانواده بعداً درباره
 * آسیب‌دیدگی ادعایی کرد، این فیلد و عکسش سند دفاعی مهد هستند.
 */

const CONDITIONS: { value: ArrivalCondition; label: string }[] = [
  { value: 'normal', label: 'عادی' },
  { value: 'fever_or_cold', label: 'تب یا سرماخوردگی' },
  { value: 'scratch_or_bruise', label: 'خراش یا کبودی' },
  { value: 'restless', label: 'بی‌قراری' },
]

export type ArrivalResult = {
  droppedByGuardianId: string | null
  arrivalCondition: ArrivalCondition
  photo: Blob | null
  medication: { name: string; dose: string; scheduledTime: string } | null
}

type Props = {
  child: Child
  guardians: Guardian[]
  /** ردیف امروز، اگر کودک قبلاً وارد شده باشد. */
  existing: Attendance | null
  onClose: () => void
  onSubmit: (result: ArrivalResult) => Promise<void>
}

export function ArrivalSheet({ child, guardians, existing, onClose, onSubmit }: Props) {
  const allowed = guardians.filter((g) => g.canPickup)
  const [guardianId, setGuardianId] = useState<string | null>(
    existing?.droppedByGuardianId ?? allowed[0]?.id ?? null,
  )
  const [condition, setCondition] = useState<ArrivalCondition>(
    existing?.arrivalCondition ?? 'normal',
  )
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null)
  const [medName, setMedName] = useState('')
  const [medDose, setMedDose] = useState('')
  const [medTime, setMedTime] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // نشانی پیش‌نمایش را آزاد کن، وگرنه حافظه در طول روز پر می‌شود.
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url) }, [photo])

  const alreadyIn = Boolean(existing?.checkInAt)

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      const compressed = await compressImage(file)
      setPhoto({ blob: compressed.blob, url: compressed.previewUrl })
    } catch {
      setError('این عکس خوانده نشد. دوباره بگیرید یا از گالری انتخاب کنید.')
    }
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await onSubmit({
        droppedByGuardianId: guardianId,
        arrivalCondition: condition,
        photo: photo?.blob ?? null,
        medication: medName.trim()
          ? {
              name: medName.trim(),
              dose: medDose.trim(),
              scheduledTime: toLatinDigits(medTime.trim()),
            }
          : null,
      })
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد. دوباره تلاش کنید.')
      setBusy(false)
    }
  }

  return (
    <BottomSheet
      title={child.firstName}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={`${styles.primary} t-body-lg`} onClick={() => void submit()} disabled={busy}>
            {alreadyIn ? 'ذخیره تغییرها' : 'ثبت ورود'}
          </button>
          <button type="button" className={`${styles.secondary} t-body-lg`} onClick={onClose}>
            انصراف
          </button>
        </>
      }
    >
      {alreadyIn && existing?.checkInAt ? (
        <p className={`${styles.note} t-body`}>
          ورودش ساعت {formatTime(new Date(existing.checkInAt))} ثبت شده.
        </p>
      ) : null}

      {/* ۱ — آورنده. پیش‌فرض انتخاب‌شده است و مربی فقط استثنا را دست می‌زند. */}
      <section className={styles.section}>
        <h3 className={`${styles.legend} t-caption`}>چه کسی آورد؟</h3>
        <div className={styles.options}>
          {allowed.map((guardian) => {
            const on = guardian.id === guardianId
            return (
              <button
                key={guardian.id}
                type="button"
                className={`${styles.option} t-body-lg`}
                aria-pressed={on}
                onClick={() => setGuardianId(guardian.id)}
              >
                {on ? <span className={styles.tick} aria-hidden><CheckIcon size={16} /></span> : null}
                {guardian.relation ?? guardian.fullName}
              </button>
            )
          })}
        </div>
      </section>

      {/* ۲ — وضعیت هنگام ورود، به‌علاوه عکس اختیاری. */}
      <section className={styles.section}>
        <h3 className={`${styles.legend} t-caption`}>وضعیت هنگام ورود</h3>
        <div className={styles.options}>
          {CONDITIONS.map((item) => {
            const on = item.value === condition
            return (
              <button
                key={item.value}
                type="button"
                className={`${styles.option} t-body-lg`}
                aria-pressed={on}
                onClick={() => setCondition(item.value)}
              >
                {on ? <span className={styles.tick} aria-hidden><CheckIcon size={16} /></span> : null}
                {item.label}
              </button>
            )
          })}
        </div>

        {condition !== 'normal' ? (
          <div className={styles.photoRow}>
            <button
              type="button"
              className={`${styles.photoBtn} t-body-lg`}
              onClick={() => fileInput.current?.click()}
            >
              {photo ? 'عکس دیگر' : 'افزودن عکس'}
            </button>
            {photo ? <img className={styles.thumb} src={photo.url} alt="عکس هنگام ورود" /> : null}
            <input
              ref={fileInput}
              className={styles.drop}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => void pickPhoto(event.target.files?.[0])}
            />
          </div>
        ) : null}
      </section>

      {/* ۳ — دارو. */}
      <section className={styles.section}>
        <h3 className={`${styles.legend} t-caption`}>دارو آورده‌اند؟</h3>
        <div className={styles.medFields}>
          <input
            className={`${styles.input}`}
            placeholder="نام دارو"
            value={medName}
            onChange={(event) => setMedName(event.target.value)}
            aria-label="نام دارو"
          />
          {medName.trim() ? (
            <>
              <input
                className={styles.input}
                placeholder="مقدار، مثل یک قاشق"
                value={medDose}
                onChange={(event) => setMedDose(event.target.value)}
                aria-label="مقدار دارو"
              />
              <input
                className={`${styles.input} ${styles.time}`}
                placeholder="12:00"
                inputMode="numeric"
                value={medTime}
                onChange={(event) => setMedTime(event.target.value)}
                aria-label="ساعت مصرف"
              />
            </>
          ) : null}
        </div>
      </section>

      {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}
    </BottomSheet>
  )
}

/** تاریخ امروز برای ثبت دارو. */
export function today(): string {
  return toIsoDate(new Date())
}
