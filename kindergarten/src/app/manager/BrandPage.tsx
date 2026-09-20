import { useEffect, useRef, useState } from 'react'
import { Mascot } from '../../design-system/index.ts'
import { useData } from '../../core/auth/index.ts'
import { useCentre } from '../../core/centre/index.ts'
import { compressImage } from '../../core/media/compress.ts'
import shell from './ProgramPage.module.css'
import styles from './BrandPage.module.css'

/**
 * هویت مهد — نامی که خانواده می‌بیند و نشانی که در سرصفحه می‌نشیند.
 *
 * یک نصب، چهل مهد را می‌گرداند. تا پیش از این هر چهل تا یک اپِ
 * بی‌نام بودند: ستون‌های `name` و `logo_url` از مهاجرت ۰۰۰۲ وجود
 * داشتند و در کل رابط حتی یک بار خوانده نمی‌شدند.
 *
 * ── دو چیزی که این صفحه عمداً ندارد ─────────────────────────────
 *
 * ۱. **انتخاب رنگ.** رنگِ آسمانِ سرصفحه می‌گوید در کدام حساب هستی —
 *    سبز مربی، مرجانی خانواده، بنفش مدیر — و مربی و مدیر گاهی یک
 *    نفرند. اگر هر مهد رنگِ خودش را بگذارد، آن نشانه می‌میرد و متنِ
 *    سفیدِ روی آن هم از کنتراست می‌افتد (بخش ۱۲.۲).
 *
 * ۲. **تمدید اشتراک.** وضعیتش را نشان می‌دهد چون مدیر باید بداند، ولی
 *    دکمه‌اش را ندارد: تمدید کارِ سکوست. دکمه‌ای که کار نکند بدتر از
 *    نبودنش است.
 */
