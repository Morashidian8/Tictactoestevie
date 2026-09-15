/**
 * مخزن محلی — فقط برای اجرای بدون سرور.
 *
 * قید مرکز و کلاس اینجا هم دقیقاً مثل مخزن واقعی اعمال می‌شود، تا رفتار
 * دو پیاده‌سازی یکی باشد و صفحه نفهمد با کدام‌یک کار می‌کند.
 */
import { quotaReport, type QuotaLine, type SmsBucket } from '../../notify/index.ts'
import type {
  AbsenceNotice,
  AccessScope,
  ReadAuditSink,
  ChildInSession,
  Enrollment,
  Notice,
  Amendment,
  PaymentClaim,
  Invoice,
  InvoiceStatus,
  Message,
  Payment,
  PickupPlan,
  Attendance,
  CheckInInput,
  Child,
  ClassDay,
  DataAccess,
  BulkValues,
  CheckOutInput,
  DailyReport,
  DaySummary,
  Incident,
  IncidentInput,
  ParentDay,
  Photo,
  PickupCodeCheck,
  PickupOption,
  Guardian,
  MedicationInput,
  MedicationLog,
  MedicationRequest,
  AuditFile,
  AuditReadiness,
  PaymentIntent,
  PaymentResult,
  PaymentReminderLog,
  InvoiceLine,
  FeeItem,
  FeeItemOffer,
  FeeYearMonth,
  ReportPatch,
} from '../types.ts'
import { isInCurrentWeek } from '../../../i18n/week.ts'
import {
  AUTHORIZED,
  CENTER_ID,
  CHILDREN,
  CLASSES,
  GUARDIANS,
  PICKUP_CODES,
  seedPickupCodes,
  CHILD_FEES,
  DAY_PERIODS,
  ENROLLMENTS,
  STAFF_NAMES,
  STAFF_SHIFTS,
  CONSENTS,
  FEE_PLANS,
  GUARDIAN_PHONES,
  MEDICAL,
  PAYER,
  seedAbsences,
  seedAttendance,
  seedMedications,
  VACCINATION,
  NATIONAL_IDS,
  HEALTH_CARDS,
} from './fixture.ts'
import { isOverdue } from '../attendanceState.ts'
import { jalaliYearMonth, toIsoDate } from '../../../i18n/index.ts'
import { invoiceDue, invoiceTotal } from '../money.ts'
import {
  applicableFields,
  bulkFields,
  dayEndFor,
  dayStartFor,
  enrolledOn,
  minutesOf,
  periodsAt,
  phaseAt,
  upcomingPeriodAt,
  periodsFor,
  staffOnDutyIds,
} from '../periods.ts'

type DayState = {
  attendance: Map<string, Attendance>
  absences: AbsenceNotice[]
  medications: MedicationLog[]
  reports: Map<string, DailyReport>
  incidents: Incident[]
  photos: Photo[]
  /** زمان ارسال گزارش‌های روز. پس از این، گزارش‌ها قفل‌اند. */
  sentAt: string | null
}

const days = new Map<string, DayState>()

/**
 * داده نمونه روی همین مرورگر می‌ماند.
 *
 * بدون این، هر بار که صفحه دوباره بارگذاری می‌شود همه‌چیز پاک می‌شود، و
 * جریان اصلی محصول اصلاً قابل دیدن نیست: مربی روز را ثبت و ارسال کند،
 * بعد خانواده با حساب خودش وارد شود و همان روز را ببیند.
 *
 * این فقط برای اجرای بدون سرور است. با وصل شدن Supabase کنار می‌رود.
 */
const STORE_KEY = 'kg.dev.days'
let hydrated = false

type StoredDay = {
  attendance: [string, Attendance][]
  absences: AbsenceNotice[]
  medications: MedicationLog[]
  reports: [string, DailyReport][]
  incidents: Incident[]
  photos: Photo[]
  sentAt: string | null
}

/**
 * درخواست‌های دارویی خانواده — ارتقای ۳ سند بررسی طراحی.
 *
 * برخلاف medication_log که روزانه است، درخواست بازه تاریخ دارد و ممکن
 * است چند روز بماند. پس بیرون از days نگه داشته می‌شود.
 */
const MED_REQUESTS: MedicationRequest[] = []

/**
 * تراکنش‌های باز درگاه — ارتقای ۱ سند بررسی طراحی.
 *
 * جدا از PAYMENTS نگه داشته می‌شوند و همین نکته اصلی است: تراکنشِ
 * تأییدنشده پرداخت نیست و نباید در هیچ جمعی بیاید. فقط وقتی تأیید
 * سمت سرور رسید، یک ردیف در PAYMENTS ساخته می‌شود.
 */
type PendingPayment = {
  key: string
  invoiceId: string
  amount: number
  psp: string
  state: 'pending' | 'verified' | 'failed'
  /**
   * چند بار وضعیت پرسیده شده.
   *
   * نسخه نمایشی باید حالت «در انتظار» را هم نشان بدهد، چون در واقعیت
   * وب‌هوک گاهی دیر می‌رسد. ولی این نباید به ساعت دیواری بسته باشد:
   * تستی که ساعت را ثابت می‌کند هرگز از انتظار بیرون نمی‌آمد.
   */
  asked: number
  trackingCode?: string
}

const GATEWAY: PendingPayment[] = []

function save(): void {
  try {
    const payload = {
      days: Object.fromEntries(
        [...days.entries()].map(([date, state]) => [
          date,
          {
            attendance: [...state.attendance.entries()],
            absences: state.absences,
            medications: state.medications,
            reports: [...state.reports.entries()],
            incidents: state.incidents,
            photos: state.photos,
            sentAt: state.sentAt,
          } satisfies StoredDay,
        ]),
      ),
      needs: [...NEEDS.entries()],
      codes: PICKUP_CODES,
      plans: PLANS,
      notices: NOTICES,
      invoices: INVOICES,
      feeItems: FEE_ITEMS,
      feeItemChildren: FEE_ITEM_CHILDREN,
      invoiceLines: INVOICE_LINES,
      reminders: REMINDERS,
      payments: PAYMENTS,
      messages: MESSAGES,
      amendments: AMENDMENTS,
      claims: CLAIMS,
      medRequests: MED_REQUESTS,
      gateway: GATEWAY,
      extras: [...EXTRA_TODAY.entries()].map(([k, v]) => [k, [...v]] as [string, string[]]),
      smsUsed: { ...smsUsedBy },
    }
    localStorage.setItem(STORE_KEY, JSON.stringify(payload))
  } catch {
    // حالت ناشناس مرورگر یا سهمیه پر. داده تا بستن صفحه می‌ماند.
  }
}

function hydrate(): void {
  if (hydrated) return
  hydrated = true
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return
    const payload = JSON.parse(raw) as {
      days: Record<string, StoredDay>
      needs: [string, { id: string; text: string; done: boolean }[]][]
      codes: typeof PICKUP_CODES
      plans?: PickupPlan[]
      notices?: Notice[]
      invoices?: InvoiceRow[]
      feeItems?: FeeItemRow[]
      feeItemChildren?: FeeItemChildRow[]
      invoiceLines?: InvoiceLineRow[]
      reminders?: PaymentReminderLog[]
      payments?: Payment[]
      messages?: Message[]
      amendments?: Amendment[]
      claims?: PaymentClaim[]
      medRequests?: MedicationRequest[]
      gateway?: PendingPayment[]
      extras?: [string, string[]][]
      smsUsed?: number
    }
    for (const [date, stored] of Object.entries(payload.days ?? {})) {
      days.set(date, {
        attendance: new Map(stored.attendance),
        absences: stored.absences,
        medications: stored.medications,
        reports: new Map(stored.reports),
        incidents: stored.incidents,
        /*
         * نشانی blob با بارگذاری دوباره صفحه می‌میرد.
         *
         * نگه داشتنش یعنی مربی پس از هر نوسازی، تصویر شکسته می‌بیند و
         * فکر می‌کند عکسش از بین رفته. در پیاده‌سازی واقعی نشانی از
         * استوریج می‌آید و پایدار است؛ اینجا عکسِ مرده انداخته می‌شود
         * و تگ‌هایش با آن.
         */
        photos: stored.photos.filter((photo) => !photo.previewUrl.startsWith('blob:')),
        sentAt: stored.sentAt,
      })
    }
    for (const [key, list] of payload.needs ?? []) NEEDS.set(key, list)
    if (payload.codes?.length) {
      PICKUP_CODES.splice(0, PICKUP_CODES.length, ...payload.codes)
    }
    // بدون این‌ها، کار مدیر و خانواده با هر بارگذاری دوباره از بین
    // می‌رفت و جریان «مدیر صورتحساب صادر کرد، خانواده دید» اصلاً
    // قابل دیدن نبود.
    const restore = <T>(target: T[], source: T[] | undefined) => {
      if (source?.length) target.splice(0, target.length, ...source)
    }
    restore(PLANS, payload.plans)
    restore(NOTICES, payload.notices)
    restore(INVOICES, payload.invoices)
    restore(FEE_ITEMS, payload.feeItems)
    restore(FEE_ITEM_CHILDREN, payload.feeItemChildren)
    restore(INVOICE_LINES, payload.invoiceLines)
    restore(REMINDERS, payload.reminders)
    restore(PAYMENTS, payload.payments)
    restore(MESSAGES, payload.messages)
    restore(AMENDMENTS, payload.amendments)
    restore(CLAIMS, payload.claims)
    restore(MED_REQUESTS, payload.medRequests)
    restore(GATEWAY, payload.gateway)
    for (const [k, v] of payload.extras ?? []) EXTRA_TODAY.set(k, new Set(v))
    // نسخه پیشین یک عدد ذخیره می‌کرد. همان را روی سطل اطلاع‌رسانی
    // می‌نشانیم تا داده ذخیره‌شده کاربر با ارتقا از بین نرود.
    if (typeof payload.smsUsed === 'number') smsUsedBy.notice = payload.smsUsed
    else if (payload.smsUsed && typeof payload.smsUsed === 'object') {
      for (const bucket of ['notice', 'critical_fallback'] as SmsBucket[]) {
        const value = (payload.smsUsed as Partial<Record<SmsBucket, number>>)[bucket]
        if (typeof value === 'number') smsUsedBy[bucket] = value
      }
    }
  } catch {
    // داده ذخیره‌شده خراب بود. از نمونه تازه شروع می‌کنیم.
  } finally {
    // پس از بازیابی، نه پیش از آن: اگر مدیر خودش صورتحساب صادر کرده
    // باشد، نمونه چیزی روی آن نمی‌نویسد.
    seedFinance()
  }
}

/**
 * داده مالی نمونه — فقط نسخه نمایشی.
 *
 * بی این، خانواده صفحه مالی را باز می‌کرد و یک فهرست خالی می‌دید؛ یعنی
 * دقیقاً چیزی که آمده ببیند را نمی‌دید. مدیرِ یک مهد واقعی خودش
 * صورتحساب صادر می‌کند و این تابع هیچ‌وقت کاری نمی‌کند، چون فقط وقتی
 * می‌نویسد که هیچ صورتحسابی وجود نداشته باشد.
 *
 * الگو عمداً یکنواخت نیست: ماه‌های گذشته تسویه‌اند، ماه پیش نیمه‌پرداخت
 * و ماه جاری باز است. حالت «همه‌چیز پرداخت‌شده» هیچ‌کدام از صفحه‌های
 * سررسید و جریمه و یادآوری را نشان نمی‌دهد.
 */
