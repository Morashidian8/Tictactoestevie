import { useEffect, useState } from 'react'
import { toLatinDigits, toPersianDigits } from '../../i18n/index.ts'
import { useAuth } from '../../core/auth/index.ts'
import { readLastCentre, type LastCentre } from '../../core/centre/index.ts'
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
  /*
   * مهدِ بارِ پیش.
   *
   * صفحهٔ ورود حسابی ندارد، پس نمی‌تواند بپرسد «کدام مهد». ولی
   * خانواده‌ای که هر روز همین یک اپ را باز می‌کند، باید از همان
   * صفحهٔ اول مهدِ خودش را ببیند — نه نامِ عمومیِ یک نرم‌افزار.
   *
   * `useState` با مقدار آغازین و نه `useEffect`: تا اولین رنگ‌آمیزی
   * خوانده می‌شود و عنوان یک‌بار عوض نمی‌شود.
   */
  const [lastCentre] = useState(readLastCentre)
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
        <CentreMark centre={lastCentre} />
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
      <CentreMark centre={lastCentre} />
      {/* نامِ مهد بالای صفحه آمده؛ دوباره نوشتنش در عنوان، یک خط تکراری است. */}
      <h1 className={`${styles.title} t-h1`}>
        {lastCentre ? 'ورود به حساب' : 'ورود به سامانه مهد'}
      </h1>
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
 * نشانِ مهد در صفحهٔ ورود.
 *
 * فقط وقتی می‌آید که این دستگاه پیش‌تر واردِ مهدی شده باشد. اولین بار
 * — و روی دستگاهی که حافظه‌اش پاک شده — صفحه همان صفحهٔ عمومی است، و
 * این درست است: نشانِ حدسی بدتر از بی‌نشانی است.
 */
function CentreMark({ centre }: { centre: LastCentre | null }) {
  if (!centre) return null
  return (
    <div className={styles.mark}>
      {centre.logoUrl ? <img className={styles.markLogo} src={centre.logoUrl} alt="" /> : null}
      <span className={`${styles.markName} t-body-lg`}>{centre.name}</span>
    </div>
  )
}

/**
 * فقط در اجرای محلی و در نسخه نمایشی دیده می‌شود. وقتی Supabase و پنل
 * پیامک وصل شوند، کد واقعاً پیامک می‌شود و این کادر حذف می‌شود.
 *
 * شماره‌ها با import پویا می‌آیند، نه import ثابت: وگرنه همین کادرِ
 * نمایش‌داده‌نشده، داده نمونه را به بیلد تولید می‌کشاند.
 */
const IS_DEMO = import.meta.env.DEV || import.meta.env.VITE_DEMO === '1'

function DevNote() {
  const [demo, setDemo] = useState<{
    phones: Record<string, string>
    code: string
  } | null>(null)

  useEffect(() => {
    if (!IS_DEMO) return
    let cancelled = false
    void import('../../core/auth/localAuthAdapter.ts').then((mod) => {
      if (!cancelled) setDemo({ phones: mod.DEV_PHONES, code: mod.DEV_CODE })
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!IS_DEMO || !demo) return null
  return (
    <aside className={`${styles.devNote} t-caption`}>
      <strong>اجرای محلی، بدون سرور</strong>
      <span>
        مربی تمام‌روز: <span className={styles.devPhone}>{demo.phones.teacher}</span>
      </span>
      {/* سه شیفت متفاوت، تا حالت چندمربی در نسخه نمایشی دیده شود. */}
      <span>
        مربی تا ظهر: <span className={styles.devPhone}>{demo.phones.teacherMorning}</span>
      </span>
      <span>
        مربی از ظهر: <span className={styles.devPhone}>{demo.phones.teacherAfternoon}</span>
      </span>
      <span>
        مربی کلاس ستاره‌ها:{' '}
        <span className={styles.devPhone}>{demo.phones.teacherOtherClass}</span>
      </span>
      <span>
        مربی و مدیر: <span className={styles.devPhone}>{demo.phones.teacherAndManager}</span>
      </span>
      <span>
        سرپرست: <span className={styles.devPhone}>{demo.phones.guardian}</span>
      </span>
      <span>
        کد: <span className={styles.devPhone}>{demo.code}</span>
      </span>
    </aside>
  )
}
