import { useEffect, useState } from 'react'
import { AlertIcon, AvatarFace, BottomSheet, CheckIcon } from '../../design-system/index.ts'
import { formatCount, formatTime, toIsoDate, toLatinDigits } from '../../i18n/index.ts'
import { useData } from '../../core/auth/index.ts'
import type { Child, PickupCodeCheck, PickupOption } from '../../core/data/index.ts'
import styles from './CheckOutSheet.module.css'

/**
 * شیت ثبت خروج — بخش ۵.۸ سند.
 *
 * مسیر عادی: یک ضربه، انتخاب تحویل‌گیرنده از فهرست مجاز.
 *
 * کد تحویل: سرپرست از اپ خودش کد گرفته و به فرد داده. مربی کد را وارد
 * می‌کند، سامانه نام و عکس فرد را نشان می‌دهد، مربی چهره را تطبیق می‌دهد
 * و تأیید می‌کند. کد یکبارمصرف و محدود به همان روز است.
 *
 * قاعده سفت: «اگر فرد در فهرست مجاز نباشد و کد هم نداشته باشد، سامانه
 * اجازه ثبت نمی‌دهد و به مدیر ارجاع می‌دهد. این یک هشدار قابل رد شدن
 * نیست.» پس این شیت هیچ راه سومی ندارد.
 */
type Props = {
  child: Child
  onClose: () => void
  onDone: () => void
}

/** ساعت پایان مهد. تا وصل شدن تنظیمات مرکز، پیش‌فرض سند. */
const WORK_END = { hour: 16, minute: 30 }