function seedFinance(): void {
  if (INVOICES.length > 0) return
  const now = new Date()
  const year = jalaliYearMonth(now).split('-')[0]
  if (!year) return

  /*
   * دوره‌های گذشته از روی تاریخ واقعی ساخته می‌شوند، نه با شمارش ماه
   * جلالی: نگاشت ماه جلالی به بازه میلادی اینجا نیست و حدس زدنش، عدد
   * ساختن است.
   */
  const back = (months: number): Date => {
    const d = new Date(now)
    d.setDate(1)
    d.setMonth(d.getMonth() - months)
    return d
  }

  CHILDREN.forEach((child, index) => {
    if (!PAYER[child.id]) return
    const fee = CHILD_FEES[child.id]
    const plan = FEE_PLANS.find((p) => p.id === fee?.planId) ?? FEE_PLANS[0]
    if (!plan) return
    const discount = Math.round((plan.amount * (fee?.discountPercent ?? 0)) / 100)

    /*
     * ماه جاری عمداً صادر نمی‌شود.
     *
     * صدور، کارِ مدیر است و جریان «مدیر صادر کرد ← خانواده دید» تنها
     * وقتی دیده می‌شود که ماه جاری باز باشد. اگر نمونه خودش صادرش
     * می‌کرد، آن جریان اصلاً قابل نشان دادن نبود.
     */
    for (let k = 4; k >= 1; k -= 1) {
      const when = back(k)
      const period = jalaliYearMonth(when)
      if (!period.startsWith(`${year}-`)) continue

      const due = new Date(when)
      due.setDate(10)
      const id = `inv-${child.id}-${period}`
      INVOICES.push({
        id,
        childId: child.id,
        period,
        amount: plan.amount,
        discount,
        lateFee: 0,
        overdueFee: 0,
        dueDate: toIsoDate(due),
        cancelled: false,
      })

      const total = plan.amount - discount

      /*
       * ماه گذشته باز می‌ماند تا حالت‌های سررسیدگذشته و جریمه و
       * یادآوری اصلاً دیدنی باشند. یک نمونه که همه‌چیزش تسویه است،
       * نیمی از این صفحه را نشان نمی‌دهد.
       */
      if (k === 1) {
        if (index % 3 === 0) {
          // یکی از هر سه، نیمه‌پرداخت — تا حالت «بخشی پرداخت شده» هم بیاید.
          const paidAt = new Date(due)
          paidAt.setDate(paidAt.getDate() - 1)
          PAYMENTS.push({
            id: `pay-${id}`,
            invoiceId: id,
            amount: Math.round(total / 2),
            paidAt: paidAt.toISOString(),
            method: 'کارت به کارت',
            receiptNo: null,
            paymentMethod: 'manual_receipt',
            trackingCode: null,
            receiptUrl: 'demo-receipt',
          })
        }
        // جریمه دیرکرد، ده درصدِ مانده — همان سیاست پیش‌فرض نمونه.
        const row = INVOICES[INVOICES.length - 1]
        if (row) {
          const unpaid = total - (index % 3 === 0 ? Math.round(total / 2) : 0)
          row.overdueFee = Math.round(unpaid / 10)
        }
        REMINDERS.push(
          {
            id: `rem-${id}-due`,
            period,
            kind: 'due_today',
            channel: 'sms',
            sentAt: toIsoDate(due) + 'T08:00:00.000Z',
          },
          {
            id: `rem-${id}-late`,
            period,
            kind: 'overdue',
            channel: 'app',
            sentAt: new Date(due.getTime() + 5 * 86_400_000).toISOString(),
          },
        )
        continue
      }

      const paidAt = new Date(due)
      paidAt.setDate(paidAt.getDate() - 3)
      const online = k % 2 === 0
      PAYMENTS.push({
        id: `pay-${id}`,
        invoiceId: id,
        amount: total,
        paidAt: paidAt.toISOString(),
        method: online ? 'درگاه اینترنتی' : 'کارت به کارت',
        receiptNo: null,
        paymentMethod: online ? 'online' : 'manual_receipt',
        trackingCode: online ? `82${index}${k}4519` : null,
        // یکی از پرداخت‌های گذشته عمداً بی‌سند است تا حالت «سندی ثبت
        // نشده» دیده شود؛ همان حالتی که صفحه نباید پنهانش کند.
        receiptUrl: online || k === 3 ? null : 'demo-receipt',
      })
    }
  })

  /*
   * قلم‌های هزینه: یکی اجباری و صادرشده، یکی اختیاری و بی‌جواب.
   *
   * اختیاریِ بی‌جواب مهم‌ترین حالت است — همان که نشان می‌دهد اردو تا
   * وقتی خانواده نپذیرفته، در مانده نمی‌آید.
   */
  const thisPeriod = jalaliYearMonth(now)
  const lastPeriod = jalaliYearMonth(back(1))
  FEE_ITEMS.push(
    {
      id: 'fee-lunch',
      title: 'ناهار',
      description: 'ناهار گرم، ماهانه',
      amount: 6_000_000,
      period: lastPeriod,
      optional: false,
      publishedAt: now.toISOString(),
    },
    {
      id: 'fee-trip',
      title: 'اردوی باغ پرندگان',
      description: 'پنجشنبه، با سرویس مهد. شرکت اختیاری است.',
      amount: 3_500_000,
      period: thisPeriod,
      optional: true,
      publishedAt: now.toISOString(),
    },
    {
      id: 'fee-craft',
      title: 'لوازم کاردستی',
      description: 'خمیر بازی، مقوا و رنگ — نیم‌سال اول',
      amount: 1_800_000,
      period: lastPeriod,
      optional: false,
      publishedAt: now.toISOString(),
    },
  )
  for (const child of CHILDREN) {
    if (!PAYER[child.id]) continue
    FEE_ITEM_CHILDREN.push(
      { itemId: 'fee-lunch', childId: child.id, answer: null },
      { itemId: 'fee-craft', childId: child.id, answer: null },
      { itemId: 'fee-trip', childId: child.id, answer: null },
    )
  }
  for (const item of FEE_ITEMS) issueFeeItem(item)
}

function dayState(date: string): DayState {
  hydrate()
  let state = days.get(date)
  if (!state) {
    seedPickupCodes(date)
    state = {
      attendance: new Map(seedAttendance(date).map((row) => [row.childId, row])),
      absences: seedAbsences(date),
      medications: seedMedications(date),
      reports: new Map(),
      incidents: [],
      photos: [],
      sentAt: null,
    }
    days.set(date, state)
    save()
  }
  return state
}

/**
 * کودکانی که یک حساب سرپرست می‌بیند.
 *
 * در داده واقعی از child_guardian می‌آید. اینجا برای نمونه، حساب سرپرست
 * به دو کودک وصل است تا حالت «چند کودک در یک خانواده» هم دیده شود.
 */
const GUARDIAN_CHILDREN: Record<string, string[]> = {
  'acc-parent': ['child-1', 'child-9'],
}


/* ── حالت‌های تازه برای برنامه فردا و اطلاع‌رسانی ─────────────── */

/** اعلام‌های خانواده. در داده واقعی جدول pickup_plan است. */
const PLANS: PickupPlan[] = []

/** اطلاعیه‌های منتشرشده. در داده واقعی جدول announcement است. */
const NOTICES: Notice[] = []

/**
 * بخش ۱۵.۴: سهمیه پیامک هرگز نامحدود نیست.
 *
 * ارتقای ۴: دو سطل جدا. سطل «اطلاع‌رسانی» برای اطلاعیه و یادآوری بدهی
 * است و مدیر می‌تواند تمامش کند؛ سطل «پشتیبان رخداد حیاتی» فقط برای کد
 * تحویل، حادثه تأییدشده و هشدار دارویی است و از آن سطل برداشت نمی‌شود.
 *
 * چرا جدا: مدیری که برای اطلاعیه‌های ماه سهمیه‌اش را سوزانده، نباید
 * فردا نتواند حادثه را خبر دهد.
 */
const SMS_ALLOCATED: Record<SmsBucket, number> = { notice: 500, critical_fallback: 200 }
const smsUsedBy: Record<SmsBucket, number> = { notice: 0, critical_fallback: 0 }
const smsRemaining = () => SMS_ALLOCATED.notice - smsUsedBy.notice
const smsQuota = (): QuotaLine[] =>
  quotaReport(
    (['notice', 'critical_fallback'] as SmsBucket[]).map((bucket) => ({
      bucket,
      allocated: SMS_ALLOCATED[bucket],
      extraPurchased: 0,
      used: smsUsedBy[bucket],
    })),
  )

/** تعداد پرسنلی که پیامک تعطیلی به آن‌ها هم می‌رود — بخش ۱۵.۳. */
const STAFF_COUNT = 12

/**
 * کد چهاررقمی، بدون صفر ابتدایی تا خواندن و گفتنش تلفنی ساده بماند.
 * تکراری بودن در همان روز بررسی می‌شود چون کلید یکتا (مرکز، روز، کد) است.
 */
function makeCode(): string {
  for (let tries = 0; tries < 50; tries += 1) {
    const code = String(1000 + Math.floor(Math.random() * 9000))
    if (!PICKUP_CODES.some((c) => c.code === code)) return code
  }
  throw new Error('ساخت کد ممکن نشد.')
}



/** ساعت کاری پیام مهد — بخش ۶.۶. در داده واقعی از ستون center می‌آید. */
const MESSAGE_HOURS = { start: '08:00', end: '16:30' }

/** آغاز ساعت کاری روز بعد. پیام صف‌شده همان موقع تحویل می‌شود. */
function nextMorning(from: Date): Date {
  const next = new Date(from)
  const [h, m] = MESSAGE_HOURS.start.split(':').map(Number)
  if (from.getHours() * 60 + from.getMinutes() >= (h ?? 8) * 60 + (m ?? 0)) {
    next.setDate(next.getDate() + 1)
  }
  next.setHours(h ?? 8, m ?? 0, 0, 0)
  return next
}

/* ── حالت مالی و پیام ─────────────────────────────────────────── */

type InvoiceRow = {
  id: string
  childId: string
  period: string
  amount: number
  discount: number
  /** جریمه تأخیر در تحویل گرفتن کودک — بخش ۵.۸. */
  lateFee: number
  /** جریمه دیرکرد پرداخت. دو چیز جدا، دو ستون جدا. */
  overdueFee: number
  dueDate: string
  cancelled: boolean
}

/** تعریف مدیر. تا `publishedAt` پر نشود، خانواده نمی‌بیندش. */
type FeeItemRow = {
  id: string
  title: string
  description: string | null
  amount: number
  period: string
  optional: boolean
  publishedAt: string | null
}

/** به چه کودکی خورده و خانواده چه جوابی داده. */
type FeeItemChildRow = {
  itemId: string
  childId: string
  answer: 'accepted' | 'declined' | null
}

type InvoiceLineRow = {
  id: string
  invoiceId: string
  itemId: string
  title: string
  amount: number
}

const INVOICES: InvoiceRow[] = []
const FEE_ITEMS: FeeItemRow[] = []
const FEE_ITEM_CHILDREN: FeeItemChildRow[] = []
const INVOICE_LINES: InvoiceLineRow[] = []
const REMINDERS: PaymentReminderLog[] = []
const PAYMENTS: Payment[] = []
const MESSAGES: Message[] = []
const AMENDMENTS: Amendment[] = []
const CLAIMS: PaymentClaim[] = []
const ABSENCES_DECLARED: { childId: string; date: string; reason: string | null }[] = []

const childName = (childId: string): string => {
  const child = CHILDREN.find((c) => c.id === childId)
  return child ? `${child.firstName} ${child.lastName}` : '—'
}

const paidFor = (invoiceId: string): number =>
  PAYMENTS.filter((p) => p.invoiceId === invoiceId).reduce((sum, p) => sum + p.amount, 0)

/**
 * وضعیت صورتحساب از روی پرداخت‌ها و سررسید محاسبه می‌شود، نه از ستون
 * جدا. یک منبع حقیقت یعنی «پرداخت‌شده ولی هنوز issued» ممکن نیست.
 */
function linesFor(invoiceId: string): InvoiceLine[] {
  return INVOICE_LINES.filter((l) => l.invoiceId === invoiceId).map((l) => ({
    id: l.id,
    title: l.title,
    amount: l.amount,
  }))
}

/** مجموع اقلام. عدد و فهرست پشتش همیشه یکی‌اند چون عدد اصلاً ذخیره نمی‌شود. */
const extrasFor = (invoiceId: string): number =>
  INVOICE_LINES.filter((l) => l.invoiceId === invoiceId).reduce((sum, l) => sum + l.amount, 0)

/**
 * قلم هزینه را روی صورتحساب‌های همان دوره می‌نشاند.
 *
 * قلم اختیاریِ نپذیرفته سطر نمی‌سازد: اردویی که کودک نمی‌رود نباید در
 * مانده خانواده بیاید. دوباره صدا زدنش سطر تکراری نمی‌سازد.
 */
function issueFeeItem(item: FeeItemRow): number {
  if (!item.publishedAt) return 0
  let made = 0
  for (const link of FEE_ITEM_CHILDREN.filter((f) => f.itemId === item.id)) {
    if (item.optional && link.answer !== 'accepted') continue
    const invoice = INVOICES.find(
      (i) => i.childId === link.childId && i.period === item.period && !i.cancelled,
    )
    if (!invoice) continue
    if (INVOICE_LINES.some((l) => l.invoiceId === invoice.id && l.itemId === item.id)) continue
    INVOICE_LINES.push({
      id: `line-${invoice.id}-${item.id}`,
      invoiceId: invoice.id,
      itemId: item.id,
      title: item.title,
      amount: item.amount,
    })
    made += 1
  }
  return made
}

/** قلم از دید مدیر: چند نفر، چند جواب، و چند سطر واقعاً ساخته شد. */
function feeItemOf(item: FeeItemRow): FeeItem {
  const links = FEE_ITEM_CHILDREN.filter((f) => f.itemId === item.id)
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    amount: item.amount,
    period: item.period,
    optional: item.optional,
    published: item.publishedAt !== null,
    childCount: links.length,
    acceptedCount: links.filter((l) => l.answer === 'accepted').length,
    declinedCount: links.filter((l) => l.answer === 'declined').length,
    issuedCount: INVOICE_LINES.filter((l) => l.itemId === item.id).length,
  }
}

/** قلم‌های منتشرشده‌ای که به این کودک خورده، با جواب خانواده. */
function offersFor(childId: string): FeeItemOffer[] {
  return FEE_ITEM_CHILDREN.filter((f) => f.childId === childId)
    .flatMap((link) => {
      const item = FEE_ITEMS.find((f) => f.id === link.itemId)
      if (!item?.publishedAt) return []
      return [{
        itemId: item.id,
        title: item.title,
        description: item.description,
        amount: item.amount,
        period: item.period,
        optional: item.optional,
        answer: link.answer,
      } satisfies FeeItemOffer]
    })
    .sort((a, b) => a.period.localeCompare(b.period))
}

