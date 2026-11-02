import { useCallback, useEffect, useState } from 'react'
import {
  AlertIcon,
  ChoiceGroup,
  EmptyState,
  FileField,
  JalaliDateField,
} from '../../design-system/index.ts'
import { formatAge, formatCount, formatJalali, toIsoDate, toPersianDigits } from '../../i18n/index.ts'
import { useData } from '../../core/auth/index.ts'
import { STAFF_TITLE_LABEL } from '../../core/data/index.ts'
import type {
  NewStaff,
  PendingStaffDocument,
  SlotState,
  StaffDocumentRequirement,
  StaffDocumentSlot,
  StaffTitle,
  StaffCartableRow,
  StaffDocumentKind,
  StaffField,
  StaffNoteKind,
  StaffProfile,
} from '../../core/data/index.ts'
import styles from './StaffPage.module.css'

/**
 * کارتابل کارکنان — ماژول ۰۰۲۲ و ۰۰۲۴.
 *
 * خواسته مالک محصول: «عملکرد مربی‌ها توسط مدیر چگونه ارزیابی میشه … یعنی
 * مربی ها دارای پروفایل باشند در کارتابل مدیر» و «تصاویر گواهینامه مربی
 * ها بشه آپلود کرد … و بشه خروجی گرفت برای بازرس».
 *
 * سه قاعده که این صفحه نمی‌شکند:
 *
 * ۱. **هیچ نمره، رتبه یا مقایسه‌ای بین مربیان.** کارتابل فعالیت را
 *    می‌شمارد، نه کیفیت را. یک تست کل شِما را برای ستون امتیاز می‌گردد.
 *
 * ۲. **شمار رخداد، معیار عملکرد نیست و اینجا نمی‌آید.** اگر مربی ببیند
 *    ثبت رخداد به ضررش تمام می‌شود، کمتر ثبت می‌کند — و آسیبش به کودک
 *    می‌رسد، نه به مربی.
 *
 * ۳. **ارزیابیِ در میان گذاشته‌نشده، ارزیابی نیست.** صفحه مدیر را وادار
 *    نمی‌کند، ولی «با مربی در میان گذاشته نشده» را صریح نشان می‌دهد.
 */

const DOC_KINDS: { value: StaffDocumentKind; label: string; needsExpiry: boolean }[] = [
  { value: 'health_card', label: 'کارت بهداشت', needsExpiry: true },
  { value: 'degree', label: 'مدرک تحصیلی', needsExpiry: false },
  { value: 'training', label: 'گواهی دوره', needsExpiry: false },
  { value: 'national_id', label: 'کارت ملی', needsExpiry: false },
  { value: 'criminal_record', label: 'عدم سوءپیشینه', needsExpiry: true },
  { value: 'contract', label: 'قرارداد', needsExpiry: true },
  { value: 'other', label: 'سایر', needsExpiry: false },
]

/*
 * حالت هر قلم از چک‌لیست، با **کلمه**.
 *
 * همان فهرستی که پنل مربی نشان می‌دهد — دو طرف باید یک چیز بخوانند،
 * وگرنه مربی می‌گوید «فرستادم» و مدیر می‌گوید «نیامده».
 */
const SLOT_TEXT: Record<SlotState, string> = {
  missing: 'نیامده',
  pending: 'در انتظار تأیید',
  rejected: 'رد شد',
  expired: 'منقضی شده',
  expiring: 'رو به انقضا',
  valid: 'تأیید شده',
  none: 'تأیید شده',
}

/** کدام حالت‌ها کاری می‌خواهند. */
const SLOT_TODO: Record<SlotState, boolean> = {
  missing: true,
  pending: true,
  rejected: true,
  expired: true,
  expiring: true,
  valid: false,
  none: false,
}

const NOTE_KINDS: { value: StaffNoteKind; label: string }[] = [
  { value: 'commendation', label: 'تقدیر' },
  { value: 'review', label: 'ارزیابی دوره‌ای' },
  { value: 'training', label: 'دوره لازم' },
  { value: 'concern', label: 'نگرانی' },
]

const NOTE_LABEL: Record<string, string> = Object.fromEntries(
  NOTE_KINDS.map((k) => [k.value, k.label]),
)
const DOC_LABEL: Record<string, string> = Object.fromEntries(
  DOC_KINDS.map((k) => [k.value, k.label]),
)