export function BrandPage({ onBack }: { onBack: () => void }) {
  const data = useData()
  const { centre, setCentre } = useCentre()
  const fileInput = useRef<HTMLInputElement>(null)

  const [name, setName] = useState(centre?.name ?? '')
  /*
   * نشانِ انتخاب‌شده ولی هنوز ذخیره‌نشده.
   *
   * تا «ذخیره» زده نشود چیزی عوض نمی‌شود — ولی مدیر باید **پیش از**
   * ذخیره ببیند چه شکلی می‌شود. لوگویی که بعد از ذخیره بد بنشیند،
   * یعنی یک رفت‌وبرگشتِ دیگر.
   */
  const [picked, setPicked] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  /*
   * از بالای صفحه باز می‌شود، نه از جایی که «منو» اسکرول شده بود.
   *
   * پنل مدیر یک قاب دارد و جابه‌جایی بین صفحه‌ها اسکرول را نگه
   * می‌دارد. اینجا بیش از هر صفحهٔ دیگری بد است: چیزی که مدیر آمده
   * ببیند — پیش‌نمایشِ سرصفحه — بالاترین کارت است.
   */
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  const shown = picked ?? centre?.logoUrl ?? null
  const dirty = name.trim() !== (centre?.name ?? '') || picked !== null

  const pick = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      /*
       * نسخهٔ کوچک، نه اصلِ عکس.
       *
       * نشان در ۴۴ پیکسل دیده می‌شود؛ فرستادن عکسِ ۱۶۰۰ پیکسلیِ
       * موبایل برای آن، هم آپلود را کند می‌کند هم بی‌فایده است.
       */
      const image = await compressImage(file)
      setPicked(URL.createObjectURL(image.thumb))
    } catch {
      setError('عکس خوانده نشد.')
    }
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const next = await data.setCentreBrand({ name: name.trim(), logoUrl: picked })
      setCentre(next)
      setPicked(null)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ذخیره نشد.')
    } finally {
      setBusy(false)
    }
  }

  const drop = async () => {
    setBusy(true)
    setError(null)
    try {
      const next = await data.clearCentreLogo()
      setCentre(next)
      setPicked(null)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'برداشته نشد.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={shell.page}>
      <header className={shell.header}>
        <button type="button" className={shell.back} onClick={onBack} aria-label="بازگشت به منو">
          ‹
        </button>
        <span className={`${shell.title} t-h2`}>هویت مهد</span>
      </header>

      <div className={shell.body}>
        <section className={shell.card} aria-label="پیش‌نمایش سرصفحه">
          <span className={`${shell.cardLabel} t-caption`}>این‌طور دیده می‌شود</span>
          {/*
            پیش‌نمایشِ خودِ سرصفحه، با همان رنگِ پنل خانواده.
            چرا خانواده: نشانِ مهد بیشتر از همه آنجا دیده می‌شود.
          */}
          <div className={styles.preview}>
            <span className={styles.brand} aria-hidden>
              {/* بی نشان، همان چیزی را نشان می‌دهد که سرصفحه واقعاً می‌کشد. */}
              {shown ? <img className={styles.logo} src={shown} alt="" /> : <Mascot kind="heart" size={44} />}
            </span>
            <span className={styles.stack}>
              <span className={`${styles.centre} t-caption`}>{name.trim() || 'نام مهد'}</span>
              <span className={`${styles.hello} t-h2`}>سلام مریم!</span>
            </span>
          </div>
          {!shown ? (
            <p className={`${shell.muted} t-caption`}>
              بی نشان هم کار می‌کند: شخصیت پوسته سر جایش می‌ماند.
            </p>
          ) : null}
        </section>

        <section className={shell.card} aria-label="نام مهد">
          <label className={`${shell.cardLabel} t-caption`} htmlFor="centre-name">
            نام مهد
          </label>
          <input
            id="centre-name"
            className={`${styles.input} t-body-lg`}
            value={name}
            maxLength={80}
            onChange={(event) => {
              setName(event.target.value)
              setSaved(false)
            }}
          />
          <p className={`${shell.muted} t-caption`}>
            همین نام در سرصفحهٔ هر سه پنل و در پروندهٔ بازرسی می‌آید.
          </p>
        </section>

        <section className={shell.card} aria-label="نشان مهد">
          <span className={`${shell.cardLabel} t-caption`}>نشان مهد</span>
          <div className={styles.actions}>
            <button
              type="button"
              className={`${styles.pick} t-body`}
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              {shown ? 'نشان دیگری انتخاب کنید' : 'انتخاب نشان'}
            </button>
            {centre?.logoUrl ? (
              <button type="button" className={`${styles.drop} t-body`} disabled={busy} onClick={() => void drop()}>
                برداشتن نشان
              </button>
            ) : null}
          </div>
          <input
            ref={fileInput}
            className={styles.hiddenInput}
            type="file"
            accept="image/*"
            aria-label="نشان مهد"
            onChange={(event) => {
              void pick(event.target.files?.[0])
              setSaved(false)
              event.target.value = ''
            }}
          />
          <p className={`${shell.muted} t-caption`}>
            تصویر مربع بهتر می‌نشیند. نشان روی قاب سفید می‌آید تا در هر سه پنل
            دیده شود.
          </p>
        </section>

        {centre ? (
          <section className={shell.card} aria-label="اشتراک">
            <span className={`${shell.cardLabel} t-caption`}>اشتراک</span>
            <p className={`${shell.note} t-body`}>
              {centre.licenceActive ? 'فعال است.' : 'تمام شده است.'}
              {centre.plan ? ` طرح: ${centre.plan}.` : ''}
            </p>
            <p className={`${shell.muted} t-caption`}>برای تغییر طرح، با پشتیبانی تماس بگیرید.</p>
          </section>
        ) : null}

        {error ? <p className={`${shell.error} t-body`} role="alert">{error}</p> : null}
        {saved && !dirty ? <p className={`${styles.ok} t-body`} role="status">ذخیره شد.</p> : null}

        <button
          type="button"
          className={`${styles.save} t-body-lg`}
          disabled={busy || !dirty || name.trim().length < 2}
          onClick={() => void save()}
        >
          ذخیره
        </button>
      </div>
    </div>
  )
}