/**
 * دوازده ماه سال، صادرشده و نشده.
 *
 * ماهی که صورتحساب ندارد بدهی نیست: `issued=false` و مبلغش برآوردِ
 * طرح شهریه است. اگر برآورد را بدهی نشان می‌دادیم، خانواده در مهر یک
 * رقم دوازده‌ماهه می‌دید و می‌ترسید.
 */
function feeYear(childId: string, year: string): FeeYearMonth[] {
  const fee = CHILD_FEES[childId]
  const plan = FEE_PLANS.find((p) => p.id === fee?.planId) ?? FEE_PLANS[0]
  const estimate = plan
    ? plan.amount - Math.round((plan.amount * (fee?.discountPercent ?? 0)) / 100)
    : 0

  return Array.from({ length: 12 }, (_, i) => {
    const period = `${year}-${String(i + 1).padStart(2, '0')}`
    const row = INVOICES.find((r) => r.childId === childId && r.period === period)
    if (!row) {
      return {
        period,
        issued: false,
        amount: estimate,
        discount: 0,
        extras: 0,
        lateFee: 0,
        overdueFee: 0,
        paid: 0,
        dueDate: null,
        status: 'not_issued' as const,
      }
    }
    const invoice = invoiceOf(row)
    return {
      period,
      issued: true,
      amount: invoice.amount,
      discount: invoice.discount,
      extras: invoice.lines.reduce((sum, l) => sum + l.amount, 0),
      lateFee: invoice.lateFee,
      overdueFee: invoice.overdueFee,
      paid: invoice.paid,
      dueDate: invoice.dueDate,
      status: invoice.status,
    }
  })
}

function invoiceOf(row: InvoiceRow): Invoice {
  const lines = linesFor(row.id)
  const due = row.amount - row.discount + row.lateFee + row.overdueFee + extrasFor(row.id)
  const paid = paidFor(row.id)
  const status: InvoiceStatus = row.cancelled
    ? 'cancelled'
    : paid >= due
      ? 'paid'
      : toIsoDate(new Date()) > row.dueDate
        ? 'overdue'
        : paid > 0
          ? 'partially_paid'
          : 'issued'
  return {
    id: row.id,
    childId: row.childId,
    childName: childName(row.childId),
    period: row.period,
    amount: row.amount,
    discount: row.discount,
    lateFee: row.lateFee,
    overdueFee: row.overdueFee,
    paid,
    dueDate: row.dueDate,
    status,
    lines,
  }
}




/** فیلدهای قابل اعمال یک کودک، از ثبت‌نام فعالش. */
/**
 * نشانی عکسی که بارگذاری دوباره صفحه را تاب می‌آورد.
 *
 * blob فقط تا پایان همین بارگذاری زنده است. مربی که صفحه را نو می‌کند
 * — یا خانواده که از حساب خودش وارد می‌شود — تصویر شکسته می‌دید.
 *
 * در پیاده‌سازی واقعی نشانی از استوریج می‌آید و این تابع اصلاً لازم
 * نیست. اینجا blob به data تبدیل می‌شود تا نسخه نمایشی همان رفتار را
 * نشان بدهد. اگر تبدیل نشد، همان blob برمی‌گردد و عکس فقط تا نوسازی
 * بعدی می‌ماند — که از نشانی مرده بهتر است.
 */
async function durableUrl(url: string): Promise<string> {
  if (!url.startsWith('blob:')) return url
  try {
    const blob = await (await fetch(url)).blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('عکس خوانده نشد'))
      reader.readAsDataURL(blob)
    })
  } catch {
    return url
  }
}

/**
 * نام سرپرستی که اعلام کرده.
 *
 * مربی باید بداند کدام سرپرست دارو را اعلام کرده؛ اگر سؤالی پیش بیاید
 * می‌داند به که زنگ بزند.
 */
function guardianName(accountId: string): string | null {
  const childId = (GUARDIAN_CHILDREN[accountId] ?? [])[0]
  if (!childId) return null
  return GUARDIANS[childId]?.[0]?.fullName ?? null
}

/**
 * تاریخ جلالی داده نمونه به ISO، فقط برای مقایسه.
 *
 * داده نمونه تاریخ‌ها را جلالی نگه می‌دارد چون همان چیزی است که در
 * رابط دیده می‌شود. برای «منقضی شده یا نه» باید قابل مقایسه باشد، و
 * تفاوت ۶۲۱ سال برای همین مقایسه کافی است.
 */
function jalaliToIso(jalali: string): string {
  const [year = '1400', month = '01', day = '01'] = jalali.split('-')
  return `${Number(year) + 621}-${month}-${day}`
}

/** درخواست‌های دارویی باز یک کودک در یک تاریخ. */
function requestsOn(childId: string, date: string): MedicationRequest[] {
  return MED_REQUESTS.filter(
    (r) =>
      r.childId === childId &&
      r.cancelledAt === null &&
      date >= r.fromDate &&
      date <= r.toDate,
  )
}

/** ساعت آغاز روزِ این کودک، از بازه‌های دوره حضورش. */
function dayStartOf(childId: string): string | null {
  const enrollment = ENROLLMENTS.find((e) => e.childId === childId)
  return enrollment ? dayStartFor(DAY_PERIODS, enrollment.attendanceType) : null
}

function fieldsOf(childId: string): string[] {
  const enrollment = ENROLLMENTS.find((e) => e.childId === childId)
  return enrollment ? applicableFields(DAY_PERIODS, enrollment.attendanceType) : []
}

/** نام مربیِ حساب فعال. در داده واقعی از staff می‌آید. */
function staffNameOf(accountId: string): string {
  return STAFF_NAMES[accountId] ?? ACCOUNT_STAFF[accountId] ?? 'مربی'
}

/**
 * شناسه کارکنِ هر حساب نمونه. در داده واقعی user_account.staff_id است.
 */
const ACCOUNT_STAFF: Record<string, string> = {
  'acc-teacher-golha': 'زهرا محمدی',
  'acc-teacher-both': 'مریم رضایی',
  'acc-teacher-noon': 'نسرین کاظمی',
  'acc-teacher-setareha': 'الهام نوری',
}

/**
 * تأخیر تحویل، از پایان بازه خودِ کودک.
 *
 * پیش‌تر از ساعت ثابت ۱۶:۳۰ می‌آمد، پس کودک صبحانه‌ای هرگز تأخیر
 * نمی‌گرفت و ساعت ۱۳ رفتنش «زودتر از موعد» به نظر می‌رسید.
 */
function lateAfter(childId: string, at: Date): number {
  const enrollment = ENROLLMENTS.find((e) => e.childId === childId)
  const end = enrollment ? dayEndFor(DAY_PERIODS, enrollment.attendanceType) : null
  if (!end) return 0
  const minutes = at.getHours() * 60 + at.getMinutes()
  return Math.max(0, minutes - minutesOf(end))
}

/* ── بازه و دوره حضور ─────────────────────────────────────────── */

/** بخش ۷.۲. در داده واقعی از center.max_children_per_staff می‌آید. */
const MAX_CHILDREN_PER_STAFF = 15

/**
 * کودکانی که مربی امروز دستی به فهرست افزوده.
 *
 * بخش ۵.۳ اصلاح‌شده: کودک سه‌روزه گاهی روز چهارم هم می‌آید و بدون این،
 * مربی هیچ راهی برای ثبت ورودش ندارد. کلید «کلاس|تاریخ» است.
 */
const EXTRA_TODAY = new Map<string, Set<string>>()

/**
 * لحظه جاری، ولی روی تاریخِ خواسته‌شده.
 *
 * روز گذشته یا آینده ساعتِ حالا را می‌گیرد؛ بدون این، بازه‌ها برای هر
 * روزی جز امروز بی‌معنا می‌شدند.
 */
function sameDayNow(isoDate: string): Date {
  const now = new Date()
  if (toLocalIsoDate(now) === isoDate) return now
  const [y, m, d] = isoDate.split('-').map(Number)
  const at = new Date(now)
  at.setFullYear(y ?? 2026, (m ?? 1) - 1, d ?? 1)
  return at
}

const enrollmentOf = (childId: string): Enrollment | null =>
  ENROLLMENTS.find((e) => e.childId === childId) ?? null

/**
 * کودک را با آنچه امروز درباره‌اش صادق است برمی‌گرداند، یا null اگر
 * امروز در جلسه نباشد.
 */
function childInSession(child: Child, at: Date, isExtra: boolean): ChildInSession | null {
  const enrollment = enrollmentOf(child.id)
  if (!enrollment) return null

  // روزی که ثبت‌نامش نیست: فقط اگر مربی دستی افزوده باشد.
  if (!enrolledOn(enrollment, at) && !isExtra) return null

  const mine = periodsFor(DAY_PERIODS, enrollment.attendanceType)
  // پنجره انتقال: کودک نیم‌ساعت پیش از بازه‌اش پیدا می‌شود و نیم‌ساعت
  // پس از آن می‌ماند، تا شبکه سر مرز ناگهان عوض نشود.
  const phase = phaseAt(mine, at)
  // استثنای دستی از قید بازه هم می‌گذرد: مربی می‌داند چه می‌کند.
  if (phase === null && !isExtra) return null

  return {
    ...child,
    attendanceType: enrollment.attendanceType,
    phase: phase ?? 'current',
    periods: mine,
    fields: applicableFields(DAY_PERIODS, enrollment.attendanceType),
    dayStart: dayStartFor(DAY_PERIODS, enrollment.attendanceType),
    dayEnd: dayEndFor(DAY_PERIODS, enrollment.attendanceType),
    addedException: isExtra,
    // بخش ۷.۱: آلرژی همراه کودک می‌آید، نه پشت یک فراخوانی دیگر.
    allergies: MEDICAL[child.id]?.allergies ?? [],
  }
}

