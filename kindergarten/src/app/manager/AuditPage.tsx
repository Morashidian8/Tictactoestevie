import { useCallback, useEffect, useState } from 'react'
import {
  AlertIcon,
  ChoiceGroup,
  EmptyState,
  FileField,
  JalaliDateField,
} from '../../design-system/index.ts'
import { formatCount, formatJalali, toIsoDate, toPersianDigits } from '../../i18n/index.ts'
import { CheckIcon } from '../../design-system/index.ts'
import { useData } from '../../core/auth/index.ts'
import type {
  AuditFile,
  AuditReadiness,
  CenterDocumentInput,
  CenterDocumentKind,
  InspectionFile,
  InspectionVisitInput,
} from '../../core/data/index.ts'
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
const CENTER_DOC_KINDS: { value: CenterDocumentKind; label: string }[] = [
  { value: 'operating_licence', label: 'مجوز فعالیت' },
  { value: 'liability_insurance', label: 'بیمه مسئولیت' },
  { value: 'fire_safety', label: 'ایمنی و اطفاء حریق' },
  { value: 'building_safety', label: 'ایمنی ساختمان' },
  { value: 'health_permit', label: 'بهداشت محیط' },
  { value: 'lease', label: 'سند یا اجاره‌نامه' },
  { value: 'other', label: 'سایر' },
]

const CENTER_DOC_TEXT: Record<string, string> = Object.fromEntries(
  CENTER_DOC_KINDS.map((k) => [k.value, k.label]),
)

/** از کجا این قلم ثابت می‌شود. */
const SOURCE_TEXT: Record<string, string> = {
  center_document: 'مدرک مهد',
  staff_document: 'مدرک مربیان',
  app_report: 'خروجی اپ',
  manual: 'دست مهد',
}

