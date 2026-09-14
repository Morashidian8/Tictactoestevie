import { useCallback, useEffect, useState } from 'react'
import { AlertIcon, EmptyState } from '../../design-system/index.ts'
import { formatCount, formatJalali, toPersianDigits } from '../../i18n/index.ts'
import { useData } from '../../core/auth/index.ts'
import type { AuditFile, AuditReadiness } from '../../core/data/index.ts'
import styles from './AuditPage.module.css'

/**
 * خروجی پرونده بازرسی — ارتقای ۲ سند بررسی طراحی.
 *
 * بازرس بهزیستی یا شبکه بهداشت که سر می‌زند، سه دفتر می‌خواهد. مهد امروز
 * آن‌ها را دستی و روی کاغذ نگه می‌دارد و روز بازرسی هول می‌شود. داده‌اش
 * تماماً در سامانه هست؛ فقط خروجی نداشت.
 *
 * صفحه دو کار می‌کند و ترتیبشان عمدی است:
 *
 *   بالا  — نمای آمادگی: سه عددی که مدیر باید **پیش از** بازرسی ببیند.
 *           فایل روز بازرسی دیر است؛ این نما هفته‌ها زودتر کار دارد.
 *   پایین — ساختن خودِ فایل.
 */
const VACCINATION_TEXT: Record<string, string> = {
  complete: 'کامل',
  incomplete: 'ناقص',
  unrecorded: 'ثبت نشده',
}