export function createLocalDataAccess(scope: AccessScope): DataAccess {
  if (scope.centerId !== CENTER_ID) {
    throw new Error('داده محلی فقط برای همان یک مرکز نمونه است')
  }

  /*
   * خواندن داده ذخیره‌شده، همین‌جا و یک بار.
   *
   * پیش‌تر hydrate فقط از dayState صدا زده می‌شد، یعنی تنبل: هر متدی
   * که حالت ماژول را مستقیم می‌خواند و به روزی دست نمی‌زد، آرایه خالی
   * می‌دید. صندوق پیام مربی دقیقاً در همین افتاد — روی بارگذاری تازه
   * صفر گفتگو برمی‌گرداند و بعد از باز شدن «امروز» درست کار می‌کرد.
   *
   * hydrate خودش idempotent است، پس صدا زدنش اینجا هزینه‌ای ندارد و
   * کل این دسته از باگ را می‌بندد.
   */
  hydrate()

  /** همان قید کلاسی که سیاست سطر-محور در دیتابیس اعمال می‌کند. */
  const visibleClassIds = (): string[] =>
    scope.role === 'manager'
      ? CLASSES.map((c) => c.id)
      : CLASSES.filter((c) => scope.classIds.includes(c.id)).map((c) => c.id)

  const assertVisible = (classId: string) => {
    if (!visibleClassIds().includes(classId)) {
      throw new Error('این کلاس به حساب فعال تخصیص نیافته است')
    }
  }

  /** نام فرستنده از دید بیننده. در داده واقعی از user_account می‌آید. */
  const senderName = () => (scope.role === 'guardian' ? 'خانواده' : 'مربی')

  /** کلید مرتب‌سازی پیام: زمان ارسال، وگرنه زمان سررسید صف. */
  const order = (m: Message) => m.sentAt ?? m.queuedUntil ?? ''

  const currentStaffName = () => staffNameOf(scope.accountId)

  const assertManager = () => {
    if (scope.role !== 'manager') {
      throw new Error('این کار فقط از حساب مدیر ممکن است')
    }
  }

  /** سرپرست فقط برای کودک خودش تصمیم می‌گیرد — بخش ۶.۵. */
  const assertOwnChild = (childId: string) => {
    if (scope.role === 'manager') return
    if (scope.role === 'guardian') {
      if (!(GUARDIAN_CHILDREN[scope.accountId] ?? []).includes(childId)) {
        throw new Error('این کودک به حساب شما وصل نیست')
      }
      return
    }
    const child = CHILDREN.find((c) => c.id === childId)
    if (!child?.classId || !visibleClassIds().includes(child.classId)) {
      throw new Error('این کودک در کلاس‌های شما نیست')
    }
  }

  return {
    scope,

    async listClasses() {
      const allowed = visibleClassIds()
      return CLASSES.filter((c) => allowed.includes(c.id))
    },

    /**
     * روز کلاس، در یک لحظه مشخص.
     *
     * فقط کودکانی برمی‌گردند که همین حالا در جلسه‌اند: ثبت‌نام فعال
     * دارند، امروز روزشان است، و لحظه جاری در یکی از بازه‌هایشان است.
     * پیش‌تر کل کلاس برمی‌گشت و مربی صبح، کودکان بعدازظهری را هم
     * می‌دید و نوار خلاصه روی همه حساب می‌شد.
     */
    async getClassDay(classId, date): Promise<ClassDay> {
      assertVisible(classId)
      const classRoom = CLASSES.find((c) => c.id === classId)
      if (!classRoom) throw new Error('کلاس پیدا نشد')

      const at = sameDayNow(date)
      const current = periodsAt(DAY_PERIODS, at)
      const extras = EXTRA_TODAY.get(`${classId}|${date}`) ?? new Set<string>()

      const children = CHILDREN.filter((c) => c.classId === classId)
        .map((child) => childInSession(child, at, extras.has(child.id)))
        .filter((c): c is ChildInSession => c !== null)

      const ids = new Set(children.map((c) => c.id))
      const state = dayState(date)

      const onDuty = staffOnDutyIds(
        STAFF_SHIFTS.filter((sh) => sh.classId === classId),
        at,
        date,
      )

      /*
       * فقط کودکان بازه جاری در شمارش نسبت می‌آیند. کودکی که در پنجره
       * انتقال است هنوز نیامده یا رفته، و شمردنش نسبت را غلط می‌کند.
       */
      const inSession = children.filter((c) => c.phase === 'current')

      return {
        classRoom,
        children,
        upcomingPeriod: upcomingPeriodAt(DAY_PERIODS, at),
        enrolledToday: CHILDREN.filter(
          (c) => c.classId === classId && enrolledOn(enrollmentOf(c.id), at),
        ).length,
        periods: DAY_PERIODS,
        currentPeriods: current,
        // بخش ۷.۲: نسبت در همین لحظه، نه یک بار در روز. مرز بازه‌ها
        // بحرانی‌ترین نقطه است و خودکار در همین عدد می‌افتد.
        ratio: {
          children: inSession.length,
          staff: onDuty.length,
          maxAllowed: MAX_CHILDREN_PER_STAFF,
          breached: inSession.length > MAX_CHILDREN_PER_STAFF * Math.max(onDuty.length, 1),
        },
        attendance: [...state.attendance.values()].filter((a) => ids.has(a.childId)),
        absences: state.absences.filter((a) => ids.has(a.childId)),
        medications: state.medications.filter((m) => ids.has(m.childId)),
        // درخواست‌هایی که خانواده اعلام کرده ولی هنوز تحویل نگرفته‌ایم.
        medicationRequests: [...ids].flatMap((id) => requestsOn(id, date)),
        reports: [...state.reports.values()].filter((r) => ids.has(r.childId)),
        incidents: state.incidents.filter((i) => ids.has(i.childId)),
        photos: state.photos,
      }
    },

    async listGuardians(childId): Promise<Guardian[]> {
      const child = CHILDREN.find((c) => c.id === childId)
      if (!child?.classId) return []
      assertVisible(child.classId)
      return GUARDIANS[childId] ?? []
    },

    async checkIn(input: CheckInInput): Promise<Attendance> {
      const child = CHILDREN.find((c) => c.id === input.childId)
      if (!child?.classId) throw new Error('کودک پیدا نشد')
      assertVisible(child.classId)

      const date = toLocalIsoDate(input.at)
      const state = dayState(date)
      const row: Attendance = {
        childId: input.childId,
        date,
        checkInAt: input.at.toISOString(),
        checkOutAt: null,
        droppedByGuardianId:
          input.droppedByGuardianId ?? GUARDIANS[input.childId]?.[0]?.id ?? null,
        arrivalCondition: input.arrivalCondition ?? 'normal',
        arrivalPhotoUrl: input.arrivalPhotoUrl ?? null,
        pickedUpById: null,
        pickupMethod: null,
        // نام مربیِ تحویل‌گیرنده. سرپرست هم همین را می‌بیند.
        checkedInByName: currentStaffName(),
        checkedOutByName: null,
        lateMinutes: 0,
      }
      state.attendance.set(input.childId, row)

      // ثبت ورود، اعلام غیبت همان روز را باطل می‌کند.
      state.absences = state.absences.filter((a) => a.childId !== input.childId)
      save()
      return row
    },

    async addMedication(input: MedicationInput): Promise<MedicationLog> {
      const child = CHILDREN.find((c) => c.id === input.childId)
      if (!child?.classId) throw new Error('کودک پیدا نشد')
      assertVisible(child.classId)

      const row: MedicationLog = {
        id: `med-${Math.random().toString(36).slice(2, 10)}`,
        childId: input.childId,
        date: input.date,
        name: input.name,
        dose: input.dose ?? null,
        scheduledTime: input.scheduledTime ?? null,
        givenAt: null,
      }
      dayState(input.date).medications.push(row)
      save()
      return row
    },

    /* ── درخواست دارو از خانواده — ارتقای ۳ ─────────────────── */

    async requestMedication(input): Promise<MedicationRequest> {
      assertOwnChild(input.childId)
      if (!input.name.trim()) throw new Error('نام دارو لازم است.')
      if (!input.dose.trim()) throw new Error('مقدار مصرف لازم است.')
      if (input.times.length === 0) throw new Error('دست‌کم یک ساعت مصرف لازم است.')
      if (input.toDate < input.fromDate) throw new Error('تاریخ پایان پیش از شروع است.')

      const row: MedicationRequest = {
        id: `mrq-${Math.random().toString(36).slice(2, 10)}`,
        childId: input.childId,
        name: input.name.trim(),
        dose: input.dose.trim(),
        times: [...input.times].sort(),
        fromDate: input.fromDate,
        toDate: input.toDate,
        note: input.note?.trim() || null,
        announcedAt: new Date().toISOString(),
        announcedByName: guardianName(scope.accountId),
        receivedAt: null,
        receivedByName: null,
        cancelledAt: null,
      }
      MED_REQUESTS.push(row)
      save()
      return row
    },

    async listMedicationRequests(childId, date): Promise<MedicationRequest[]> {
      assertOwnChild(childId)
      return requestsOn(childId, date)
    },

    async cancelMedicationRequest(requestId) {
      const row = MED_REQUESTS.find((r) => r.id === requestId)
      if (!row) throw new Error('درخواست پیدا نشد.')
      assertOwnChild(row.childId)
      // پس از تحویل، لغو از سمت خانواده معنا ندارد: دارو دست مهد است.
      if (row.receivedAt) {
        throw new Error('این دارو تحویل مهد شده. برای لغو با مربی صحبت کنید.')
      }
      row.cancelledAt = new Date().toISOString()
      save()
    },

    /**
     * مربی شیشه دارو را تحویل گرفت — حلقه دوم زنجیره.
     *
     * تا اینجا درخواست فقط یک اعلام بود. حالا برای هر ساعت مصرف یک
     * ردیف یادآور ساخته می‌شود و تازه از این لحظه «داده شد» ممکن است.
     */
    async receiveMedication(requestId, date): Promise<MedicationLog[]> {
      const row = MED_REQUESTS.find((r) => r.id === requestId)
      if (!row) throw new Error('درخواست پیدا نشد.')
      const child = CHILDREN.find((c) => c.id === row.childId)
      if (!child?.classId) throw new Error('کودک پیدا نشد')
      assertVisible(child.classId)
      if (row.cancelledAt) throw new Error('این درخواست لغو شده است.')
      if (row.receivedAt) return dayState(date).medications.filter((m) => m.requestId === row.id)

      row.receivedAt = new Date().toISOString()
      row.receivedByName = currentStaffName()

      const state = dayState(date)
      const made = row.times.map((time): MedicationLog => ({
        id: `med-${Math.random().toString(36).slice(2, 10)}`,
        childId: row.childId,
        date,
        name: row.name,
        dose: row.dose,
        scheduledTime: time,
        givenAt: null,
        requestId: row.id,
      }))
      state.medications.push(...made)
      save()
      return made
    },

    /**
     * ثبت گروهی — بخش ۵.۵، با قید بازه.
     *
     * فقط روی کودکان حاضر در بازه فعلی می‌نشیند و فقط روی فیلدهایی که
     * برای همان کودک معنا دارند. پیش‌تر روی کل کلاس می‌نشست، پس خلق عصرِ
     * کودک صبحانه‌ای هم پر می‌شد — چیزی که برای او اصلاً وجود ندارد.
     */
    async applyBulk(classId, date, values: BulkValues): Promise<DailyReport[]> {
      assertVisible(classId)
      const state = dayState(date)
      const written: DailyReport[] = []
      const day = await this.getClassDay(classId, date)

      for (const child of day.children) {
        // پنجره انتقال در ثبت گروهی سهمی ندارد: کودکی که هنوز نیامده یا
        // رفته، مقدار گروهی نمی‌گیرد.
        if (child.phase !== 'current') continue
        const current = state.reports.get(child.id)

        /*
         * بخش ۵.۵: «هر کودکی که دست‌نخورده بماند، مقدار گروهی برایش ثبت
         * می‌شود.» یعنی آنچه مربی جدا نوشته پاک نمی‌شود.
         *
         * ولی «دست خورده» به معنای «تا آخر روز کنار گذاشته شده» نیست.
         * با دو بازه، کودکی که مربی صبح ناهارش را استثنا کرده بود از
         * ثبت گروهیِ عصر هم می‌افتاد و مربی باید خوابش را تک‌تک وارد
         * می‌کرد. پس قاعده دقیق‌تر می‌شود: روی کودک استثنا فقط جاهای
         * خالی پر می‌شوند، و هیچ مقدار نوشته‌شده‌ای بازنویسی نمی‌شود.
         */
        const keep = current?.touched === true
        const put = <T>(next: T | null, now: T | null): T | null =>
          keep && now !== null ? now : (next ?? now ?? null)

        // بخش ۶: فقط فیلدهای بازه جاری، و فقط آن‌هایی که برای این کودک
        // معنا دارند. خلق صبحِ ثبت‌شده با ثبت گروهیِ عصر عوض نمی‌شود.
        const writable = bulkFields(child.fields, day.currentPeriods)

        const next: DailyReport = {
          ...blank(child.id, date),
          ...current,
          // ناهار برای همه است و به بازه وصل نیست.
          lunch: put(values.lunch, current?.lunch ?? null),
          napStart: writable.includes('nap')
            ? put(values.napStart, current?.napStart ?? null)
            : (current?.napStart ?? null),
          ...moodPatch(values.mood, current, writable, keep),
          touched: keep,
        }
        state.reports.set(child.id, next)
        written.push(next)
      }

      save()
      return written
    },

    async saveChildReport(childId, date, patch: ReportPatch): Promise<DailyReport> {
      const child = CHILDREN.find((c) => c.id === childId)
      if (!child?.classId) throw new Error('کودک پیدا نشد')
      assertVisible(child.classId)

      const state = dayState(date)
      // بخش ۵.۹: پس از ارسال، گزارش قفل است و فقط اصلاحیه می‌پذیرد.
      // همان قاعده‌ای که تریگر دیتابیس هم می‌بندد.
      if (state.sentAt) {
        throw new Error('گزارش‌های امروز فرستاده شده‌اند. تغییر فقط به شکل اصلاحیه ثبت می‌شود.')
      }
      const next: DailyReport = {
        ...blank(childId, date),
        ...state.reports.get(childId),
        ...patch,
        touched: true,
      }
      state.reports.set(childId, next)
      save()
      return next
    },

    async listPickupOptions(childId): Promise<PickupOption[]> {
      const child = CHILDREN.find((c) => c.id === childId)
      if (!child?.classId) return []
      // قید کلاسی جواب نمی‌دهد: سرپرست هیچ کلاسی ندارد ولی باید فهرست
      // مجاز کودک خودش را ببیند تا بتواند برای فردا انتخاب کند.
      assertOwnChild(childId)

      // بخش ۶.۵: سرپرست محدودشده در فهرست تحویل‌گیرنده دیده نمی‌شود.
      // شِما هم همین را می‌بندد؛ اینجا آینه همان است.
      const guardians = (GUARDIANS[childId] ?? [])
        .filter((g) => g.canPickup)
        .map((g): PickupOption => ({
          id: g.id,
          fullName: g.fullName,
          relation: g.relation,
          photoUrl: null,
          kind: 'guardian',
        }))

      const authorized = (AUTHORIZED[childId] ?? []).map((a): PickupOption => ({
        ...a,
        kind: 'authorized',
      }))

      return [...guardians, ...authorized]
    },

    async checkPickupCode(childId, code, date): Promise<PickupCodeCheck> {
      const child = CHILDREN.find((c) => c.id === childId)
      if (!child?.classId) throw new Error('کودک پیدا نشد')
      assertVisible(child.classId)

      const entry = PICKUP_CODES.find((c) => c.code === code.trim())
      if (!entry) return { valid: false, bearerName: null, photoUrl: null, reason: 'unknown' }
      if (entry.childId !== childId) {
        return { valid: false, bearerName: entry.bearerName, photoUrl: null, reason: 'other_child' }
      }
      // بخش ۵.۸: کد یکبارمصرف و محدود به همان روز.
      if (entry.usedAt) {
        return { valid: false, bearerName: entry.bearerName, photoUrl: null, reason: 'used' }
      }
      if (entry.date !== date) {
        return { valid: false, bearerName: entry.bearerName, photoUrl: null, reason: 'wrong_day' }
      }

      return {
        valid: true,
        bearerName: entry.bearerName,
        photoUrl: entry.photoUrl,
        reason: 'ok',
      }
    },

    async checkOut(input: CheckOutInput): Promise<Attendance> {
      const child = CHILDREN.find((c) => c.id === input.childId)
      if (!child?.classId) throw new Error('کودک پیدا نشد')
      assertVisible(child.classId)

      const date = toLocalIsoDate(input.at)
      const state = dayState(date)
      const row = state.attendance.get(input.childId)
      if (!row?.checkInAt) throw new Error('ورود این کودک هنوز ثبت نشده است.')
      if (row.checkOutAt) throw new Error('خروجش قبلاً ثبت شده است.')

      // بخش ۵.۸، قاعده سفت: فرد باید یا در فهرست مجاز باشد یا کد داشته
      // باشد. وگرنه ثبت نمی‌شود و به مدیر ارجاع می‌رود.
      if (input.method === 'code') {
        const entry = PICKUP_CODES.find((c) => c.code === input.code?.trim())
        if (!entry || entry.childId !== input.childId || entry.usedAt || entry.date !== date) {
          throw new Error('این کد معتبر نیست. به مدیر ارجاع دهید.')
        }
        entry.usedAt = input.at.toISOString()
      } else {
        const allowed = (GUARDIANS[input.childId] ?? [])
          .filter((g) => g.canPickup)
          .map((g) => g.id)
          .concat((AUTHORIZED[input.childId] ?? []).map((a) => a.id))
        if (!input.personId || !allowed.includes(input.personId)) {
          throw new Error('این فرد در فهرست مجاز این کودک نیست. به مدیر ارجاع دهید.')
        }
      }

      const next: Attendance = {
        ...row,
        checkOutAt: input.at.toISOString(),
        pickupMethod: input.method,
        pickedUpById: input.personId ?? null,
        // نام مربیِ تحویل‌دهنده. هر مربی آن کلاس حق تحویل دارد.
        checkedOutByName: currentStaffName(),
        // بخش ۵.۸: تأخیر از پایان بازه خودِ کودک، نه پایان کار مهد.
        // کودک صبحانه‌ای که ساعت ۱۳ می‌رود سر وقت رفته.
        lateMinutes: lateAfter(input.childId, input.at),
      }
      state.attendance.set(input.childId, next)
      save()
      return next
    },

    async createIncident(input: IncidentInput): Promise<Incident> {
      const child = CHILDREN.find((c) => c.id === input.childId)
      if (!child?.classId) throw new Error('کودک پیدا نشد')
      assertVisible(child.classId)

      const date = toLocalIsoDate(input.occurredAt)
      const state = dayState(date)

      const { severity, escalationReason } = escalate(input, state.incidents)

      const row: Incident = {
        id: `inc-${Math.random().toString(36).slice(2, 10)}`,
        childId: input.childId,
        occurredAt: input.occurredAt.toISOString(),
        type: input.type,
        severity,
        location: input.location,
        description: input.description,
        escalationReason,
        // بخش ۳.۳: رویداد متوسط یا بالا بدون تأیید مدیر به سرپرست نمی‌رسد.
        requiresApproval: severity !== 'minor',
      }
      state.incidents.push(row)
      save()
      return row
    },

    async addPhoto(date, previewUrl, childIds): Promise<Photo> {
      const state = dayState(date)
      const row: Photo = {
        id: `pho-${Math.random().toString(36).slice(2, 10)}`,
        date,
        previewUrl: await durableUrl(previewUrl),
        childIds,
        // بخش ۵.۵: عکس بدون تگ منتشر نمی‌شود.
        published: childIds.length > 0,
      }
      state.photos.push(row)
      save()
      return row
    },

    async setPhotoTags(photoId, childIds): Promise<Photo> {
      for (const state of days.values()) {
        const photo = state.photos.find((p) => p.id === photoId)
        if (photo) {
          photo.childIds = childIds
          photo.published = childIds.length > 0
          save()
          return photo
        }
      }
      throw new Error('عکس پیدا نشد')
    },

    async listMyChildren(): Promise<Child[]> {
      if (scope.role !== 'guardian') return []
      const ids = GUARDIAN_CHILDREN[scope.accountId] ?? []
      return CHILDREN.filter((c) => ids.includes(c.id))
    },

    async getParentDay(childId, date): Promise<ParentDay> {
      // بخش ۶.۵: سرپرست فقط کودک خودش را می‌بیند. همان قیدی که سیاست
      // سطر-محور در دیتابیس می‌بندد.
      if (scope.role === 'guardian') {
        const mine = GUARDIAN_CHILDREN[scope.accountId] ?? []
        if (!mine.includes(childId)) throw new Error('این کودک به این حساب تعلق ندارد')
      }

      const child = CHILDREN.find((c) => c.id === childId)
      if (!child) throw new Error('کودک پیدا نشد')

      const state = dayState(date)
      const attendance = state.attendance.get(childId) ?? null
      const report = state.reports.get(childId) ?? null
      // بخش ۵.۹: گزارش تا فرستاده نشدن به خانواده نمی‌رسد.
      const sent = state.sentAt !== null

      const nameOf = (id: string | null): string | null => {
        if (!id) return null
        const guardian = (GUARDIANS[childId] ?? []).find((g) => g.id === id)
        if (guardian) return guardian.relation ?? guardian.fullName
        const authorized = (AUTHORIZED[childId] ?? []).find((a) => a.id === id)
        return authorized ? `${authorized.relation ?? ''} ${authorized.fullName}`.trim() : null
      }

      return {
        child,
        date,
        sent,
        checkInAt: attendance?.checkInAt ?? null,
        droppedByName: nameOf(attendance?.droppedByGuardianId ?? null),
        // سرپرستان خواسته‌اند بدانند کودکشان را دست چه کسی داده‌اند.
        checkedInByName: attendance?.checkedInByName ?? null,
        checkOutAt: attendance?.checkOutAt ?? null,
        checkedOutByName: attendance?.checkedOutByName ?? null,
        pickedUpByName:
          attendance?.pickupMethod === 'code'
            ? 'با کد تحویل'
            : nameOf(attendance?.pickedUpById ?? null),
        lunch: sent ? report?.lunch ?? null : null,
        napMinutes: sent ? napMinutesOf(report?.napStart ?? null) : null,
        moodMorning: sent ? report?.moodMorning ?? null : null,
        moodNoon: sent ? report?.moodNoon ?? null : null,
        moodAfternoon: sent ? report?.moodAfternoon ?? null : null,
        teacherNote: sent ? report?.teacherNote ?? null : null,
        needsFromHome: sent ? (needsFor(childId, date) ?? []) : [],
        // بخش ۵.۹: اصلاحیه جدا از متن اصلی دیده می‌شود، نه به‌جای آن.
        amendments: AMENDMENTS.filter((a) => a.childId === childId && a.date === date),
        // بخش ۶.۶: فقط عکسی که این کودک در آن تگ خورده، و فقط پس از انتشار.
        photos: state.photos.filter((p) => p.published && p.childIds.includes(childId)),
        // بخش ۳.۳: رویداد متوسط یا بالا بدون تأیید مدیر به سرپرست نمی‌رسد.
        incidents: state.incidents.filter(
          (i) => i.childId === childId && !i.requiresApproval,
        ),
      }
    },

    async setNeedDone(childId, date, needId, done): Promise<void> {
      const list = needsFor(childId, date)
      const item = list.find((n) => n.id === needId)
      if (item) item.done = done
      save()
    },

    async getDaySummary(classId, date): Promise<DaySummary> {
      assertVisible(classId)
      const state = dayState(date)
      // همه کودکانِ امروزِ کلاس، نه فقط کودکان بازه جاری: کودک
      // صبحانه‌ای که ظهر رفته هم باید در شمارش پایان روز بیاید.
      const at = sameDayNow(date)
      const children = CHILDREN.filter(
        (c) => c.classId === classId && enrolledOn(enrollmentOf(c.id), at),
      )

      const complete: string[] = []
      const incomplete: DaySummary['incomplete'] = []

      for (const child of children) {
        const report = state.reports.get(child.id)
        const missing = missingParts(report, fieldsOf(child.id))
        if (missing.length === 0) complete.push(child.id)
        else incomplete.push({ childId: child.id, missing })
      }

      // بخش ۵.۹: کودکان بدون یادداشت در این هفته. هفته از شنبه شروع
      // می‌شود، پس روزهای پیشین هم خوانده می‌شوند نه فقط امروز.
      const noted = new Set<string>()
      for (const [day, past] of days) {
        if (!isInCurrentWeek(day)) continue
        for (const report of past.reports.values()) {
          if (report.teacherNote?.trim()) noted.add(report.childId)
        }
      }

      return {
        complete,
        incomplete,
        // تگ عکس هنوز ساخته نشده؛ وقتی استوریج وصل شد از photo_tag می‌آید.
        untaggedPhotos: state.photos.filter((p) => p.childIds.length === 0).length,
        withoutNoteThisWeek: children.filter((c) => !noted.has(c.id)).map((c) => c.id),
        names: Object.fromEntries(children.map((c) => [c.id, c.firstName])),
        sentAt: state.sentAt,
      }
    },


    /* ── درخواست از خانه، سمت مربی — بخش ۵.۹ بند ۶ ───────────── */

    async setClassNeeds(classId, date, texts) {
      assertVisible(classId)
      const state = dayState(date)
      if (state.sentAt) {
        throw new Error('گزارش‌های امروز فرستاده شده‌اند؛ از این پس فقط اصلاحیه.')
      }
      const clean = texts.map((t) => t.trim()).filter((t) => t.length > 0)
      const children = CHILDREN.filter((c) => c.classId === classId)
      for (const child of children) {
        const key = `${child.id}|${date}`
        const before = needsFor(child.id, date)
        // تیک‌هایی که خانواده قبلاً زده از بین نمی‌رود: متن یکسان یعنی
        // همان درخواست، نه درخواست تازه.
        NEEDS.set(
          key,
          clean.map((text, index) => ({
            id: `need-${index + 1}`,
            text,
            done: before.find((n) => n.text === text)?.done ?? false,
          })),
        )
      }
      save()
      return children.length
    },

    /* ── برنامه فردا — بخش ۵.۸ و ۶.۴ ───────────────────────── */

    async listPlans(classId, date) {
      assertVisible(classId)
      const ids = new Set(CHILDREN.filter((c) => c.classId === classId).map((c) => c.id))
      return PLANS.filter((p) => p.date === date && ids.has(p.childId))
    },

    async getChildPlans(childId, date) {
      assertOwnChild(childId)
      return PLANS.filter((p) => p.childId === childId && p.date === date)
    },

    async savePlan(input) {
      assertOwnChild(input.childId)
      const options = await this.listPickupOptions(input.childId)
      const known = input.personId ? options.find((o) => o.id === input.personId) : null

      if (input.personId && !known) {
        throw new Error('این فرد در فهرست مجاز این کودک نیست.')
      }
      if (!known && !input.newPerson?.fullName.trim()) {
        throw new Error('نام فرد را بنویسید.')
      }

      const plan: PickupPlan = known
        ? {
            id: `plan-${input.childId}-${input.date}-${input.direction}`,
            childId: input.childId,
            date: input.date,
            direction: input.direction,
            personName: known.fullName,
            personId: known.id,
            photoUrl: known.photoUrl,
            // فرد مجاز کد لازم ندارد؛ بخش ۵.۸ کد را برای کسی گذاشته که
            // در فهرست نیست.
            code: null,
            note: input.note?.trim() || null,
          }
        : {
            id: `plan-${input.childId}-${input.date}-${input.direction}`,
            childId: input.childId,
            date: input.date,
            direction: input.direction,
            personName: input.newPerson!.fullName.trim(),
            personId: null,
            photoUrl: null,
            code: makeCode(),
            note: input.note?.trim() || null,
          }

      const at = PLANS.findIndex(
        (p) => p.childId === input.childId && p.date === input.date && p.direction === input.direction,
      )
      if (at >= 0) PLANS.splice(at, 1, plan)
      else PLANS.push(plan)

      // کد ساخته‌شده باید از همان مسیری قابل بررسی باشد که مربی می‌شناسد.
      if (plan.code) {
        PICKUP_CODES.push({
          code: plan.code,
          childId: plan.childId,
          date: plan.date,
          bearerName: plan.personName,
          photoUrl: null,
          usedAt: null,
        })
      }
      save()
      return plan
    },

    async clearPlan(childId, date, direction) {
      assertOwnChild(childId)
      const at = PLANS.findIndex(
        (p) => p.childId === childId && p.date === date && p.direction === direction,
      )
      if (at < 0) return
      const [gone] = PLANS.splice(at, 1)
      if (gone?.code) {
        const codeAt = PICKUP_CODES.findIndex((c) => c.code === gone.code && c.date === date)
        if (codeAt >= 0) PICKUP_CODES.splice(codeAt, 1)
      }
      save()
    },

    /* ── مدیر — بخش ۱۳.۳ ────────────────────────────────────── */

    async getManagerDashboard(date) {
      assertManager()
      const state = dayState(date)
      const present = [...state.attendance.values()].filter(
        (a) => a.checkInAt && !a.checkOutAt,
      ).length

      /*
       * بی‌خبر، از مهلتِ بازه خودِ هر کودک.
       *
       * پیش‌تر یک ساعت ثابت برای همه بود و کل فهرست را تا ساعت ۹ خالی
       * نگه می‌داشت یا پس از آن کودک بعدازظهری را هم بی‌خبر می‌شمرد.
       * حالا هر کودک مهلت خودش را دارد، و کودکی که امروز اصلاً روزش
       * نیست اصلاً در فهرست نمی‌آید.
       */
      const absent = new Set(state.absences.map((a) => a.childId))
      const at = sameDayNow(date)
      const unaccounted = CHILDREN.filter((c) => {
        if (!enrolledOn(enrollmentOf(c.id), at)) return false
        if (state.attendance.get(c.id)?.checkInAt || absent.has(c.id)) return false
        return isOverdue({ id: c.id, dayStart: dayStartOf(c.id) }, at)
      }).map((c) => ({
        childId: c.id,
        name: `${c.firstName} ${c.lastName}`,
        guardianPhone: GUARDIAN_PHONES[c.id] ?? null,
      }))

      const nameOf = (childId: string) => {
        const child = CHILDREN.find((c) => c.id === childId)
        return child ? `${child.firstName} ${child.lastName}` : '—'
      }

      return {
        date,
        present,
        enrolled: CHILDREN.length,
        unaccounted,
        pendingIncidents: state.incidents
          .filter((i) => i.requiresApproval)
          .map((i) => ({ ...i, childName: nameOf(i.childId) })),
        classes: CLASSES.map((room) => {
          const kids = CHILDREN.filter(
            (c) => c.classId === room.id && enrolledOn(enrollmentOf(c.id), at),
          )
          const complete = kids.filter(
            (c) => missingParts(state.reports.get(c.id), fieldsOf(c.id)).length === 0,
          ).length
          // بخش ۷: نسبت از کودکانِ همین لحظه و مربیانِ همین لحظه، نه از
          // کل کلاس و کل کارکنان. مرز دو بازه خودش را در همین عدد نشان
          // می‌دهد.
          const inSession = kids.filter((c) => childInSession(c, at, false) !== null)
          const onDuty = staffOnDutyIds(
            STAFF_SHIFTS.filter((sh) => sh.classId === room.id),
            at,
            date,
          )
          return {
            classId: room.id,
            name: room.name,
            complete,
            total: kids.length,
            sent: state.sentAt !== null,
            ratio: {
              children: inSession.length,
              staff: onDuty.length,
              maxAllowed: MAX_CHILDREN_PER_STAFF,
              breached: inSession.length > MAX_CHILDREN_PER_STAFF * Math.max(onDuty.length, 1),
            },
          }
        }),
        pendingClaims: CLAIMS.filter((c) => c.status === 'pending').length,
        smsQuota: smsQuota(),
      }
    },

    /* ── پرونده بازرسی — ارتقای ۲ ───────────────────────────── */

    async getAuditReadiness(): Promise<AuditReadiness> {
      assertManager()
      const soon = new Date()
      soon.setDate(soon.getDate() + 30)
      const limit = toIsoDate(soon)
      return {
        incompleteVaccination: CHILDREN.filter(
          (c) => (VACCINATION[c.id] ?? 'unrecorded') !== 'complete',
        ).length,
        missingNationalId: CHILDREN.filter((c) => !NATIONAL_IDS[c.id]).length,
        // منقضی، نزدیک انقضا، و ثبت‌نشده — هر سه یک کار لازم دارند.
        expiringHealthCards: Object.values(HEALTH_CARDS).filter(
          (card) => !card.expiresAt || jalaliToIso(card.expiresAt) < limit,
        ).length,
      }
    },

    /**
     * پرونده بازرسی — سه جدولی که بازرس می‌خواهد.
     *
     * فقط مدیر، و ساختنش رد پا می‌گذارد: بخش ۱۰.۲ لاگ دسترسی را برای
     * همه داده کودک الزامی کرده، و این حساس‌ترین خروجی کل سامانه است.
     */
    async buildAuditFile(): Promise<AuditFile> {
      assertManager()

      const today = toIsoDate(new Date())
      const soon = new Date()
      soon.setDate(soon.getDate() + 30)
      const limit = toIsoDate(soon)

      return {
        centerName: 'مهد آفتاب',
        builtAt: new Date().toISOString(),
        builtBy: staffNameOf(scope.accountId),
        children: CHILDREN.map((child) => {
          const enrollment = enrollmentOf(child.id)
          return {
            fullName: `${child.firstName} ${child.lastName}`,
            nationalId: NATIONAL_IDS[child.id] ?? null,
            birthDate: null,
            className: CLASSES.find((c) => c.id === child.classId)?.name ?? null,
            attendanceType: enrollment?.attendanceType ?? null,
            guardianName: GUARDIANS[child.id]?.[0]?.fullName ?? null,
            guardianPhone: GUARDIAN_PHONES[child.id] ?? null,
            enrolledSince: enrollment?.startDate ?? null,
          }
        }),
        health: CHILDREN.map((child) => {
          const profile = MEDICAL[child.id]
          return {
            className: CLASSES.find((c) => c.id === child.classId)?.name ?? null,
            fullName: `${child.firstName} ${child.lastName}`,
            allergies: profile?.allergies.length ? profile.allergies.join('، ') : 'ندارد',
            conditions: profile?.chronicConditions ?? 'ندارد',
            vaccinationStatus: VACCINATION[child.id] ?? 'unrecorded',
            updatedAt: null,
          }
        }),
        staff: Object.entries(HEALTH_CARDS).map(([id, card]) => ({
          fullName: STAFF_NAMES[id] ?? id,
          role: 'مربی',
          cardNumber: card.number,
          issuedAt: card.issuedAt,
          expiresAt: card.expiresAt,
          cardState: !card.expiresAt
            ? ('ثبت نشده' as const)
            : jalaliToIso(card.expiresAt) < today
              ? ('منقضی' as const)
              : jalaliToIso(card.expiresAt) < limit
                ? ('نزدیک انقضا' as const)
                : ('معتبر' as const),
        })),
      }
    },

    /** بخش ۱۱.۱۰: دامنه مرکز را خودِ لایه می‌بندد، نه فراخواننده. */
    async listCenterChildren() {
      assertManager()
      return CHILDREN.filter((child) => child.classId !== null)
    },

    async decideIncident(incidentId, decision) {
      assertManager()
      for (const state of days.values()) {
        const incident = state.incidents.find((i) => i.id === incidentId)
        if (!incident) continue
        // بخش ۳.۳: تصمیم مدیر یا رویداد را به خانواده می‌رساند یا
        // بایگانی‌اش می‌کند. متن اولیه مربی در هیچ حالتی عوض نمی‌شود.
        if (decision === 'archive') {
          state.incidents = state.incidents.filter((i) => i.id !== incidentId)
        } else {
          incident.requiresApproval = false
        }
        save()
        return
      }
      throw new Error('رویداد پیدا نشد.')
    },

    async previewNotice(input) {
      assertManager()
      const children = input.classId
        ? CHILDREN.filter((c) => c.classId === input.classId)
        : CHILDREN
      const withoutPhone = children
        .filter((c) => !GUARDIAN_PHONES[c.id])
        .map((c) => ({
          childId: c.id,
          childName: `${c.firstName} ${c.lastName}`,
          guardianName: GUARDIANS[c.id]?.[0]?.fullName ?? '—',
        }))
      const reachable = children.length - withoutPhone.length
      return {
        families: children.length,
        staff: STAFF_COUNT,
        withoutPhone,
        smsRemaining: smsRemaining(),
        // بخش ۱۵.۳: پیامک مربی‌ها متن جداگانه دارد، پس جدا شمرده می‌شود.
        smsNeeded: input.sendSms ? reachable + STAFF_COUNT : 0,
      }
    },

    async publishNotice(input) {
      assertManager()
      const audience = await this.previewNotice(input)
      if (input.sendSms && audience.smsNeeded > audience.smsRemaining) {
        throw new Error(
          `سهمیه پیامک کافی نیست: ${audience.smsNeeded} لازم است و ${audience.smsRemaining} مانده.`,
        )
      }
      if (input.sendSms) smsUsedBy.notice += audience.smsNeeded

      const notice: Notice = {
        id: `notice-${NOTICES.length + 1}`,
        kind: input.kind,
        classId: input.classId ?? null,
        title: input.title.trim(),
        body: input.body.trim(),
        publishedAt: new Date().toISOString(),
        smsSentCount: input.sendSms ? audience.smsNeeded : 0,
        seenInAppCount: 0,
      }
      NOTICES.unshift(notice)
      save()
      return notice
    },

    async listNotices(limit) {
      return NOTICES.slice(0, limit)
    },


    /* ── مالی — ماژول M5 ────────────────────────────────────── */

    async getFinance(period) {
      assertManager()
      const rows = INVOICES.filter((r) => r.period === period).map(invoiceOf)
      const issued = rows.reduce((sum, i) => sum + invoiceTotal(i), 0)
      const collected = rows.reduce((sum, i) => sum + i.paid, 0)
      return {
        period,
        issued,
        collected,
        outstanding: issued - collected,
        overdue: rows.filter((i) => i.status === 'overdue'),
        unpaid: rows.filter((i) => i.status !== 'paid' && i.status !== 'cancelled'),
        plans: FEE_PLANS.map((plan) => ({
          ...plan,
          childCount: Object.values(CHILD_FEES).filter((f) => f.planId === plan.id).length,
        })),
      }
    },

    /**
     * بخش ۸: «صدور صورتحساب ماهانه گروهی با یک اقدام».
     * روی کودکی که صورتحساب همان دوره را دارد دوباره نمی‌نشیند، وگرنه
     * ضربه دوم مدیر همه را دو برابر می‌کرد.
     */
    async issueInvoices(period, dueDate) {
      assertManager()
      let made = 0
      for (const child of CHILDREN) {
        if (INVOICES.some((r) => r.childId === child.id && r.period === period)) continue
        const fee = CHILD_FEES[child.id]
        const plan = FEE_PLANS.find((p) => p.id === fee?.planId)
        if (!plan) continue
        INVOICES.push({
          id: `inv-${child.id}-${period}`,
          childId: child.id,
          period,
          amount: plan.amount,
          discount: Math.round((plan.amount * (fee?.discountPercent ?? 0)) / 100),
          lateFee: 0,
          overdueFee: 0,
          dueDate,
          cancelled: false,
        })
        made += 1
      }
      save()
      return made
    },

    async recordPayment(input) {
      assertManager()
      const row = INVOICES.find((r) => r.id === input.invoiceId)
      if (!row) throw new Error('صورتحساب پیدا نشد.')
      if (input.amount <= 0) throw new Error('مبلغ باید بیشتر از صفر باشد.')
      const remaining = invoiceDue(invoiceOf(row))
      if (input.amount > remaining) {
        throw new Error('مبلغ از باقی‌مانده صورتحساب بیشتر است.')
      }
      const payment: Payment = {
        id: `pay-${PAYMENTS.length + 1}`,
        invoiceId: input.invoiceId,
        amount: input.amount,
        paidAt: new Date().toISOString(),
        method: input.method ?? null,
        receiptNo: input.receiptNo ?? null,
      }
      PAYMENTS.push(payment)
      save()
      return payment
    },

    async remindOverdue(period) {
      assertManager()
      const overdue = INVOICES.filter((r) => r.period === period)
        .map(invoiceOf)
        .filter((i) => i.status === 'overdue')
      // فقط خانواده‌هایی که شماره دارند. بقیه در فهرست مدیر می‌مانند.
      const reachable = overdue.filter((i) => GUARDIAN_PHONES[i.childId])
      if (reachable.length > smsRemaining()) {
        throw new Error('سهمیه پیامک برای یادآوری کافی نیست.')
      }
      smsUsedBy.notice += reachable.length
      save()
      return reachable.length
    },

    /** بخش ۶.۵: فقط سرپرست پرداخت‌کننده مالی را می‌بیند. */
    async getParentFinance(childId) {
      assertOwnChild(childId)
      const payerGuardianId = PAYER[childId]
      const mine = (GUARDIAN_CHILDREN[scope.accountId] ?? []).includes(childId)
      // در داده نمونه، سرپرست اولِ هر کودک پرداخت‌کننده است.
      const isPayer = scope.role === 'manager' || (mine && payerGuardianId !== undefined)
      if (!isPayer) {
        return {
          isPayer: false,
          invoices: [],
          payments: [],
          claims: [],
          outstanding: 0,
          year: [],
          yearLabel: '',
          offers: [],
          reminders: [],
        }
      }

      const invoices = INVOICES.filter((r) => r.childId === childId).map(invoiceOf)
      const ids = new Set(invoices.map((i) => i.id))
      const outstanding = invoices
        .filter((i) => i.status !== 'paid' && i.status !== 'cancelled')
        .reduce((sum, i) => sum + invoiceDue(i), 0)

      const yearLabel = jalaliYearMonth(new Date()).split('-')[0] ?? ''
      return {
        isPayer: true,
        invoices,
        payments: PAYMENTS.filter((p) => ids.has(p.invoiceId)),
        claims: CLAIMS.filter((c) => c.childId === childId),
        outstanding,
        year: feeYear(childId, yearLabel),
        yearLabel,
        offers: offersFor(childId),
        reminders: REMINDERS.filter((r) =>
          INVOICES.some((i) => i.childId === childId && i.period === r.period),
        ),
      }
    },

    /**
     * جواب خانواده به قلم اختیاری.
     *
     * پذیرفتن، همان‌جا سطر صورتحساب می‌سازد — اگر صورتحساب آن دوره
     * صادر شده باشد. اگر نشده، سطر وقتی می‌آید که صادر شود؛ همین است
     * که `issueFeeItem` را دوباره‌اجراپذیر نگه می‌دارد.
     */
    async answerFeeItem(itemId, childId, accept) {
      assertOwnChild(childId)
      const link = FEE_ITEM_CHILDREN.find((f) => f.itemId === itemId && f.childId === childId)
      if (!link) throw new Error('این قلم به کودک شما مربوط نیست.')
      const item = FEE_ITEMS.find((f) => f.id === itemId)
      if (!item?.publishedAt) throw new Error('قلم هزینه پیدا نشد.')
      if (!item.optional) throw new Error('این قلم اختیاری نیست.')

      link.answer = accept ? 'accepted' : 'declined'
      if (accept) issueFeeItem(item)
      else {
        // نپذیرفتن، سطرِ ساخته‌شده را هم برمی‌دارد. وگرنه خانواده‌ای که
        // نظرش عوض شد، بدهی‌ای می‌ماند که رویش جواب «نه» ثبت است.
        const drop = INVOICE_LINES.findIndex(
          (l) => l.itemId === itemId && INVOICES.some((i) => i.id === l.invoiceId && i.childId === childId),
        )
        if (drop >= 0) INVOICE_LINES.splice(drop, 1)
      }
      save()
    },

    /* ── درگاه پرداخت — ارتقای ۱ ────────────────────────────── */

    /**
     * تراکنش را باز می‌کند. **پرداخت نیست.**
     *
     * در پیاده‌سازی واقعی اینجا به واسط (زیبال، وندار، زرین‌پال) وصل
     * می‌شود و نشانی درگاهش برمی‌گردد. اینجا نسخه نمایشی است، ولی
     * قاعده معماری همان است: ردیف با حالت انتظار ساخته می‌شود و تا
     * تأیید سمت سرور در هیچ جمعی نمی‌آید.
     */
    async startOnlinePayment(invoiceId): Promise<PaymentIntent> {
      const row = INVOICES.find((r) => r.id === invoiceId)
      if (!row) throw new Error('صورتحساب پیدا نشد.')
      assertOwnChild(row.childId)

      const invoice = invoiceOf(row)
      const due = invoiceDue(invoice)
      if (due <= 0) throw new Error('این صورتحساب تسویه شده است.')

      const key = `idem-${Math.random().toString(36).slice(2, 12)}`
      const pending: PendingPayment = {
        key,
        invoiceId,
        amount: due,
        psp: 'zibal',
        state: 'pending',
        asked: 0,
      }
      GATEWAY.push(pending)
      save()
      return {
        paymentId: key,
        key,
        redirectUrl: `https://gateway.zibal.ir/start/${key}`,
        amount: due,
        psp: 'zibal',
      }
    },

    /**
     * وضعیت تراکنش، از سرور.
     *
     * بازگشت مرورگر سند نیست. در نسخه نمایشی، تراکنش سه ثانیه پس از
     * باز شدن «تأیید» می‌شود تا حالت انتظار هم قابل دیدن باشد — همان
     * حالتی که در واقعیت وقتی وب‌هوک دیر می‌رسد پیش می‌آید.
     */
    async checkOnlinePayment(key): Promise<PaymentResult> {
      const pending = GATEWAY.find((g) => g.key === key)
      if (!pending) return { state: 'failed', reason: 'تراکنشی با این شناسه پیدا نشد.' }
      if (pending.state === 'failed') {
        return { state: 'failed', reason: 'پرداخت انجام نشد. مبلغی از حساب شما کم نشده.' }
      }
      if (pending.state === 'pending') {
        // پرسش اول «در انتظار» است، دومی تأییدشده — بی وابستگی به ساعت.
        pending.asked += 1
        if (pending.asked < 2) {
          save()
          return { state: 'pending' }
        }
        pending.state = 'verified'
        /*
         * کد رهگیری فقط رقم است، نه حروف.
         *
         * واسط‌های واقعی (زیبال، وندار) هم شماره برمی‌گردانند. مهم‌تر
         * اینکه رابط ارقام را فارسی نشان می‌دهد؛ کدی که حرف لاتین
         * داشته باشد نیمه‌فارسی می‌شود و والد نمی‌تواند برای بانک
         * بخواندش.
         */
        pending.trackingCode = String(Math.floor(100000000 + Math.random() * 899999999))
        PAYMENTS.push({
          id: `pay-${Math.random().toString(36).slice(2, 10)}`,
          invoiceId: pending.invoiceId,
          amount: pending.amount,
          paidAt: new Date().toISOString(),
          method: 'online',
          receiptNo: null,
          paymentMethod: 'online',
          trackingCode: pending.trackingCode,
        })
        // وضعیت صورتحساب از جمع پرداخت‌ها ساخته می‌شود، پس همین کافی است.
        save()
      }
      return {
        state: 'paid',
        trackingCode: pending.trackingCode ?? '—',
        amount: pending.amount,
      }
    },

    /* ── پرونده کودک — ماژول M1 ─────────────────────────────── */

    async getChildProfile(childId) {
      assertOwnChild(childId)
      const child = CHILDREN.find((c) => c.id === childId)
      if (!child) throw new Error('کودک پیدا نشد.')
      const medical = MEDICAL[childId]
      const granted = CONSENTS[childId] ?? []
      const options = await this.listPickupOptions(childId)

      return {
        child,
        className: CLASSES.find((c) => c.id === child.classId)?.name ?? null,
        // شماره در داده نمونه روی کودک است، نه روی تک‌تک سرپرستان. پس
        // فقط پرداخت‌کننده شماره می‌گیرد تا صفحه دو شماره یکسان نشان
        // ندهد. در داده واقعی هر سرپرست شماره خودش را دارد.
        guardians: (GUARDIANS[childId] ?? []).map((g) => ({
          ...g,
          phone: PAYER[childId] === g.id ? (GUARDIAN_PHONES[childId] ?? null) : null,
          isPayer: PAYER[childId] === g.id,
        })),
        authorized: options.filter((o) => o.kind === 'authorized'),
        medical: {
          childId,
          bloodType: medical?.bloodType ?? null,
          allergies: medical?.allergies ?? [],
          chronicConditions: medical?.chronicConditions ?? null,
          dailyMedication: medical?.dailyMedication ?? null,
          doctorName: medical?.doctorName ?? null,
          doctorPhone: medical?.doctorPhone ?? null,
        },
        consents: (
          ['photo_capture', 'photo_group_publish', 'field_trip', 'medication', 'emergency_care'] as const
        ).map((type) => ({ type, granted: granted.includes(type) })),
      }
    },

    /* ── اعلام غیبت — بخش ۶.۴ ───────────────────────────────── */

    async declareAbsence(input) {
      assertOwnChild(input.childId)
      const state = dayState(input.date)
      // فقط برای امروز و گذشته معنا دارد. روز آینده هنوز ورودی ندارد،
      // و بررسی نکردن این شرط باعث می‌شد اعلام غیبت فردا همیشه رد شود.
      if (input.date <= toIsoDate(new Date()) && state.attendance.get(input.childId)?.checkInAt) {
        throw new Error('این کودک امروز وارد شده است.')
      }
      const at = state.absences.findIndex((a) => a.childId === input.childId)
      const notice = { childId: input.childId, date: input.date, reason: input.reason }
      if (at >= 0) state.absences.splice(at, 1, notice)
      else state.absences.push(notice)
      ABSENCES_DECLARED.push(notice)
      save()
    },

    async listMyNotices() {
      // اطلاعیه کل مهد به همه می‌رسد؛ اطلاعیه کلاس فقط به کلاس خودش.
      const mine = new Set(
        scope.role === 'guardian'
          ? CHILDREN.filter((c) => (GUARDIAN_CHILDREN[scope.accountId] ?? []).includes(c.id))
              .map((c) => c.classId)
          : visibleClassIds(),
      )
      return NOTICES.filter((n) => n.classId === null || mine.has(n.classId))
    },

    /* ── پیام با ساعت کاری — بخش ۶.۶ ────────────────────────── */

    /**
     * صندوق گفتگوهای مربی.
     *
     * فقط کودکانی که گفتگویی دارند می‌آیند. فهرست کامل کلاس با بیست
     * ردیف خالی، صندوقی است که کسی بازش نمی‌کند.
     *
     * مرتب‌سازی بر اساس «منتظر جواب» و بعد تازگی: پیامی که خانواده
     * فرستاده و جوابی نگرفته، مهم‌ترین چیز این صفحه است.
     */
    async listThreads() {
      const mine = new Set(
        CHILDREN.filter((c) => c.classId && visibleClassIds().includes(c.classId)).map(
          (c) => c.id,
        ),
      )
      const byChild = new Map<string, Message[]>()
      for (const message of MESSAGES) {
        if (!mine.has(message.childId)) continue
        const list = byChild.get(message.childId) ?? []
        list.push(message)
        byChild.set(message.childId, list)
      }

      const rows = [...byChild.entries()].map(([childId, list]) => {
        const sorted = [...list].sort((a, b) => order(a).localeCompare(order(b)))
        const last = sorted[sorted.length - 1]
        return {
          childId,
          childName: childName(childId),
          photoUrl: CHILDREN.find((c) => c.id === childId)?.photoUrl ?? null,
          lastBody: last?.body ?? null,
          lastAt: last ? order(last) : null,
          awaitingReply: last?.senderRole === 'family',
          queued: list.filter((m) => m.sentAt === null).length,
        }
      })

      return rows.sort((a, b) => {
        if (a.awaitingReply !== b.awaitingReply) return a.awaitingReply ? -1 : 1
        return (b.lastAt ?? '').localeCompare(a.lastAt ?? '')
      })
    },

    async getThread(childId) {
      assertOwnChild(childId)
      const side = scope.role === 'guardian' ? 'family' : 'staff'
      return {
        childId,
        childName: childName(childId),
        messages: MESSAGES.filter((m) => m.childId === childId).map((m) => ({
          ...m,
          // طرفِ گفتگو، نه شخص: مهد چند مربی دارد و همه یک طرف‌اند.
          mine: m.senderRole === side,
        })),
        hours: { start: MESSAGE_HOURS.start, end: MESSAGE_HOURS.end },
      }
    },

    /**
     * بخش ۶.۶: بیرون از ساعت کاری، پیام تا صبح در صف می‌ماند.
     *
     * پیام حذف نمی‌شود و خطا هم نمی‌دهد؛ فرستاده می‌شود ولی تحویلش عقب
     * می‌افتد و همین به فرستنده گفته می‌شود. مربی ساعت یازده شب پیام
     * نمی‌گیرد، و خانواده هم حس نمی‌کند حرفش گم شده.
     */
    async sendMessage(childId, body) {
      assertOwnChild(childId)
      const text = body.trim()
      if (!text) throw new Error('پیام خالی است.')

      const now = new Date()
      const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      const inHours = clock >= MESSAGE_HOURS.start && clock <= MESSAGE_HOURS.end

      const message: Message = {
        id: `msg-${MESSAGES.length + 1}`,
        childId,
        body: text,
        mine: true,
        senderRole: scope.role === 'guardian' ? 'family' : 'staff',
        // نام واقعی، نه «مربی»: خانواده باید بداند با که حرف می‌زند.
        senderName: scope.role === 'guardian' ? senderName() : currentStaffName(),
        sentAt: inHours ? now.toISOString() : null,
        queuedUntil: inHours ? null : nextMorning(now).toISOString(),
      }
      MESSAGES.push(message)
      save()
      return message
    },


    /* ── دارو — بخش ۵.۳ ───────────────────────────────────────── */

    async markMedicationGiven(medicationId) {
      for (const state of days.values()) {
        const row = state.medications.find((m) => m.id === medicationId)
        if (!row) continue
        if (row.childId) assertOwnChild(row.childId)
        /*
         * قاعده ایمنی ارتقای ۳: دارویی که از خانواده تحویل گرفته نشده،
         * خورانده نمی‌شود. تریگر پایگاه داده همین را می‌بندد؛ اینجا
         * آینه همان است.
         */
        if (row.requestId) {
          const request = MED_REQUESTS.find((r) => r.id === row.requestId)
          if (!request?.receivedAt) {
            throw new Error('این دارو هنوز تحویل گرفته نشده. اول «تحویل گرفتم» را بزنید.')
          }
        }
        row.givenAt = new Date().toISOString()
        save()
        return
      }
      throw new Error('دارو پیدا نشد.')
    },

    /* ── اصلاحیه — بخش ۵.۹ ────────────────────────────────────── */

    async addAmendment(childId, date, text) {
      assertOwnChild(childId)
      const clean = text.trim()
      if (!clean) throw new Error('متن اصلاحیه خالی است.')
      const state = dayState(date)
      // اصلاحیه فقط روی گزارشِ فرستاده‌شده معنا دارد؛ پیش از ارسال،
      // مربی خودِ گزارش را ویرایش می‌کند.
      if (!state.sentAt) {
        throw new Error('گزارش این روز هنوز فرستاده نشده؛ خودش را ویرایش کنید.')
      }
      const amendment: Amendment = {
        id: `amend-${AMENDMENTS.length + 1}`,
        childId,
        date,
        text: clean,
        createdAt: new Date().toISOString(),
      }
      AMENDMENTS.push(amendment)
      save()
      return amendment
    },

    async listAmendments(classId, date) {
      assertVisible(classId)
      const ids = new Set(CHILDREN.filter((c) => c.classId === classId).map((c) => c.id))
      return AMENDMENTS.filter((a) => a.date === date && ids.has(a.childId))
    },

    /* ── اعلام پرداخت — بخش ۸ ─────────────────────────────────── */

    async declarePayment(input) {
      const row = INVOICES.find((r) => r.id === input.invoiceId)
      if (!row) throw new Error('صورتحساب پیدا نشد.')
      assertOwnChild(row.childId)
      if (input.amount <= 0) throw new Error('مبلغ باید بیشتر از صفر باشد.')

      const remaining = invoiceDue(invoiceOf(row))
      const alreadyClaimed = CLAIMS.filter(
        (c) => c.invoiceId === row.id && c.status === 'pending',
      ).reduce((sum, c) => sum + c.amount, 0)
      if (input.amount > remaining - alreadyClaimed) {
        throw new Error('مبلغ از باقی‌مانده صورتحساب بیشتر است.')
      }

      const claim: PaymentClaim = {
        id: `claim-${CLAIMS.length + 1}`,
        invoiceId: row.id,
        childId: row.childId,
        childName: childName(row.childId),
        period: row.period,
        amount: input.amount,
        receiptUrl: input.receiptUrl ?? null,
        note: input.note?.trim() || null,
        status: 'pending',
        declaredAt: new Date().toISOString(),
        rejectReason: null,
      }
      CLAIMS.push(claim)
      save()
      return claim
    },

    async listPaymentClaims(status) {
      assertManager()
      return CLAIMS.filter((c) => c.status === status)
    },

    /* ── اقلام هزینه — مدیر ─────────────────────────────────── */

    async listFeeItems(period) {
      assertManager()
      return FEE_ITEMS.filter((f) => f.period === period).map(feeItemOf)
    },

    async createFeeItem(input) {
      assertManager()
      if (!input.title.trim()) throw new Error('عنوان قلم لازم است.')
      if (input.amount <= 0) throw new Error('مبلغ باید بیشتر از صفر باشد.')

      const item: FeeItemRow = {
        id: `fee-${Date.now().toString(36)}`,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        amount: input.amount,
        period: input.period,
        optional: input.optional,
        // ساختن، فرستادن نیست. انتشار ضربه خودش را دارد.
        publishedAt: null,
      }
      FEE_ITEMS.push(item)

      const targets = CHILDREN.filter(
        (c) => input.scope.kind === 'center' || c.classId === input.scope.classId,
      )
      for (const child of targets) {
        FEE_ITEM_CHILDREN.push({ itemId: item.id, childId: child.id, answer: null })
      }
      save()
      return feeItemOf(item)
    },

    async publishFeeItem(itemId) {
      assertManager()
      const item = FEE_ITEMS.find((f) => f.id === itemId)
      if (!item) throw new Error('قلم هزینه پیدا نشد.')
      if (item.publishedAt) throw new Error('این قلم قبلاً فرستاده شده.')
      item.publishedAt = new Date().toISOString()
      const made = issueFeeItem(item)
      save()
      return made
    },

    async decidePaymentClaim(claimId, approve, reason) {
      assertManager()
      const claim = CLAIMS.find((c) => c.id === claimId)
      if (!claim) throw new Error('اعلام پیدا نشد.')
      if (claim.status !== 'pending') throw new Error('این اعلام قبلاً بررسی شده.')

      if (!approve) {
        // رد بدون دلیل، خانواده را سردرگم می‌گذارد.
        if (!reason?.trim()) throw new Error('دلیل رد را بنویسید.')
        claim.status = 'rejected'
        claim.rejectReason = reason.trim()
        save()
        return
      }

      // تأیید، پرداخت واقعی را می‌سازد. تا این لحظه هیچ ریالی ثبت نشده.
      PAYMENTS.push({
        id: `pay-${PAYMENTS.length + 1}`,
        invoiceId: claim.invoiceId,
        amount: claim.amount,
        paidAt: new Date().toISOString(),
        method: 'اعلام خانواده',
        receiptNo: null,
      })
      claim.status = 'approved'
      save()
    },


    /* ── دوره حضور — بخش ۵.۳ اصلاح‌شده ────────────────────────── */

    async listOffDayChildren(classId, date) {
      assertVisible(classId)
      const at = sameDayNow(date)
      const extras = EXTRA_TODAY.get(`${classId}|${date}`) ?? new Set<string>()
      return CHILDREN.filter((child) => {
        if (child.classId !== classId) return false
        if (extras.has(child.id)) return false
        const enrollment = enrollmentOf(child.id)
        if (!enrollment) return false
        // یا امروز روزش نیست، یا بازه‌اش الان نیست. هر دو حالت را مربی
        // ممکن است بخواهد دستی اضافه کند.
        return childInSession(child, at, false) === null
      })
    },

    async addChildToday(childId, date) {
      const child = CHILDREN.find((c) => c.id === childId)
      if (!child?.classId) throw new Error('کودک پیدا نشد')
      assertVisible(child.classId)
      const key = `${child.classId}|${date}`
      const set = EXTRA_TODAY.get(key) ?? new Set<string>()
      set.add(childId)
      EXTRA_TODAY.set(key, set)
      save()
    },

    async sendReports(classId, date): Promise<number> {
      assertVisible(classId)
      const state = dayState(date)
      if (state.sentAt) throw new Error('گزارش‌های امروز قبلاً فرستاده شده‌اند.')

      state.sentAt = new Date().toISOString()
      save()
      return CHILDREN.filter((c) => c.classId === classId).length
    },
  }
}