const STATE_TEXT: Record<string, string> = {
  valid: 'اعتبار تا',
  expiring: 'نزدیک انقضا،',
  expired: 'منقضی شد',
  none: '',
}

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
  /** پرونده بازرسی: چک‌لیست، مدارک مهد، و دفتر بازدید. */
  const [inspection, setInspection] = useState<InspectionFile | null>(null)
  const [sheet, setSheet] = useState<'document' | 'visit' | 'requirement' | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [readiness, inspectionFile] = await Promise.all([
        data.getAuditReadiness(),
        data.getInspectionFile(),
      ])
      setReady(readiness)
      setInspection(inspectionFile)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'خوانده نشد.')
    }
  }, [data])

  useEffect(() => {
    void load()
  }, [load])

  /** یک کار، با پیام و تازه‌سازی. */
  const run = async (job: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await job()
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'انجام نشد.')
    } finally {
      setBusy(false)
    }
  }

  const today = toIsoDate(new Date())

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

        {note ? <p className={`${styles.note} t-body-sm`}>{note}</p> : null}

        {/* ── چک‌لیست الزامات ────────────────────────────── */}
        <section className={styles.card} aria-label="چک‌لیست بازرسی">
          <span className={`${styles.cardLabel} t-caption`}>
            چک‌لیست بازرسی
            {inspection ? ` — ${formatCount(inspection.ready)} از ${formatCount(inspection.total)} آماده` : ''}
          </span>

          {inspection === null ? (
            <EmptyState text="در حال خواندن…" />
          ) : inspection.total === 0 ? (
            /*
              چک‌لیست خالی، دعوت به کنش است نه یک جمله خبری — بخش ۱۲.۱۰.
            */
            <>
              <p className={`${styles.muted} t-body-sm`}>
                هنوز چک‌لیستی ندارید. از یک سیاهه آغازین شروع کنید و بعد با الزامات
                بهزیستی استان خودتان تطبیقش بدهید.
              </p>
              <button
                type="button"
                className={styles.action}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const added = await data.seedInspectionChecklist()
                    setNote(`${formatCount(added)} قلم به چک‌لیست اضافه شد.`)
                  })
                }
              >
                ساختن چک‌لیست آغازین
              </button>
            </>
          ) : (
            <>
              <ul className={styles.checklist}>
                {inspection.requirements.map((item) => (
                  <li key={item.id} className={`${styles.requirement} t-body-sm`}>
                    <span
                      className={`${styles.mark} ${item.satisfied ? styles.markOk : styles.markGap}`}
                      aria-hidden
                    >
                      {item.satisfied ? <CheckIcon size={14} /> : '—'}
                    </span>
                    <span className={styles.reqMain}>
                      <span className={styles.reqTitle}>{item.title}</span>
                      {/*
                        وضعیت با متن گفته می‌شود، نه فقط با رنگ — بخش ۱۲.۲.
                      */}
                      <span className={`${styles.reqState} t-caption`}>
                        {item.satisfied ? SOURCE_TEXT[item.source] : 'تأمین نشده'}
                        {item.expiresAt
                          ? ` · ${STATE_TEXT[item.state]} ${formatJalali(new Date(item.expiresAt), 'short')}`
                          : ''}
                        {item.note ? ` · ${item.note}` : ''}
                      </span>
                    </span>
                    <button
                      type="button"
                      className={`${styles.hide} t-caption`}
                      onClick={() =>
                        void run(async () => {
                          await data.setRequirementActive(item.id, false)
                          setNote(`«${item.title}» از چک‌لیست برداشته شد.`)
                        })
                      }
                    >
                      لازم ندارم
                    </button>
                  </li>
                ))}
              </ul>
              {/*
                فهرست، مرجع قانونی نیست و صفحه همین را می‌گوید.
                مقررات از استانی به استان دیگر فرق دارد و بازرسِ امسال
                چیزی می‌خواهد که پارسال نمی‌خواست.
              */}
              <p className={`${styles.muted} t-caption`}>
                این سیاهه نقطه شروع است، نه فهرست قانونی. با الزامات بهزیستی و شبکه
                بهداشتِ استان خودتان تطبیقش بدهید.
              </p>
              <button type="button" className={styles.action} onClick={() => setSheet('requirement')}>
                افزودن قلم تازه
              </button>
            </>
          )}
        </section>

        {/* ── مدارک مهد ──────────────────────────────────── */}
        <section className={styles.card} aria-label="مدارک مهد">
          <span className={`${styles.cardLabel} t-caption`}>مدارک مهد</span>
          {inspection && inspection.documents.length > 0 ? (
            inspection.documents.map((doc) => {
              const expired = doc.expiresAt !== null && doc.expiresAt < today
              return (
                <p key={doc.id} className={`${styles.row} t-body-sm`}>
                  {/*
                    بندانگشتیِ خودِ برگه. مدیری که ده مدرک بارگذاری کرده
                    باید بی باز کردن هیچ‌چیز ببیند کدام‌یک واقعاً تصویر
                    دارد و کدام فقط یک عنوان است.
                  */}
                  {doc.fileUrl ? (
                    <img className={styles.thumb} src={doc.fileUrl} alt="" />
                  ) : null}
                  <span>{doc.title}</span>
                  <span className={styles.muted}>{CENTER_DOC_TEXT[doc.kind] ?? doc.kind}</span>
                  <b className={expired ? styles.expired : styles.muted}>
                    {doc.expiresAt
                      ? `${expired ? 'منقضی ' : 'تا '}${formatJalali(new Date(doc.expiresAt), 'short')}`
                      : 'بدون انقضا'}
                  </b>
                </p>
              )
            })
          ) : (
            <p className={`${styles.muted} t-body-sm`}>
              هنوز مدرکی ثبت نشده. مجوز فعالیت، بیمه مسئولیت و تأییدیه ایمنی، اولین‌هایی
              هستند که بازرس می‌خواهد.
            </p>
          )}
          <button type="button" className={styles.action} onClick={() => setSheet('document')}>
            ثبت مدرک مهد
          </button>
        </section>

        {/* ── دفتر بازدید ────────────────────────────────── */}
        <section className={styles.card} aria-label="دفتر بازدید">
          <span className={`${styles.cardLabel} t-caption`}>
            دفتر بازدید
            {inspection && inspection.openActions > 0
              ? ` — ${formatCount(inspection.openActions)} اقدام باز`
              : ''}
          </span>
          {/*
            بازرسِ بعدی اول می‌پرسد بازرسِ قبلی چه گفت. مهدی که جوابش را
            ندارد، از همان اول عقب است.
          */}
          {inspection && inspection.visits.length > 0 ? (
            inspection.visits.map((visit) => (
              <article key={visit.id} className={styles.visit}>
                <p className={`${styles.visitTop} t-body-sm`}>
                  <b>{visit.authority}</b>
                  <span className={styles.muted}>
                    {formatJalali(new Date(visit.visitedOn), 'short')}
                  </span>
                </p>
                {visit.findings ? (
                  <p className={`${styles.visitBody} t-body-sm`}>{visit.findings}</p>
                ) : null}
                {visit.actionRequired ? (
                  <>
                    <p className={`${styles.required} t-body-sm`}>
                      اقدام لازم: {visit.actionRequired}
                    </p>
                    {visit.resolvedAt ? (
                      <p className={`${styles.resolved} t-caption`}>
                        رفع شد — {formatJalali(new Date(visit.resolvedAt), 'short')}
                      </p>
                    ) : (
                      <button
                        type="button"
                        className={styles.action}
                        onClick={() =>
                          void run(async () => {
                            await data.resolveInspectionAction(visit.id)
                            setNote('اقدام لازم، رفع‌شده ثبت شد.')
                          })
                        }
                      >
                        رفع شد
                      </button>
                    )}
                  </>
                ) : null}
              </article>
            ))
          ) : (
            <p className={`${styles.muted} t-body-sm`}>
              هنوز بازدیدی ثبت نشده.
            </p>
          )}
          <button type="button" className={styles.action} onClick={() => setSheet('visit')}>
            ثبت بازدید
          </button>
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

      {sheet === 'document' ? (
        <CenterDocumentSheet
          onClose={() => setSheet(null)}
          onDone={async (input) => {
            setSheet(null)
            await run(async () => {
              await data.uploadCenterDocument(input)
              setNote(`«${input.title}» ثبت شد.`)
            })
          }}
        />
      ) : null}

      {sheet === 'visit' ? (
        <VisitSheet
          onClose={() => setSheet(null)}
          onDone={async (input) => {
            setSheet(null)
            await run(async () => {
              await data.recordInspectionVisit(input)
              setNote('بازدید ثبت شد.')
            })
          }}
        />
      ) : null}

      {sheet === 'requirement' ? (
        <RequirementSheet
          onClose={() => setSheet(null)}
          onDone={async (title, reqNote) => {
            setSheet(null)
            await run(async () => {
              await data.addInspectionRequirement(title, reqNote)
              setNote(`«${title}» به چک‌لیست اضافه شد.`)
            })
          }}
        />
      ) : null}
    </div>
  )
}