export function CheckOutSheet({ child, onClose, onDone }: Props) {
  const data = useData()
  const [options, setOptions] = useState<PickupOption[]>([])
  const [personId, setPersonId] = useState<string | null>(null)
  const [codeMode, setCodeMode] = useState(false)
  const [code, setCode] = useState('')
  const [checked, setChecked] = useState<PickupCodeCheck | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    data
      .listPickupOptions(child.id)
      .then(setOptions)
      .catch((cause: unknown) => setError(messageOf(cause)))
  }, [data, child.id])

  // کد چهاررقمی که کامل شد، خودکار بررسی می‌شود. مربی دستش بند است و
  // نباید دکمه اضافه بزند.
  useEffect(() => {
    const digits = toLatinDigits(code).replace(/\D/g, '')
    if (digits.length < 4) {
      setChecked(null)
      return
    }
    let cancelled = false
    data
      .checkPickupCode(child.id, digits, toIsoDate(new Date()))
      .then((result) => {
        if (!cancelled) setChecked(result)
      })
      .catch((cause: unknown) => setError(messageOf(cause)))
    return () => {
      cancelled = true
    }
  }, [code, data, child.id])

  const now = new Date()
  const late = lateMinutes(now)

  const canSubmit = codeMode ? checked?.valid === true : Boolean(personId)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await data.checkOut({
        childId: child.id,
        at: new Date(),
        method: codeMode ? 'code' : kindOf(options, personId),
        personId: codeMode ? null : personId,
        code: codeMode ? toLatinDigits(code).replace(/\D/g, '') : null,
      })
      onDone()
      onClose()
    } catch (cause) {
      setError(messageOf(cause))
      setBusy(false)
    }
  }

  return (
    <BottomSheet
      title={`خروج ${child.firstName}`}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className={`${styles.primary} t-body-lg`}
            onClick={() => void submit()}
            disabled={busy || !canSubmit}
          >
            ثبت خروج ساعت {formatTime(now)}
          </button>
          <button type="button" className={`${styles.secondary} t-body-lg`} onClick={onClose}>
            انصراف
          </button>
        </>
      }
    >
      {late > 0 ? (
        <p className={`${styles.late} t-body`}>
          <span aria-hidden><AlertIcon size={18} /></span>
          {formatCount(late)} دقیقه پس از ساعت پایان مهد. به صورتحساب اضافه می‌شود.
        </p>
      ) : null}

      {!codeMode ? (
        <section className={styles.section}>
          <h3 className={`${styles.legend} t-caption`}>چه کسی تحویل می‌گیرد؟</h3>

          <div className={styles.options}>
            {options.map((person) => (
              <button
                key={person.id}
                type="button"
                className={styles.person}
                aria-pressed={personId === person.id}
                onClick={() => setPersonId(person.id)}
              >
                <span className={styles.personFace}>
                  {person.photoUrl ? (
                    <img src={person.photoUrl} alt="" />
                  ) : (
                    <AvatarFace seed={person.id} />
                  )}
                </span>
                <span className={styles.personMain}>
                  <span className={`${styles.personName} t-body-lg`}>{person.fullName}</span>
                  {person.relation ? (
                    <span className={`${styles.personRelation} t-caption`}>{person.relation}</span>
                  ) : null}
                </span>
                {personId === person.id ? <CheckIcon size={20} /> : null}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={`${styles.codeToggle} t-body-lg`}
            onClick={() => {
              setCodeMode(true)
              setPersonId(null)
            }}
          >
            کسی غیر از این‌ها آمده، کد دارد
          </button>

          <p className={`${styles.blocked} t-body`}>
            <span className={styles.blockedIcon} aria-hidden><AlertIcon size={18} /></span>
            <span>
              اگر نه در این فهرست است و نه کد دارد، خروج ثبت نمی‌شود. به مدیر بگویید.
            </span>
          </p>
        </section>
      ) : (
        <section className={styles.section}>
          <h3 className={`${styles.legend} t-caption`}>کد تحویل را وارد کنید</h3>

          <input
            className={styles.codeInput}
            inputMode="numeric"
            maxLength={4}
            placeholder="····"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            aria-label="کد تحویل"
            autoFocus
          />

          {checked?.valid ? (
            <div className={styles.match}>
              <span className={styles.matchFace}>
                {checked.photoUrl ? (
                  <img src={checked.photoUrl} alt="" />
                ) : (
                  <AvatarFace seed={checked.bearerName ?? code} />
                )}
              </span>
              <span className={styles.matchMain}>
                <span className={`${styles.matchName} t-h2`}>{checked.bearerName}</span>
                <span className={`${styles.matchAsk} t-body`}>
                  چهره‌اش را با این تطبیق دهید، بعد تأیید کنید.
                </span>
              </span>
            </div>
          ) : null}

          {checked && !checked.valid ? (
            <p className={`${styles.blocked} t-body`}>
              <span className={styles.blockedIcon} aria-hidden><AlertIcon size={18} /></span>
              <span>{codeProblem(checked)}</span>
            </p>
          ) : null}

          <button
            type="button"
            className={`${styles.codeToggle} t-body-lg`}
            onClick={() => {
              setCodeMode(false)
              setCode('')
              setChecked(null)
            }}
          >
            بازگشت به فهرست مجاز
          </button>
        </section>
      )}

      {error ? (
        <p className={`${styles.blocked} t-body`}>
          <span className={styles.blockedIcon} aria-hidden><AlertIcon size={18} /></span>
          <span>{error}</span>
        </p>
      ) : null}
    </BottomSheet>
  )
}

/** پیام رد شدن کد. می‌گوید چه شد و چه باید کرد، بدون عذرخواهی. */
function codeProblem(check: PickupCodeCheck): string {
  switch (check.reason) {
    case 'used':
      return 'این کد قبلاً استفاده شده. کد یکبارمصرف است. از سرپرست کد تازه بخواهید.'
    case 'wrong_day':
      return 'این کد برای امروز نیست. کد فقط همان روزی که ساخته می‌شود کار می‌کند.'
    case 'other_child':
      return 'این کد برای کودک دیگری است.'
    default:
      return 'چنین کدی وجود ندارد. رقم‌ها را دوباره بررسی کنید یا به مدیر بگویید.'
  }
}

function kindOf(options: PickupOption[], personId: string | null) {
  return options.find((o) => o.id === personId)?.kind === 'authorized'
    ? ('authorized' as const)
    : ('guardian' as const)
}

function lateMinutes(at: Date): number {
  const end = new Date(at)
  end.setHours(WORK_END.hour, WORK_END.minute, 0, 0)
  return Math.max(0, Math.round((at.getTime() - end.getTime()) / 60000))
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'ثبت نشد.'
}