/**
 * بخش ۵.۹: «کامل» یعنی غذا و خواب و هر سه بازه خلق پر شده باشند.
 * همان تعریفی که تریگر دیتابیس هم به کار می‌برد.
 */
/**
 * بخش ۵.۹: «کامل» یعنی هر فیلدی که برای این کودک معنا دارد پر باشد.
 *
 * تعریف دیگر ثابت نیست: کودک صبحانه‌ای خلق عصر و خواب ندارد و نبودشان
 * نقص نیست. همان منطقی که تریگر پایگاه داده هم اجرا می‌کند.
 */
function missingParts(report: DailyReport | undefined, fields?: readonly string[]): string[] {
  if (fields) {
    const missing: string[] = []
    if (fields.includes('lunch') && !report?.lunch) missing.push('ناهار')
    if (fields.includes('nap') && !report?.napStart) missing.push('خواب')
    const moodMissing =
      (fields.includes('mood_morning') && !report?.moodMorning) ||
      (fields.includes('mood_noon') && !report?.moodNoon) ||
      (fields.includes('mood_afternoon') && !report?.moodAfternoon)
    if (moodMissing) missing.push('خلق')
    return missing
  }
  return legacyMissingParts(report)
}

function legacyMissingParts(report: DailyReport | undefined): string[] {
  const missing: string[] = []
  if (!report?.lunch) missing.push('ناهار')
  if (!report?.napStart) missing.push('خواب')
  if (!report?.moodMorning || !report?.moodNoon || !report?.moodAfternoon) missing.push('خلق')
  return missing
}