/* ── ثبت مدرک مهد ───────────────────────────────────────────── */

function CenterDocumentSheet({ onClose, onDone }: {
  onClose: () => void
  onDone: (input: CenterDocumentInput) => Promise<void>
}) {
  const [kind, setKind] = useState<CenterDocumentKind>('operating_licence')
  const [title, setTitle] = useState('')
  const [issuer, setIssuer] = useState('')
  const [reference, setReference] = useState('')
  const [expires, setExpires] = useState<string | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    /*
     * تاریخ همیشه میلادیِ ISO از تقویم می‌آید — بخش ۱۲.
     *
     * پیش‌تر اینجا ورودی متنی بود و رشته جلالی تجزیه می‌شد. وضعیت انقضا
     * با `current_date` مقایسه می‌شود؛ یک تجزیه ناموفق یعنی «مجوز
     * منقضی» هرگز درست درنمی‌آید، و آن یکی مهد را تعطیل می‌کند. تقویم
     * اصلاً اجازه نوشتن تاریخ نامعتبر را نمی‌دهد.
     */
    if (!title.trim() && !CENTER_DOC_TEXT[kind]) {
      setError('عنوان مدرک لازم است.')
      return
    }
    void onDone({
      kind,
      title: title.trim() || (CENTER_DOC_TEXT[kind] ?? 'مدرک'),
      fileUrl,
      issuer,
      referenceNo: reference,
      expiresAt: expires,
    })
  }

  return (
    <div className={styles.sheetBackdrop} role="dialog" aria-label="ثبت مدرک مهد">
      <div className={styles.sheet}>
        <p className={`${styles.sheetTitle} t-h2`}>مدرک مهد</p>

        <ChoiceGroup
          label="نوع مدرک"
          options={CENTER_DOC_KINDS}
          value={kind}
          onChange={setKind}
        />

        <label className={`${styles.field} t-caption`}>
          عنوان
          <input
            className={styles.input}
            value={title}
            aria-label="عنوان مدرک مهد"
            placeholder={CENTER_DOC_TEXT[kind]}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <label className={`${styles.field} t-caption`}>
          مرجع صادرکننده
          <input
            className={styles.input}
            value={issuer}
            aria-label="مرجع صادرکننده"
            placeholder="مثلاً: بهزیستی استان"
            onChange={(event) => setIssuer(event.target.value)}
          />
        </label>

        <label className={`${styles.field} t-caption`}>
          شماره مدرک
          <input
            className={styles.input}
            value={reference}
            aria-label="شماره مدرک"
            onChange={(event) => setReference(event.target.value)}
          />
        </label>

        <JalaliDateField label="اعتبار تا" value={expires} onChange={setExpires} />

        <FileField
          label="تصویر مدرک"
          value={fileUrl}
          onChange={setFileUrl}
          hint="بازرس خودِ برگه را می‌خواهد، نه فهرست عنوان‌ها."
        />

        {error ? <p className={`${styles.error} t-caption`}>{error}</p> : null}

        <div className={styles.sheetActions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            انصراف
          </button>
          <button type="button" className={`${styles.primary} t-body-sm`} onClick={submit}>
            ثبت
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── ثبت بازدید ─────────────────────────────────────────────── */

function VisitSheet({ onClose, onDone }: {
  onClose: () => void
  onDone: (input: InspectionVisitInput) => Promise<void>
}) {
  const [authority, setAuthority] = useState('')
  const [inspector, setInspector] = useState('')
  const [findings, setFindings] = useState('')
  const [action, setAction] = useState('')
  const [visited, setVisited] = useState<string | null>(toIsoDate(new Date()))
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    if (visited === null) {
      setError('تاریخ بازدید لازم است. از تقویم انتخابش کنید.')
      return
    }
    if (!authority.trim()) {
      setError('نام مرجع بازرسی لازم است.')
      return
    }
    void onDone({
      visitedOn: visited,
      authority,
      inspectorName: inspector,
      findings,
      actionRequired: action,
    })
  }

  return (
    <div className={styles.sheetBackdrop} role="dialog" aria-label="ثبت بازدید">
      <div className={styles.sheet}>
        <p className={`${styles.sheetTitle} t-h2`}>بازدید بازرس</p>

        <label className={`${styles.field} t-caption`}>
          مرجع بازرسی
          <input
            className={styles.input}
            value={authority}
            aria-label="مرجع بازرسی"
            placeholder="بهزیستی، شبکه بهداشت، آتش‌نشانی…"
            onChange={(event) => setAuthority(event.target.value)}
          />
        </label>

        <JalaliDateField
          label="تاریخ بازدید"
          value={visited}
          onChange={setVisited}
          allowClear={false}
        />

        <label className={`${styles.field} t-caption`}>
          نام بازرس
          <input
            className={styles.input}
            value={inspector}
            aria-label="نام بازرس"
            onChange={(event) => setInspector(event.target.value)}
          />
        </label>

        <label className={`${styles.field} t-caption`}>
          آنچه گفت
          <textarea
            className={styles.textarea}
            value={findings}
            rows={3}
            aria-label="یافته‌های بازرس"
            onChange={(event) => setFindings(event.target.value)}
          />
        </label>

        {/*
          اقدام لازم، جدا از یافته‌ها.
          بازرسِ بعدی اول می‌پرسد قبلی چه خواست و آیا رفع شد — و آن
          سؤال با یک پاراگراف آزاد جواب داده نمی‌شود.
        */}
        <label className={`${styles.field} t-caption`}>
          اقدام لازم — اگر چیزی خواست
          <textarea
            className={styles.textarea}
            value={action}
            rows={2}
            aria-label="اقدام لازم"
            onChange={(event) => setAction(event.target.value)}
          />
        </label>

        {error ? <p className={`${styles.error} t-caption`}>{error}</p> : null}

        <div className={styles.sheetActions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            انصراف
          </button>
          <button
            type="button"
            className={`${styles.primary} t-body-sm`}
            disabled={authority.trim().length === 0}
            onClick={submit}
          >
            ثبت
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── افزودن قلم به چک‌لیست ───────────────────────────────────── */

function RequirementSheet({ onClose, onDone }: {
  onClose: () => void
  onDone: (title: string, note?: string) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')

  return (
    <div className={styles.sheetBackdrop} role="dialog" aria-label="افزودن قلم چک‌لیست">
      <div className={styles.sheet}>
        <p className={`${styles.sheetTitle} t-h2`}>قلم تازه چک‌لیست</p>
        {/*
          قلمی که مهد خودش اضافه می‌کند «دستی» است: اپ نمی‌تواند بداند
          چطور ثابتش کند، پس هرگز خودش تیک نمی‌زند — فقط یادآوری می‌کند.
        */}
        <p className={`${styles.muted} t-caption`}>
          این قلم را اپ نمی‌تواند خودش بررسی کند؛ فقط در فهرست می‌ماند تا یادتان بماند.
        </p>

        <label className={`${styles.field} t-caption`}>
          عنوان
          <input
            className={styles.input}
            value={title}
            aria-label="عنوان قلم چک‌لیست"
            placeholder="مثلاً: تأییدیه سیستم گرمایشی"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <label className={`${styles.field} t-caption`}>
          توضیح — اختیاری
          <input
            className={styles.input}
            value={note}
            aria-label="توضیح قلم چک‌لیست"
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

        <div className={styles.sheetActions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            انصراف
          </button>
          <button
            type="button"
            className={`${styles.primary} t-body-sm`}
            disabled={title.trim().length === 0}
            onClick={() => void onDone(title, note)}
          >
            افزودن
          </button>
        </div>
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