export function StaffPage({ openStaffId, onBack }: {
  /** پرونده‌ای که باید همان اول باز باشد — مثلاً از داشبورد مدیر. */
  openStaffId?: string | null
  onBack: () => void
}) {
  const data = useData()
  const [rows, setRows] = useState<StaffCartableRow[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(openStaffId ?? null)
  const [addingStaff, setAddingStaff] = useState(false)
  const [exported, setExported] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [queue, setQueue] = useState<PendingStaffDocument[] | null>(null)
  const [rejecting, setRejecting] = useState<PendingStaffDocument | null>(null)
  const [needs, setNeeds] = useState<StaffDocumentRequirement[] | null>(null)
  const [askingNeed, setAskingNeed] = useState(false)

  const load = useCallback(async () => {
    const to = toIsoDate(new Date())
    const from = new Date()
    from.setDate(from.getDate() - 30)
    try {
      setRows(await data.getStaffCartable(toIsoDate(from), to))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'خوانده نشد.')
      setRows([])
    }
  }, [data])

  const loadQueue = useCallback(() => {
    data.listPendingDocuments().then(setQueue).catch(() => setQueue([]))
    data.listDocumentRequirements().then(setNeeds).catch(() => setNeeds([]))
  }, [data])

  useEffect(() => {
    void load()
    loadQueue()
  }, [load, loadQueue])

  if (openId) {
    return (
      <StaffFile
        staffId={openId}
        onBack={() => {
          setOpenId(null)
          void load()
        }}
      />
    )
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="بازگشت به داشبورد">
          <Chevron />
        </button>
        <span className={`${styles.title} t-h2`}>کارکنان</span>
      </header>

      <div className={styles.body}>
        {/*
          آنچه این صفحه عمداً نمی‌گوید: کدام مربی «بهتر» است.
          گفتنش یعنی ساختن معیاری که مربی برای بهتر شدنش، کار واقعی را
          کنار بگذارد.
        */}
        <p className={`${styles.muted} t-caption`}>
          فعالیت سی روز گذشته. این ارقام کارِ ثبت‌شده را می‌شمارند، نه کیفیت کار را —
          و بین مربیان مقایسه نمی‌شوند.
        </p>

        {/*
          صف تأیید مدارک، **بالای** فهرست.

          این تنها چیز این صفحه است که کسِ دیگری منتظرش است: مربی مدرکش
          را فرستاده و تا مدیر جواب ندهد، برایش ثبت نشده. کاری که کسی
          منتظرش است، پایین صفحه نمی‌رود.
        */}
        {queue && queue.length > 0 ? (
          <section className={styles.queue} aria-label="مدارک در انتظار تأیید">
            <p className={`${styles.queueTitle} t-body-lg`}>
              <AlertIcon size={18} />
              {formatCount(queue.length)} مدرک در انتظار تأیید شما
            </p>
            {queue.map((doc) => (
              <article key={doc.id} className={styles.queueRow}>
                <p className={`${styles.queueWho} t-body`}>
                  <b>{doc.fullName}</b>
                  <span className={styles.muted}>{doc.title}</span>
                </p>
                {/*
                  خودِ تصویر، نه فقط عنوانش.
                  مدیری که مدرک را ندیده، تأییدش هم بی‌معنا است.
                */}
                <img className={styles.queueShot} src={doc.fileUrl} alt="" />
                {doc.expiresAt ? (
                  <p className={`${styles.muted} t-caption`}>
                    اعتبار تا {formatJalali(new Date(doc.expiresAt), 'short')}
                  </p>
                ) : null}
                <div className={styles.queueActions}>
                  <button
                    type="button"
                    className={`${styles.primary} t-body`}
                    onClick={() =>
                      void data
                        .reviewStaffDocument(doc.id, true)
                        .then(() => {
                          loadQueue()
                          void load()
                        })
                        .catch((cause: unknown) =>
                          setError(cause instanceof Error ? cause.message : 'ثبت نشد.'),
                        )
                    }
                  >
                    تأیید
                  </button>
                  <button
                    type="button"
                    className={`${styles.secondary} t-body`}
                    onClick={() => setRejecting(doc)}
                  >
                    رد با توضیح
                  </button>
                </div>
              </article>
            ))}
          </section>
        ) : null}

        {rows === null ? (
          <EmptyState text="در حال خواندن…" />
        ) : rows.length === 0 ? (
          <EmptyState text="کارکنی ثبت نشده." />
        ) : (
          <ul className={styles.list}>
            {rows.map((row) => (
              <li key={row.staffId}>
                <button type="button" className={styles.item} onClick={() => setOpenId(row.staffId)}>
                  <span className={styles.main}>
                    <span className={`${styles.name} t-body`}>
                      {row.fullName}
                      {/* سمت کنار نام: مدیری که چارت می‌چیند، همین را می‌خواند. */}
                      <span className={`${styles.badge} t-caption`}>
                        {STAFF_TITLE_LABEL[row.title]}
                      </span>
                    </span>
                    <span className={`${styles.stats} t-caption`}>
                      {/*
                        ویرگول فارسی، نه «·»: نقطه‌چین میان دو رقم فارسی
                        «۰» خوانده می‌شود.
                      */}
                      {formatCount(row.daysActive)} روز فعال،{' '}
                      {formatCount(row.checkIns)} ورود ثبت‌شده
                    </span>
                    {row.lastReview ? (
                      <span className={`${styles.muted} t-caption`}>
                        آخرین ارزیابی: {formatJalali(new Date(row.lastReview), 'short')}
                      </span>
                    ) : (
                      <span className={`${styles.needsReview} t-caption`}>
                        هنوز ارزیابی نشده
                      </span>
                    )}
                  </span>
                  {/*
                    مدرک منقضی، تنها هشدار این فهرست است — چون تنها چیزی
                    است که روز بازرسی تبدیل به تخلف می‌شود.
                  */}
                  {row.documentsExpired > 0 ? (
                    <span className={`${styles.flag} ${styles.flagBad}`}>
                      {formatCount(row.documentsExpired)} مدرک منقضی
                    </span>
                  ) : row.documentsExpiring > 0 ? (
                    <span className={styles.flag}>
                      {formatCount(row.documentsExpiring)} مدرک رو به انقضا
                    </span>
                  ) : null}
                  <Chevron flip />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/*
          افزودن مربی، بالای خروجی.

          تا امروز هیچ راهی نبود: ردیف کارکن فقط با دست در پایگاه داده
          ساخته می‌شد. مدیری که مربی تازه استخدام کرده، همان روز اول به
          آن نیاز دارد.
        */}
        <button type="button" className={styles.action} onClick={() => setAddingStaff(true)}>
          افزودن مربی
        </button>

        {/*
          فهرست مدارکی که از هر مربی خواسته می‌شود.

          فهرست **داده است، نه کد** — همان استدلال چک‌لیست بازرسی:
          مقررات از استانی به استان دیگر فرق دارد و مهدِ خصوصی چیزی
          می‌خواهد که مهدِ دولتی نمی‌خواهد. مربی همین فهرست را در پنل
          خودش می‌بیند.
        */}
        <section className={styles.card} aria-label="مدارک لازم از مربیان">
          <span className={`${styles.cardLabel} t-caption`}>مدارک لازم از هر مربی</span>
          {needs === null ? (
            <p className={`${styles.muted} t-body`}>در حال خواندن…</p>
          ) : needs.length === 0 ? (
            <p className={`${styles.muted} t-body`}>
              هنوز چیزی خواسته نشده. تا این فهرست خالی باشد، پنل مربی چیزی برای بارگذاری ندارد.
            </p>
          ) : (
            needs.map((need) => (
              <p key={need.id} className={`${styles.row} t-body`}>
                <span>{need.title}</span>
                <span className={styles.muted}>
                  {need.needsExpiry ? 'با تاریخ اعتبار' : 'بدون تاریخ'}
                </span>
                <button
                  type="button"
                  className={styles.linkAction}
                  onClick={() =>
                    void data
                      .dropDocumentRequirement(need.id)
                      .then(loadQueue)
                      .catch((cause: unknown) =>
                        setError(cause instanceof Error ? cause.message : 'برداشته نشد.'),
                      )
                  }
                >
                  برداشتن
                </button>
              </p>
            ))
          )}
          <button type="button" className={styles.action} onClick={() => setAskingNeed(true)}>
            افزودن به فهرست
          </button>
        </section>

        <button
          type="button"
          className={styles.action}
          onClick={() => void data.exportStaffFile().then(setExported).catch(() => setExported(null))}
        >
          خروجی پرونده کارکنان برای بازرس
        </button>

        {exported ? (
          <section className={styles.export} aria-label="خروجی پرونده کارکنان">
            <pre className={styles.exportText}>{exported}</pre>
          </section>
        ) : null}

        {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}
      </div>

      {rejecting ? (
        <RejectSheet
          doc={rejecting}
          onClose={() => setRejecting(null)}
          onDone={() => {
            setRejecting(null)
            loadQueue()
            void load()
          }}
        />
      ) : null}

      {askingNeed ? (
        <RequirementSheet
          onClose={() => setAskingNeed(false)}
          onDone={() => {
            setAskingNeed(false)
            loadQueue()
          }}
        />
      ) : null}

      {addingStaff ? (
        <NewStaffSheet
          onClose={() => setAddingStaff(false)}
          onDone={async (id) => {
            setAddingStaff(false)
            await load()
            // پرونده‌اش همان‌جا باز می‌شود: مدیری که تازه مربی را اضافه
            // کرده، کار بعدی‌اش پر کردن همان پرونده است.
            setOpenId(id)
          }}
        />
      ) : null}
    </div>
  )
}

/* ── شیت افزودن مربی ────────────────────────────────────────── */

/*
 * دو فهرست، چون دو چیز متفاوت‌اند.
 *
 * **دسترسی** تعیین می‌کند چه می‌بیند و چه می‌تواند؛ سه مقدار دارد و
 * تمام سیاست‌های سطر-محور روی همان بنا شده. **سمت** آنچه روی چارت مهد
 * نوشته می‌شود و بازرس می‌پرسد. سرمربی و کمک‌مربی هر دو دسترسیِ «مربی»
 * دارند — مهاجرت ۰۰۳۸.
 */
const STAFF_ROLES: { value: NewStaff['role']; label: string }[] = [
  { value: 'teacher', label: 'مربی' },
  { value: 'assistant', label: 'کمک‌مربی' },
  { value: 'manager', label: 'مدیر' },
]

const STAFF_TITLES: { value: StaffTitle; label: string }[] = (
  Object.keys(STAFF_TITLE_LABEL) as StaffTitle[]
).map((value) => ({ value, label: STAFF_TITLE_LABEL[value] }))

function NewStaffSheet({ onClose, onDone }: {
  onClose: () => void
  onDone: (staffId: string) => Promise<void>
}) {
  const data = useData()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [role, setRole] = useState<NewStaff['role']>('teacher')
  const [title, setTitle] = useState<StaffTitle>('teacher')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await onDone(await data.addStaff({ firstName, lastName, role, title, phone }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
      setBusy(false)
    }
  }

  return (
    <div className={styles.sheetBackdrop} role="dialog" aria-label="افزودن مربی">
      <div className={styles.sheet}>
        <p className={`${styles.sheetTitle} t-h2`}>مربی تازه</p>

        <label className={`${styles.field} t-caption`}>
          نام
          <input
            className={styles.input}
            value={firstName}
            aria-label="نام مربی"
            onChange={(event) => setFirstName(event.target.value)}
            autoFocus
          />
        </label>

        <label className={`${styles.field} t-caption`}>
          نام خانوادگی
          <input
            className={styles.input}
            value={lastName}
            aria-label="نام خانوادگی مربی"
            onChange={(event) => setLastName(event.target.value)}
          />
        </label>

        <ChoiceGroup label="دسترسی" options={STAFF_ROLES} value={role} onChange={setRole} />
        <ChoiceGroup label="سمت" options={STAFF_TITLES} value={title} onChange={setTitle} />

        <label className={`${styles.field} t-caption`}>
          شماره تماس
          <input
            className={styles.input}
            value={phone}
            inputMode="numeric"
            aria-label="شماره تماس مربی"
            onChange={(event) => setPhone(event.target.value)}
          />
        </label>

        {/*
          آنچه اینجا نیست: ساختن حساب کاربری و دسترسی.
          آن، تصمیم جداگانه‌ای است (بخش ۷.۴) و از فرمِ «مربی تازه»
          بیرون می‌ماند.
        */}
        <p className={`${styles.muted} t-caption`}>
          بقیه مشخصات را در پرونده‌اش وارد کنید. دسترسی به اپ جداگانه داده می‌شود.
        </p>

        {error ? <p className={`${styles.error} t-caption`}>{error}</p> : null}

        <div className={styles.sheetActions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            انصراف
          </button>
          <button
            type="button"
            className={`${styles.primary} t-body-sm`}
            onClick={() => void submit()}
            disabled={busy || !firstName.trim()}
          >
            افزودن
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── پرونده یک مربی ─────────────────────────────────────────── */

function StaffFile({ staffId, onBack }: { staffId: string; onBack: () => void }) {
  const data = useData()
  const [file, setFile] = useState<StaffProfile | null>(null)
  const [adding, setAdding] = useState<'doc' | 'note' | 'profile' | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [slots, setSlots] = useState<StaffDocumentSlot[] | null>(null)

  const load = useCallback(async () => {
    try {
      setFile(await data.getStaffProfile(staffId))
    } catch {
      setFile(null)
    }
    data.getStaffDocumentChecklist(staffId).then(setSlots).catch(() => setSlots([]))
  }, [data, staffId])

  const [titleOpen, setTitleOpen] = useState(false)
  const [exitOpen, setExitOpen] = useState(false)

  useEffect(() => {
    void load()
  }, [load])

  if (!file) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <button type="button" className={styles.back} onClick={onBack} aria-label="بازگشت به فهرست کارکنان">
            <Chevron />
          </button>
          <span className={`${styles.title} t-h2`}>پرونده مربی</span>
        </header>
        <EmptyState text="در حال خواندن…" />
      </div>
    )
  }

  const today = toIsoDate(new Date())
  /* مدارکی که هیچ قلمِ چک‌لیست ادعایشان را نمی‌کند. */
  const onList = new Set((slots ?? []).map((slot) => slot.kind))
  const extras = file.documents.filter((doc) => !onList.has(doc.kind))

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="بازگشت به فهرست کارکنان">
          <Chevron />
        </button>
        <span className={`${styles.title} t-h2`}>{file.fullName}</span>
      </header>

      <div className={styles.body}>
        {note ? <p className={`${styles.note} t-body`}>{note}</p> : null}

        {/*
          مشخصات — نام، سن، تماس، سکونت، تحصیلات و سوابق.

          تا امروز اینجا فقط نقش و کلاس بود. پرونده پرسنلیِ مهدکودک این
          نیست: بازرس بهزیستی رزومه و کد ملی می‌خواهد، و مدیری که شب
          باید به مربی زنگ بزند نشانی و شماره می‌خواهد.

          شماره تماس اینجا **هست**. پیش‌تر عمداً نبود تا فهرست پرسنل جای
          افشای شماره نباشد — ولی این فهرست نیست؛ پرونده یک نفر است و
          فقط مدیر بازش می‌کند.

          آنچه همچنان نیست: هیچ نمره، رتبه یا مقایسه‌ای. «سوابق» متن
          آزاد است نه عددی که بشود رویش مرتب کرد.
        */}
        <section className={styles.card}>
          <span className={`${styles.cardLabel} t-caption`}>مشخصات</span>
          <Fact label="نام و نام خانوادگی" value={file.fullName} />
          <Fact label="دسترسی" value={file.role} />
          {/*
            سمت جدا از دسترسی است و از همین‌جا عوض می‌شود.

            دسترسی از این فرم عوض **نمی‌شود**: نقشِ حساب کاربری باید با
            نقشِ پرسنل یکی بماند (تریگر ۰۰۰۲) و تغییرش یعنی تصمیم درباره
            دسترسی — همان چیزی که بخش ۷.۴ جدا نگهش می‌دارد.
          */}
          <p className={`${styles.row} t-body`}>
            <span>سمت</span>
            <span className={styles.titleCell}>
              <b>{STAFF_TITLE_LABEL[file.title]}</b>
              <button
                type="button"
                className={`${styles.titleEdit} t-caption`}
                onClick={() => setTitleOpen(true)}
              >
                تغییر
              </button>
            </span>
          </p>
          <Fact label="کلاس‌ها" value={file.classNames.join('، ')} />
          {/*
            سن از تاریخ تولد حساب می‌شود، ذخیره نمی‌شود: سنِ ذخیره‌شده
            هر سال یک بار بی‌صدا غلط می‌شود.
          */}
          <Fact
            label="تاریخ تولد"
            value={
              file.birthDate
                ? `${formatJalali(new Date(file.birthDate), 'short')}${
                    formatAge(file.birthDate) ? ` · ${formatAge(file.birthDate)}` : ''
                  }`
                : ''
            }
          />
          <Fact label="کد ملی" value={file.nationalId ? toPersianDigits(file.nationalId) : ''} />
          <Fact label="شماره تماس" value={file.phone ? toPersianDigits(file.phone) : ''} />
          <Fact label="آدرس سکونت" value={file.address} />
          <Fact label="تحصیلات" value={file.education} />
          <Fact label="سوابق کاری" value={file.resume} />
          <Fact
            label="تماس اضطراری"
            value={
              file.emergencyName || file.emergencyPhone
                ? [file.emergencyName, file.emergencyPhone ? toPersianDigits(file.emergencyPhone) : null]
                    .filter(Boolean)
                    .join(' · ')
                : ''
            }
          />
          <button type="button" className={styles.action} onClick={() => setAdding('profile')}>
            ویرایش مشخصات
          </button>
        </section>

        {/*
          مدارک، به‌ترتیبِ چک‌لیست.

          پیش‌تر اینجا فقط داشته‌ها فهرست می‌شد و مدیر باید خودش
          می‌فهمید چه کم است. حالا یک ردیف برای هر **خواسته** می‌آید،
          و آنچه نیامده هم ردیف خودش را دارد.
        */}
        <section className={styles.card}>
          <span className={`${styles.cardLabel} t-caption`}>مدارک</span>
          {slots === null ? (
            <p className={`${styles.muted} t-body`}>در حال خواندن…</p>
          ) : slots.length === 0 ? (
            <p className={`${styles.muted} t-body`}>
              فهرست مدارک لازم خالی است. آن را در صفحه کارکنان بچینید.
            </p>
          ) : (
            slots.map((slot) => (
              <p key={slot.requirementId} className={`${styles.row} t-body`}>
                <span>{slot.title}</span>
                {/* حالت با کلمه، نه با رنگ — بخش ۱۲.۲. */}
                <b className={SLOT_TODO[slot.state] ? styles.expired : styles.muted}>
                  {SLOT_TEXT[slot.state]}
                </b>
                {slot.expiresAt && (slot.state === 'valid' || slot.state === 'expiring') ? (
                  <span className={styles.muted}>
                    تا {formatJalali(new Date(slot.expiresAt), 'short')}
                  </span>
                ) : null}
              </p>
            ))
          )}

          {/*
            مدارکی که بیرون از چک‌لیست بارگذاری شده‌اند — قرارداد، گواهی
            دوره‌ای که مهد لازمش ندارد ولی دارد. حذفشان از صفحه یعنی
            مدرکی که هست، دیده نشود.
          */}
          {extras.length > 0 ? (
            <>
              <span className={`${styles.cardLabel} t-caption`}>بیرون از فهرست</span>
              {extras.map((doc) => {
                const expired = doc.expiresAt !== null && doc.expiresAt < today
                return (
                  <p key={doc.id} className={`${styles.row} t-body`}>
                    <span>{doc.title}</span>
                    <span className={styles.muted}>{DOC_LABEL[doc.kind] ?? doc.kind}</span>
                    {doc.expiresAt ? (
                      <b className={expired ? styles.expired : undefined}>
                        {expired ? 'منقضی ' : 'تا '}
                        {formatJalali(new Date(doc.expiresAt), 'short')}
                      </b>
                    ) : (
                      <b className={styles.muted}>بدون انقضا</b>
                    )}
                  </p>
                )
              })}
            </>
          ) : null}

          <button type="button" className={styles.action} onClick={() => setAdding('doc')}>
            بارگذاری مدرک
          </button>
        </section>

        <section className={styles.card}>
          <span className={`${styles.cardLabel} t-caption`}>یادداشت‌ها و ارزیابی</span>
          {file.notes.length === 0 ? (
            <p className={`${styles.muted} t-body`}>هنوز یادداشتی ثبت نشده.</p>
          ) : (
            file.notes.map((n) => (
              <article key={n.id} className={styles.noteRow}>
                <p className={`${styles.noteTop} t-body`}>
                  <b>{NOTE_LABEL[n.kind] ?? n.kind}</b>
                  <span className={styles.muted}>
                    {formatJalali(new Date(n.writtenAt), 'short')}
                  </span>
                </p>
                <p className={`${styles.noteBody} t-body`}>{n.body}</p>
                {/*
                  ارزیابی‌ای که مربی هرگز نمی‌بیند، ارزیابی نیست؛
                  پرونده‌سازی است. اپ وادار نمی‌کند، ولی سکوت را می‌گوید.
                */}
                <p className={`${n.sharedAt ? styles.shared : styles.unshared} t-caption`}>
                  {n.sharedAt ? 'با مربی در میان گذاشته شده' : 'با مربی در میان گذاشته نشده'}
                </p>
              </article>
            ))
          )}
          <button type="button" className={styles.action} onClick={() => setAdding('note')}>
            ثبت یادداشت یا ارزیابی
          </button>
        </section>

        <section className={styles.card}>
          <span className={`${styles.cardLabel} t-caption`}>فعالیت سی روز گذشته</span>
          <p className={`${styles.row} t-body`}>
            <span>روز فعال</span>
            <b>{formatCount(file.activity.daysActive)}</b>
          </p>
          <p className={`${styles.row} t-body`}>
            <span>ورود ثبت‌شده</span>
            <b>{formatCount(file.activity.checkIns)}</b>
          </p>
          <p className={`${styles.row} t-body`}>
            <span>خروج ثبت‌شده</span>
            <b>{formatCount(file.activity.checkOuts)}</b>
          </p>
          <p className={`${styles.muted} t-caption`}>
            «روز فعال» یعنی روزی که این مربی دست‌کم یک ثبت کرده. جایگزین حضور و غیاب
            پرسنل نیست: مربی‌ای که تمام روز بوده و چیزی ثبت نکرده، اینجا صفر می‌خورد.
          </p>
        </section>

        {/*
          خروج از مهد — آخرین کارت، و عمداً آخر.

          کنشی است که بازگشت ندارد و نباید کنار «بارگذاری مدرک» بنشیند.
          متنش هم می‌گوید چه اتفاقی می‌افتد و چه اتفاقی **نمی‌افتد**:
          پرونده می‌ماند، دسترسی می‌رود.
        */}
        <section className={styles.card}>
          <span className={`${styles.cardLabel} t-caption`}>خروج از مهد</span>
          <p className={`${styles.muted} t-caption`}>
            پرونده و گزارش‌های گذشته‌اش سر جایشان می‌مانند — بازرس همان‌ها را می‌خواهد.
            آنچه می‌رود، دسترسی به اپ و جای او در فهرست کلاس‌هاست.
          </p>
          <button
            type="button"
            className={`${styles.action} ${styles.danger}`}
            onClick={() => setExitOpen(true)}
          >
            ثبت خروج از مهد
          </button>
        </section>
      </div>

      {titleOpen ? (
        <TitleSheet
          staffId={staffId}
          current={file.title}
          onClose={() => setTitleOpen(false)}
          onDone={async (label) => {
            setTitleOpen(false)
            setNote(`سمت به «${label}» تغییر کرد.`)
            await load()
          }}
        />
      ) : null}

      {exitOpen ? (
        <ExitSheet
          staffId={staffId}
          fullName={file.fullName}
          onClose={() => setExitOpen(false)}
          onDone={onBack}
        />
      ) : null}

      {adding === 'doc' ? (
        <DocumentSheet
          staffId={staffId}
          onClose={() => setAdding(null)}
          onDone={async (title) => {
            setAdding(null)
            setNote(`«${title}» بارگذاری شد.`)
            await load()
          }}
        />
      ) : null}

      {adding === 'note' ? (
        <NoteSheet
          staffId={staffId}
          onClose={() => setAdding(null)}
          onDone={async (shared) => {
            setAdding(null)
            setNote(
              shared
                ? 'یادداشت ثبت و با مربی در میان گذاشته شد.'
                : 'یادداشت ثبت شد — هنوز با مربی در میان گذاشته نشده.',
            )
            await load()
          }}
        />
      ) : null}

      {adding === 'profile' ? (
        <ProfileSheet
          staffId={staffId}
          onClose={() => setAdding(null)}
          onDone={async (changed) => {
            setAdding(null)
            setNote(
              changed === 0
                ? 'چیزی عوض نشد.'
                : `${formatCount(changed)} مورد از مشخصات ثبت شد.`,
            )
            await load()
          }}
        />
      ) : null}
    </div>
  )
}

/* ── شیت تغییر سمت ──────────────────────────────────────────── */

function TitleSheet({ staffId, current, onClose, onDone }: {
  staffId: string
  current: StaffTitle
  onClose: () => void
  onDone: (label: string) => Promise<void>
}) {
  const data = useData()
  const [title, setTitle] = useState<StaffTitle>(current)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await data.setStaffTitle(staffId, title)
      await onDone(STAFF_TITLE_LABEL[title])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
      setBusy(false)
    }
  }

  return (
    <div className={styles.sheetBackdrop} role="dialog" aria-label="تغییر سمت">
      <div className={styles.sheet}>
        <p className={`${styles.sheetTitle} t-h2`}>سمت در مهد</p>
        <ChoiceGroup label="سمت" options={STAFF_TITLES} value={title} onChange={setTitle} />
        <p className={`${styles.muted} t-caption`}>
          سمت، دسترسی را عوض نمی‌کند. دسترسی تصمیم جداگانه‌ای است.
        </p>
        {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}
        <div className={styles.sheetActions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            انصراف
          </button>
          <button
            type="button"
            className={`${styles.action} ${styles.primary}`}
            disabled={busy}
            onClick={() => void submit()}
          >
            ثبت سمت
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── شیت ثبت خروج ───────────────────────────────────────────── */

/**
 * خروج کارمند از مهد.
 *
 * نام را تأیید می‌گیرد، نه یک «مطمئنید؟» خالی: در فهرستی که چند مریمِ
 * هم‌نام دارد، «بله» زدن روی پرونده اشتباه یک ضربه فاصله است.
 */
function ExitSheet({ staffId, fullName, onClose, onDone }: {
  staffId: string
  fullName: string
  onClose: () => void
  onDone: () => void
}) {
  const data = useData()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await data.removeStaff(staffId)
      onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
      setBusy(false)
    }
  }

  return (
    <div className={styles.sheetBackdrop} role="dialog" aria-label="ثبت خروج از مهد">
      <div className={styles.sheet}>
        <p className={`${styles.sheetTitle} t-h2`}>خروج {fullName} از مهد</p>
        <p className={`${styles.muted} t-body`}>
          از امروز دسترسی‌اش به اپ قطع می‌شود و از فهرست کلاس‌ها بیرون می‌رود.
          پرونده، مدارک و گزارش‌های گذشته‌اش پاک نمی‌شوند.
        </p>
        {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}
        <div className={styles.sheetActions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            انصراف
          </button>
          <button
            type="button"
            className={`${styles.action} ${styles.danger}`}
            disabled={busy}
            onClick={() => void submit()}
          >
            ثبت خروج
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * یک قلم مشخصات.
 *
 * قلم خالی هم نوشته می‌شود، با «—». حذفش یعنی مدیر نمی‌بیند چه چیزی
 * جا مانده — و روز بازرسی، همان جامانده‌ها مشکل‌اند.
 */
function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <p className={`${styles.row} t-body`}>
      <span>{label}</span>
      <b>{value?.trim() ? value : '—'}</b>
    </p>
  )
}

/* ── شیت ویرایش مشخصات ──────────────────────────────────────── */

/**
 * فرم از روی فهرست بسته پایگاه داده ساخته می‌شود، نه از روی کدی که
 * اینجا نوشته شده. اگر میدانی اضافه یا کم شود، این فرم بی هیچ تغییری
 * همراهش می‌آید — و میدانی که فهرست نمی‌شناسد، اصلاً فرستاده نمی‌شود.
 */
function ProfileSheet({ staffId, onClose, onDone }: {
  staffId: string
  onClose: () => void
  onDone: (changed: number) => Promise<void>
}) {
  const data = useData()
  const [fields, setFields] = useState<StaffField[] | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    data
      .listStaffFields(staffId)
      .then((list) => {
        setFields(list)
        setDraft(Object.fromEntries(list.map((f) => [f.key, f.value])))
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'خوانده نشد.'))
  }, [data, staffId])

  const submit = async () => {
    if (!fields) return
    setBusy(true)
    setError(null)
    try {
      // فقط آنچه واقعاً عوض شده فرستاده می‌شود؛ وگرنه دفتر رویداد پر
      // می‌شود از «تغییر»هایی که چیزی را عوض نکرده‌اند.
      const changed = fields.filter((f) => (draft[f.key] ?? '') !== f.value)
      for (const f of changed) {
        await data.editStaffField(staffId, f.key, draft[f.key] ?? '')
      }
      await onDone(changed.length)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
      setBusy(false)
    }
  }

  return (
    <div className={styles.sheetBackdrop} role="dialog" aria-label="ویرایش مشخصات مربی">
      <div className={styles.sheet}>
        <p className={`${styles.sheetTitle} t-h2`}>مشخصات مربی</p>

        {fields === null ? (
          <EmptyState text="در حال خواندن…" />
        ) : (
          fields.map((f) =>
            f.input === 'date' ? (
              <JalaliDateField
                key={f.key}
                label={f.label}
                value={draft[f.key] || null}
                onChange={(iso) => setDraft((d) => ({ ...d, [f.key]: iso ?? '' }))}
              />
            ) : f.input === 'text' ? (
              <label key={f.key} className={`${styles.field} t-caption`}>
                {f.label}
                <textarea
                  className={styles.textarea}
                  rows={3}
                  value={draft[f.key] ?? ''}
                  aria-label={f.label}
                  onChange={(event) => setDraft((d) => ({ ...d, [f.key]: event.target.value }))}
                />
              </label>
            ) : (
              <label key={f.key} className={`${styles.field} t-caption`}>
                {f.label}
                <input
                  className={styles.input}
                  value={draft[f.key] ?? ''}
                  aria-label={f.label}
                  /*
                   * رقم لاتین فقط در همین میدان‌ها — بخش ۱۲.۱. کد ملی و
                   * شماره تلفن جایی می‌روند که با رقم فارسی خوانده
                   * نمی‌شوند.
                   */
                  inputMode={f.input === 'digits' ? 'numeric' : 'text'}
                  onChange={(event) => setDraft((d) => ({ ...d, [f.key]: event.target.value }))}
                />
              </label>
            ),
          )
        )}

        {error ? <p className={`${styles.error} t-caption`}>{error}</p> : null}

        <div className={styles.sheetActions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            انصراف
          </button>
          <button
            type="button"
            className={`${styles.primary} t-body-sm`}
            onClick={() => void submit()}
            disabled={busy || fields === null}
          >
            ثبت
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── شیت بارگذاری مدرک ──────────────────────────────────────── */

function DocumentSheet({ staffId, onClose, onDone }: {
  staffId: string
  onClose: () => void
  onDone: (title: string) => Promise<void>
}) {
  const data = useData()
  const [kind, setKind] = useState<StaffDocumentKind>('health_card')
  const [title, setTitle] = useState('')
  const [expires, setExpires] = useState<string | null>(null)
  const [file, setFile] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const needsExpiry = DOC_KINDS.find((k) => k.value === kind)?.needsExpiry ?? false

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await data.uploadStaffDocument({
        staffId,
        kind,
        title: title.trim() || (DOC_LABEL[kind] ?? 'مدرک'),
        // تصویر خودِ مدرک. تا وصل شدن استوریج، نشانی محلی مرورگر است.
        fileUrl: file ?? 'demo-document',
        expiresAt: expires,
      })
      await onDone(title.trim() || (DOC_LABEL[kind] ?? 'مدرک'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'بارگذاری نشد.')
      setBusy(false)
    }
  }

  return (
    <div className={styles.sheetBackdrop} role="dialog" aria-label="بارگذاری مدرک">
      <div className={styles.sheet}>
        <p className={`${styles.sheetTitle} t-h2`}>بارگذاری مدرک</p>

        <ChoiceGroup
          label="نوع مدرک"
          options={DOC_KINDS.map((k) => ({ value: k.value, label: k.label }))}
          value={kind}
          onChange={setKind}
        />

        <label className={`${styles.field} t-caption`}>
          عنوان
          <input
            className={styles.input}
            value={title}
            aria-label="عنوان مدرک"
            placeholder={DOC_LABEL[kind]}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        {/*
          تصویر خودِ مدرک.
          بازرس کاغذ می‌خواهد؛ ردیفی که فقط عنوان دارد، مدرک نیست.
        */}
        <FileField
          label="تصویر مدرک"
          value={file}
          onChange={setFile}
          hint="تا وصل شدن فضای ذخیره‌سازی، تصویر فقط در همین مرورگر می‌ماند."
        />

        {/*
          تاریخ از تقویم، نه تایپ.
          کل ارزش این ستون مقایسه با امروز است؛ تاریخی که خوانده نشود
          یعنی «مدرک منقضی» هرگز درست درنمی‌آید.
        */}
        <JalaliDateField
          label={needsExpiry ? 'اعتبار تا' : 'اعتبار تا — اختیاری'}
          value={expires}
          onChange={setExpires}
        />

        {error ? <p className={`${styles.error} t-caption`}>{error}</p> : null}

        <div className={styles.sheetActions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            انصراف
          </button>
          <button
            type="button"
            className={`${styles.primary} t-body`}
            disabled={busy}
            onClick={() => void submit()}
          >
            بارگذاری
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── شیت یادداشت ────────────────────────────────────────────── */

function NoteSheet({ staffId, onClose, onDone }: {
  staffId: string
  onClose: () => void
  onDone: (shared: boolean) => Promise<void>
}) {
  const data = useData()
  const [kind, setKind] = useState<StaffNoteKind>('review')
  const [body, setBody] = useState('')
  const [share, setShare] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await data.addStaffNote({ staffId, kind, body, share })
      await onDone(share)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
      setBusy(false)
    }
  }

  return (
    <div className={styles.sheetBackdrop} role="dialog" aria-label="ثبت یادداشت">
      <div className={styles.sheet}>
        <p className={`${styles.sheetTitle} t-h2`}>یادداشت یا ارزیابی</p>

        <ChoiceGroup label="نوع" options={NOTE_KINDS} value={kind} onChange={setKind} />

        <label className={`${styles.field} t-caption`}>
          متن
          <textarea
            className={styles.textarea}
            value={body}
            rows={4}
            aria-label="متن یادداشت"
            onChange={(event) => setBody(event.target.value)}
          />
        </label>

        {/*
          پیش‌فرض «در میان گذاشته شود» است، و عمدی.
          ارزیابی‌ای که مربی هرگز نمی‌بیند، ارزیابی نیست.
        */}
        <label className={`${styles.check} t-body`}>
          <input
            type="checkbox"
            checked={share}
            onChange={(event) => setShare(event.target.checked)}
          />
          با خود مربی در میان گذاشته شود
        </label>
        {!share ? (
          <p className={`${styles.warn} t-caption`}>
            <AlertIcon size={16} />
            یادداشتی که مربی نمی‌بیند، در پرونده‌اش می‌ماند ولی فرصت پاسخ یا اصلاح ندارد.
          </p>
        ) : null}

        {error ? <p className={`${styles.error} t-caption`}>{error}</p> : null}

        <div className={styles.sheetActions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            انصراف
          </button>
          <button
            type="button"
            className={`${styles.primary} t-body`}
            disabled={busy || body.trim().length === 0}
            onClick={() => void submit()}
          >
            ثبت
          </button>
        </div>
      </div>
    </div>
  )
}

function Chevron({ flip }: { flip?: boolean }) {
  return (
    <svg className="mirror" width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={flip ? 'm9 18 6-6-6-6' : 'm15 18-6-6 6-6'} />
    </svg>
  )
}


/* ── شیت رد مدرک ────────────────────────────────────────────── */

/**
 * رد یک مدرک، با دلیل.
 *
 * دلیل اجباری است و پایگاه داده هم همین را می‌گوید. مربی‌ای که فقط
 * «رد شد» می‌بیند، همان عکس را دوباره می‌فرستد و مدیر دوباره ردش
 * می‌کند — یک جمله این حلقه را می‌بندد.
 */
function RejectSheet({ doc, onClose, onDone }: {
  doc: PendingStaffDocument
  onClose: () => void
  onDone: () => void
}) {
  const data = useData()
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!why.trim()) {
      setError('بنویسید چرا، تا مربی بداند چه باید بفرستد.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await data.reviewStaffDocument(doc.id, false, why)
      onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
      setBusy(false)
    }
  }

  return (
    <div className={styles.sheetBackdrop} role="dialog" aria-label="رد مدرک">
      <div className={styles.sheet}>
        <p className={`${styles.sheetTitle} t-h2`}>رد «{doc.title}»</p>
        <p className={`${styles.muted} t-body`}>{doc.fullName}</p>

        <label className={`${styles.field} t-caption`}>
          چرا رد می‌شود
          <textarea
            className={styles.textarea}
            rows={3}
            value={why}
            aria-label="دلیل رد مدرک"
            placeholder="مثلاً: تصویر خوانا نیست، دوباره بفرستید."
            onChange={(event) => setWhy(event.target.value)}
          />
        </label>

        {error ? <p className={`${styles.error} t-caption`}>{error}</p> : null}

        <div className={styles.sheetActions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            انصراف
          </button>
          <button
            type="button"
            className={`${styles.primary} t-body`}
            disabled={busy}
            onClick={() => void submit()}
          >
            ثبت رد
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── شیت افزودن قلم به فهرست مدارک لازم ─────────────────────── */

function RequirementSheet({ onClose, onDone }: {
  onClose: () => void
  onDone: () => void
}) {
  const data = useData()
  const [kind, setKind] = useState<StaffDocumentKind>('health_card')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [needsExpiry, setNeedsExpiry] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await data.setDocumentRequirement({
        kind,
        title: title.trim() || (DOC_LABEL[kind] ?? 'مدرک'),
        note,
        needsExpiry,
      })
      onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
      setBusy(false)
    }
  }

  return (
    <div className={styles.sheetBackdrop} role="dialog" aria-label="افزودن مدرک لازم">
      <div className={styles.sheet}>
        <p className={`${styles.sheetTitle} t-h2`}>مدرک لازم</p>

        <ChoiceGroup
          label="نوع مدرک"
          options={DOC_KINDS.map((k) => ({ value: k.value, label: k.label }))}
          value={kind}
          onChange={setKind}
        />

        <label className={`${styles.field} t-caption`}>
          عنوان، همان‌طور که مربی می‌بیند
          <input
            className={styles.input}
            value={title}
            aria-label="عنوان مدرک لازم"
            placeholder={DOC_LABEL[kind]}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <label className={`${styles.field} t-caption`}>
          توضیح برای مربی — اختیاری
          <input
            className={styles.input}
            value={note}
            aria-label="توضیح مدرک لازم"
            placeholder="مثلاً: کارت بهداشتِ امسال، نه پارسال."
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

        {/*
          تاریخ اعتبار، فقط جایی که واقعاً هست.

          اجبارِ تاریخ روی مدرکی که تاریخ ندارد، مربی را وادار می‌کند
          تاریخِ الکی بزند — و آن تاریخ بعداً «مدرک معتبر» نشان می‌دهد.
        */}
        <ChoiceGroup
          label="تاریخ اعتبار"
          options={[
            { value: 'no', label: 'لازم نیست' },
            { value: 'yes', label: 'لازم است' },
          ]}
          value={needsExpiry ? 'yes' : 'no'}
          onChange={(next) => setNeedsExpiry(next === 'yes')}
        />

        {error ? <p className={`${styles.error} t-caption`}>{error}</p> : null}

        <div className={styles.sheetActions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            انصراف
          </button>
          <button
            type="button"
            className={`${styles.primary} t-body`}
            disabled={busy}
            onClick={() => void submit()}
          >
            افزودن
          </button>
        </div>
      </div>
    </div>
  )
}