/**
 * مدت خواب به دقیقه.
 *
 * بخش ۶.۳ می‌گوید «خواب: ۸۰ دقیقه»، نه ساعت شروع. خانواده ساعت شروع را
 * نمی‌خواهد، مدت را می‌خواهد. تا وقتی ساعت پایان ثبت نمی‌شود، از ساعت
 * شروع تا پایان پنجره خواب حساب می‌شود.
 */
const NAP_WINDOW_END = { hour: 14, minute: 30 }

function napMinutesOf(napStart: string | null): number | null {
  if (!napStart) return null
  const match = /^(\d{1,2}):(\d{2})/.exec(napStart)
  if (!match) return null
  const start = Number(match[1]) * 60 + Number(match[2])
  const end = NAP_WINDOW_END.hour * 60 + NAP_WINDOW_END.minute
  return Math.max(0, end - start)
}

/**
 * «درخواست از خانه» — بخش ۶.۳.
 *
 * در داده واقعی از daily_report.needs_from_home_json می‌آید. اینجا برای
 * نمونه، یک درخواست روی یک کودک نشسته تا تیک «انجام شد» قابل آزمایش باشد.
 */
const NEEDS = new Map<string, { id: string; text: string; done: boolean }[]>()

function needsFor(childId: string, date: string) {
  const key = `${childId}|${date}`
  let list = NEEDS.get(key)
  if (!list) {
    list =
      childId === 'child-1'
        ? [{ id: 'need-1', text: 'فردا لباس گرم بیاورید.', done: false }]
        : []
    NEEDS.set(key, list)
  }
  return list
}

