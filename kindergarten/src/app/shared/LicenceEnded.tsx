import type { Centre } from '../../core/data/index.ts'
import { useAuth } from '../../core/auth/index.ts'
import { formatJalali } from '../../i18n/index.ts'
import styles from './LicenceEnded.module.css'

/**
 * وقتی اشتراک مهد تمام شده است.
 *
 * مهاجرت ۰۰۴۱ قفل را در خودِ پایگاه داده گذاشت: `current_center_id`
 * برای مهدِ منقضی تهی می‌شود و هیچ پرس‌وجویی سطری برنمی‌گرداند. این
 * صفحه، روی همان قفل حرف می‌زند.
 *
 * ── سه چیزی که این صفحه عمداً می‌کند ────────────────────────────
 *
 * ۱. **می‌گوید داده پاک نشده.** مدیری که صبح اپ را باز می‌کند و
 *    فهرست خالی می‌بیند، فکر می‌کند پروندهٔ صد کودک از بین رفته.
 *    نمی‌رفته: قفل است، نه پاک‌شدن.
 *
 * ۲. **نامِ مهد و تاریخِ پایان را می‌آورد.** «اشتراک شما تمام شده»
 *    بدون تاریخ، یعنی مدیر باید زنگ بزند تا بفهمد کِی.
 *
 * ۳. **راهِ خروج دارد.** همان شماره ممکن است در مهد دیگری هم حساب
 *    داشته باشد؛ صفحه‌ای بی دکمهٔ خروج، او را حبس می‌کند.
 *
 * چیزی که **نمی‌کند**: دکمهٔ «تمدید». تمدید کارِ اپراتور سکوست و از
 * این پنل شدنی نیست — دکمه‌ای که کار نکند بدتر از نبودنش است.
 */
export function LicenceEnded({ centre }: { centre: Centre }) {
  const { signOut } = useAuth()
  const ended = centre.activeUntil ? new Date(`${centre.activeUntil}T00:00:00`) : null

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <p className={`${styles.centre} t-caption`}>{centre.name}</p>
        <h1 className={`${styles.title} t-h2`}>اشتراک این مهد تمام شده است</h1>

        {ended ? (
          <p className={`${styles.when} t-body`}>
            آخرین روز اشتراک: {formatJalali(ended, 'full')}
          </p>
        ) : null}

        <p className={`${styles.calm} t-body`}>
          داده‌های مهد سر جایشان هستند — پرونده کودکان، گزارش‌ها و حساب‌ها پاک
          نشده‌اند. با تمدید اشتراک، همان لحظه برمی‌گردند.
        </p>

        <p className={`${styles.how} t-body`}>
          برای تمدید با پشتیبانی تماس بگیرید.
        </p>

        <button type="button" className={`${styles.out} t-body-lg`} onClick={() => void signOut()}>
          خروج از حساب
        </button>
      </div>
    </main>
  )
}
