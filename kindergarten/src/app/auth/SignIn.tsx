import { useState } from 'react'
import { toLatinDigits, toPersianDigits } from '../../i18n/index.ts'
import { DEV_CODE, DEV_PHONES, useAuth } from '../../core/auth/index.ts'
import styles from './SignIn.module.css'

/**
 * ورود — بخش ۳.۲ سند.
 *
 * شماره تلفن ← کد یکبارمصرف ← اگر بیش از یک حساب داشت، صفحه انتخاب حساب.
 *
 * لحن نوشتار از بخش ۱۲.۱۰: دکمه دقیقاً می‌گوید چه اتفاقی می‌افتد، و خطا
 * توضیح می‌دهد چه شد و چه باید کرد، بدون عذرخواهی.
 */
type Step = 'phone' | 'code'

export function SignIn() {
  const { requestCode, verifyCode } = useAuth()
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await task()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'مشکلی پیش آمد.')
    } finally {
      setBusy(false)
    }
  }

  if (step === 'code') {
    return (
      <main className={styles.screen}>
        <h1 className={`${styles.title} t-h1`}>کد را وارد کنید</h1>
        <p className={`${styles.hint} t-body`}>
          کد پنج‌رقمی به شماره {toPersianDigits(phone)} فرستاده شد.
        </p>

        <form
          className={styles.field}
          onSubmit={(event) => {
            event.preventDefault()
            // اگر شماره بیش از یک حساب داشته باشد، حساب فعالی نمی‌نشیند و
            // مسیریابی خودش صفحه انتخاب حساب را می‌آورد.
            void run(async () => {
              await verifyCode(phone, toLatinDigits(code))
            })
          }}
        >
          <label className={`${styles.label} t-caption`} htmlFor="code">
            کد یکبارمصرف
          </label>
          <input
            id="code"
            className={`${styles.input} t-body-lg`}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={5}
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}
          <button
            type="submit"
            className={`${styles.submit} t-body-lg`}
            disabled={busy || toLatinDigits(code).length < 5}
          >
            ورود
          </button>
        </form>

        <button type="button" className={`${styles.link} t-body`} onClick={() => setStep('phone')}>
          تغییر شماره
        </button>

        <DevNote />
      </main>
    )
  }

  return (
    <main className={styles.screen}>
      <h1 className={`${styles.title} t-h1`}>ورود به سامانه مهد</h1>
      <p className={`${styles.hint} t-body`}>شماره تلفنتان را وارد کنید تا کد بفرستیم.</p>

      <form
        className={styles.field}
        onSubmit={(event) => {
          event.preventDefault()
          void run(async () => {
            await requestCode(toLatinDigits(phone))
            setCode('')
            setStep('code')
          })
        }}
      >
        <label className={`${styles.label} t-caption`} htmlFor="phone">
          شماره تلفن
        </label>
        <input
          id="phone"
          className={`${styles.input} t-body-lg`}
          inputMode="tel"
          autoComplete="tel"
          placeholder="09121234567"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
        {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}
        <button
          type="submit"
          className={`${styles.submit} t-body-lg`}
          disabled={busy || toLatinDigits(phone).length < 11}
        >
          فرستادن کد
        </button>
      </form>

      <DevNote />
    </main>
  )
}

/**
 * فقط در اجرای محلی و در نسخه نمایشی دیده می‌شود. وقتی Supabase و پنل
 * پیامک وصل شوند، کد واقعاً پیامک می‌شود و این کادر حذف می‌شود.
 */
function DevNote() {
  if (!import.meta.env.DEV && import.meta.env.VITE_DEMO !== '1') return null
  return (
    <aside className={`${styles.devNote} t-caption`}>
      <strong>اجرای محلی، بدون سرور</strong>
      <span>
        شماره یک‌حسابه: <span className={styles.devPhone}>{DEV_PHONES[0]}</span>
      </span>
      <span>
        شماره دوحسابه: <span className={styles.devPhone}>{DEV_PHONES[1]}</span>
      </span>
      <span>
        کد: <span className={styles.devPhone}>{DEV_CODE}</span>
      </span>
    </aside>
  )
}