function blank(childId: string, date: string): DailyReport {
  return {
    childId,
    date,
    lunch: null,
    napStart: null,
    moodMorning: null,
    moodNoon: null,
    moodAfternoon: null,
    teacherNote: null,
    touched: false,
  }
}

/**
 * «خلق عمومی امروز» هر سه بازه را پر می‌کند.
 *
 * گزارش سه بازه دارد (بخش ۱۱.۳) و بخش ۵.۹ گزارش را وقتی کامل می‌داند که
 * هر سه پر باشند. اگر نوار گروهی فقط یک بازه را بگیرد، گزارش هیچ‌وقت از
 * این صفحه کامل نمی‌شود و صفحه بستن روز همیشه همه را ناقص می‌شمارد.
 *
 * تفکیک بازه‌ها جای خودش را دارد: شیت استثنای هر کودک، جایی که مربی
 * می‌گوید این کودک صبح خوب بود و عصر بی‌قرار.
 */
/**
 * نوار گروهی «خلق عمومی امروز» است، پس هر سه بازه را پر می‌کند — ولی
 * فقط آن‌هایی که برای این کودک وجود دارند.
 *
 * پیش‌تر هر سه را بی‌قید پر می‌کرد و خلق عصرِ کودک صبحانه‌ای هم مقدار
 * می‌گرفت، در حالی که او اصلاً عصر در مهد نیست.
 */
