import { useRef, useState } from 'react'
import { compressImage } from '../core/media/compress.ts'
import styles from './FileField.module.css'

/**
 * بارگذاری تصویر یک مدرک.
 *
 * فشرده‌سازی سمت کلاینت پیش از ذخیره — بخش ۱۴.۳. عکس دوربین موبایل
 * چند مگابایت است و مدیری که ده مدرک بارگذاری می‌کند، با اینترنت مهد
 * منتظر می‌ماند.
 *
 * محدودیتی که این جزء **پنهان نمی‌کند**: تا وصل شدن استوریج، نشانی
 * `blob:` مرورگر است و با بستن صفحه می‌میرد. متن زیر همین را می‌گوید،
 * چون مدیری که فکر کند مدرکش ذخیره شده، روز بازرسی غافلگیر می‌شود.
 */
export function FileField({ label, value, onChange, hint }: {
  label: string
  value: string | null
  onChange: (url: string | null) => void
  hint?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const made = await compressImage(file)
      onChange(made.previewUrl)
    } catch {
      setError('تصویر خوانده نشد. عکس دیگری انتخاب کنید.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.field}>
      <span className={`${styles.label} t-caption`}>{label}</span>

      {value ? <img className={styles.preview} src={value} alt="" /> : null}

      <button
        type="button"
        className={`${styles.pick} ${value ? styles.pickDone : ''}`}
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? 'در حال آماده کردن…' : value ? 'تصویر دیگری انتخاب کنید' : 'انتخاب تصویر'}
      </button>

      {value ? (
        <button type="button" className={styles.clear} onClick={() => onChange(null)}>
          برداشتن تصویر
        </button>
      ) : null}

      <input
        ref={input}
        className={styles.hidden}
        type="file"
        accept="image/*"
        aria-label={label}
        onChange={(event) => void pick(event.target.files?.[0])}
      />

      {hint ? <span className={`${styles.hint} t-caption`}>{hint}</span> : null}
      {error ? <span className={`${styles.error} t-caption`}>{error}</span> : null}
    </div>
  )
}
