import { useCallback, useEffect, useState } from 'react'
import {
  AlertIcon,
  BottomSheet,
  EmptyState,
  JalaliDateField,
  ShieldCheckIcon,
} from '../../design-system/index.ts'
import { formatCount, formatJalali, toPersianDigits } from '../../i18n/index.ts'
import { useAuth } from '../../core/auth/index.ts'
import { createPlatformAccess } from '../../core/platform/index.ts'
import type { CenterSummary, PlatformAccess } from '../../core/platform/index.ts'
import styles from './PlatformApp.module.css'

/**
 * کنسول اپراتور — جایی که چهل مهدِ فروخته‌شده گردانده می‌شوند.
 *
 * ── آنچه این صفحه عمداً نشان نمی‌دهد ────────────────────────────
 *
 * هیچ کودکی، هیچ گزارشی، هیچ پیامی، هیچ صورتحسابی. اپراتور مالکِ
 * سکوست، نه مالکِ پرونده‌ها.
 *
 * این محدودیت در پایگاه داده اعمال شده و تست می‌شود (مهاجرت ۰۰۴۱ و
 * جاروی `rls.sql`)؛ اینجا فقط همان مرز را تکرار می‌کند. اگر روزی این
 * صفحه چیزی جز عدد نشان داد، یعنی جایی پایین‌تر شکسته است.
 *
 * ── چرا «کاری که مانده» بالای فهرست است ─────────────────────────
 *
 * کسی که چهل مهد دارد، هر روز فهرست را نمی‌خواند. چیزی که باید
 * ببیند این است: کدام اشتراک تمام شده و کدام دارد تمام می‌شود. بقیه
 * پایین‌تر و در آرامش.
 */

/** چند روز مانده به پایان، «رو به اتمام» حساب می‌شود. */
const SOON_DAYS = 14