/**
 * خلق گروهی روی بازه‌های مجاز.
 *
 * keep یعنی این کودک استثناست: جای خالی پر می‌شود ولی آنچه مربی نوشته
 * دست نمی‌خورد.
 */
function moodPatch(
  mood: DailyReport['moodNoon'],
  current: DailyReport | undefined,
  fields: readonly string[],
  keep = false,
) {
  if (!mood) return {}
  const patch: Partial<DailyReport> = {}
  const set = (field: 'moodMorning' | 'moodNoon' | 'moodAfternoon', key: string) => {
    if (!fields.includes(key)) return
    if (keep && current?.[field]) return
    patch[field] = mood
  }
  set('moodMorning', 'mood_morning')
  set('moodNoon', 'mood_noon')
  set('moodAfternoon', 'mood_afternoon')
  return patch
}

/**
 * ارتقای خودکار شدت — بخش ۵.۶.
 * سه حالت: عکس ضمیمه، ناحیه سر یا صورت، و بیش از دو رویداد جزئی در ۷ روز
 * گذشته برای همان کودک. همان منطقی که تریگر دیتابیس هم اجرا می‌کند.
 */
function escalate(
  input: IncidentInput,
  todayIncidents: Incident[],
): { severity: Incident['severity']; escalationReason: Incident['escalationReason'] } {
  if (input.severity !== 'minor') {
    return { severity: input.severity, escalationReason: null }
  }
  if (input.hasPhoto) return { severity: 'notify_parent', escalationReason: 'photo_attached' }
  if (input.headOrFace) return { severity: 'notify_parent', escalationReason: 'head_or_face' }

  const cutoff = input.occurredAt.getTime() - 7 * 86_400_000
  let recent = 0
  for (const state of days.values()) {
    for (const past of state.incidents) {
      if (past.childId !== input.childId || past.severity !== 'minor') continue
      if (new Date(past.occurredAt).getTime() >= cutoff) recent += 1
    }
  }
  void todayIncidents
  if (recent > 2) return { severity: 'notify_parent', escalationReason: 'repeated_7d' }

  return { severity: 'minor', escalationReason: null }
}

function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * رد پای خواندن در حالت محلی — بند ۱۱.۹.
 *
 * سروری نیست که در audit_log بنویسد، پس ردیف‌ها در حافظه می‌مانند تا
 * تست بتواند بسنجد که روکش واقعاً صدا زده می‌شود. در حالت Supabase
 * همین رابط در جدول audit_log می‌نویسد.
 */
export const localAuditRows: { entity: string; ids: string[]; accountId: string }[] = []

export function createLocalAuditSink(scope: AccessScope): ReadAuditSink {
  return {
    async readOccurred(entity, ids) {
      localAuditRows.push({ entity, ids, accountId: scope.accountId })
    },
  }
}