export function AuditPage({ onBack }: { onBack: () => void }) {
  const data = useData()
  const [ready, setReady] = useState<AuditReadiness | null>(null)
  const [file, setFile] = useState<AuditFile | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setReady(await data.getAuditReadiness())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'خوانده نشد.')
    }
  }, [data])

  useEffect(() => {
    void load()
  }, [load])

  const build = async () => {
    setBusy(true)
    setError(null)
    try {
      setFile(await data.buildAuditFile())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ساخته نشد.')
    } finally {
      setBusy(false)
    }
  }

  /*
   * چاپ، نه دانلود.
   *
   * PDF ساختن در مرورگر یک کتابخانه سنگین می‌خواهد و فونت فارسی را هم
   * باید با خودش ببرد. پنجره چاپ مرورگر همان PDF را می‌دهد، با فونت
   * درست، و روی هر دستگاهی کار می‌کند. مهد هم اغلب نسخه کاغذی می‌خواهد.
   */
  const print = () => window.print()

  const gap = ready
    ? ready.incompleteVaccination + ready.missingNationalId + ready.expiringHealthCards
    : 0

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.back}
          onClick={onBack}
          aria-label="بازگشت به داشبورد"
        >
          <svg
            className="mirror"
            width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <span className={`${styles.title} t-h2`}>خروجی پرونده بازرسی</span>
      </header>

      <div className={styles.body}>
        {/* ── نمای آمادگی ── */}
        <section className={styles.card} aria-label="آمادگی بازرسی">
          <span className={`${styles.cardLabel} t-caption`}>آمادگی بازرسی، همین حالا</span>
          {ready ? (
            gap === 0 ? (
              <p className={`${styles.allGood} t-body-sm`}>
                پرونده‌ها کامل‌اند. چیزی برای جبران پیش از بازرسی نمانده.
              </p>
            ) : (
              <ul className={styles.gaps}>
                <Gap
                  count={ready.incompleteVaccination}
                  text="کودک کارت واکسیناسیون کامل ندارند"
                />
                <Gap count={ready.missingNationalId} text="کودک کد ملی ثبت‌نشده دارند" />
                <Gap
                  count={ready.expiringHealthCards}
                  text="مربی کارت بهداشتشان منقضی یا نزدیک انقضاست"
                />
              </ul>
            )
          ) : (
            <EmptyState text="در حال خواندن…" />
          )}
        </section>

        {/* ── هشدار پیش از ساخت ── */}
        <section className={styles.warn} aria-label="هشدار داده حساس">
          <span className={styles.warnIcon} aria-hidden>
            <AlertIcon size={20} />
          </span>
          <p className={`${styles.warnText} t-body-sm`}>
            این فایل کد ملی، شماره تماس و اطلاعات سلامت کودکان را دارد. ساختنش
            با نام شما ثبت می‌شود.
          </p>
        </section>

        {error ? <p className={`${styles.error} t-body-sm`}>{error}</p> : null}

        {!file ? (
          <button
            type="button"
            className={`${styles.build} t-body`}
            onClick={() => void build()}
            disabled={busy}
          >
            ساخت پرونده
          </button>
        ) : (
          <>
            <div className={styles.built}>
              <p className={`${styles.builtHead} t-body-sm`}>
                پرونده {file.centerName} · ساخته {file.builtBy} ·{' '}
                {formatJalali(new Date(file.builtAt), 'weekday')}
              </p>
              <button type="button" className={`${styles.build} t-body`} onClick={print}>
                چاپ یا ذخیره PDF
              </button>
            </div>

            <Table
              title={`جدول ۱ — دفتر آمار کودکان (${toPersianDigits(file.children.length)})`}
              head={['نام', 'کد ملی', 'کلاس', 'دوره حضور', 'سرپرست', 'تماس']}
              rows={file.children.map((row) => [
                row.fullName,
                row.nationalId ? toPersianDigits(row.nationalId) : '—',
                row.className ?? '—',
                row.attendanceType === 'morning'
                  ? 'صبح'
                  : row.attendanceType === 'afternoon'
                    ? 'بعدازظهر'
                    : 'تمام‌روز',
                row.guardianName ?? '—',
                row.guardianPhone ? toPersianDigits(row.guardianPhone) : '—',
              ])}
            />

            <Table
              title={`جدول ۲ — کنترل سلامت و واکسیناسیون (${toPersianDigits(file.health.length)})`}
              head={['کلاس', 'نام', 'آلرژی', 'بیماری زمینه‌ای', 'واکسیناسیون']}
              rows={file.health.map((row) => [
                row.className ?? '—',
                row.fullName,
                row.allergies,
                row.conditions,
                VACCINATION_TEXT[row.vaccinationStatus] ?? '—',
              ])}
              markRow={(row) => row[4] !== 'کامل'}
            />

            <Table
              title={`جدول ۳ — کارت بهداشت مربیان (${toPersianDigits(file.staff.length)})`}
              head={['نام', 'شماره کارت', 'صدور', 'انقضا', 'وضعیت']}
              rows={file.staff.map((row) => [
                row.fullName,
                row.cardNumber ? toPersianDigits(row.cardNumber) : '—',
                row.issuedAt ? toPersianDigits(row.issuedAt) : '—',
                row.expiresAt ? toPersianDigits(row.expiresAt) : '—',
                row.cardState,
              ])}
              markRow={(row) => row[4] !== 'معتبر'}
            />
          </>
        )}
      </div>
    </div>
  )
}

function Gap({ count, text }: { count: number; text: string }) {
  if (count === 0) return null
  return (
    <li className={`${styles.gap} t-body-sm`}>
      <span className={styles.gapCount}>{formatCount(count)}</span>
      <span>{text}</span>
    </li>
  )
}

/**
 * جدول چاپی.
 *
 * markRow ردیفی را که کار دارد پررنگ می‌کند — تنها رنگ کل فایل. بازرس
 * روی کاغذ دنبال همین ردیف‌ها می‌گردد.
 */
function Table({
  title,
  head,
  rows,
  markRow,
}: {
  title: string
  head: string[]
  rows: string[][]
  markRow?: (row: string[]) => boolean
}) {
  return (
    <section className={styles.tableCard} aria-label={title}>
      <h2 className={`${styles.tableTitle} t-body`}>{title}</h2>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              {head.map((cell) => (
                <th key={cell} className="t-caption">{cell}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className={markRow?.(row) ? styles.rowMarked : undefined}>
                {row.map((cell, at) => (
                  <td key={at} className="t-body-sm">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