const today = (): string => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`
}

const daysLeft = (until: string | null): number | null => {
  if (!until) return null
  const a = new Date(`${today()}T00:00:00`)
  const b = new Date(`${until}T00:00:00`)
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

export function PlatformApp() {
  const { session, signOut } = useAuth()
  const [platform, setPlatform] = useState<PlatformAccess | null>(null)
  const [rows, setRows] = useState<CenterSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<CenterSummary | null>(null)

  useEffect(() => {
    void createPlatformAccess().then(setPlatform)
  }, [])

  const load = useCallback(async () => {
    if (!platform) return
    try {
      setRows(await platform.listCenters())
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'خوانده نشد.')
      setRows([])
    }
  }, [platform])

  useEffect(() => {
    void load()
  }, [load])

  const expired = (rows ?? []).filter((row) => !row.licenceActive)
  const soon = (rows ?? []).filter((row) => {
    const left = daysLeft(row.activeUntil)
    return row.licenceActive && left !== null && left <= SOON_DAYS
  })

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <span className={styles.badge} aria-hidden>
          <ShieldCheckIcon size={20} />
        </span>
        <span className={styles.headText}>
          <span className={`${styles.title} t-h2`}>مهدهای من</span>
          <span className={`${styles.who} t-caption`}>
            {session?.active?.displayName ?? 'پشتیبانی محصول'}
          </span>
        </span>
        <button type="button" className={`${styles.signOut} t-caption`} onClick={() => void signOut()}>
          خروج
        </button>
      </header>

      {/*
        کاری که مانده، بالای همه‌چیز.

        اشتراکِ تمام‌شده یعنی مهدی که همین حالا نمی‌تواند کار کند —
        مربی‌اش صبح اپ را باز کرده و خالی دیده. این فوری‌ترین چیزی
        است که اپراتور باید بداند.
      */}
      {expired.length > 0 || soon.length > 0 ? (
        <section className={styles.alerts} aria-label="اشتراک‌هایی که رسیدگی می‌خواهند">
          {expired.length > 0 ? (
            <p className={`${styles.alertRow} ${styles.alertBad} t-body`}>
              <AlertIcon size={18} />
              اشتراک {formatCount(expired.length)} مهد تمام شده — همین حالا بسته‌اند
            </p>
          ) : null}
          {soon.length > 0 ? (
            <p className={`${styles.alertRow} t-body`}>
              اشتراک {formatCount(soon.length)} مهد تا دو هفته دیگر تمام می‌شود
            </p>
          ) : null}
        </section>
      ) : null}

      <button type="button" className={`${styles.add} t-body-lg`} onClick={() => setAdding(true)}>
        مهد تازه
      </button>

      {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}

      {rows === null ? (
        <EmptyState text="در حال خواندن…" />
      ) : rows.length === 0 ? (
        <EmptyState text="هنوز مهدی ثبت نشده. با «مهد تازه» شروع کنید." />
      ) : (
        <ul className={styles.list}>
          {rows.map((row) => {
            const left = daysLeft(row.activeUntil)
            return (
              <li key={row.centerId}>
                <button
                  type="button"
                  className={`${styles.card} ${row.licenceActive ? '' : styles.cardOff}`}
                  onClick={() => setEditing(row)}
                >
                  <span className={styles.cardTop}>
                    <b className={`${styles.name} t-body-lg`}>{row.name}</b>
                    {/*
                      وضعیت با کلمه گفته می‌شود، نه با رنگ — بخش ۱۲.۲.
                    */}
                    <span className={`${styles.state} t-caption`}>
                      {!row.licenceActive
                        ? 'بسته'
                        : left === null
                          ? 'بی‌پایان'
                          : left <= SOON_DAYS
                            ? `${formatCount(left)} روز مانده`
                            : 'فعال'}
                    </span>
                  </span>

                  {/*
                    عدد، نه پرونده. اپراتور می‌داند مهد چقدر بزرگ است و
                    آخرین بار کِی کار کرده — و هیچ چیز دیگری.

                    جداکننده ویرگول فارسی است نه «·»: نقطهٔ وسط در اندازهٔ
                    ۱۱ پیکسل کنار رقم فارسی «۰» خوانده می‌شود و
                    «۵ کارمند» را «۰۵ کارمند» نشان می‌دهد. همان باگی که
                    یک بار در پنل مربی گرفته و درست شده بود.
                  */}
                  <span className={`${styles.counts} t-caption`}>
                    {formatCount(row.children)} کودک، {formatCount(row.staff)} کارمند،{' '}
                    {formatCount(row.families)} خانواده
                  </span>

                  <span className={`${styles.meta} t-caption`}>
                    {row.plan ? `طرح ${row.plan}` : 'بدون طرح'}
                    {'، '}
                    {row.lastActivity
                      ? `آخرین ثبت ${formatJalali(new Date(row.lastActivity), 'short')}`
                      : 'هنوز ثبتی ندارد'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <p className={`${styles.note} t-caption`}>
        اینجا فقط شمار و وضعیت اشتراک دیده می‌شود. پروندهٔ کودکان و پیام‌های هر مهد،
        حتی برای پشتیبانی، خوانده نمی‌شود.
      </p>

      {adding && platform ? (
        <NewCenterSheet
          platform={platform}
          onClose={() => setAdding(false)}
          onDone={async () => {
            setAdding(false)
            await load()
          }}
        />
      ) : null}

      {editing && platform ? (
        <LicenceSheet
          platform={platform}
          centre={editing}
          onClose={() => setEditing(null)}
          onDone={async () => {
            setEditing(null)
            await load()
          }}
        />
      ) : null}
    </main>
  )
}

/* ── شیت مهد تازه ───────────────────────────────────────────── */

function NewCenterSheet({ platform, onClose, onDone }: {
  platform: PlatformAccess
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [name, setName] = useState('')
  const [managerName, setManagerName] = useState('')
  const [phone, setPhone] = useState('')
  const [plan, setPlan] = useState('ماهانه')
  const [until, setUntil] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await platform.createCenter({
        name,
        managerName,
        managerPhone: phone,
        plan,
        activeUntil: until,
      })
      await onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ساخته نشد.')
      setBusy(false)
    }
  }

  return (
    <BottomSheet
      title="مهد تازه"
      onClose={onClose}
      footer={
        <button
          type="button"
          className={`${styles.primary} t-body-lg`}
          disabled={busy}
          onClick={() => void submit()}
        >
          ساختن مهد و حساب مدیر
        </button>
      }
    >
      <label className={`${styles.field} t-caption`}>
        نام مهد
        <input
          className={styles.input}
          value={name}
          aria-label="نام مهد"
          onChange={(event) => setName(event.target.value)}
          autoFocus
        />
      </label>

      {/*
        مدیر با همان تراکنش ساخته می‌شود.
        مهدی که مدیر ندارد، کسی را ندارد که کلاس بسازد و مربی اضافه کند.
      */}
      <label className={`${styles.field} t-caption`}>
        نام مدیر
        <input
          className={styles.input}
          value={managerName}
          aria-label="نام مدیر"
          onChange={(event) => setManagerName(event.target.value)}
        />
      </label>

      <label className={`${styles.field} t-caption`}>
        شماره موبایل مدیر — با همین وارد می‌شود
        <input
          className={styles.input}
          value={phone}
          inputMode="numeric"
          aria-label="شماره موبایل مدیر"
          placeholder="09xxxxxxxxx"
          onChange={(event) => setPhone(event.target.value)}
        />
      </label>

      <label className={`${styles.field} t-caption`}>
        طرح
        <input
          className={styles.input}
          value={plan}
          aria-label="طرح"
          onChange={(event) => setPlan(event.target.value)}
        />
      </label>

      <JalaliDateField label="اشتراک تا — خالی یعنی بی‌پایان" value={until} onChange={setUntil} />

      {error ? <p className={`${styles.error} t-caption`}>{error}</p> : null}
    </BottomSheet>
  )
}

/* ── شیت اشتراک ─────────────────────────────────────────────── */

function LicenceSheet({ platform, centre, onClose, onDone }: {
  platform: PlatformAccess
  centre: CenterSummary
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [plan, setPlan] = useState(centre.plan ?? '')
  const [until, setUntil] = useState<string | null>(centre.activeUntil)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (nextUntil: string | null) => {
    setBusy(true)
    setError(null)
    try {
      await platform.setCenterLicence(centre.centerId, plan, nextUntil)
      await onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
      setBusy(false)
    }
  }

  /** یک ماه از امروز — تمدید معمول، با یک ضربه. */
  const oneMonth = (): string => {
    const at = new Date()
    at.setMonth(at.getMonth() + 1)
    return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(
      at.getDate(),
    ).padStart(2, '0')}`
  }

  return (
    <BottomSheet
      title={centre.name}
      onClose={onClose}
      footer={
        <button
          type="button"
          className={`${styles.primary} t-body-lg`}
          disabled={busy}
          onClick={() => void save(until)}
        >
          ثبت
        </button>
      }
    >
      <p className={`${styles.counts} t-body`}>
        {formatCount(centre.children)} کودک، {formatCount(centre.staff)} کارمند،{' '}
        {formatCount(centre.families)} خانواده
      </p>

      <label className={`${styles.field} t-caption`}>
        طرح
        <input
          className={styles.input}
          value={plan}
          aria-label="طرح"
          onChange={(event) => setPlan(event.target.value)}
        />
      </label>

      <JalaliDateField label="اشتراک تا — خالی یعنی بی‌پایان" value={until} onChange={setUntil} />

      {/*
        تمدید یک‌ماهه، با یک ضربه.
        کارِ غالبِ اپراتور همین است؛ تقویم برای بقیهٔ حالت‌ها می‌ماند.
      */}
      <button
        type="button"
        className={`${styles.secondary} t-body`}
        disabled={busy}
        onClick={() => void save(oneMonth())}
      >
        تمدید یک ماه از امروز
      </button>

      {/*
        بستن مهد، نه حذفش.
        داده سر جایش می‌ماند؛ مهدی که دوباره تمدید کند همه‌چیزش برمی‌گردد.
      */}
      <button
        type="button"
        className={`${styles.danger} t-body`}
        disabled={busy}
        onClick={() => void save(today())}
      >
        بستن در پایان امروز
      </button>

      <p className={`${styles.note} t-caption`}>
        بستن، داده را پاک نمی‌کند. مهد قفل می‌شود و با تمدید، همه‌چیز برمی‌گردد.
        شمار {toPersianDigits(centre.children)} کودک سر جایش می‌ماند.
      </p>

      {error ? <p className={`${styles.error} t-caption`}>{error}</p> : null}
    </BottomSheet>
  )
}
