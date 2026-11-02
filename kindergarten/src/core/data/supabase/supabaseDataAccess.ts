/**
 * پیاده‌سازی واقعی لایه داده روی Supabase.
 *
 * بند ۱۱.۱۰: هیچ متدی center_id نمی‌گیرد. قید از دامنه‌ای می‌آید که مخزن
 * با آن ساخته شده، و هر پرس‌وجو اینجا — نه در صفحه‌ها — به آن مقید
 * می‌شود. سیاست سطر-محور دیتابیس حصار دوم است، نه اول.
 *
 * هشدار صداقت: این کد هنوز روی نمونه زنده Supabase اجرا نشده. تایپ‌ها و
 * نام ستون‌ها با مهاجرت‌های supabase/migrations خوانده شده‌اند، ولی تا
 * وصل شدن یک نمونه واقعی، «کامپایل می‌شود» تنها چیزی است که ثابت شده.
 */
import { quotaReport, type QuotaLine, type SmsBucket } from '../../notify/index.ts'
import { upcomingBirthdays } from '../birthdays.ts'
import { ALL_FEATURES } from '../types.ts'
import type {
  Centre,
  CentreFeature,
  FeatureFlags,
  DocumentReview,
  StaffDocumentKind,
  StaffDocumentSlot,
  ThreadSummary,
  AccessScope,
  Attendance,
  Birthday,
  StaffTitle,
  BulkValues,
  Child,

  ClassRoom,
  DailyReport,
  DataAccess,
  DaySummary,
  Guardian,
  Incident,
  IncidentInput,
  MedicationInput,
  MedicationLog,
  MedicationRequest,
  AuditFile,
  AuditReadiness,
  AuditChildRow,
  AuditHealthRow,
  AuditStaffRow,
  PaymentIntent,
  PaymentResult,
  Notice,
  NoticeAudience,
  NoticeInput,
  ParentDay,
  PickupPlan,
  PickupPlanInput,
  PlanDirection,
  ManagerDashboard,
  IncidentDecision,
  AbsenceInput,
  AttendanceType,
  ChildInSession,
  DayPeriod,
  Enrollment,
  StaffShift,
  Amendment,
  ClaimStatus,
  PaymentClaim,
  PaymentClaimInput,
  ChildProfile,
  ConsentType,
  FinanceOverview,
  Invoice,
  InvoiceStatus,
  Message,
  MessageThread,
  ParentFinance,
  Payment,
  PaymentInput,
  Photo,
  PickupCodeCheck,
  PickupOption,
  ReportPatch,
  CheckInInput,
  CheckOutInput,
  InvoiceLine,
  FeeItem,
  FeeItemOffer,
  ProfileChange,
  ProfileField,
  Conversation,
  ConversationSummary,
  MessageCandidate,
  StaffCartableRow,
  LeaveInput,
  LeaveKind,
  LeaveRequest,
  Loan,
  MealBasketLine,
  MealSlot,
  MealOffer,
  MealOrderState,
  MealPayMethod,
  MealPlate,
  MealPriceInput,
  PendingMealPayment,
  LoanInput,
  LoanKind,
  NewStaff,
  OpenLoan,
  PendingLeave,
  StaffField,
  StaffProfile,
  AttendanceDay,
  AttendanceMonth,
  MonthlyReport,
  Observation,
  CenterDocument,
  InspectionFile,
  InspectionRequirement,
  InspectionVisit,
  ActivityCorner,
  InterestMap,
  PlaySession,
  CalendarEvent,
  Expense,
  IncomeVsExpense,
  MenuEntry,
  Survey,
  FeeYearMonth,
  PaymentMethod,
  PaymentReminderLog,
} from '../types.ts'
import { isInCurrentWeek } from '../../../i18n/week.ts'
import { jalaliToIso, jalaliYearMonth } from '../../../i18n/index.ts'
import { invoiceDue, invoiceTotal } from '../money.ts'
import { isOverdue } from '../attendanceState.ts'
import { supabase } from './client.ts'
import {
  applicableFields,
  bulkFields,
  dayEndFor,
  dayStartFor,
  enrolledOn,
  periodsAt,
  periodsFor,
  phaseAt,
  upcomingPeriodAt,
  staffOnDutyIds,
} from '../periods.ts'

type Row = Record<string, unknown>

/** خطای Supabase را به پیام فارسی تبدیل می‌کند و مسیر را قطع می‌کند. */
function orThrow<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  if (result.data === null) throw new Error('پاسخی از سرور نیامد.')
  return result.data
}

const asChild = (r: Row): Child => ({
  id: r.id as string,
  classId: (r.class_id as string | null) ?? null,
  firstName: r.first_name as string,
  lastName: r.last_name as string,
  photoUrl: (r.photo_url as string | null) ?? null,
  birthDate: (r.birth_date as string | null) ?? null,
})

const asAttendance = (r: Row): Attendance => ({
  childId: r.child_id as string,
  date: r.date as string,
  checkInAt: (r.check_in_at as string | null) ?? null,
  checkOutAt: (r.check_out_at as string | null) ?? null,
  droppedByGuardianId: (r.dropped_by_guardian_id as string | null) ?? null,
  arrivalCondition: (r.arrival_condition as Attendance['arrivalCondition']) ?? 'normal',
  arrivalPhotoUrl: (r.arrival_photo_url as string | null) ?? null,
  pickedUpById:
    (r.picked_up_by_guardian_id as string | null) ??
    (r.picked_up_by_authorized_id as string | null) ??
    null,
  pickupMethod: (r.pickup_method as Attendance['pickupMethod']) ?? null,
  checkedInByName: ((r.checked_in_by as Row | null)?.full_name as string | null) ?? null,
  checkedOutByName: ((r.checked_out_by as Row | null)?.full_name as string | null) ?? null,
  lateMinutes: (r.late_minutes as number | null) ?? 0,
})

const asPeriod = (r: Row): DayPeriod => ({
  id: r.id as string,
  key: r.key as string,
  title: r.title as string,
  startTime: (r.start_time as string).slice(0, 5),
  endTime: (r.end_time as string).slice(0, 5),
  sortOrder: r.sort_order as number,
  reportFields: ((r.report_fields as string[] | null) ?? []),
  includedIn: ((r.included_in as AttendanceType[] | null) ?? []),
})

const asEnrollment = (r: Row): Enrollment => ({
  id: r.id as string,
  childId: r.child_id as string,
  classId: r.class_id as string,
  startDate: r.start_date as string,
  endDate: (r.end_date as string | null) ?? null,
  attendanceType: r.attendance_type as AttendanceType,
  weekdays: ((r.weekdays as number[] | null) ?? []),
  feePlanId: (r.fee_plan_id as string | null) ?? null,
  discountPercent: Number(r.discount_percent ?? 0),
})

const asShift = (r: Row): StaffShift => ({
  id: r.id as string,
  staffId: r.staff_id as string,
  classId: r.class_id as string,
  weekday: r.weekday as number,
  startTime: (r.start_time as string).slice(0, 5),
  endTime: (r.end_time as string).slice(0, 5),
  effectiveFrom: r.effective_from as string,
  effectiveTo: (r.effective_to as string | null) ?? null,
})

const asReport = (r: Row): DailyReport => ({
  childId: r.child_id as string,
  date: r.date as string,
  lunch: (r.lunch as DailyReport['lunch']) ?? null,
  napStart: (r.nap_start as string | null) ?? null,
  moodMorning: (r.mood_morning as DailyReport['moodMorning']) ?? null,
  moodNoon: (r.mood_noon as DailyReport['moodNoon']) ?? null,
  moodAfternoon: (r.mood_afternoon as DailyReport['moodAfternoon']) ?? null,
  teacherNote: (r.teacher_note as string | null) ?? null,
  touched: Boolean(r.touched),
})

const asIncident = (r: Row): Incident => ({
  id: r.id as string,
  childId: r.child_id as string,
  occurredAt: r.occurred_at as string,
  type: r.type as Incident['type'],
  severity: r.severity as Incident['severity'],
  location: r.location as Incident['location'],
  description: (r.description as string | null) ?? '',
  escalationReason: (r.escalation_reason as Incident['escalationReason']) ?? null,
  // بخش ۳.۳: جز جزئی، تا تأیید مدیر به خانواده نمی‌رسد.
  requiresApproval: r.severity !== 'minor' && r.approved_at === null,
})

const asPhoto = (r: Row): Photo => ({
  id: r.id as string,
  date: r.date as string,
  previewUrl: (r.thumb_url as string | null) ?? (r.url as string),
  childIds: ((r.photo_tag as Row[] | null) ?? []).map((t) => t.child_id as string),
  published: r.status === 'published',
})

const asMedication = (r: Row): MedicationLog => ({
  id: r.id as string,
  childId: r.child_id as string,
  date: r.date as string,
  name: r.name as string,
  dose: (r.dose as string | null) ?? null,
  scheduledTime: (r.scheduled_time as string | null) ?? null,
  givenAt: (r.given_at as string | null) ?? null,
  requestId: (r.request_id as string | null) ?? null,
})

const asMedRequest = (r: Row): MedicationRequest => ({
  id: r.id as string,
  childId: r.child_id as string,
  name: r.name as string,
  dose: r.dose as string,
  times: (r.times as string[] | null) ?? [],
  fromDate: r.from_date as string,
  toDate: r.to_date as string,
  note: (r.note as string | null) ?? null,
  announcedAt: r.announced_at as string,
  announcedByName: ((r.announced_by_guardian as Row | null)?.full_name as string | null) ?? null,
  receivedAt: (r.received_at as string | null) ?? null,
  receivedByName: ((r.received_by_staff as Row | null)?.full_name as string | null) ?? null,
  cancelledAt: (r.cancelled_at as string | null) ?? null,
})

/** ستون‌های پیوندی نام سرپرست و مربی، برای اینکه مربی بداند از که بپرسد. */
const MED_REQUEST_SELECT =
  '*, announced_by_guardian:announced_by(full_name), received_by_staff:received_by(full_name)'

const toTime = (value: string | null | undefined): string | null =>
  value && value.length > 0 ? value : null


const asPlan = (r: Row): PickupPlan => {
  const guardian = r.guardian as Row | null
  const authorized = r.authorized as Row | null
  const code = r.code as Row | null
  return {
    id: r.id as string,
    childId: r.child_id as string,
    date: r.date as string,
    direction: r.direction as PickupPlan['direction'],
    personName:
      (guardian?.full_name as string | undefined) ??
      (authorized?.full_name as string | undefined) ??
      (code?.bearer_name as string | undefined) ??
      '—',
    personId: (r.guardian_id as string | null) ?? (r.authorized_id as string | null) ?? null,
    photoUrl: (authorized?.photo_url as string | null) ?? null,
    code: (code?.code as string | null) ?? null,
    note: (r.note as string | null) ?? null,
  }
}

const asNotice = (r: Row, kind: Notice['kind']): Notice => ({
  id: r.id as string,
  kind,
  classId: (r.class_id as string | null) ?? null,
  title: r.title as string,
  body: r.body as string,
  publishedAt: (r.published_at as string | null) ?? null,
  smsSentCount: (r.sms_sent_count as number | null) ?? 0,
  seenInAppCount: (r.delivered_count as number | null) ?? 0,
})


/**
 * وضعیت صورتحساب از پرداخت‌ها و سررسید محاسبه می‌شود، نه فقط از ستون
 * status: یک منبع حقیقت یعنی «پرداخت‌شده ولی هنوز issued» ممکن نیست.
 */
const asInvoice = (r: Row): Invoice => {
  const child = r.child as Row | null
  const paid = ((r.payment as Row[] | null) ?? []).reduce(
    (sum, p) => sum + ((p.amount as number) ?? 0),
    0,
  )
  const amount = (r.amount as number) ?? 0
  const discount = (r.discount as number) ?? 0
  const lateFee = (r.late_fee as number) ?? 0
  const overdueFee = (r.overdue_fee as number) ?? 0
  const lines = ((r.invoice_line as Row[] | null) ?? []).map((l): InvoiceLine => ({
    id: l.id as string,
    title: l.title as string,
    amount: l.amount as number,
  }))
  const extras = lines.reduce((sum, l) => sum + l.amount, 0)
  const due = amount - discount + lateFee + overdueFee + extras
  const today = new Date().toISOString().slice(0, 10)
  /*
   * سررسیدِ گذشته بر نیمه‌پرداخت مقدم است — همان ترتیبی که
   * app.invoice_status_now در پایگاه داده دارد. اگر این دو با هم
   * نخوانند، خانواده در اپ «بخشی پرداخت شده» می‌بیند و یادآوری
   * دیرکرد می‌گیرد.
   */
  const status: InvoiceStatus =
    r.status === 'cancelled'
      ? 'cancelled'
      : paid >= due
        ? 'paid'
        : today > (r.due_date as string)
          ? 'overdue'
          : paid > 0
            ? 'partially_paid'
            : 'issued'
  return {
    id: r.id as string,
    childId: r.child_id as string,
    childName: `${child?.first_name ?? ''} ${child?.last_name ?? ''}`.trim() || '—',
    period: r.period as string,
    amount,
    discount,
    lateFee,
    overdueFee,
    paid,
    dueDate: r.due_date as string,
    status,
    lines,
  }
}


const asClaim = (
  r: Row,
  invoice: { childId: string; childName: string; period: string },
): PaymentClaim => ({
  id: r.id as string,
  invoiceId: r.invoice_id as string,
  childId: invoice.childId,
  childName: invoice.childName,
  period: invoice.period,
  amount: r.amount as number,
  receiptUrl: (r.receipt_url as string | null) ?? null,
  note: (r.note as string | null) ?? null,
  status: r.status as PaymentClaim['status'],
  declaredAt: r.declared_at as string,
  rejectReason: (r.reject_reason as string | null) ?? null,
})

/** آغاز ساعت کاری روز بعد، به شکل ISO. */
function nextMorningIso(from: Date, start: string): string {
  const [h, m] = start.split(':').map(Number)
  const next = new Date(from)
  if (from.getHours() * 60 + from.getMinutes() >= (h ?? 8) * 60 + (m ?? 0)) {
    next.setDate(next.getDate() + 1)
  }
  next.setHours(h ?? 8, m ?? 0, 0, 0)
  return next.toISOString()
}


/**
 * لحظه جاری، ولی روی تاریخِ خواسته‌شده.
 * بدون این، بازه‌ها برای هر روزی جز امروز بی‌معنا می‌شدند.
 */
function sameDayNow(isoDate: string): Date {
  const now = new Date()
  if (now.toISOString().slice(0, 10) === isoDate) return now
  const [y, m, d] = isoDate.split('-').map(Number)
  const at = new Date(now)
  at.setFullYear(y ?? 2026, (m ?? 1) - 1, d ?? 1)
  return at
}

/**
 * قرارداد به‌علاوه یک متد داخلی که لایه ردِ پا صدایش می‌زند.
 *
 * چرا نوع بازگشتی همین است و نه `DataAccess`: خروجی پیش‌تر با
 * `as DataAccess` بسته می‌شد، و آن یعنی هر متدی که به قرارداد اضافه
 * می‌شد و اینجا نوشته نمی‌شد، بی‌صدا رد می‌شد — اولین باری که کاربر
 * واقعی رویش می‌زد، خطای زمان اجرا می‌گرفت. با نوع صریح، کامپایلر
 * همان لحظه می‌گوید کدام متد جا مانده.
 */
type AuditedDataAccess = DataAccess & {
  readOccurred: (entity: string, ids: string[]) => Promise<void>
}

/** بازه میلادیِ یک دوره جلالی مثل «۱۴۰۴-۰۷». */
function periodRange(period: string): { from: string; to: string } {
  const [yearText, monthText] = period.split('-')
  const year = Number(yearText)
  const index = Number(monthText)
  const from = jalaliToIso(year, index, 1)
  const nextMonth = index === 12 ? 1 : index + 1
  const nextYear = index === 12 ? year + 1 : year
  const firstOfNext = jalaliToIso(nextYear, nextMonth, 1)
  if (!from || !firstOfNext) {
    const today = new Date().toISOString().slice(0, 10)
    return { from: today, to: today }
  }
  // یکم ماه بعد منهای یک روز — تا آخرین روز ماه، کبیسه یا نه، درست دربیاید.
  const end = new Date(`${firstOfNext}T12:00:00`)
  end.setDate(end.getDate() - 1)
  return { from, to: end.toISOString().slice(0, 10) }
}

export function createSupabaseDataAccess(scope: AccessScope): AuditedDataAccess {
  /**
   * شناسه مربیِ حسابِ فعال.
   *
   * `scope.accountId` شناسه **حساب** است نه مربی — یک نفر می‌تواند هم
   * حساب مربی داشته باشد هم سرپرست، و آن دو یک شناسه ندارند.
   */
  const myStaffId = async (): Promise<string> => {
    const me = orThrow(
      await db.from('user_account').select('staff_id').eq('id', scope.accountId).single(),
    ) as Row
    const id = me.staff_id as string | null
    if (!id) throw new Error('این حساب مربی نیست')
    return id
  }

  /** چک‌لیست مدارک یک مربی. یک ردیف برای هر خواسته، نه هر مدرک. */
  const readChecklist = async (staffId: string): Promise<StaffDocumentSlot[]> => {
    const rows = (orThrow(
      await db.rpc('staff_document_checklist', { centre: scope.centerId, target: staffId }),
    ) ?? []) as Row[]
    return rows.map((r) => ({
      requirementId: r.requirement_id as string,
      kind: r.kind as StaffDocumentKind,
      title: r.title as string,
      note: (r.note as string | null) ?? null,
      needsExpiry: Boolean(r.needs_expiry),
      documentId: (r.document_id as string | null) ?? null,
      review: (r.review as DocumentReview | null) ?? null,
      reviewNote: (r.review_note as string | null) ?? null,
      expiresAt: (r.expires_at as string | null) ?? null,
      state: r.state as StaffDocumentSlot['state'],
    }))
  }

  /**
   * پرونده یک مربی.
   *
   * `sharedOnly` برای وقتی است که خودِ مربی می‌خواند: یادداشتی که با او
   * در میان گذاشته نشده، در پرونده‌اش دیده نمی‌شود. سیاست سطر-محور هم
   * همین را می‌بندد؛ این فیلتر فقط صریحش می‌کند.
   */
  const readStaffFile = async (staffId: string, sharedOnly: boolean): Promise<StaffProfile> => {
    const [person, docs, notes, classes] = await Promise.all([
      db
        .from('staff')
        .select('id, full_name, first_name, last_name, role, phone, birth_date, national_id, address, education, resume, emergency_name, emergency_phone')
        .eq('id', staffId)
        .single(),
      db.from('staff_document').select('*').eq('staff_id', staffId).order('uploaded_at', { ascending: false }),
      db.from('staff_note').select('*').eq('staff_id', staffId).order('written_at', { ascending: false }),
      db.from('staff_class').select('class:class_id(name)').eq('staff_id', staffId),
    ])

    const row = orThrow(person) as Row
    const noteRows = ((orThrow(notes) as Row[]) ?? []).filter(
      (n) => !sharedOnly || n.shared_at !== null,
    )

    return {
      staffId,
      fullName: row.full_name as string,
      firstName: row.first_name as string,
      lastName: row.last_name as string,
      role: row.role as string,
      title: ((row.title as StaffTitle | null) ?? 'teacher'),
      /*
       * شماره تماس اینجا **هست**.
       *
       * پیش‌تر عمداً خوانده نمی‌شد تا فهرست پرسنل جای افشای شماره نباشد.
       * ولی این فهرست نیست؛ پرونده یک نفر است، و سیاست سطر-محور جدول
       * `staff` همین حالا فقط مدیر و خودِ مربی را می‌گذارد بخواندش.
       */
      phone: (row.phone as string | null) ?? null,
      birthDate: (row.birth_date as string | null) ?? null,
      nationalId: (row.national_id as string | null) ?? null,
      address: (row.address as string | null) ?? null,
      education: (row.education as string | null) ?? null,
      resume: (row.resume as string | null) ?? null,
      emergencyName: (row.emergency_name as string | null) ?? null,
      emergencyPhone: (row.emergency_phone as string | null) ?? null,
      classNames: ((orThrow(classes) as Row[]) ?? [])
        .map((c) => (c.class as Row | null)?.name as string | undefined)
        .filter((n): n is string => Boolean(n)),
      documents: ((orThrow(docs) as Row[]) ?? []).map((d) => ({
        id: d.id as string,
        kind: d.kind as StaffProfile['documents'][number]['kind'],
        title: d.title as string,
        fileUrl: d.file_url as string,
        review: d.review as DocumentReview,
        reviewNote: (d.review_note as string | null) ?? null,
        issuedAt: (d.issued_at as string | null) ?? null,
        expiresAt: (d.expires_at as string | null) ?? null,
        uploadedAt: d.uploaded_at as string,
      })),
      notes: noteRows.map((n) => ({
        id: n.id as string,
        kind: n.kind as StaffProfile['notes'][number]['kind'],
        body: n.body as string,
        writtenAt: n.written_at as string,
        sharedAt: (n.shared_at as string | null) ?? null,
      })),
      activity: {
        daysActive: 0,
        checkIns: 0,
        checkOuts: 0,
        reportsWritten: 0,
        reportsSent: 0,
        medicationsReceived: 0,
      },
    }
  }

  const db = supabase()

  /**
   * قید مشترک هر پرس‌وجو. هیچ متدی این را جا نمی‌اندازد چون هیچ متدی
   * مستقیم به db.from نمی‌رسد مگر از همین‌جا.
   */
  const from = (table: string) => db.from(table).select('*').eq('center_id', scope.centerId)

  const visibleClassIds = async (): Promise<string[]> =>
    scope.role === 'manager'
      ? (await listClasses()).map((c) => c.id)
      : scope.classIds

  const assertVisible = async (classId: string) => {
    if (!(await visibleClassIds()).includes(classId)) {
      throw new Error('این کلاس به حساب فعال تخصیص نیافته است')
    }
  }


  /**
   * بخش ۱۵.۴ و ارتقای ۴: سهمیه ماه جاری، دو سطل جدا.
   *
   * جدول از مهاجرت ۰۰۲۱ کلید سه‌تایی دارد (مرکز، دوره، سطل)، پس یک
   * مرکز در یک ماه دو ردیف دارد. سطلی که ردیف ندارد هم باید دیده شود،
   * وگرنه مدیر فکر می‌کند وجود ندارد — این کار را quotaReport می‌کند.
   */
  const smsQuota = async (): Promise<QuotaLine[]> => {
    const period = new Date().toISOString().slice(0, 7)
    const rows = orThrow(await from('sms_quota').eq('period', period)) as Row[]
    return quotaReport(
      rows.map((row) => ({
        bucket: row.bucket as SmsBucket,
        allocated: (row.allocated as number) ?? 0,
        extraPurchased: (row.extra_purchased as number) ?? 0,
        used: (row.used as number) ?? 0,
      })),
    )
  }

  /**
   * باقی‌مانده سطل «اطلاع‌رسانی» — تنها سطلی که اطلاعیه و یادآوری بدهی
   * از آن برمی‌دارند. سطل حیاتی عمداً اینجا خوانده نمی‌شود.
   */
  const smsRemaining = async (): Promise<number> =>
    (await smsQuota()).find((line) => line.bucket === 'notice')?.remaining ?? 0

  async function listClasses(): Promise<ClassRoom[]> {
    const rows = orThrow(
      await db
        .from('class')
        .select('id, center_id, name')
        .eq('center_id', scope.centerId)
        .order('name'),
    ) as Row[]
    const mine = scope.role === 'manager' ? rows : rows.filter((r) => scope.classIds.includes(r.id as string))
    return mine.map((r) => ({ id: r.id as string, centerId: r.center_id as string, name: r.name as string }))
  }

  /** کودکان یک کلاس. چند جا لازم است، پس یک بار نوشته می‌شود. */
  const childrenOf = async (classId: string): Promise<Child[]> =>
    (orThrow(await from('child').eq('class_id', classId).is('left_at', null).order('first_name')) as Row[])
      .map(asChild)

  /**
   * کودکانی که امروز روزشان هست، همراه فیلدهای گزارشِ خودشان.
   *
   * برخلاف getClassDay، قید «همین لحظه در جلسه» ندارد. هرجا که کل روز
   * شمرده می‌شود — خلاصه پایان روز، گزارش ماهانه — این لازم است.
   */
  const enrolledTodayIn = async (
    classId: string,
    date: string,
  ): Promise<(Child & { fields: string[] })[]> => {
    const at = sameDayNow(date)
    const [periodRows, enrollmentRows] = await Promise.all([
      from('day_period').order('sort_order'),
      from('child_enrollment').eq('class_id', classId),
    ])
    const periods = (orThrow(periodRows) as Row[]).map(asPeriod)
    const enrollments = (orThrow(enrollmentRows) as Row[]).map(asEnrollment)
    const all = await childrenOf(classId)
    return all.flatMap((child) => {
      const enrollment = enrollments.find(
        (e) =>
          e.childId === child.id &&
          date >= e.startDate &&
          (e.endDate === null || date <= e.endDate),
      )
      if (!enrollment || !enrolledOn(enrollment, at)) return []
      return [{ ...child, fields: applicableFields(periods, enrollment.attendanceType) }]
    })
  }

  /**
   * مهدِ این حساب — مهاجرت ۰۰۴۲.
   *
   * از تابع خوانده می‌شود، نه از جدول: مهدِ منقضی زیر سیاستِ `center`
   * ردیف خودش را می‌بیند ولی `security definer` همان یک خواندن را
   * برای هر سه نقش یکسان می‌کند، و `licence_active` همان‌جا حساب
   * می‌شود.
   */
  const readCentre = async (): Promise<Centre> => {
    const rows = (orThrow(await db.rpc('my_centre')) ?? []) as Row[]
    const r = rows[0]
    if (!r) throw new Error('مهد این حساب پیدا نشد.')
    return {
      centerId: r.center_id as string,
      name: r.name as string,
      logoUrl: (r.logo_url as string | null) ?? null,
      phone: (r.phone as string | null) ?? null,
      address: (r.address as string | null) ?? null,
      plan: (r.plan as string | null) ?? null,
      activeUntil: (r.active_until as string | null) ?? null,
      licenceActive: Boolean(r.licence_active),
    }
  }

  return {
    scope,
    listClasses,

    getMyCentre: readCentre,

    async setCentreBrand(input) {
      orThrow(
        await db.rpc('set_center_brand', {
          new_name: input.name,
          new_logo_url: input.logoUrl ?? null,
        }),
      )
      return readCentre()
    },

    async clearCentreLogo() {
      orThrow(await db.rpc('clear_center_logo'))
      return readCentre()
    },

    async getMyFeatures() {
      const rows = (orThrow(await db.rpc('my_features')) ?? []) as Row[]
      /*
       * از «همه روشن» شروع می‌شود و سطرها رویش می‌نشینند.
       *
       * همان قاعدهٔ `center_feature_on`: نبودِ سطر یعنی روشن. اگر
       * مهاجرتِ بعدی قابلیتی اضافه کند و مهدی هنوز سطرش را نداشته
       * باشد، اینجا هم از دست نمی‌رود.
       */
      const flags = Object.fromEntries(
        ALL_FEATURES.map((f) => [f, true]),
      ) as FeatureFlags
      for (const r of rows) {
        const key = r.feature as CentreFeature
        if (key in flags) flags[key] = Boolean(r.enabled)
      }
      return flags
    },

    async getClassDay(classId, date) {
      await assertVisible(classId)
      const classes = await listClasses()
      const classRoom = classes.find((c) => c.id === classId)
      if (!classRoom) throw new Error('کلاس پیدا نشد')

      const at = sameDayNow(date)
      const [periodRows, enrollmentRows, shiftRows, extraRows, medicalRows] =
        await Promise.all([
          from('day_period').order('sort_order'),
          from('child_enrollment').eq('class_id', classId),
          from('staff_shift').eq('class_id', classId),
          from('session_extra').eq('class_id', classId).eq('date', date),
          // بخش ۷.۱: آلرژی همراه روز می‌آید، نه پشت یک فراخوانی دیگر.
          // یک درخواست بیشتر در صبح مهد، ارزان‌تر از دو ضربه در لحظه غذاست.
          from('medical_profile'),
        ])
      const periods = (orThrow(periodRows) as Row[]).map(asPeriod)
      const enrollments = (orThrow(enrollmentRows) as Row[]).map(asEnrollment)
      const extras = new Set(
        (orThrow(extraRows) as Row[]).map((r) => r.child_id as string),
      )
      const allergiesOf = new Map<string, string[]>(
        (orThrow(medicalRows) as Row[]).map((r) => [
          r.child_id as string,
          (r.allergies_json as string[] | null) ?? [],
        ]),
      )

      // فقط کودکانی که همین حالا در جلسه‌اند. پیش‌تر کل کلاس برمی‌گشت.
      const all = await childrenOf(classId)
      const children = all.flatMap((child): ChildInSession[] => {
        const enrollment = enrollments.find(
          (e) =>
            e.childId === child.id &&
            date >= e.startDate &&
            (e.endDate === null || date <= e.endDate),
        )
        if (!enrollment) return []
        const isExtra = extras.has(child.id)
        if (!enrolledOn(enrollment, at) && !isExtra) return []
        const mine = periodsFor(periods, enrollment.attendanceType)
        // پنجره انتقال: نیم‌ساعت پیش از بازه پیدا می‌شود، نیم‌ساعت پس از
        // آن می‌ماند. بی این، شبکه سر مرز ناگهان عوض می‌شد.
        const phase = phaseAt(mine, at)
        if (phase === null && !isExtra) return []
        return [{
          ...child,
          attendanceType: enrollment.attendanceType,
          phase: phase ?? 'current',
          periods: mine,
          fields: applicableFields(periods, enrollment.attendanceType),
          dayStart: dayStartFor(periods, enrollment.attendanceType),
          dayEnd: dayEndFor(periods, enrollment.attendanceType),
          addedException: isExtra,
          allergies: allergiesOf.get(child.id) ?? [],
        }]
      })

      /*
       * کودکانی که امروز روزشان هست، فارغ از اینکه همین لحظه در جلسه
       * باشند یا نه. شمارش پایان روز و آمار مدیر از این می‌آید.
       */
      const enrolledToday = all.filter((child) => {
        const enrollment = enrollments.find(
          (e) =>
            e.childId === child.id &&
            date >= e.startDate &&
            (e.endDate === null || date <= e.endDate),
        )
        return enrollment ? enrolledOn(enrollment, at) : false
      }).length

      const shifts = (orThrow(shiftRows) as Row[]).map(asShift)
      const onDuty = staffOnDutyIds(shifts, at, date)
      /*
       * نام مربیانِ شیفت، برای اینکه داشبورد مدیر یک ضربه تا پرونده
       * همان مربی فاصله داشته باشد. شناسه‌ای که نامش خوانده نشد ردیف
       * نمی‌سازد؛ نامِ نداشته بدتر از نبودن ردیف است.
       */
      const onDutyRows = onDuty.length
        ? ((orThrow(
            await db.from('staff').select('id, full_name').in('id', onDuty),
          ) as Row[]) ?? [])
        : []
      const centreRows = orThrow(await from('center').eq('id', scope.centerId)) as Row[]
      const maxAllowed = (centreRows[0]?.max_children_per_staff as number | undefined) ?? 15
      // نسبت فقط از کودکان بازه جاری؛ پنجره انتقال در آن سهمی ندارد.
      const inSession = children.filter((c) => c.phase === 'current')
      const ratio = {
        children: inSession.length,
        staff: onDuty.length,
        maxAllowed,
        breached: inSession.length > maxAllowed * Math.max(onDuty.length, 1),
        onDuty: onDutyRows.map((r) => ({
          staffId: r.id as string,
          fullName: r.full_name as string,
        })),
      }
      const upcoming = upcomingPeriodAt(periods, at)

      const ids = children.map((c) => c.id)
      if (ids.length === 0) {
        return {
          classRoom, children, enrolledToday, periods,
          currentPeriods: periodsAt(periods, at), upcomingPeriod: upcoming, ratio,
          attendance: [], absences: [], medications: [], medicationRequests: [],
          reports: [], incidents: [], photos: [],
        }
      }

      const [attendance, absences, medRequests, medications, reports, incidents, photos] =
        await Promise.all([
        db
          .from('attendance')
          .select('*, checked_in_by:checked_in_by_staff_id(full_name), checked_out_by:checked_out_by_staff_id(full_name)')
          .eq('center_id', scope.centerId)
          .eq('date', date)
          .in('child_id', ids),
        from('absence_notice').eq('date', date).in('child_id', ids),
        db
          .from('medication_request')
          .select(MED_REQUEST_SELECT)
          .eq('center_id', scope.centerId)
          .in('child_id', ids)
          .is('cancelled_at', null)
          .lte('from_date', date)
          .gte('to_date', date),
        from('medication_log').eq('date', date).in('child_id', ids),
        from('daily_report').eq('date', date).in('child_id', ids),
        from('incident').gte('occurred_at', `${date}T00:00:00`).lte('occurred_at', `${date}T23:59:59`).in('child_id', ids),
        db
          .from('photo')
          .select('*, photo_tag(child_id)')
          .eq('center_id', scope.centerId)
          .eq('date', date)
          .eq('class_id', classId),
      ])

      return {
        classRoom,
        children,
        enrolledToday,
        periods,
        currentPeriods: periodsAt(periods, at),
        upcomingPeriod: upcoming,
        ratio,
        attendance: (orThrow(attendance) as Row[]).map(asAttendance),
        absences: (orThrow(absences) as Row[]).map((r) => ({
          childId: r.child_id as string,
          date: r.date as string,
          reason: (r.reason as string | null) ?? null,
        })),
        medications: (orThrow(medications) as Row[]).map(asMedication),
        medicationRequests: (orThrow(medRequests) as Row[]).map(asMedRequest),
        reports: (orThrow(reports) as Row[]).map(asReport),
        incidents: (orThrow(incidents) as Row[]).map(asIncident),
        photos: (orThrow(photos) as Row[]).map(asPhoto),
      }
    },

    async listGuardians(childId) {
      const rows = orThrow(
        await db
          .from('child_guardian')
          .select('relation, can_pickup, guardian:guardian_id(id, full_name)')
          .eq('center_id', scope.centerId)
          .eq('child_id', childId),
      ) as Row[]
      return rows.map((r): Guardian => {
        const g = r.guardian as Row
        return {
          id: g.id as string,
          fullName: g.full_name as string,
          relation: (r.relation as string | null) ?? null,
          canPickup: Boolean(r.can_pickup),
        }
      })
    },

    async checkIn(input: CheckInInput) {
      const date = input.at.toISOString().slice(0, 10)
      const row = orThrow(
        await db
          .from('attendance')
          .upsert(
            {
              center_id: scope.centerId,
              child_id: input.childId,
              date,
              check_in_at: input.at.toISOString(),
              dropped_by_guardian_id: input.droppedByGuardianId ?? null,
              arrival_condition: input.arrivalCondition ?? 'normal',
              arrival_photo_url: input.arrivalPhotoUrl ?? null,
            },
            { onConflict: 'child_id,date' },
          )
          .select()
          .single(),
      ) as Row
      return asAttendance(row)
    },

    async addMedication(input: MedicationInput) {
      const row = orThrow(
        await db
          .from('medication_log')
          .insert({
            center_id: scope.centerId,
            child_id: input.childId,
            date: input.date,
            name: input.name,
            dose: input.dose ?? null,
            scheduled_time: toTime(input.scheduledTime),
            handed_by_guardian_id: input.handedByGuardianId ?? null,
          })
          .select()
          .single(),
      ) as Row
      return asMedication(row)
    },

    /* ── درخواست دارو از خانواده — ارتقای ۳ ─────────────────── */

    async requestMedication(input) {
      const row = orThrow(
        await db
          .from('medication_request')
          .insert({
            center_id: scope.centerId,
            child_id: input.childId,
            name: input.name.trim(),
            dose: input.dose.trim(),
            times: [...input.times].sort(),
            from_date: input.fromDate,
            to_date: input.toDate,
            note: input.note?.trim() || null,
          })
          .select(MED_REQUEST_SELECT)
          .single(),
      ) as Row
      return asMedRequest(row)
    },

    async listMedicationRequests(childId, date) {
      const rows = orThrow(
        await db
          .from('medication_request')
          .select(MED_REQUEST_SELECT)
          .eq('center_id', scope.centerId)
          .eq('child_id', childId)
          .is('cancelled_at', null)
          .lte('from_date', date)
          .gte('to_date', date)
          .order('announced_at'),
      ) as Row[]
      return rows.map(asMedRequest)
    },

    async cancelMedicationRequest(requestId) {
      /*
       * پس از تحویل، لغو از سمت خانواده معنا ندارد: دارو دست مهد است.
       * شرط is('received_at', null) همین را می‌بندد، پس مسابقه‌ای بین
       * «والد لغو کرد» و «مربی تحویل گرفت» پیش نمی‌آید.
       */
      const rows = orThrow(
        await db
          .from('medication_request')
          .update({ cancelled_at: new Date().toISOString() })
          .eq('center_id', scope.centerId)
          .eq('id', requestId)
          .is('received_at', null)
          .select('id'),
      ) as Row[]
      if (rows.length === 0) {
        throw new Error('این دارو تحویل مهد شده. برای لغو با مربی صحبت کنید.')
      }
    },

    /**
     * مربی شیشه دارو را تحویل گرفت — حلقه دوم زنجیره.
     *
     * تا اینجا درخواست فقط یک اعلام بود. از این لحظه برای هر ساعت مصرف
     * یک یادآور ساخته می‌شود و تریگر پایگاه داده اجازه «داده شد»
     * می‌دهد.
     */
    async receiveMedication(requestId, date) {
      // received_by را تریگر پایگاه داده از حساب فعال پر می‌کند؛ کلاینت
      // نه لازم است بداند و نه حق دارد بگوید.
      const taken = orThrow(
        await db
          .from('medication_request')
          .update({ received_at: new Date().toISOString() })
          .eq('center_id', scope.centerId)
          .eq('id', requestId)
          .is('received_at', null)
          .is('cancelled_at', null)
          .select(MED_REQUEST_SELECT),
      ) as Row[]

      const request = taken[0]
      // قبلاً تحویل گرفته شده: همان یادآورهای ساخته‌شده برمی‌گردند.
      if (!request) {
        const made = orThrow(
          await from('medication_log').eq('date', date).eq('request_id', requestId),
        ) as Row[]
        return made.map(asMedication)
      }

      const rows = orThrow(
        await db
          .from('medication_log')
          .insert(
            ((request.times as string[] | null) ?? []).map((time) => ({
              center_id: scope.centerId,
              child_id: request.child_id as string,
              date,
              name: request.name as string,
              dose: request.dose as string,
              scheduled_time: time,
              request_id: requestId,
            })),
          )
          .select(),
      ) as Row[]
      return rows.map(asMedication)
    },

    /**
     * بخش ۵.۵: فقط روی کودکان دست‌نخورده می‌نشیند. شرط touched=false در
     * خود UPDATE است، نه در کد، تا رقابت دو مربی هم‌زمان استثنا را پاک
     * نکند.
     */
    /**
     * ثبت گروهی — بخش ۵.۵، با قید بخش ۶ سند دوره حضور.
     *
     * فقط روی کودکانی که همین لحظه در جلسه‌اند، و فقط روی فیلدهای بازه
     * جاری. چون فیلدهای مجاز از کودکی به کودک دیگر فرق می‌کند، کودکان
     * بر اساس همان مجموعه دسته می‌شوند و هر دسته یک update می‌گیرد —
     * نه یک update برای کل کلاس، که خلق صبح را با مقدار عصر می‌پوشاند.
     */
    async applyBulk(classId, date, values: BulkValues) {
      await assertVisible(classId)
      const day = await this.getClassDay(classId, date)
      const ids = day.children.map((c) => c.id)
      if (ids.length === 0) return []

      // ردیف نبودِ گزارش هم باید مقدار بگیرد، پس اول ردیف خالی ساخته می‌شود.
      orThrow(
        await db
          .from('daily_report')
          .upsert(
            ids.map((id) => ({ center_id: scope.centerId, child_id: id, date })),
            { onConflict: 'child_id,date', ignoreDuplicates: true },
          )
          .select('id'),
      )

      const groups = new Map<string, string[]>()
      for (const child of day.children) {
        // پنجره انتقال مقدار گروهی نمی‌گیرد.
        if (child.phase !== 'current') continue
        const writable = bulkFields(child.fields, day.currentPeriods).sort().join(',')
        const group = groups.get(writable) ?? []
        group.push(child.id)
        groups.set(writable, group)
      }

      const written: Row[] = []
      for (const [key, groupIds] of groups) {
        const writable = key ? key.split(',') : []
        const patch: Row = {}
        if (values.lunch !== null && writable.includes('lunch')) patch.lunch = values.lunch
        if (values.napStart !== null && writable.includes('nap')) {
          patch.nap_start = toTime(values.napStart)
        }
        if (values.mood !== null) {
          if (writable.includes('mood_morning')) patch.mood_morning = values.mood
          if (writable.includes('mood_noon')) patch.mood_noon = values.mood
          if (writable.includes('mood_afternoon')) patch.mood_afternoon = values.mood
        }
        if (Object.keys(patch).length === 0) continue

        const base = () =>
          db
            .from('daily_report')
            .update(patch)
            .eq('center_id', scope.centerId)
            .eq('date', date)
            .in('child_id', groupIds)
            .is('locked_at', null)

        // کودک دست‌نخورده: همه فیلدهای بازه یکجا.
        written.push(...(orThrow(await base().eq('touched', false).select()) as Row[]))

        /*
         * کودک استثنا: فقط جاهای خالی.
         *
         * بخش ۵.۵ می‌گوید نوشته مربی پاک نشود، نه اینکه کودک تا آخر روز
         * از ثبت گروهی بیفتد. هر فیلد جدا نوشته می‌شود چون شرط «خالی
         * بودن» برای هر کدام جداست.
         */
        for (const [column, value] of Object.entries(patch)) {
          orThrow(
            await db
              .from('daily_report')
              .update({ [column]: value })
              .eq('center_id', scope.centerId)
              .eq('date', date)
              .in('child_id', groupIds)
              .is('locked_at', null)
              .eq('touched', true)
              .is(column, null)
              .select('id'),
          )
        }
      }
      return written.map(asReport)
    },

    async saveChildReport(childId, date, patch: ReportPatch) {
      const row: Row = { center_id: scope.centerId, child_id: childId, date, touched: true }
      if (patch.lunch !== undefined) row.lunch = patch.lunch
      if (patch.napStart !== undefined) row.nap_start = toTime(patch.napStart)
      if (patch.moodMorning !== undefined) row.mood_morning = patch.moodMorning
      if (patch.moodNoon !== undefined) row.mood_noon = patch.moodNoon
      if (patch.moodAfternoon !== undefined) row.mood_afternoon = patch.moodAfternoon
      if (patch.teacherNote !== undefined) row.teacher_note = patch.teacherNote

      const saved = orThrow(
        await db.from('daily_report').upsert(row, { onConflict: 'child_id,date' }).select().single(),
      ) as Row
      return asReport(saved)
    },

    async listPickupOptions(childId) {
      const [guardians, authorized] = await Promise.all([
        db
          .from('child_guardian')
          .select('relation, can_pickup, guardian:guardian_id(id, full_name, photo_url)')
          .eq('center_id', scope.centerId)
          .eq('child_id', childId)
          .eq('can_pickup', true),
        from('authorized_pickup').eq('child_id', childId).eq('active', true),
      ])

      const fromGuardians = (orThrow(guardians) as Row[]).map((r): PickupOption => {
        const g = r.guardian as Row
        return {
          id: g.id as string,
          fullName: g.full_name as string,
          relation: (r.relation as string | null) ?? null,
          photoUrl: (g.photo_url as string | null) ?? null,
          kind: 'guardian',
        }
      })
      const fromAuthorized = (orThrow(authorized) as Row[]).map((r): PickupOption => ({
        id: r.id as string,
        fullName: r.full_name as string,
        relation: (r.relation as string | null) ?? null,
        photoUrl: (r.photo_url as string | null) ?? null,
        kind: 'authorized',
      }))
      return [...fromGuardians, ...fromAuthorized]
    },

    async checkPickupCode(childId, code, date): Promise<PickupCodeCheck> {
      const rows = orThrow(await from('pickup_code').eq('code', code)) as Row[]
      const row = rows[0]
      if (!row) return { valid: false, bearerName: null, photoUrl: null, reason: 'unknown' }
      if (row.child_id !== childId) {
        return { valid: false, bearerName: null, photoUrl: null, reason: 'other_child' }
      }
      if (row.used_at !== null) {
        return { valid: false, bearerName: row.bearer_name as string, photoUrl: null, reason: 'used' }
      }
      if (row.date !== date) {
        return { valid: false, bearerName: row.bearer_name as string, photoUrl: null, reason: 'wrong_day' }
      }
      return {
        valid: true,
        bearerName: row.bearer_name as string,
        photoUrl: (row.bearer_photo_url as string | null) ?? null,
        reason: 'ok',
      }
    },

    /**
     * بخش ۵.۸: بدون فهرست مجاز و بدون کد، خروج ثبت نمی‌شود. این قاعده
     * اینجا و در دیتابیس هر دو بسته است.
     */
    async checkOut(input: CheckOutInput) {
      const date = input.at.toISOString().slice(0, 10)
      if (input.method === 'code') {
        const check = await this.checkPickupCode(input.childId, input.code ?? '', date)
        if (!check.valid) throw new Error('کد تحویل معتبر نیست.')
        orThrow(
          await db
            .from('pickup_code')
            .update({ used_at: input.at.toISOString() })
            .eq('center_id', scope.centerId)
            .eq('code', input.code ?? '')
            .select('id'),
        )
      } else if (!input.personId) {
        throw new Error('تحویل‌گیرنده انتخاب نشده است.')
      }

      const row = orThrow(
        await db
          .from('attendance')
          .update({
            check_out_at: input.at.toISOString(),
            pickup_method: input.method,
            picked_up_by_guardian_id: input.method === 'guardian' ? input.personId : null,
            picked_up_by_authorized_id: input.method === 'authorized' ? input.personId : null,
          })
          .eq('center_id', scope.centerId)
          .eq('child_id', input.childId)
          .eq('date', date)
          .select()
          .single(),
      ) as Row
      return asAttendance(row)
    },

    async createIncident(input: IncidentInput) {
      // شدت خودکار در تریگر دیتابیس بالا می‌رود، نه اینجا؛ پس همان چیزی
      // که برمی‌گردد ملاک است، نه چیزی که فرستاده شد.
      const row = orThrow(
        await db
          .from('incident')
          .insert({
            center_id: scope.centerId,
            child_id: input.childId,
            occurred_at: input.occurredAt.toISOString(),
            type: input.type,
            severity: input.severity,
            location: input.location,
            minor_category: input.minorCategory ?? null,
            description: input.description,
            action_taken: input.actionTaken,
            other_child_id: input.otherChildId ?? null,
          })
          .select()
          .single(),
      ) as Row
      return asIncident(row)
    },

    /**
     * بخش ۵.۵: عکس در حالت draft درج می‌شود، تگ می‌خورد، بعد منتشر.
     * مهاجرت ۰۰۱۱ درج مستقیمِ published را رد می‌کند، پس این ترتیب
     * اجباری است نه سلیقه‌ای.
     */
    async addPhoto(date, previewUrl, childIds) {
      if (childIds.length === 0) throw new Error('عکس بدون تگ ثبت نمی‌شود.')
      const photo = orThrow(
        await db
          .from('photo')
          .insert({ center_id: scope.centerId, date, url: previewUrl, thumb_url: previewUrl })
          .select()
          .single(),
      ) as Row
      return this.setPhotoTags(photo.id as string, childIds)
    },

    async setPhotoTags(photoId, childIds) {
      orThrow(
        await db
          .from('photo_tag')
          .delete()
          .eq('center_id', scope.centerId)
          .eq('photo_id', photoId)
          .select('photo_id'),
      )
      if (childIds.length > 0) {
        orThrow(
          await db
            .from('photo_tag')
            .insert(childIds.map((id) => ({ photo_id: photoId, child_id: id, center_id: scope.centerId })))
            .select('photo_id'),
        )
        orThrow(
          await db
            .from('photo')
            .update({ status: 'published', published_at: new Date().toISOString() })
            .eq('center_id', scope.centerId)
            .eq('id', photoId)
            .select('id'),
        )
      }
      const row = orThrow(
        await db
          .from('photo')
          .select('*, photo_tag(child_id)')
          .eq('center_id', scope.centerId)
          .eq('id', photoId)
          .single(),
      ) as Row
      return asPhoto(row)
    },

    /**
     * خلاصه پایان روز — بخش ۵.۹.
     *
     * روی همه کودکانِ امروز حساب می‌شود، نه فقط کودکانِ همین لحظه: ساعت
     * ۱۶:۳۰ که مربی روز را می‌بندد، کودک صبحانه‌ای ساعت‌هاست رفته و
     * گزارشش هنوز باید شمرده شود.
     *
     * «کامل» هم پویاست (بخش ۶): هر کودک با فیلدهای خودش سنجیده می‌شود.
     */
    async getDaySummary(classId, date): Promise<DaySummary> {
      const day = await this.getClassDay(classId, date)
      const everyone = await enrolledTodayIn(classId, date)
      const reports = new Map(day.reports.map((r) => [r.childId, r]))

      const complete: string[] = []
      const incomplete: DaySummary['incomplete'] = []
      for (const child of everyone) {
        const r = reports.get(child.id)
        const missing: string[] = []
        if (child.fields.includes('lunch') && !r?.lunch) missing.push('ناهار')
        if (child.fields.includes('nap') && !r?.napStart) missing.push('خواب')
        const moodMissing =
          (child.fields.includes('mood_morning') && !r?.moodMorning) ||
          (child.fields.includes('mood_noon') && !r?.moodNoon) ||
          (child.fields.includes('mood_afternoon') && !r?.moodAfternoon)
        if (moodMissing) missing.push('خلق')
        if (missing.length === 0) complete.push(child.id)
        else incomplete.push({ childId: child.id, missing })
      }

      const notes = orThrow(
        await from('daily_report')
          .in('child_id', everyone.map((c) => c.id))
          .not('teacher_note', 'is', null),
      ) as Row[]
      const notedThisWeek = new Set(
        notes.filter((r) => isInCurrentWeek(r.date as string)).map((r) => r.child_id as string),
      )

      const sent = orThrow(
        await from('daily_report').eq('date', date).not('sent_at', 'is', null).limit(1),
      ) as Row[]

      return {
        complete,
        incomplete,
        untaggedPhotos: day.photos.filter((p) => p.childIds.length === 0).length,
        withoutNoteThisWeek: everyone.filter((c) => !notedThisWeek.has(c.id)).map((c) => c.id),
        names: Object.fromEntries(everyone.map((c) => [c.id, c.firstName])),
        sentAt: (sent[0]?.sent_at as string | undefined) ?? null,
      }
    },

    async listMyChildren() {
      const links = orThrow(
        await db
          .from('child_guardian')
          .select('child:child_id(id, class_id, first_name, last_name, photo_url)')
          .eq('center_id', scope.centerId),
      ) as Row[]
      return links.map((r) => asChild(r.child as Row))
    },

    /**
     * بخش ۶.۳. گزارش تا وقتی فرستاده نشده به خانواده نمی‌رسد، و رویداد
     * تأییدنشده هم نه. سیاست سطر-محور همین را دوباره می‌بندد.
     */
    async getParentDay(childId, date): Promise<ParentDay> {
      const mine = await this.listMyChildren()
      const child = mine.find((c) => c.id === childId)
      if (!child) throw new Error('این کودک به حساب شما وصل نیست')

      const [attendanceRows, reportRows, photoRows, incidentRows] = await Promise.all([
        db
          .from('attendance')
          .select('*, checked_in_by:checked_in_by_staff_id(full_name), checked_out_by:checked_out_by_staff_id(full_name)')
          .eq('center_id', scope.centerId)
          .eq('child_id', childId)
          .eq('date', date),
        from('daily_report').eq('child_id', childId).eq('date', date),
        db
          .from('photo')
          .select('*, photo_tag!inner(child_id)')
          .eq('center_id', scope.centerId)
          .eq('date', date)
          .eq('status', 'published')
          .eq('photo_tag.child_id', childId),
        from('incident')
          .eq('child_id', childId)
          .gte('occurred_at', `${date}T00:00:00`)
          .lte('occurred_at', `${date}T23:59:59`),
      ])

      const attendance = (orThrow(attendanceRows) as Row[])[0]
      const report = (orThrow(reportRows) as Row[])[0]
      const sent = Boolean(report?.sent_at)

      const names = orThrow(
        await db
          .from('guardian')
          .select('id, full_name')
          .eq('center_id', scope.centerId),
      ) as Row[]
      const nameOf = (id: string | null) =>
        id ? ((names.find((g) => g.id === id)?.full_name as string | undefined) ?? null) : null

      const napMinutes =
        sent && report?.nap_start && report?.nap_end
          ? Math.round(
              (Date.parse(`1970-01-01T${report.nap_end as string}Z`) -
                Date.parse(`1970-01-01T${report.nap_start as string}Z`)) /
                60000,
            )
          : null

      return {
        child,
        date,
        sent,
        checkInAt: (attendance?.check_in_at as string | null) ?? null,
        droppedByName: nameOf((attendance?.dropped_by_guardian_id as string | null) ?? null),
        // سرپرستان خواسته‌اند بدانند کودکشان را دست چه کسی داده‌اند.
        checkedInByName: ((attendance?.checked_in_by as Row | null)?.full_name as string | null) ?? null,
        checkOutAt: (attendance?.check_out_at as string | null) ?? null,
        checkedOutByName: ((attendance?.checked_out_by as Row | null)?.full_name as string | null) ?? null,
        pickedUpByName: nameOf((attendance?.picked_up_by_guardian_id as string | null) ?? null),
        lunch: sent ? ((report?.lunch as ParentDay['lunch']) ?? null) : null,
        napMinutes,
        moodMorning: sent ? ((report?.mood_morning as ParentDay['moodMorning']) ?? null) : null,
        moodNoon: sent ? ((report?.mood_noon as ParentDay['moodNoon']) ?? null) : null,
        moodAfternoon: sent ? ((report?.mood_afternoon as ParentDay['moodAfternoon']) ?? null) : null,
        teacherNote: sent ? ((report?.teacher_note as string | null) ?? null) : null,
        needsFromHome: sent
          ? ((report?.needs_from_home_json as ParentDay['needsFromHome'] | null) ?? [])
          : [],
        // بخش ۵.۹: اصلاحیه جدا از متن اصلی دیده می‌شود، نه به‌جای آن.
        amendments: sent && report
          ? ((orThrow(
              await from('daily_report_amendment').eq('daily_report_id', report.id as string),
            ) as Row[]).map((a): Amendment => ({
              id: a.id as string,
              childId,
              date,
              text: a.text as string,
              createdAt: a.created_at as string,
            })))
          : [],
        photos: (orThrow(photoRows) as Row[]).map(asPhoto),
        incidents: (orThrow(incidentRows) as Row[]).map(asIncident).filter((i) => !i.requiresApproval),
      }
    },

    async setNeedDone(childId, date, needId, done) {
      const rows = orThrow(
        await from('daily_report').eq('child_id', childId).eq('date', date),
      ) as Row[]
      const row = rows[0]
      if (!row) return
      const needs = (row.needs_from_home_json as ParentDay['needsFromHome'] | null) ?? []
      orThrow(
        await db
          .from('daily_report')
          .update({
            needs_from_home_json: needs.map((n) => (n.id === needId ? { ...n, done } : n)),
          })
          .eq('center_id', scope.centerId)
          .eq('id', row.id as string)
          .select('id'),
      )
    },


    /* ── درخواست از خانه، سمت مربی — بخش ۵.۹ بند ۶ ───────────── */

    async setClassNeeds(classId, date, texts) {
      await assertVisible(classId)
      const children = await childrenOf(classId)
      const clean = texts.map((t) => t.trim()).filter((t) => t.length > 0)
      const existing = orThrow(
        await from('daily_report').eq('date', date).in('child_id', children.map((c) => c.id)),
      ) as Row[]

      for (const child of children) {
        const row = existing.find((r) => r.child_id === child.id)
        if (row?.locked_at) continue
        const before =
          ((row?.needs_from_home_json as { id: string; text: string; done: boolean }[] | null) ?? [])
        orThrow(
          await db
            .from('daily_report')
            .upsert(
              {
                center_id: scope.centerId,
                child_id: child.id,
                date,
                // تیک خانواده حفظ می‌شود: متن یکسان یعنی همان درخواست.
                needs_from_home_json: clean.map((text, index) => ({
                  id: `need-${index + 1}`,
                  text,
                  done: before.find((n) => n.text === text)?.done ?? false,
                })),
              },
              { onConflict: 'child_id,date' },
            )
            .select('id'),
        )
      }
      return children.length
    },

    /* ── برنامه فردا — بخش ۵.۸ و ۶.۴ ───────────────────────── */

    async listPlans(classId, date) {
      await assertVisible(classId)
      const children = await childrenOf(classId)
      if (children.length === 0) return []
      const rows = orThrow(
        await db
          .from('pickup_plan')
          .select('*, guardian:guardian_id(full_name), authorized:authorized_id(full_name, photo_url), code:pickup_code_id(code, bearer_name)')
          .eq('center_id', scope.centerId)
          .eq('date', date)
          .in('child_id', children.map((c) => c.id)),
      ) as Row[]
      return rows.map(asPlan)
    },

    async getChildPlans(childId, date) {
      const rows = orThrow(
        await db
          .from('pickup_plan')
          .select('*, guardian:guardian_id(full_name), authorized:authorized_id(full_name, photo_url), code:pickup_code_id(code, bearer_name)')
          .eq('center_id', scope.centerId)
          .eq('child_id', childId)
          .eq('date', date),
      ) as Row[]
      return rows.map(asPlan)
    },

    async savePlan(input: PickupPlanInput) {
      const options = await this.listPickupOptions(input.childId)
      const known = input.personId ? options.find((o) => o.id === input.personId) : null
      if (input.personId && !known) throw new Error('این فرد در فهرست مجاز این کودک نیست.')
      if (!known && !input.newPerson?.fullName.trim()) throw new Error('نام فرد را بنویسید.')

      let codeId: string | null = null
      if (!known) {
        // بخش ۵.۸: کد یکبارمصرف و محدود به همان روز.
        const code = String(1000 + Math.floor(Math.random() * 9000))
        const made = orThrow(
          await db
            .from('pickup_code')
            .insert({
              center_id: scope.centerId,
              child_id: input.childId,
              date: input.date,
              code,
              bearer_name: input.newPerson!.fullName.trim(),
              bearer_phone: input.newPerson!.phone.trim() || null,
              created_by: scope.accountId,
              expires_at: `${input.date}T23:59:59`,
            })
            .select()
            .single(),
        ) as Row
        codeId = made.id as string
      }

      const saved = orThrow(
        await db
          .from('pickup_plan')
          .upsert(
            {
              center_id: scope.centerId,
              child_id: input.childId,
              date: input.date,
              direction: input.direction,
              guardian_id: known?.kind === 'guardian' ? known.id : null,
              authorized_id: known?.kind === 'authorized' ? known.id : null,
              pickup_code_id: codeId,
              note: input.note?.trim() || null,
              created_by: scope.accountId,
            },
            { onConflict: 'child_id,date,direction' },
          )
          .select('*, guardian:guardian_id(full_name), authorized:authorized_id(full_name, photo_url), code:pickup_code_id(code, bearer_name)')
          .single(),
      ) as Row
      return asPlan(saved)
    },

    async clearPlan(childId, date, direction: PlanDirection) {
      orThrow(
        await db
          .from('pickup_plan')
          .delete()
          .eq('center_id', scope.centerId)
          .eq('child_id', childId)
          .eq('date', date)
          .eq('direction', direction)
          .select('id'),
      )
    },

    /* ── مدیر — بخش ۱۳.۳ ────────────────────────────────────── */

    async getManagerDashboard(date): Promise<ManagerDashboard> {
      const classes = await listClasses()
      const perClass = await Promise.all(
        classes.map(async (room) => {
          const day = await this.getClassDay(room.id, date)
          const reports = new Map(day.reports.map((r) => [r.childId, r]))
          // بخش ۶: «کامل» پویاست. کودک صبحانه‌ای خواب ندارد، پس نداشتنش
          // ناقص بودن نیست.
          const complete = day.children.filter((c) => {
            const r = reports.get(c.id)
            if (c.fields.includes('lunch') && !r?.lunch) return false
            if (c.fields.includes('nap') && !r?.napStart) return false
            if (c.fields.includes('mood_morning') && !r?.moodMorning) return false
            if (c.fields.includes('mood_noon') && !r?.moodNoon) return false
            if (c.fields.includes('mood_afternoon') && !r?.moodAfternoon) return false
            return true
          }).length
          return { room, day, complete }
        }),
      )

      const now = new Date()
      const unaccounted: ManagerDashboard['unaccounted'] = []
      const pending: ManagerDashboard['pendingIncidents'] = []
      let present = 0
      let enrolled = 0

      for (const { day } of perClass) {
        enrolled += day.enrolledToday
        const absent = new Set(day.absences.map((a) => a.childId))
        const byChild = new Map(day.attendance.map((a) => [a.childId, a]))
        for (const child of day.children) {
          const row = byChild.get(child.id)
          if (row?.checkInAt && !row.checkOutAt) present += 1
          // مهلت هر کودک از آغاز بازه خودش، نه از ساعت ثابت ۹.
          if (!row?.checkInAt && !absent.has(child.id) && isOverdue(child, now)) {
            unaccounted.push({
              childId: child.id,
              name: `${child.firstName} ${child.lastName}`,
              guardianPhone: null,
            })
          }
        }
        for (const incident of day.incidents) {
          if (!incident.requiresApproval) continue
          const child = day.children.find((c) => c.id === incident.childId)
          pending.push({
            ...incident,
            childName: child ? `${child.firstName} ${child.lastName}` : '—',
          })
        }
      }

      const phones = orThrow(
        await db
          .from('child_guardian')
          .select('child_id, guardian:guardian_id(phone)')
          .eq('center_id', scope.centerId),
      ) as Row[]
      for (const row of unaccounted) {
        const match = phones.find((p) => p.child_id === row.childId)
        row.guardianPhone = ((match?.guardian as Row | null)?.phone as string | null) ?? null
      }

      return {
        date,
        present,
        enrolled,
        unaccounted,
        pendingIncidents: pending,
        classes: perClass.map(({ room, day, complete }) => ({
          classId: room.id,
          name: room.name,
          complete,
          total: day.enrolledToday,
          sent: day.reports.some((r) => r.touched) && complete === day.children.length,
          ratio: day.ratio,
        })),
        pendingClaims: (
          orThrow(await from('payment_claim').eq('status', 'pending')) as Row[]
        ).length,
        smsQuota: await smsQuota(),
      }
    },

    /* ── منو، تقویم، نظرسنجی — ماژول M14 ────────────────────── */

    async getMenu(childId: string, from: string, to: string): Promise<MenuEntry[]> {
      /*
       * تقاطع آلرژی سمت سرور است، نه اینجا.
       *
       * فهرست آلرژی کودک اصلاً به مرورگر نمی‌آید مگر لازم باشد، و
       * منطق تطبیق یک جا می‌ماند — دو پیاده‌سازی یعنی دو جواب.
       */
      const rows = orThrow(
        await db.rpc('menu_for_child', {
          centre: scope.centerId,
          target: childId,
          from_date: from,
          to_date: to,
        }),
      ) as Row[]
      return (rows ?? []).map((r): MenuEntry => ({
        menuDayId: r.menu_day_id as string,
        date: r.date as string,
        slot: r.slot as MenuEntry['slot'],
        title: r.title as string,
        ingredients: (r.ingredients as string[] | null) ?? [],
        note: (r.note as string | null) ?? null,
        allergyHits: (r.allergy_hits as string[] | null) ?? [],
      }))
    },

    async setMenuDay(input) {
      // یک روز و یک وعده، یک منو — قید menu_day_once در جدول هم هست.
      orThrow(
        await db.from('menu_day').upsert(
          {
            center_id: scope.centerId,
            date: input.date,
            slot: input.slot,
            title: input.title.trim(),
            ingredients: input.ingredients.map((i) => i.trim()).filter(Boolean),
            note: input.note?.trim() || null,
          },
          { onConflict: 'center_id,date,slot' },
        ),
      )
    },

    async listCalendar(from: string, to: string): Promise<CalendarEvent[]> {
      /*
       * رویداد نامرئی را سیاست سطر-محور می‌بندد، نه این پرس‌وجو.
       * فیلتر اینجا فقط تکرارِ همان قاعده بود و می‌توانست با آن نخواند.
       */
      const rows = orThrow(
        await db
          .from('calendar_event')
          .select('*')
          .eq('center_id', scope.centerId)
          .gte('date', from)
          .lte('date', to)
          .order('date'),
      ) as Row[]
      return (rows ?? []).map((r): CalendarEvent => ({
        id: r.id as string,
        date: r.date as string,
        endDate: (r.end_date as string | null) ?? null,
        kind: r.kind as CalendarEvent['kind'],
        title: r.title as string,
        note: (r.note as string | null) ?? null,
        visibleToFamily: Boolean(r.visible_to_family),
      }))
    },

    /*
     * تولدهای پیشِ رو.
     *
     * سطرها از `child` می‌آیند و سیاست سطر-محور خودش کلاس‌های حسابِ
     * فعال را می‌بندد — همان قیدی که آداپتور محلی با visibleClassIds
     * تقلیدش می‌کند. حساب سرپرست اینجا خالی برمی‌گرداند، چون فهرست
     * تولد یعنی فهرست نام و تاریخ تولدِ کودکانِ خانواده‌های دیگر.
     *
     * حسابِ «چه روزی و چند سالش می‌شود» در `birthdays.ts` است، مشترک
     * با آداپتور محلی: دو حساب جدا یعنی روزی یکی «فردا» می‌گوید و
     * دیگری «امروز».
     */
    async listBirthdays(withinDays: number): Promise<Birthday[]> {
      if (scope.role === 'guardian') return []
      const rows = orThrow(
        await db
          .from('child')
          .select('*')
          .eq('center_id', scope.centerId)
          .is('left_at', null)
          .not('birth_date', 'is', null),
      ) as Row[]
      const classes = await this.listClasses()
      const nameOf = (id: string) => classes.find((c) => c.id === id)?.name ?? null
      return upcomingBirthdays((rows ?? []).map(asChild), withinDays, nameOf)
    },

    async addCalendarEvent(input) {
      orThrow(
        await db.from('calendar_event').insert({
          center_id: scope.centerId,
          date: input.date,
          end_date: input.endDate ?? null,
          kind: input.kind,
          title: input.title.trim(),
          note: input.note?.trim() || null,
          visible_to_family: input.visibleToFamily ?? true,
        }),
      )
    },

    async listSurveys(): Promise<Survey[]> {
      const [surveyRows, mineRows] = await Promise.all([
        db
          .from('survey')
          .select('*')
          .eq('center_id', scope.centerId)
          .order('opens_at', { ascending: false }),
        db.from('survey_response').select('survey_id, choice'),
      ])

      const mine = new Map(
        ((orThrow(mineRows) as Row[]) ?? []).map((r) => [
          r.survey_id as string,
          r.choice as number,
        ]),
      )
      const rows = (orThrow(surveyRows) as Row[]) ?? []
      const manager = scope.role === 'manager'

      return Promise.all(
        rows.map(async (r): Promise<Survey> => {
          const show = Boolean(r.show_results)
          /*
           * شمار فقط وقتی مدیریم یا انتشار روشن است — و هرگز نام.
           *
           * app.survey_tally فقط عدد برمی‌گرداند؛ سطرهای رأی را سیاست
           * سطر-محور جز برای خودِ رأی‌دهنده نمی‌دهد.
           */
          const tally =
            manager || show
              ? ((orThrow(
                  await db.rpc('survey_tally', {
                    centre: scope.centerId,
                    target: r.id as string,
                  }),
                ) as Row[]) ?? []).map((t) => ({
                  choice: t.choice as number,
                  label: t.label as string,
                  votes: (t.votes as number) ?? 0,
                }))
              : null

          return {
            id: r.id as string,
            question: r.question as string,
            options: (r.options as string[] | null) ?? [],
            closesAt: (r.closes_at as string | null) ?? null,
            showResults: show,
            myChoice: mine.get(r.id as string) ?? null,
            tally,
          }
        }),
      )
    },

    async createSurvey(input) {
      const options = input.options.map((o) => o.trim()).filter(Boolean)
      if (options.length < 2) throw new Error('نظرسنجی دست‌کم دو گزینه می‌خواهد.')
      orThrow(
        await db.from('survey').insert({
          center_id: scope.centerId,
          question: input.question.trim(),
          options,
          closes_at: input.closesAt ?? null,
          // پیش‌فرض: نتیجه به خانواده نشان داده نمی‌شود.
          show_results: input.showResults ?? false,
        }),
      )
    },

    async answerSurvey(surveyId: string, choice: number) {
      // یک رأی برای هر حساب — کلید اصلی جدول همین را می‌بندد.
      orThrow(
        await db.from('survey_response').upsert(
          {
            survey_id: surveyId,
            user_account_id: scope.accountId,
            center_id: scope.centerId,
            choice,
          },
          { onConflict: 'survey_id,user_account_id' },
        ),
      )
    },

    async setSurveyResultsVisible(surveyId: string, visible: boolean) {
      orThrow(
        await db
          .from('survey')
          .update({ show_results: visible })
          .eq('id', surveyId)
          .eq('center_id', scope.centerId),
      )
    },

    /* ── هزینه و درآمد — ماژول M16 ──────────────────────────── */

    async getIncomeVsExpense(period: string): Promise<IncomeVsExpense> {
      const [summaryRows, expenseRows] = await Promise.all([
        db.rpc('income_vs_expense', { centre: scope.centerId, span: period }),
        db
          .from('expense')
          .select('*')
          .eq('center_id', scope.centerId)
          .order('date', { ascending: false })
          .limit(100),
      ])

      const summary = ((orThrow(summaryRows) as Row[]) ?? [])[0] ?? {}
      const byCategory = (summary.by_category as Record<string, number> | null) ?? {}

      return {
        period,
        // «وصول‌شده»، نه «صادرشده» — تابع سرور همین را می‌دهد.
        collected: (summary.collected as number) ?? 0,
        spent: (summary.spent as number) ?? 0,
        byCategory: Object.entries(byCategory)
          .map(([category, total]) => ({
            category: category as IncomeVsExpense['byCategory'][number]['category'],
            total,
          }))
          .sort((a, b) => b.total - a.total),
        expenses: ((orThrow(expenseRows) as Row[]) ?? []).map((e): Expense => ({
          id: e.id as string,
          date: e.date as string,
          amount: e.amount as number,
          category: e.category as Expense['category'],
          note: (e.note as string | null) ?? null,
          receiptUrl: (e.receipt_url as string | null) ?? null,
        })),
      }
    },

    async addExpense(input) {
      orThrow(
        await db.from('expense').insert({
          center_id: scope.centerId,
          date: input.date,
          amount: input.amount,
          category: input.category,
          note: input.note?.trim() || null,
          receipt_url: input.receiptUrl ?? null,
        }),
      )
    },


    /* ── بازی آزاد — ماژول M8 ───────────────────────────────── */

    async getFreePlayBoard(classId: string, date: string, session: PlaySession) {
      const [cornerRows, choiceRows, pairRows, day] = await Promise.all([
        db
          .from('activity_corner')
          .select('id, title, glyph')
          .eq('center_id', scope.centerId)
          .eq('active', true)
          .order('sort_order'),
        db
          .from('free_choice_log')
          .select('child_id, corner_id')
          .eq('center_id', scope.centerId)
          .eq('date', date)
          .eq('session', session),
        db
          .from('play_pair')
          .select('child_a, child_b')
          .eq('center_id', scope.centerId)
          .eq('date', date),
        this.getClassDay(classId, date),
      ])

      const placed: Record<string, string> = {}
      for (const row of (orThrow(choiceRows) as Row[]) ?? []) {
        placed[row.child_id as string] = row.corner_id as string
      }

      return {
        corners: ((orThrow(cornerRows) as Row[]) ?? []).map((c): ActivityCorner => ({
          id: c.id as string,
          title: c.title as string,
          glyph: (c.glyph as string | null) ?? null,
        })),
        placed,
        // همه کودکان نوبت؛ «ثبت‌نشده» مشتقِ رابط است — بخش ۵.۴.
        children: day.children.map((c) => ({
          id: c.id,
          firstName: c.firstName,
          photoUrl: c.photoUrl ?? null,
        })),
        pairs: ((orThrow(pairRows) as Row[]) ?? []).map((p) => ({
          a: p.child_a as string,
          b: p.child_b as string,
        })),
      }
    },

    async setFreeChoice(childId: string, date: string, session: PlaySession, cornerId: string) {
      const me = orThrow(
        await db.from('user_account').select('staff_id').eq('id', scope.accountId).single(),
      ) as Row

      /*
       * نظر عوض کردن، نه انتخاب دوم.
       *
       * قید free_choice_once یک ردیف برای هر کودک و نوبت می‌گذارد؛
       * upsert همان ردیف را جابه‌جا می‌کند.
       */
      orThrow(
        await db.from('free_choice_log').upsert(
          {
            center_id: scope.centerId,
            child_id: childId,
            corner_id: cornerId,
            date,
            session,
            staff_id: me.staff_id as string | null,
          },
          { onConflict: 'child_id,date,session' },
        ),
      )
    },

    async clearFreeChoice(childId: string, date: string, session: PlaySession) {
      orThrow(
        await db
          .from('free_choice_log')
          .delete()
          .eq('center_id', scope.centerId)
          .eq('child_id', childId)
          .eq('date', date)
          .eq('session', session),
      )
    },

    async setPlayPair(date: string, childA: string, childB: string, paired: boolean) {
      // جفت مرتب‌شده: «الف با ب» و «ب با الف» یکی‌اند — قید در جدول هم هست.
      const [a, b] = childA < childB ? [childA, childB] : [childB, childA]
      if (paired) {
        orThrow(
          await db
            .from('play_pair')
            .upsert(
              { center_id: scope.centerId, date, child_a: a, child_b: b },
              { onConflict: 'date,child_a,child_b' },
            ),
        )
        return
      }
      orThrow(
        await db
          .from('play_pair')
          .delete()
          .eq('center_id', scope.centerId)
          .eq('date', date)
          .eq('child_a', a)
          .eq('child_b', b),
      )
    },

    async getInterestMap(childId: string, from: string, to: string): Promise<InterestMap> {
      const [mapRows, sample, partnerRows] = await Promise.all([
        db.rpc('interest_map', {
          centre: scope.centerId,
          target: childId,
          from_date: from,
          to_date: to,
        }),
        db.rpc('interest_sample', {
          centre: scope.centerId,
          target: childId,
          from_date: from,
          to_date: to,
        }),
        db.rpc('play_partners', {
          centre: scope.centerId,
          target: childId,
          from_date: from,
          to_date: to,
        }),
      ])

      return {
        // همه گوشه‌ها، حتی صفرها: «انتخاب‌نشده» خودش یک خط گزارش است.
        corners: ((orThrow(mapRows) as Row[]) ?? []).map((r) => ({
          id: r.corner_id as string,
          title: r.title as string,
          glyph: (r.glyph as string | null) ?? null,
          times: (r.times as number) ?? 0,
        })),
        sample: (orThrow(sample) as number) ?? 0,
        threshold: 8,
        partners: ((orThrow(partnerRows) as Row[]) ?? []).map((r) => ({
          childId: r.child_id as string,
          firstName: r.first_name as string,
          times: (r.times as number) ?? 0,
        })),
      }
    },

    async listUnpairedChildren(from: string, to: string) {
      const rows = orThrow(
        await db.rpc('unpaired_children', {
          centre: scope.centerId,
          from_date: from,
          to_date: to,
        }),
      ) as Row[]
      return (rows ?? []).map((r) => ({
        childId: r.child_id as string,
        fullName: r.full_name as string,
      }))
    },


    /* ── پرونده بازرسی — ارتقای ۲ ───────────────────────────── */

    async getAuditReadiness(): Promise<AuditReadiness> {
      const rows = orThrow(
        await db.rpc('audit_readiness', { centre: scope.centerId }),
      ) as Row[]
      const row = rows[0] ?? {}
      return {
        incompleteVaccination: (row.incomplete_vaccination as number | undefined) ?? 0,
        missingNationalId: (row.missing_national_id as number | undefined) ?? 0,
        expiringHealthCards: (row.expiring_health_cards as number | undefined) ?? 0,
      }
    },

    /**
     * پرونده بازرسی.
     *
     * record_audit_export اول صدا زده می‌شود، نه آخر: اگر ساختن فایل
     * نیمه‌کاره بماند هم رد پا زده شده است. و همان تابع نقش را بررسی
     * می‌کند، پس کلاینت نمی‌تواند دورش بزند.
     */
    async buildAuditFile(): Promise<AuditFile> {
      orThrow(await db.rpc('record_audit_export'))

      const [children, health, staff, centre] = await Promise.all([
        db.rpc('audit_children', { centre: scope.centerId }),
        db.rpc('audit_health', { centre: scope.centerId }),
        db.rpc('audit_staff', { centre: scope.centerId }),
        db.from('center').select('name').eq('id', scope.centerId).single(),
      ])

      return {
        centerName: ((orThrow(centre) as Row).name as string | undefined) ?? 'مهد',
        builtAt: new Date().toISOString(),
        builtBy: scope.accountId,
        children: (orThrow(children) as Row[]).map((r): AuditChildRow => ({
          fullName: r.full_name as string,
          nationalId: (r.national_id as string | null) ?? null,
          birthDate: (r.birth_date as string | null) ?? null,
          className: (r.class_name as string | null) ?? null,
          attendanceType: (r.attendance_type as AuditChildRow['attendanceType']) ?? null,
          guardianName: (r.guardian_name as string | null) ?? null,
          guardianPhone: (r.guardian_phone as string | null) ?? null,
          enrolledSince: (r.enrolled_since as string | null) ?? null,
        })),
        health: (orThrow(health) as Row[]).map((r): AuditHealthRow => ({
          className: (r.class_name as string | null) ?? null,
          fullName: r.full_name as string,
          allergies: (r.allergies as string | null) ?? 'ندارد',
          conditions: (r.conditions as string | null) ?? 'ندارد',
          vaccinationStatus: r.vaccination_status as AuditHealthRow['vaccinationStatus'],
          updatedAt: (r.updated_at as string | null) ?? null,
        })),
        staff: (orThrow(staff) as Row[]).map((r): AuditStaffRow => ({
          fullName: r.full_name as string,
          role: r.role as string,
          cardNumber: (r.card_number as string | null) ?? null,
          issuedAt: (r.issued_at as string | null) ?? null,
          expiresAt: (r.expires_at as string | null) ?? null,
          cardState: r.card_state as AuditStaffRow['cardState'],
        })),
      }
    },

    async listCenterChildren() {
      // دامنه مرکز از scope می‌آید، نه از فراخواننده — بند ۱۱.۱۰.
      const rows = orThrow(
        await from('child').is('left_at', null).order('first_name'),
      ) as Row[]
      return rows.map(asChild)
    },

    async decideIncident(incidentId, decision: IncidentDecision) {
      // بخش ۳.۳: تصمیم مدیر مسیر رویداد را تعیین می‌کند. متن اولیه مربی
      // در هیچ حالتی عوض نمی‌شود — تریگر دیتابیس نگهش می‌دارد.
      orThrow(
        await db
          .from('incident')
          .update({
            manager_decision: decision,
            approved_by: scope.accountId,
            approved_at: decision === 'archive' ? null : new Date().toISOString(),
          })
          .eq('center_id', scope.centerId)
          .eq('id', incidentId)
          .select('id'),
      )
    },

    async previewNotice(input: NoticeInput): Promise<NoticeAudience> {
      const rows = orThrow(
        await db
          .from('child_guardian')
          .select('child_id, guardian:guardian_id(full_name, phone), child:child_id(first_name, last_name, class_id)')
          .eq('center_id', scope.centerId),
      ) as Row[]
      const scoped = input.classId
        ? rows.filter((r) => (r.child as Row).class_id === input.classId)
        : rows

      const families = new Set(scoped.map((r) => r.child_id as string))
      const withoutPhone: NoticeAudience['withoutPhone'] = []
      for (const childId of families) {
        const forChild = scoped.filter((r) => r.child_id === childId)
        if (forChild.some((r) => (r.guardian as Row).phone)) continue
        const child = forChild[0]?.child as Row | undefined
        withoutPhone.push({
          childId,
          childName: `${child?.first_name ?? ''} ${child?.last_name ?? ''}`.trim(),
          guardianName: ((forChild[0]?.guardian as Row | undefined)?.full_name as string) ?? '—',
        })
      }

      const staff = (orThrow(await from('staff').eq('active', true)) as Row[]).length
      const reachable = families.size - withoutPhone.length
      return {
        families: families.size,
        staff,
        withoutPhone,
        smsRemaining: await smsRemaining(),
        smsNeeded: input.sendSms ? reachable + staff : 0,
      }
    },

    async publishNotice(input: NoticeInput): Promise<Notice> {
      const audience = await this.previewNotice(input)
      // بخش ۱۵.۴: سهمیه هرگز نامحدود نیست، پس ارسالی که از سهمیه بگذرد
      // اصلاً شروع نمی‌شود.
      if (input.sendSms && audience.smsNeeded > audience.smsRemaining) {
        throw new Error(
          `سهمیه پیامک کافی نیست: ${audience.smsNeeded} لازم است و ${audience.smsRemaining} مانده.`,
        )
      }

      if (input.kind !== 'announcement') {
        orThrow(
          await db
            .from('closure')
            .insert({
              center_id: scope.centerId,
              class_id: input.classId ?? null,
              date: input.date ?? new Date().toISOString().slice(0, 10),
              type: input.kind === 'closure' ? 'full_closure' : 'delayed_opening',
              reason: input.reason ?? 'other',
              message_text: input.body,
              reopen_at: input.reopenAt ?? null,
              sms_sent_count: audience.smsNeeded,
              created_by: scope.accountId,
            })
            .select('id'),
        )
      }

      const row = orThrow(
        await db
          .from('announcement')
          .insert({
            center_id: scope.centerId,
            class_id: input.classId ?? null,
            title: input.title.trim(),
            body: input.body.trim(),
            audience: input.classId ? 'class' : 'center',
            published_at: new Date().toISOString(),
            published_by: scope.accountId,
            send_sms: input.sendSms,
            sms_sent_count: audience.smsNeeded,
          })
          .select()
          .single(),
      ) as Row

      if (input.sendSms && audience.smsNeeded > 0) {
        const period = new Date().toISOString().slice(0, 7)
        const quota = orThrow(
          await from('sms_quota').eq('period', period),
        ) as Row[]
        const used = ((quota[0]?.used as number | undefined) ?? 0) + audience.smsNeeded
        orThrow(
          await db
            .from('sms_quota')
            .upsert(
              { center_id: scope.centerId, period, allocated: (quota[0]?.allocated as number) ?? 0, used },
              { onConflict: 'center_id,period' },
            )
            .select('period'),
        )
      }

      return asNotice(row, input.kind)
    },

    async listNotices(limit) {
      const rows = orThrow(
        await from('announcement')
          .not('published_at', 'is', null)
          .order('published_at', { ascending: false })
          .limit(limit),
      ) as Row[]
      return rows.map((r) => asNotice(r, 'announcement'))
    },


    /* ── مالی — ماژول M5 ────────────────────────────────────── */

    async getFinance(period): Promise<FinanceOverview> {
      const [invoiceRows, planRows, feeRows] = await Promise.all([
        db
          .from('invoice')
          .select('*, child:child_id(first_name, last_name), payment(amount)')
          .eq('center_id', scope.centerId)
          .eq('period', period),
        from('fee_plan').eq('active', true),
        from('child_fee'),
      ])

      const invoices = (orThrow(invoiceRows) as Row[]).map(asInvoice)
      const issued = invoices.reduce((sum, i) => sum + invoiceTotal(i), 0)
      const collected = invoices.reduce((sum, i) => sum + i.paid, 0)
      const fees = orThrow(feeRows) as Row[]

      return {
        period,
        issued,
        collected,
        outstanding: issued - collected,
        overdue: invoices.filter((i) => i.status === 'overdue'),
        unpaid: invoices.filter((i) => i.status !== 'paid' && i.status !== 'cancelled'),
        plans: (orThrow(planRows) as Row[]).map((r) => ({
          id: r.id as string,
          title: r.title as string,
          amount: r.amount as number,
          period: r.period as FinanceOverview['plans'][number]['period'],
          active: Boolean(r.active),
          childCount: fees.filter((f) => f.fee_plan_id === r.id).length,
        })),
      }
    },

    async issueInvoices(period, dueDate) {
      const [children, fees, plans, existing] = await Promise.all([
        from('child').is('left_at', null),
        from('child_fee'),
        from('fee_plan'),
        from('invoice').eq('period', period),
      ])
      const feeRows = orThrow(fees) as Row[]
      const planRows = orThrow(plans) as Row[]
      const have = new Set((orThrow(existing) as Row[]).map((r) => r.child_id as string))

      // بخش ۸: «صدور گروهی با یک اقدام». کودکی که صورتحساب همان دوره را
      // دارد دوباره نمی‌گیرد، وگرنه ضربه دوم همه را دو برابر می‌کرد.
      const rows = (orThrow(children) as Row[])
        .filter((child) => !have.has(child.id as string))
        .flatMap((child) => {
          const fee = feeRows.find((f) => f.child_id === child.id)
          const plan = planRows.find((p) => p.id === fee?.fee_plan_id)
          if (!plan) return []
          const amount = plan.amount as number
          const percent = Number(fee?.discount_percent ?? 0)
          return [{
            center_id: scope.centerId,
            child_id: child.id,
            period,
            amount,
            discount: Math.round((amount * percent) / 100),
            due_date: dueDate,
          }]
        })

      if (rows.length === 0) return 0
      orThrow(await db.from('invoice').insert(rows).select('id'))
      return rows.length
    },

    async recordPayment(input: PaymentInput): Promise<Payment> {
      if (input.amount <= 0) throw new Error('مبلغ باید بیشتر از صفر باشد.')
      const invoice = orThrow(
        await db
          .from('invoice')
          .select('*, payment(amount)')
          .eq('center_id', scope.centerId)
          .eq('id', input.invoiceId)
          .single(),
      ) as Row
      const view = asInvoice(invoice)
      const remaining = invoiceDue(view)
      if (input.amount > remaining) throw new Error('مبلغ از باقی‌مانده صورتحساب بیشتر است.')

      const row = orThrow(
        await db
          .from('payment')
          .insert({
            center_id: scope.centerId,
            invoice_id: input.invoiceId,
            amount: input.amount,
            method: input.method ?? null,
            receipt_no: input.receiptNo ?? null,
            recorded_by: scope.accountId,
          })
          .select()
          .single(),
      ) as Row

      // وضعیت صورتحساب از مجموع پرداخت‌ها می‌آید، نه از دست کاربر.
      const paid = view.paid + input.amount
      orThrow(
        await db
          .from('invoice')
          .update({ status: paid >= invoiceTotal(view) ? 'paid' : 'partially_paid' })
          .eq('center_id', scope.centerId)
          .eq('id', input.invoiceId)
          .select('id'),
      )

      return {
        id: row.id as string,
        invoiceId: row.invoice_id as string,
        amount: row.amount as number,
        paidAt: row.paid_at as string,
        method: (row.method as string | null) ?? null,
        receiptNo: (row.receipt_no as string | null) ?? null,
      }
    },

    async remindOverdue(period) {
      const overview = await this.getFinance(period)
      const phones = orThrow(
        await db
          .from('child_guardian')
          .select('child_id, is_payer, guardian:guardian_id(phone)')
          .eq('center_id', scope.centerId)
          .eq('is_payer', true),
      ) as Row[]
      const reachable = overview.overdue.filter((i) =>
        phones.some((p) => p.child_id === i.childId && (p.guardian as Row).phone),
      )
      const remaining = await smsRemaining()
      if (reachable.length > remaining) throw new Error('سهمیه پیامک برای یادآوری کافی نیست.')

      const periodKey = new Date().toISOString().slice(0, 7)
      const quota = orThrow(await from('sms_quota').eq('period', periodKey)) as Row[]
      orThrow(
        await db
          .from('sms_quota')
          .upsert(
            {
              center_id: scope.centerId,
              period: periodKey,
              allocated: (quota[0]?.allocated as number) ?? 0,
              used: ((quota[0]?.used as number) ?? 0) + reachable.length,
            },
            { onConflict: 'center_id,period' },
          )
          .select('period'),
      )
      return reachable.length
    },

    async getParentFinance(childId): Promise<ParentFinance> {
      // بخش ۶.۵: فقط سرپرست پرداخت‌کننده. سیاست سطر-محور هم همین را
      // می‌بندد؛ اینجا پیش از آن پرسیده می‌شود تا پیام روشن باشد.
      const link = orThrow(
        await db
          .from('child_guardian')
          .select('is_payer')
          .eq('center_id', scope.centerId)
          .eq('child_id', childId),
      ) as Row[]
      const isPayer = scope.role === 'manager' || link.some((r) => r.is_payer)
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

      const yearLabel = jalaliYearMonth(new Date()).split('-')[0] ?? ''

      const [rows, yearRows, offerRows] = await Promise.all([
        db
          .from('invoice')
          .select('*, child:child_id(first_name, last_name), invoice_line(id, title, amount), payment(amount, paid_at, method, receipt_no, receipt_url, tracking_code, payment_method, id, invoice_id)')
          .eq('center_id', scope.centerId)
          .eq('child_id', childId)
          .order('period', { ascending: false }),
        db.rpc('child_fee_year', { centre: scope.centerId, target: childId, year: yearLabel }),
        db
          .from('fee_item_child')
          .select('accepted_at, declined_at, fee_item:fee_item_id(id, title, description, amount, period, optional, published_at)')
          .eq('center_id', scope.centerId)
          .eq('child_id', childId),
      ])

      const invoiceRows = orThrow(rows) as Row[]
      const invoices = invoiceRows.map(asInvoice)
      const payments = invoiceRows.flatMap((r) =>
        ((r.payment as Row[] | null) ?? []).map((p): Payment => ({
          id: p.id as string,
          invoiceId: r.id as string,
          amount: p.amount as number,
          paidAt: p.paid_at as string,
          method: (p.method as string | null) ?? null,
          receiptNo: (p.receipt_no as string | null) ?? null,
          paymentMethod: (p.payment_method as PaymentMethod | null) ?? undefined,
          trackingCode: (p.tracking_code as string | null) ?? null,
          receiptUrl: (p.receipt_url as string | null) ?? null,
        })),
      )

      const year = ((orThrow(yearRows) as Row[]) ?? []).map((m): FeeYearMonth => ({
        period: m.period as string,
        issued: m.issued as boolean,
        amount: (m.amount as number) ?? 0,
        discount: (m.discount as number) ?? 0,
        extras: (m.extras as number) ?? 0,
        lateFee: (m.late_fee as number) ?? 0,
        overdueFee: (m.overdue_fee as number) ?? 0,
        paid: (m.paid as number) ?? 0,
        dueDate: (m.due_date as string | null) ?? null,
        status: m.status as FeeYearMonth['status'],
      }))

      // قلم منتشرنشده به خانواده نشان داده نمی‌شود. سیاست سطر-محور هم
      // همین را می‌بندد؛ این فیلتر فقط صریحش می‌کند.
      const offers = ((orThrow(offerRows) as Row[]) ?? []).flatMap((r): FeeItemOffer[] => {
        const item = r.fee_item as Row | null
        if (!item?.published_at) return []
        return [{
          itemId: item.id as string,
          title: item.title as string,
          description: (item.description as string | null) ?? null,
          amount: item.amount as number,
          period: item.period as string,
          optional: item.optional as boolean,
          answer: r.accepted_at ? 'accepted' : r.declined_at ? 'declined' : null,
        }]
      })
      const claims = (orThrow(
        await db
          .from('payment_claim')
          .select('*, invoice:invoice_id(period, child_id)')
          .eq('center_id', scope.centerId)
          .in('invoice_id', invoices.map((i) => i.id)),
      ) as Row[]).map((r) =>
        asClaim(r, {
          childId,
          childName: invoices[0]?.childName ?? '—',
          period: ((r.invoice as Row | null)?.period as string) ?? '',
        }),
      )

      const reminders = ((orThrow(
        await db
          .from('payment_reminder')
          .select('id, kind, channel, sent_at, invoice:invoice_id(period)')
          .eq('center_id', scope.centerId)
          .in('invoice_id', invoices.map((i) => i.id))
          .order('sent_at', { ascending: false }),
      ) as Row[]) ?? []).map((r): PaymentReminderLog => ({
        id: r.id as string,
        period: ((r.invoice as Row | null)?.period as string) ?? '',
        kind: r.kind as PaymentReminderLog['kind'],
        channel: r.channel as PaymentReminderLog['channel'],
        sentAt: r.sent_at as string,
      }))

      return {
        isPayer: true,
        invoices,
        payments,
        claims,
        outstanding: invoices
          .filter((i) => i.status !== 'paid' && i.status !== 'cancelled')
          .reduce((sum, i) => sum + invoiceDue(i), 0),
        year,
        yearLabel,
        offers,
        reminders,
      }
    },

    /**
     * جواب خانواده به قلم اختیاری.
     *
     * فقط همین دو ستون را می‌نویسد؛ مبلغ و اینکه قلم به کدام کودک
     * خورده، دست مدیر است و سیاست سطر-محور همان را می‌بندد. پذیرفتن،
     * سطر صورتحساب را از سمت سرور می‌سازد تا مبلغ از کلاینت نیاید.
     */
    async answerFeeItem(itemId, childId, accept) {
      const now = new Date().toISOString()
      orThrow(
        await db
          .from('fee_item_child')
          .update(
            accept
              ? { accepted_at: now, declined_at: null }
              : { declined_at: now, accepted_at: null },
          )
          .eq('fee_item_id', itemId)
          .eq('child_id', childId)
          .eq('center_id', scope.centerId),
      )
      if (accept) orThrow(await db.rpc('issue_fee_item', { item: itemId }))
    },

    /* ── درگاه پرداخت — ارتقای ۱ ────────────────────────────── */

    /**
     * تراکنش را باز می‌کند و نشانی درگاه را می‌دهد.
     *
     * ردیف با حالت انتظار ساخته می‌شود و تریگر پایگاه داده تضمین
     * می‌کند تا تأیید سمت سرور در مانده صورتحساب سهمی نداشته باشد.
     * نشانی درگاه از تابع لبه (edge function) می‌آید، نه از کلاینت:
     * کلید واسط پرداخت هرگز نباید به مرورگر برسد.
     */
    async startOnlinePayment(invoiceId): Promise<PaymentIntent> {
      const row = orThrow(
        await db.rpc('start_online_payment', { invoice: invoiceId }),
      ) as Row
      return {
        paymentId: row.payment_id as string,
        key: row.idempotency_key as string,
        redirectUrl: row.redirect_url as string,
        amount: row.amount as number,
        psp: row.psp as string,
      }
    },

    /**
     * وضعیت تراکنش، از سرور.
     *
     * بازگشت مرورگر سند نیست — این پرس‌وجو است که می‌گوید چه شد. تا
     * وقتی verified_at پر نشده، پاسخ «در انتظار» است و صورتحساب
     * دست‌نخورده می‌ماند.
     */
    async checkOnlinePayment(key): Promise<PaymentResult> {
      const rows = orThrow(
        await db
          .from('payment')
          .select('amount, tracking_code, gateway_state, verified_at')
          .eq('center_id', scope.centerId)
          .eq('idempotency_key', key)
          .limit(1),
      ) as Row[]

      const row = rows[0]
      if (!row) return { state: 'failed', reason: 'تراکنشی با این شناسه پیدا نشد.' }
      if (row.gateway_state === 'failed') {
        return { state: 'failed', reason: 'پرداخت انجام نشد. مبلغی از حساب شما کم نشده.' }
      }
      if (!row.verified_at) return { state: 'pending' }
      return {
        state: 'paid',
        trackingCode: (row.tracking_code as string | null) ?? '—',
        amount: row.amount as number,
      }
    },

    /* ── پرونده کودک — ماژول M1 ─────────────────────────────── */

    async getChildProfile(childId): Promise<ChildProfile> {
      const [childRow, links, medicalRows, consentRows, options] = await Promise.all([
        db.from('child').select('*, class:class_id(name)').eq('center_id', scope.centerId).eq('id', childId).single(),
        db
          .from('child_guardian')
          .select('relation, can_pickup, is_payer, guardian:guardian_id(id, full_name, phone)')
          .eq('center_id', scope.centerId)
          .eq('child_id', childId),
        from('medical_profile').eq('child_id', childId),
        from('consent').eq('child_id', childId),
        this.listPickupOptions(childId),
      ])

      const child = orThrow(childRow) as Row
      const medical = (orThrow(medicalRows) as Row[])[0]
      const granted = new Set(
        (orThrow(consentRows) as Row[]).filter((r) => r.granted_at).map((r) => r.type as string),
      )

      return {
        child: asChild(child),
        className: ((child.class as Row | null)?.name as string | null) ?? null,
        guardians: (orThrow(links) as Row[]).map((r) => {
          const g = r.guardian as Row
          return {
            id: g.id as string,
            fullName: g.full_name as string,
            relation: (r.relation as string | null) ?? null,
            canPickup: Boolean(r.can_pickup),
            phone: (g.phone as string | null) ?? null,
            isPayer: Boolean(r.is_payer),
          }
        }),
        authorized: options.filter((o) => o.kind === 'authorized'),
        medical: {
          childId,
          bloodType: (medical?.blood_type as string | null) ?? null,
          allergies: ((medical?.allergies_json as string[] | null) ?? []),
          chronicConditions: (medical?.chronic_conditions as string | null) ?? null,
          dailyMedication: (medical?.daily_medication as string | null) ?? null,
          doctorName: (medical?.doctor_name as string | null) ?? null,
          doctorPhone: (medical?.doctor_phone as string | null) ?? null,
        },
        consents: (
          ['photo_capture', 'photo_group_publish', 'field_trip', 'medication', 'emergency_care'] as ConsentType[]
        ).map((type) => ({ type, granted: granted.has(type) })),
      }
    },

    /* ── اعلام غیبت — بخش ۶.۴ ───────────────────────────────── */

    async declareAbsence(input: AbsenceInput) {
      orThrow(
        await db
          .from('absence_notice')
          .upsert(
            {
              center_id: scope.centerId,
              child_id: input.childId,
              date: input.date,
              reason: input.reason,
              declared_by: scope.accountId,
            },
            { onConflict: 'child_id,date' },
          )
          .select('id'),
      )
    },

    async listMyNotices() {
      // سیاست سطر-محور خودش اطلاعیه کلاس دیگر را پنهان می‌کند.
      const rows = orThrow(
        await from('announcement')
          .not('published_at', 'is', null)
          .order('published_at', { ascending: false })
          .limit(20),
      ) as Row[]
      return rows.map((r) => asNotice(r, 'announcement'))
    },

    /* ── پیام با ساعت کاری — بخش ۶.۶ ────────────────────────── */

    async getThread(childId): Promise<MessageThread> {
      const [threadRows, centerRows, childRows] = await Promise.all([
        from('message_thread').eq('child_id', childId),
        from('center').eq('id', scope.centerId),
        from('child').eq('id', childId),
      ])
      const center = (orThrow(centerRows) as Row[])[0]
      const child = (orThrow(childRows) as Row[])[0]
      const thread = (orThrow(threadRows) as Row[])[0]
      const hours = {
        start: ((center?.parent_message_start as string | undefined) ?? '08:00').slice(0, 5),
        end: ((center?.parent_message_end as string | undefined) ?? '16:30').slice(0, 5),
      }
      if (!thread) {
        return {
          childId,
          childName: `${child?.first_name ?? ''} ${child?.last_name ?? ''}`.trim(),
          messages: [],
          hours,
        }
      }
      const rows = orThrow(
        await db
          .from('message')
          .select('*, sender:sender_id(role, staff:staff_id(full_name), guardian:guardian_id(full_name))')
          .eq('center_id', scope.centerId)
          .eq('thread_id', thread.id as string)
          .order('created_at'),
      ) as Row[]
      const side = scope.role === 'guardian' ? 'family' : 'staff'
      return {
        childId,
        childName: `${child?.first_name ?? ''} ${child?.last_name ?? ''}`.trim(),
        messages: rows.map((r): Message => {
          const sender = r.sender as Row | null
          const role = (sender?.role as string | undefined) ?? 'teacher'
          const senderRole: Message['senderRole'] = role === 'guardian' ? 'family' : 'staff'
          return {
            id: r.id as string,
            childId,
            body: r.body as string,
            // طرفِ گفتگو، نه شخص: مهد چند مربی دارد و همه یک طرف‌اند.
            mine: senderRole === side,
            senderRole,
            senderName:
              ((sender?.staff as Row | null)?.full_name as string | undefined) ??
              ((sender?.guardian as Row | null)?.full_name as string | undefined) ??
              (senderRole === 'family' ? 'خانواده' : 'مربی'),
            sentAt: (r.sent_at as string | null) ?? null,
            queuedUntil: (r.queued_until as string | null) ?? null,
          }
        }),
        hours,
      }
    },

    /**
     * صندوق گفتگوهای مربی.
     *
     * فقط کودکانی که گفتگویی دارند می‌آیند. فهرست کامل کلاس با بیست
     * ردیف خالی، صندوقی است که کسی بازش نمی‌کند.
     */
    async listThreads(): Promise<ThreadSummary[]> {
      const threads = orThrow(
        await db
          .from('message_thread')
          .select('id, child_id, child:child_id(first_name, last_name, photo_url, class_id)')
          .eq('center_id', scope.centerId),
      ) as Row[]

      const visible = threads.filter((t) => {
        if (scope.role === 'manager') return true
        const kid = t.child as Row | null
        const classId = kid?.class_id as string | null
        return classId !== null && scope.classIds.includes(classId)
      })
      if (visible.length === 0) return []

      const rows = orThrow(
        await db
          .from('message')
          .select('thread_id, body, sent_at, queued_until, created_at, sender:sender_id(role)')
          .eq('center_id', scope.centerId)
          .in('thread_id', visible.map((t) => t.id as string))
          .order('created_at'),
      ) as Row[]

      const summaries = visible.map((thread): ThreadSummary => {
        const kid = thread.child as Row | null
        const mine = rows.filter((r) => r.thread_id === thread.id)
        const last = mine[mine.length - 1]
        const lastRole = ((last?.sender as Row | null)?.role as string | undefined) ?? null
        return {
          childId: thread.child_id as string,
          childName: `${kid?.first_name ?? ''} ${kid?.last_name ?? ''}`.trim(),
          photoUrl: (kid?.photo_url as string | null) ?? null,
          lastBody: (last?.body as string | undefined) ?? null,
          lastAt:
            ((last?.sent_at as string | null) ?? (last?.queued_until as string | null)) ?? null,
          awaitingReply: lastRole === 'guardian',
          queued: mine.filter((r) => r.sent_at === null).length,
        }
      })

      /*
       * منتظرِ جواب اول، بعد تازه‌ترین. پیامی که خانواده فرستاده و
       * جوابی نگرفته، مهم‌ترین چیز این صفحه است.
       */
      return summaries
        .filter((t) => t.lastBody !== null)
        .sort((a, b) => {
          if (a.awaitingReply !== b.awaitingReply) return a.awaitingReply ? -1 : 1
          return (b.lastAt ?? '').localeCompare(a.lastAt ?? '')
        })
    },

    async sendMessage(childId, body): Promise<Message> {
      const text = body.trim()
      if (!text) throw new Error('پیام خالی است.')

      const existing = orThrow(await from('message_thread').eq('child_id', childId)) as Row[]
      const threadId =
        (existing[0]?.id as string | undefined) ??
        ((orThrow(
          await db
            .from('message_thread')
            .insert({ center_id: scope.centerId, child_id: childId })
            .select()
            .single(),
        ) as Row).id as string)

      const thread = await this.getThread(childId)
      const now = new Date()
      const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      // بخش ۶.۶: بیرون از ساعت کاری پیام می‌رود ولی تحویلش تا صبح
      // عقب می‌افتد. حذف نمی‌شود و خطا هم نمی‌دهد.
      const inHours = clock >= thread.hours.start && clock <= thread.hours.end
      const queuedUntil = inHours ? null : nextMorningIso(now, thread.hours.start)

      const row = orThrow(
        await db
          .from('message')
          .insert({
            center_id: scope.centerId,
            thread_id: threadId,
            sender_id: scope.accountId,
            body: text,
            sent_at: inHours ? now.toISOString() : null,
            queued_until: queuedUntil,
          })
          .select()
          .single(),
      ) as Row

      return {
        id: row.id as string,
        childId,
        body: text,
        mine: true,
        senderRole: scope.role === 'guardian' ? 'family' : 'staff',
        senderName: 'خودم',
        sentAt: (row.sent_at as string | null) ?? null,
        queuedUntil,
      }
    },


    /* ── دارو — بخش ۵.۳ ───────────────────────────────────────── */

    async markMedicationGiven(medicationId) {
      orThrow(
        await db
          .from('medication_log')
          .update({ given_at: new Date().toISOString(), given_by: scope.accountId })
          .eq('center_id', scope.centerId)
          .eq('id', medicationId)
          .select('id'),
      )
    },

    /* ── اصلاحیه — بخش ۵.۹ ────────────────────────────────────── */

    async addAmendment(childId, date, text): Promise<Amendment> {
      const clean = text.trim()
      if (!clean) throw new Error('متن اصلاحیه خالی است.')
      const reports = orThrow(
        await from('daily_report').eq('child_id', childId).eq('date', date),
      ) as Row[]
      const report = reports[0]
      // اصلاحیه فقط روی گزارشِ قفل‌شده معنا دارد؛ پیش از آن مربی خودِ
      // گزارش را ویرایش می‌کند. تریگر دیتابیس هم همین را می‌بندد.
      if (!report?.locked_at) {
        throw new Error('گزارش این روز هنوز فرستاده نشده؛ خودش را ویرایش کنید.')
      }
      const row = orThrow(
        await db
          .from('daily_report_amendment')
          .insert({
            center_id: scope.centerId,
            daily_report_id: report.id as string,
            text: clean,
            created_by: scope.accountId,
          })
          .select()
          .single(),
      ) as Row
      return {
        id: row.id as string,
        childId,
        date,
        text: clean,
        createdAt: row.created_at as string,
      }
    },

    async listAmendments(classId, date) {
      await assertVisible(classId)
      const children = await childrenOf(classId)
      if (children.length === 0) return []
      const rows = orThrow(
        await db
          .from('daily_report_amendment')
          .select('*, report:daily_report_id(child_id, date)')
          .eq('center_id', scope.centerId),
      ) as Row[]
      const ids = new Set(children.map((c) => c.id))
      return rows
        .filter((r) => {
          const report = r.report as Row | null
          return report?.date === date && ids.has(report.child_id as string)
        })
        .map((r): Amendment => ({
          id: r.id as string,
          childId: (r.report as Row).child_id as string,
          date,
          text: r.text as string,
          createdAt: r.created_at as string,
        }))
    },

    /* ── اعلام پرداخت — بخش ۸ ─────────────────────────────────── */

    async declarePayment(input: PaymentClaimInput): Promise<PaymentClaim> {
      if (input.amount <= 0) throw new Error('مبلغ باید بیشتر از صفر باشد.')
      const invoice = asInvoice(
        orThrow(
          await db
            .from('invoice')
            .select('*, child:child_id(first_name, last_name), payment(amount)')
            .eq('center_id', scope.centerId)
            .eq('id', input.invoiceId)
            .single(),
        ) as Row,
      )
      const pending = (orThrow(
        await from('payment_claim').eq('invoice_id', input.invoiceId).eq('status', 'pending'),
      ) as Row[]).reduce((sum, r) => sum + ((r.amount as number) ?? 0), 0)
      const remaining = invoiceDue(invoice) - pending
      if (input.amount > remaining) throw new Error('مبلغ از باقی‌مانده صورتحساب بیشتر است.')

      const row = orThrow(
        await db
          .from('payment_claim')
          .insert({
            center_id: scope.centerId,
            invoice_id: input.invoiceId,
            amount: input.amount,
            receipt_url: input.receiptUrl ?? null,
            note: input.note?.trim() || null,
            declared_by: scope.accountId,
          })
          .select()
          .single(),
      ) as Row
      return asClaim(row, invoice)
    },

    async listPaymentClaims(status: ClaimStatus) {
      const rows = orThrow(
        await db
          .from('payment_claim')
          .select('*, invoice:invoice_id(period, child_id, child:child_id(first_name, last_name))')
          .eq('center_id', scope.centerId)
          .eq('status', status)
          .order('declared_at'),
      ) as Row[]
      return rows.map((r) => {
        const invoice = r.invoice as Row
        const child = invoice.child as Row | null
        return asClaim(r, {
          childId: invoice.child_id as string,
          childName: `${child?.first_name ?? ''} ${child?.last_name ?? ''}`.trim() || '—',
          period: invoice.period as string,
        })
      })
    },

    /* ── پرونده بازرسی ──────────────────────────────────────── */

    async getInspectionFile(): Promise<InspectionFile> {
      const [reqRows, scoreRows, docRows, visitRows] = await Promise.all([
        db.rpc('inspection_readiness', { centre: scope.centerId }),
        db.rpc('inspection_score', { centre: scope.centerId }),
        db.from('center_document').select('*').eq('center_id', scope.centerId).order('kind'),
        db
          .from('inspection_visit')
          .select('*')
          .eq('center_id', scope.centerId)
          .order('visited_on', { ascending: false }),
      ])

      const score = ((orThrow(scoreRows) as Row[]) ?? [])[0] ?? {}
      return {
        requirements: ((orThrow(reqRows) as Row[]) ?? []).map((r): InspectionRequirement => ({
          id: r.requirement_id as string,
          title: r.title as string,
          source: r.source as InspectionRequirement['source'],
          satisfied: Boolean(r.satisfied),
          expiresAt: (r.expires_at as string | null) ?? null,
          state: (r.state as InspectionRequirement['state']) ?? 'none',
          note: (r.note as string | null) ?? null,
        })),
        documents: ((orThrow(docRows) as Row[]) ?? []).map((d): CenterDocument => ({
          id: d.id as string,
          kind: d.kind as CenterDocument['kind'],
          title: d.title as string,
          fileUrl: (d.file_url as string | null) ?? null,
          issuer: (d.issuer as string | null) ?? null,
          referenceNo: (d.reference_no as string | null) ?? null,
          issuedAt: (d.issued_at as string | null) ?? null,
          expiresAt: (d.expires_at as string | null) ?? null,
          note: (d.note as string | null) ?? null,
        })),
        visits: ((orThrow(visitRows) as Row[]) ?? []).map((v): InspectionVisit => ({
          id: v.id as string,
          visitedOn: v.visited_on as string,
          authority: v.authority as string,
          inspectorName: (v.inspector_name as string | null) ?? null,
          findings: (v.findings as string | null) ?? null,
          actionRequired: (v.action_required as string | null) ?? null,
          resolvedAt: (v.resolved_at as string | null) ?? null,
        })),
        ready: (score.ready as number) ?? 0,
        total: (score.total as number) ?? 0,
        expiring: (score.expiring as number) ?? 0,
        openActions: (score.open_actions as number) ?? 0,
      }
    },

    async seedInspectionChecklist(): Promise<number> {
      return (orThrow(
        await db.rpc('seed_inspection_checklist', { centre: scope.centerId }),
      ) as number) ?? 0
    },

    async addInspectionRequirement(title: string, note?: string) {
      orThrow(
        await db.from('inspection_requirement').insert({
          center_id: scope.centerId,
          title: title.trim(),
          /*
           * قلمی که مهد خودش اضافه می‌کند «دستی» است: اپ نمی‌تواند
           * بداند چطور ثابتش کند، پس ادعا نمی‌کند تأمین شده.
           */
          source: 'manual',
          note: note?.trim() || null,
        }),
      )
    },

    async setRequirementActive(requirementId: string, active: boolean) {
      // غیرفعال، نه حذف: مهدی که نظرش عوض شود، تاریخچه‌اش را نمی‌بازد.
      orThrow(
        await db
          .from('inspection_requirement')
          .update({ active })
          .eq('id', requirementId)
          .eq('center_id', scope.centerId),
      )
    },

    async uploadCenterDocument(input) {
      orThrow(
        await db.from('center_document').insert({
          center_id: scope.centerId,
          kind: input.kind,
          title: input.title.trim(),
          file_url: input.fileUrl ?? null,
          issuer: input.issuer?.trim() || null,
          reference_no: input.referenceNo?.trim() || null,
          expires_at: input.expiresAt ?? null,
          note: input.note?.trim() || null,
        }),
      )
    },

    async recordInspectionVisit(input) {
      orThrow(
        await db.from('inspection_visit').insert({
          center_id: scope.centerId,
          visited_on: input.visitedOn,
          authority: input.authority.trim(),
          inspector_name: input.inspectorName?.trim() || null,
          findings: input.findings?.trim() || null,
          action_required: input.actionRequired?.trim() || null,
        }),
      )
    },

    async resolveInspectionAction(visitId: string) {
      // تاریخ رفع، نه یک تیک: بازرسِ بعدی می‌پرسد کِی رفع شد.
      orThrow(
        await db
          .from('inspection_visit')
          .update({ resolved_at: new Date().toISOString().slice(0, 10) })
          .eq('id', visitId)
          .eq('center_id', scope.centerId),
      )
    },


    /* ── مشاهده و گزارش ماهانه ──────────────────────────────── */

    async addObservation(input) {
      const me = orThrow(
        await db.from('user_account').select('staff_id').eq('id', scope.accountId).single(),
      ) as Row

      const made = orThrow(
        await db
          .from('observation')
          .insert({
            center_id: scope.centerId,
            child_id: input.childId,
            date: new Date().toISOString().slice(0, 10),
            lens: input.lens,
            body: input.body.trim(),
            staff_id: me.staff_id as string | null,
          })
          .select('id')
          .single(),
      ) as Row

      /*
       * هم‌بازی از مشاهده می‌آید، نه از حدس.
       *
       * هم‌کلاس بودن دوستی نیست و شمردن هم‌حضوری، رابطه‌ای می‌سازد که
       * هیچ‌کس ندیده.
       */
      const peers = input.peerChildIds ?? []
      if (peers.length > 0) {
        orThrow(
          await db.from('observation_peer').insert(
            peers.map((childId) => ({ observation_id: made.id as string, child_id: childId })),
          ),
        )
      }
    },

    async listObservations(childId: string, from: string, to: string): Promise<Observation[]> {
      const rows = orThrow(
        await db.rpc('month_observations', {
          centre: scope.centerId,
          target: childId,
          from_date: from,
          to_date: to,
        }),
      ) as Row[]
      return (rows ?? []).map((r): Observation => ({
        id: r.id as string,
        date: r.date as string,
        lens: r.lens as Observation['lens'],
        body: r.body as string,
        staffName: (r.staff_name as string | null) ?? null,
        peers: (r.peers as string[] | null) ?? [],
      }))
    },

    async getMonthlyReport(childId: string, period: string): Promise<MonthlyReport> {
      const { from, to } = periodRange(period)
      const [obsRows, peerRows, factRows, gapRows, reportRows, childRow] = await Promise.all([
        db.rpc('month_observations', { centre: scope.centerId, target: childId, from_date: from, to_date: to }),
        db.rpc('month_peers', { centre: scope.centerId, target: childId, from_date: from, to_date: to }),
        db.rpc('month_facts', { centre: scope.centerId, target: childId, from_date: from, to_date: to }),
        db.rpc('month_gaps', { centre: scope.centerId, target: childId, from_date: from, to_date: to }),
        db.from('monthly_report').select('*').eq('child_id', childId).eq('period', period).maybeSingle(),
        db.from('child').select('first_name, last_name').eq('id', childId).single(),
      ])

      const facts = ((orThrow(factRows) as Row[]) ?? [])[0] ?? {}
      const report = (orThrow(reportRows) as Row | null) ?? null
      const child = orThrow(childRow) as Row

      return {
        id: (report?.id as string | null) ?? null,
        childId,
        childName: `${child.first_name as string} ${child.last_name as string}`,
        period,
        status: (report?.status as MonthlyReport['status']) ?? 'draft',
        teacherSummary: (report?.teacher_summary as string | null) ?? null,
        meetingNotes: (report?.meeting_notes as string | null) ?? null,
        assistedDraft: (report?.assisted_draft as string | null) ?? null,
        observations: ((orThrow(obsRows) as Row[]) ?? []).map((r): Observation => ({
          id: r.id as string,
          date: r.date as string,
          lens: r.lens as Observation['lens'],
          body: r.body as string,
          staffName: (r.staff_name as string | null) ?? null,
          peers: (r.peers as string[] | null) ?? [],
        })),
        peers: ((orThrow(peerRows) as Row[]) ?? []).map((r) => ({
          firstName: r.first_name as string,
          times: r.times as number,
        })),
        facts: {
          presentDays: (facts.present_days as number) ?? 0,
          absentDays: (facts.absent_days as number) ?? 0,
          totalMinutes: (facts.total_minutes as number) ?? 0,
          lunchAll: (facts.lunch_all as number) ?? 0,
          lunchMost: (facts.lunch_most as number) ?? 0,
          lunchLittle: (facts.lunch_little as number) ?? 0,
          lunchNone: (facts.lunch_none as number) ?? 0,
          napDays: (facts.nap_days as number) ?? 0,
          moodGood: (facts.mood_good as number) ?? 0,
          moodNormal: (facts.mood_normal as number) ?? 0,
          moodRestless: (facts.mood_restless as number) ?? 0,
          moodSad: (facts.mood_sad as number) ?? 0,
          photos: (facts.photos as number) ?? 0,
          observations: (facts.observations as number) ?? 0,
        },
        gaps: ((orThrow(gapRows) as Row[]) ?? []).map((r) => ({
          lens: r.lens as Observation['lens'],
          seen: (r.seen as number) ?? 0,
        })),
      }
    },

    /**
     * پیش‌نویس کمکی — گزینه (ب).
     *
     * **تنها ورودی مجاز، جمله‌های خودِ مربی است** و آن مرز یک تابع در
     * پایگاه داده است (app.report_material)، نه یک جمله در دستورالعمل
     * مدل: نه حضور، نه خلق، نه غذا، نه نام کودکان دیگر. از عدد
     * نتیجه‌گیری درمی‌آید و از جمله مربی، فقط ویرایش — بند ۱۰ و پیوست ج.
     *
     * ساختِ خودِ متن کار تابع لبه است، با کلیدی که فقط سرور دارد؛ اینجا
     * فقط مصالح جمع و نتیجه با ردِ پایش ثبت می‌شود.
     */
    async buildAssistedDraft(childId: string, period: string): Promise<string> {
      const { from, to } = periodRange(period)
      const material = orThrow(
        await db.rpc('report_material', {
          centre: scope.centerId,
          target: childId,
          from_date: from,
          to_date: to,
        }),
      ) as Row[]

      if (!material || material.length === 0) {
        throw new Error('برای این ماه مشاهده‌ای ثبت نشده. پیش‌نویس از چیزی ساخته نمی‌شود.')
      }

      const draft = material.map((m) => m.body as string).join('\n\n')
      const report = orThrow(
        await db
          .from('monthly_report')
          .select('id')
          .eq('child_id', childId)
          .eq('period', period)
          .maybeSingle(),
      ) as Row | null
      if (!report) throw new Error('گزارش این ماه هنوز ساخته نشده.')

      orThrow(
        await db.rpc('record_assisted_draft', {
          report: report.id as string,
          draft,
          model_name: 'edge',
          sources: material.map((m) => m.observation_id as string),
        }),
      )
      return draft
    },

    async saveMonthlyReport(childId: string, period: string, patch) {
      const { from, to } = periodRange(period)
      orThrow(
        await db.from('monthly_report').upsert(
          {
            center_id: scope.centerId,
            child_id: childId,
            period,
            period_from: from,
            period_to: to,
            ...(patch.teacherSummary !== undefined
              ? { teacher_summary: patch.teacherSummary.trim() }
              : {}),
            ...(patch.meetingNotes !== undefined
              ? { meeting_notes: patch.meetingNotes.trim() }
              : {}),
          },
          { onConflict: 'child_id,period' },
        ),
      )
    },

    async shareMonthlyReport(childId: string, period: string) {
      /*
       * بی جمع‌بندی مربی، گزارش به خانواده نمی‌رود.
       *
       * قید monthly_report_shared_needs_summary در پایگاه داده همین را
       * می‌بندد؛ این پرس‌وجو فقط پیام روشن‌تری می‌دهد.
       */
      orThrow(
        await db
          .from('monthly_report')
          .update({ status: 'shared', shared_at: new Date().toISOString() })
          .eq('child_id', childId)
          .eq('period', period),
      )
    },


    /* ── بایگانی حضور و غیاب ────────────────────────────────── */

    async getAttendanceMonth(childId: string, from: string, to: string): Promise<AttendanceMonth> {
      const [dayRows, summaryRows] = await Promise.all([
        db.rpc('child_attendance_month', {
          centre: scope.centerId,
          target: childId,
          from_date: from,
          to_date: to,
        }),
        db.rpc('child_attendance_summary', {
          centre: scope.centerId,
          target: childId,
          from_date: from,
          to_date: to,
        }),
      ])

      const summary = ((orThrow(summaryRows) as Row[]) ?? [])[0] ?? {}
      return {
        days: ((orThrow(dayRows) as Row[]) ?? []).map((r): AttendanceDay => ({
          date: r.date as string,
          checkInAt: (r.check_in_at as string | null) ?? null,
          checkOutAt: (r.check_out_at as string | null) ?? null,
          // خالی، نه صفر — روزی که خروجش ثبت نشده مدت ندارد.
          minutes: (r.minutes as number | null) ?? null,
          lateMinutes: (r.late_minutes as number) ?? 0,
          absent: Boolean(r.absent),
          absenceReason: (r.absence_reason as string | null) ?? null,
          droppedBy: (r.dropped_by as string | null) ?? null,
          pickedUpBy: (r.picked_up_by as string | null) ?? null,
        })),
        presentDays: (summary.present_days as number) ?? 0,
        absentDays: (summary.absent_days as number) ?? 0,
        totalMinutes: (summary.total_minutes as number) ?? 0,
        lateDays: (summary.late_days as number) ?? 0,
      }
    },


    /* ── پرونده کارکنان — مدیر ──────────────────────────────── */

    async getStaffCartable(from: string, to: string): Promise<StaffCartableRow[]> {
      const rows = orThrow(
        await db.rpc('staff_cartable', {
          centre: scope.centerId,
          from_date: from,
          to_date: to,
        }),
      ) as Row[]
      return (rows ?? []).map((r): StaffCartableRow => ({
        staffId: r.staff_id as string,
        fullName: r.full_name as string,
        role: r.role as string,
        title: ((r.title as StaffTitle | null) ?? 'teacher'),
        photoUrl: (r.photo_url as string | null) ?? null,
        daysActive: (r.days_active as number) ?? 0,
        checkIns: (r.check_ins as number) ?? 0,
        documentsExpired: (r.documents_expired as number) ?? 0,
        documentsExpiring: (r.documents_expiring as number) ?? 0,
        lastReview: (r.last_review as string | null) ?? null,
        openConcerns: (r.open_concerns as number) ?? 0,
      }))
    },

    async getStaffProfile(staffId: string): Promise<StaffProfile> {
      return readStaffFile(staffId, false)
    },

    async uploadStaffDocument(input) {
      /*
       * از تابع، نه درج مستقیم.
       *
       * `submit_staff_document` است که تصمیم می‌گیرد مدرک «تأییدشده»
       * ثبت شود یا «در انتظار» — و همان‌جاست که جلوی مربی گرفته می‌شود
       * که مدرک دیگری را به نام خودش بفرستد.
       */
      orThrow(
        await db.rpc('submit_staff_document', {
          target: input.staffId,
          doc_kind: input.kind,
          doc_title: input.title.trim(),
          file_url: input.fileUrl,
          issued_at: input.issuedAt ?? null,
          expires_at: input.expiresAt ?? null,
        }),
      )
    },

    /* ── مدارک: مربی می‌فرستد، مدیر تأیید می‌کند ─────────────── */

    async listDocumentRequirements() {
      const rows = (orThrow(
        await db.rpc('staff_document_requirements', { centre: scope.centerId }),
      ) ?? []) as Row[]
      return rows.map((r) => ({
        id: r.id as string,
        kind: r.kind as StaffDocumentKind,
        title: r.title as string,
        note: (r.note as string | null) ?? null,
        needsExpiry: Boolean(r.needs_expiry),
      }))
    },

    async setDocumentRequirement(input) {
      orThrow(
        await db.rpc('set_staff_document_requirement', {
          doc_kind: input.kind,
          req_title: input.title.trim(),
          req_note: input.note?.trim() || null,
          expiry_needed: input.needsExpiry ?? false,
        }),
      )
    },

    async dropDocumentRequirement(requirementId) {
      orThrow(await db.rpc('drop_staff_document_requirement', { requirement: requirementId }))
    },

    async listPendingDocuments() {
      const rows = (orThrow(
        await db.rpc('staff_document_queue', { centre: scope.centerId }),
      ) ?? []) as Row[]
      return rows.map((r) => ({
        id: r.id as string,
        staffId: r.staff_id as string,
        fullName: r.full_name as string,
        kind: r.kind as StaffDocumentKind,
        title: r.title as string,
        fileUrl: r.file_url as string,
        issuedAt: (r.issued_at as string | null) ?? null,
        expiresAt: (r.expires_at as string | null) ?? null,
        uploadedAt: r.uploaded_at as string,
      }))
    },

    async reviewStaffDocument(documentId, approve, note) {
      orThrow(
        await db.rpc('review_staff_document', {
          document: documentId,
          approve,
          note: note?.trim() || null,
        }),
      )
    },

    async getStaffDocumentChecklist(staffId) {
      return readChecklist(staffId)
    },

    async getMyDocumentChecklist() {
      return readChecklist(await myStaffId())
    },

    async submitMyDocument(input) {
      orThrow(
        await db.rpc('submit_staff_document', {
          target: await myStaffId(),
          doc_kind: input.kind,
          doc_title: input.title.trim(),
          file_url: input.fileUrl,
          issued_at: null,
          expires_at: input.expiresAt ?? null,
        }),
      )
    },

    async addStaffNote(input) {
      orThrow(
        await db.from('staff_note').insert({
          center_id: scope.centerId,
          staff_id: input.staffId,
          kind: input.kind,
          body: input.body.trim(),
          /*
           * ارزیابی‌ای که مربی هرگز نمی‌بیند، ارزیابی نیست؛ پرونده‌سازی
           * است. اپ مدیر را وادار نمی‌کند، ولی سکوت را ثبت می‌کند.
           */
          shared_at: input.share ? new Date().toISOString() : null,
        }),
      )
    },

    async exportStaffFile(): Promise<string> {
      const staff = orThrow(
        await db
          .from('staff')
          .select('id, full_name, role')
          .eq('center_id', scope.centerId)
          .eq('active', true)
          .order('full_name'),
      ) as Row[]

      const lines: string[] = ['پرونده کارکنان', '']
      for (const person of staff ?? []) {
        const file = await readStaffFile(person.id as string, false)
        lines.push(`— ${file.fullName} (${file.role})`)
        lines.push(`  کلاس‌ها: ${file.classNames.join('، ') || '—'}`)
        if (file.documents.length === 0) {
          lines.push('  مدارک: هیچ مدرکی بارگذاری نشده.')
        } else {
          for (const doc of file.documents) {
            lines.push(`  • ${doc.title}${doc.expiresAt ? ` — اعتبار تا ${doc.expiresAt}` : ''}`)
          }
        }
        lines.push('')
      }
      return lines.join('\n')
    },

    async getMyStaffFile(): Promise<StaffProfile> {
      const me = orThrow(
        await db
          .from('user_account')
          .select('staff_id')
          .eq('id', scope.accountId)
          .single(),
      ) as Row
      // مربی فقط یادداشت‌هایی را می‌بیند که با او در میان گذاشته شده.
      return readStaffFile(me.staff_id as string, true)
    },


    /* ── گفتگوی نفر به نفر ──────────────────────────────────── */

    async listConversations(): Promise<ConversationSummary[]> {
      const rows = orThrow(await db.rpc('my_conversations')) as Row[]
      return (rows ?? []).map((r): ConversationSummary => ({
        id: r.conversation_id as string,
        otherAccountId: r.other_account_id as string,
        otherName: r.other_name as string,
        otherRole: r.other_role as ConversationSummary['otherRole'],
        childId: (r.child_id as string | null) ?? null,
        childName: (r.child_name as string | null) ?? null,
        lastBody: (r.last_body as string | null) ?? null,
        lastAt: (r.last_message_at as string | null) ?? null,
        unread: (r.unread as number) ?? 0,
      }))
    },

    /**
     * فهرست انتخاب، از همان قاعده‌ای که مجوز فرستادن را می‌دهد.
     *
     * پس فهرست و مجوز نمی‌توانند با هم فرق کنند — و اگر روزی فرق
     * کردند، کاربر کسی را در فهرست می‌بیند که پیامش رد می‌شود.
     */
    async listMessageCandidates(): Promise<MessageCandidate[]> {
      const rows = orThrow(await db.rpc('message_candidates')) as Row[]
      return (rows ?? []).map((r): MessageCandidate => ({
        accountId: r.account_id as string,
        fullName: r.full_name as string,
        role: r.account_role as MessageCandidate['role'],
        context: (r.context as string | null) ?? null,
      }))
    },

    async openConversation(otherAccountId: string, aboutChildId?: string): Promise<string> {
      return orThrow(
        await db.rpc('open_conversation', {
          other: otherAccountId,
          about: aboutChildId ?? null,
        }),
      ) as string
    },

    async getConversation(conversationId: string): Promise<Conversation> {
      const [summary, msgRows] = await Promise.all([
        db.rpc('my_conversations'),
        db
          .from('message')
          .select('id, body, sender_id, sent_at, queued_until, sender:sender_id(id, role, staff:staff_id(full_name), guardian:guardian_id(full_name))')
          .eq('conversation_id', conversationId)
          .order('created_at'),
      ])

      const line = ((orThrow(summary) as Row[]) ?? []).find(
        (r) => r.conversation_id === conversationId,
      )
      if (!line) throw new Error('گفتگو پیدا نشد.')

      /*
       * «رسیده» از زمان می‌آید، نه از یک ستونِ حالت — ارتقای ۰۰۴۰.
       *
       * صفِ ساعت کاری یک زمانِ تحویل است و هیچ کارِ زمان‌بندی‌شده‌ای
       * `sent_at` را پر نمی‌کند. بدون این حساب، پیامی که ساعتش رسیده
       * تا ابد «در صف تا ۸:۰۰» می‌ماند.
       *
       * سیاست سطر-محور همین قاعده را دارد، پس پیامِ نرسیدهٔ دیگران
       * اصلاً به اینجا نمی‌رسد؛ این فقط برچسبِ درست را می‌گذارد.
       */
      const now = new Date().toISOString()
      const messages = ((orThrow(msgRows) as Row[]) ?? []).map((m) => {
        const sender = m.sender as Row | null
        const staff = sender?.staff as Row | null
        const guardian = sender?.guardian as Row | null
        const queuedUntil = (m.queued_until as string | null) ?? null
        const delivered = ((m.sent_at as string | null) ?? null) ?? queuedUntil
        return {
          id: m.id as string,
          body: m.body as string,
          mine: m.sender_id !== line.other_account_id,
          senderName:
            (staff?.full_name as string | undefined) ??
            (guardian?.full_name as string | undefined) ??
            '—',
          sentAt: delivered !== null && delivered <= now ? delivered : null,
          queuedUntil,
        }
      })

      /*
       * ساعت کاری فقط وقتی یک سرِ گفتگو خانواده است — بخش ۶.۶.
       *
       * قاعده ساعت کاری برای محافظت از خانواده است، نه یک قاعده عمومی:
       * مدیری که شب یازده به مربی می‌نویسد نباید تا صبح صبر کند.
       */
      const withFamily = scope.role === 'guardian' || line.other_role === 'guardian'
      const centre = withFamily
        ? ((orThrow(
            await db
              .from('center')
              .select('parent_message_start, parent_message_end')
              .eq('id', scope.centerId)
              .single(),
          ) as Row) ?? null)
        : null

      return {
        id: conversationId,
        otherName: line.other_name as string,
        otherRole: line.other_role as Conversation['otherRole'],
        childName: (line.child_name as string | null) ?? null,
        hours: centre
          ? {
              start: (centre.parent_message_start as string).slice(0, 5),
              end: (centre.parent_message_end as string).slice(0, 5),
            }
          : null,
        messages,
      }
    },

    async sendToConversation(conversationId: string, body: string) {
      orThrow(await db.rpc('send_message', { chat: conversationId, body }))
    },

    async markConversationRead(conversationId: string) {
      orThrow(await db.rpc('mark_conversation_read', { chat: conversationId }))
    },


    /* ── ویرایش پرونده کودک ─────────────────────────────────── */

    /**
     * میدان‌های قابل ویرایش، با مقدار فعلی و درخواست بازِ هر کدام.
     *
     * فهرست میدان‌ها از جدول می‌آید نه از کلاینت — خانواده نباید بتواند
     * کلاس کودک یا طرح شهریه را به فهرست اضافه کند.
     */
    async listProfileFields(childId: string): Promise<ProfileField[]> {
      const [fieldRows, openRows] = await Promise.all([
        db.from('profile_field').select('*').order('sort_order'),
        db
          .from('profile_change_request')
          .select('field, new_value')
          .eq('center_id', scope.centerId)
          .eq('child_id', childId)
          .eq('state', 'pending'),
      ])

      const open = new Map(
        ((orThrow(openRows) as Row[]) ?? []).map((r) => [
          r.field as string,
          (r.new_value as string | null) ?? null,
        ]),
      )

      const fields = orThrow(fieldRows) as Row[]
      const values = await Promise.all(
        fields.map((f) =>
          db.rpc('profile_value', { target: childId, field_key: f.key as string }),
        ),
      )

      return fields.map((f, i): ProfileField => {
        const answer = values[i]
        return {
          key: f.key as string,
          label: f.label as string,
          safetyCritical: f.safety_critical as boolean,
          value: answer ? ((orThrow(answer) as string | null) ?? '') : '',
          pending: open.get(f.key as string) ?? null,
        }
      })
    },

    /**
     * درخواست تغییر. **هیچ ستونی را عوض نمی‌کند.**
     *
     * مقدار قبلی را خودِ تابع سمت سرور می‌خواند؛ اگر کلاینت می‌فرستادش،
     * می‌شد مدیر را وادار کرد تغییری را تأیید کند که هرگز آن نبوده.
     */
    async requestProfileChange(childId: string, field: string, value: string) {
      orThrow(
        await db.rpc('request_profile_change', {
          target: childId,
          field_key: field,
          value,
        }),
      )
    },

    async listProfileChanges(): Promise<ProfileChange[]> {
      const rows = orThrow(
        await db.rpc('pending_profile_changes', { centre: scope.centerId }),
      ) as Row[]
      return (rows ?? []).map((r): ProfileChange => ({
        id: r.request_id as string,
        childId: r.child_id as string,
        childName: r.child_name as string,
        field: r.field as string,
        label: r.label as string,
        oldValue: (r.old_value as string | null) ?? null,
        newValue: (r.new_value as string | null) ?? null,
        safetyCritical: r.safety_critical as boolean,
        requestedAt: r.requested_at as string,
      }))
    },

    /**
     * ویرایش مستقیم، به دست مدیر.
     *
     * از همان فهرست بسته می‌گذرد که خانواده از آن می‌گذرد، و درخواستِ
     * بازِ همان میدان را می‌بندد — وگرنه تأییدِ بعدی، مقدارِ درست را با
     * مقدارِ قدیمی عوض می‌کند.
     */
    async editProfileField(childId: string, field: string, value: string) {
      orThrow(
        await db.rpc('edit_profile_field', {
          target: childId,
          field_key: field,
          value,
        }),
      )
    },

    /* ── پرونده مربی ──────────────────────────────────────── */

    async listStaffFields(staffId: string) {
      const [fields, person] = await Promise.all([
        db.from('staff_field').select('*').order('sort_order'),
        db
          .from('staff')
          .select('first_name, last_name, birth_date, national_id, phone, address, education, resume, emergency_name, emergency_phone')
          .eq('id', staffId)
          .eq('center_id', scope.centerId)
          .single(),
      ])
      const row = orThrow(person) as Row
      /* آینه `app.staff_value`: نگاشت صریح کلید به ستون، نه ساختِ نام. */
      const column: Record<string, string> = {
        first_name: 'first_name',
        last_name: 'last_name',
        birth_date: 'birth_date',
        national_id: 'national_id',
        phone: 'phone',
        address: 'address',
        education: 'education',
        resume: 'resume',
        emergency_name: 'emergency_name',
        emergency_phone: 'emergency_phone',
      }
      return ((orThrow(fields) as Row[]) ?? []).map((f): StaffField => {
        const key = f.key as string
        const at = column[key]
        return {
          key,
          label: f.label as string,
          input: f.input as StaffField['input'],
          value: at ? ((row[at] as string | null) ?? '') : '',
        }
      })
    },

    async editStaffField(staffId: string, field: string, value: string) {
      orThrow(
        await db.rpc('edit_staff_field', { target: staffId, field_key: field, value }),
      )
    },

    /* ── مرخصی مربی ───────────────────────────────────────── */

    async requestLeave(input: LeaveInput) {
      orThrow(
        await db.rpc('request_leave', {
          kind: input.kind,
          starts: input.starts,
          ends: input.ends,
          reason: input.reason?.trim() || null,
        }),
      )
    },

    async listMyLeave(): Promise<LeaveRequest[]> {
      const rows = (orThrow(await db.rpc('my_leave')) as Row[]) ?? []
      return rows.map((r) => ({
        id: r.id as string,
        kind: r.kind as LeaveKind,
        starts: r.starts as string,
        ends: r.ends as string,
        days: r.days as number,
        reason: (r.reason as string | null) ?? null,
        state: r.state as LeaveRequest['state'],
        decisionNote: (r.decision_note as string | null) ?? null,
        requestedAt: r.requested_at as string,
        reviewedAt: (r.reviewed_at as string | null) ?? null,
      }))
    },

    async listPendingLeave(): Promise<PendingLeave[]> {
      const rows =
        (orThrow(await db.rpc('pending_leave', { centre: scope.centerId })) as Row[]) ?? []
      return rows.map((r) => ({
        id: r.id as string,
        staffId: r.staff_id as string,
        fullName: r.full_name as string,
        kind: r.kind as LeaveKind,
        starts: r.starts as string,
        ends: r.ends as string,
        days: r.days as number,
        reason: (r.reason as string | null) ?? null,
        requestedAt: r.requested_at as string,
      }))
    },

    async decideLeave(requestId: string, approve: boolean, note?: string) {
      orThrow(
        await db.rpc('decide_leave', {
          request: requestId,
          approve,
          note: note?.trim() || null,
        }),
      )
    },

    async listStaffOnLeave(date: string) {
      const rows =
        (orThrow(await db.rpc('staff_on_leave', { centre: scope.centerId, day: date })) as Row[]) ??
        []
      return rows.map((r) => ({
        staffId: r.staff_id as string,
        fullName: r.full_name as string,
      }))
    },

    /* ── دفتر امانت ───────────────────────────────────────── */

    async listChildLoans(childId: string): Promise<Loan[]> {
      const rows = (orThrow(await db.rpc('child_loans', { child: childId })) as Row[]) ?? []
      return rows.map((r) => ({
        id: r.id as string,
        kind: r.kind as LoanKind,
        title: r.title as string,
        lentOn: r.lent_on as string,
        dueOn: (r.due_on as string | null) ?? null,
        returnedOn: (r.returned_on as string | null) ?? null,
        note: (r.note as string | null) ?? null,
        overdue: Boolean(r.overdue),
      }))
    },

    async lendItem(input: LoanInput) {
      orThrow(
        await db.rpc('lend_item', {
          child: input.childId,
          kind: input.kind,
          title: input.title.trim(),
          due: input.dueOn ?? null,
          note: input.note?.trim() || null,
          lent: input.lentOn ?? null,
        }),
      )
    },

    async returnItem(loanId: string, day?: string | null) {
      orThrow(await db.rpc('return_item', { loan_id: loanId, day: day ?? null }))
    },

    async listOpenLoans(): Promise<OpenLoan[]> {
      const rows =
        (orThrow(await db.rpc('open_loans', { centre: scope.centerId })) as Row[]) ?? []
      return rows.map((r) => ({
        id: r.id as string,
        childId: r.child_id as string,
        childName: r.child_name as string,
        className: (r.class_name as string | null) ?? null,
        kind: r.kind as LoanKind,
        title: r.title as string,
        lentOn: r.lent_on as string,
        dueOn: (r.due_on as string | null) ?? null,
        daysOut: r.days_out as number,
        overdue: Boolean(r.overdue),
      }))
    },

    async listLendableChildren(): Promise<Child[]> {
      /*
       * سیاست سطر-محورِ `child` خودش کار را می‌کند: مربی فقط کودکان
       * کلاس‌هایش را می‌بیند و مدیر کل مرکز. پس اینجا هیچ شرطی درباره
       * نقش نوشته نمی‌شود — همان قاعده در دو جا، دو حقیقت می‌شود.
       */
      const rows = orThrow(
        await db
          .from('child')
          .select('*')
          .eq('center_id', scope.centerId)
          .is('deleted_at', null)
          .eq('status', 'active')
          .order('first_name'),
      ) as Row[]
      return rows.map(asChild)
    },

    /* ── رزرو غذا ─────────────────────────────────────────── */

    async listMealOffers(childId: string, from: string, to: string): Promise<MealOffer[]> {
      const rows =
        (orThrow(
          await db.rpc('meal_menu', { child: childId, from_date: from, to_date: to }),
        ) as Row[]) ?? []
      return rows.map((r) => ({
        menuDayId: r.menu_day_id as string,
        date: r.date as string,
        slot: r.slot as MealSlot,
        title: r.title as string,
        ingredients: (r.ingredients as string[]) ?? [],
        price: (r.price as number | null) ?? null,
        orderBy: r.order_by as string,
        capacity: (r.capacity as number | null) ?? null,
        taken: (r.taken as number) ?? 0,
        allergyHits: (r.allergy_hits as string[]) ?? [],
        orderState: (r.order_state as MealOrderState | null) ?? null,
        orderable: Boolean(r.orderable),
      }))
    },

    async reserveMeal(childId: string, menuDayId: string) {
      orThrow(await db.rpc('reserve_meal', { child: childId, day: menuDayId }))
    },

    async cancelMealOrder(orderId: string) {
      orThrow(await db.rpc('cancel_meal_order', { order_id: orderId }))
    },

    async listMealBasket(childId: string): Promise<MealBasketLine[]> {
      const rows = (orThrow(await db.rpc('meal_basket', { child: childId })) as Row[]) ?? []
      return rows.map((r) => ({
        orderId: r.order_id as string,
        date: r.date as string,
        slot: r.slot as MealSlot,
        title: r.title as string,
        price: r.price as number,
      }))
    },

    async payMealBasket(childId: string, method: MealPayMethod, receiptUrl?: string | null) {
      orThrow(
        await db.rpc('pay_meal_basket', {
          child: childId,
          method,
          receipt: receiptUrl ?? null,
        }),
      )
    },

    async listMealsForDay(date: string): Promise<MealPlate[]> {
      const rows =
        (orThrow(await db.rpc('meals_for_day', { centre: scope.centerId, day: date })) as Row[]) ??
        []
      return rows.map((r) => ({
        slot: r.slot as MealSlot,
        title: r.title as string,
        childId: r.child_id as string,
        childName: r.child_name as string,
        className: (r.class_name as string | null) ?? null,
        allergyHits: (r.allergy_hits as string[]) ?? [],
      }))
    },

    async listPendingMealPayments(): Promise<PendingMealPayment[]> {
      const rows =
        (orThrow(await db.rpc('pending_meal_payments', { centre: scope.centerId })) as Row[]) ?? []
      return rows.map((r) => ({
        id: r.id as string,
        childId: r.child_id as string,
        childName: r.child_name as string,
        amount: r.amount as number,
        receiptUrl: (r.receipt_url as string | null) ?? null,
        meals: (r.meals as number) ?? 0,
        createdAt: r.created_at as string,
      }))
    },

    async approveMealPayment(paymentId: string) {
      orThrow(await db.rpc('approve_meal_payment', { payment: paymentId }))
    },

    async setMealPrice(input: MealPriceInput) {
      orThrow(
        await db
          .from('menu_day')
          .update({
            price: input.price,
            capacity: input.capacity ?? null,
            order_by: input.orderBy ?? null,
          })
          .eq('id', input.menuDayId)
          .eq('center_id', scope.centerId),
      )
    },

    async addStaff(input: NewStaff) {
      const made = orThrow(
        await db.rpc('add_staff', {
          first_name: input.firstName.trim(),
          last_name: input.lastName.trim(),
          staff_role: input.role,
          phone: input.phone?.trim() || null,
          staff_title: input.title,
        }),
      )
      return made as unknown as string
    },

    async setStaffTitle(staffId: string, title: StaffTitle) {
      orThrow(await db.rpc('set_staff_title', { target: staffId, staff_title: title }))
    },

    /*
     * خروج، نه حذف. قاعده‌اش در app.remove_staff است: روز خروج ثبت
     * می‌شود، کلاس‌ها برداشته می‌شوند و حساب کاربری همان لحظه غیرفعال —
     * بخش ۷.۴، «قطع فوری با یک اقدام».
     */
    async removeStaff(staffId: string) {
      orThrow(await db.rpc('remove_staff', { target: staffId }))
    },

    async decideProfileChange(requestId: string, approve: boolean, reason?: string) {
      orThrow(
        await db.rpc('decide_profile_change', {
          request: requestId,
          approve,
          reason: reason ?? null,
        }),
      )
    },

    /* ── اقلام هزینه — مدیر ─────────────────────────────────── */

    async listFeeItems(period: string): Promise<FeeItem[]> {
      const rows = orThrow(
        await db
          .from('fee_item')
          .select('*, fee_item_child(child_id, accepted_at, declined_at), invoice_line(id)')
          .eq('center_id', scope.centerId)
          .eq('period', period)
          .order('created_at', { ascending: false }),
      ) as Row[]

      return rows.map((r): FeeItem => {
        const links = (r.fee_item_child as Row[] | null) ?? []
        return {
          id: r.id as string,
          title: r.title as string,
          description: (r.description as string | null) ?? null,
          amount: r.amount as number,
          period: r.period as string,
          optional: r.optional as boolean,
          published: r.published_at !== null,
          childCount: links.length,
          acceptedCount: links.filter((l) => l.accepted_at).length,
          declinedCount: links.filter((l) => l.declined_at).length,
          issuedCount: ((r.invoice_line as Row[] | null) ?? []).length,
        }
      })
    },

    /**
     * قلم را می‌سازد و به کودکان دامنه‌اش می‌بندد — بی انتشار.
     *
     * فهرست کودکان همین‌جا ثابت می‌شود، نه هنگام انتشار: اگر فردا
     * کودکی ثبت‌نام کند، نباید صورتحساب اردویی را بگیرد که برای
     * کلاسِ آن روز تعریف شده بود.
     */
    async createFeeItem(input): Promise<FeeItem> {
      const made = orThrow(
        await db
          .from('fee_item')
          .insert({
            center_id: scope.centerId,
            title: input.title.trim(),
            description: input.description?.trim() || null,
            amount: input.amount,
            period: input.period,
            optional: input.optional,
          })
          .select('id')
          .single(),
      ) as Row

      let children = db.from('child').select('id').eq('center_id', scope.centerId)
      if (input.scope.kind === 'class') children = children.eq('class_id', input.scope.classId)
      const targets = orThrow(await children) as Row[]

      if (targets.length > 0) {
        orThrow(
          await db.from('fee_item_child').insert(
            targets.map((c) => ({
              fee_item_id: made.id as string,
              child_id: c.id as string,
              center_id: scope.centerId,
            })),
          ),
        )
      }

      const list = await this.listFeeItems(input.period)
      const item = list.find((f) => f.id === made.id)
      if (!item) throw new Error('قلم ساخته شد ولی خوانده نشد.')
      return item
    },

    async publishFeeItem(itemId: string): Promise<number> {
      orThrow(
        await db
          .from('fee_item')
          .update({ published_at: new Date().toISOString() })
          .eq('id', itemId)
          .eq('center_id', scope.centerId)
          .is('published_at', null),
      )
      // ساختن سطرها سمت سرور است، تا مبلغ از کلاینت نیاید.
      return (orThrow(await db.rpc('issue_fee_item', { item: itemId })) as number) ?? 0
    },

    async decidePaymentClaim(claimId, approve, reason) {
      const claim = orThrow(
        await db
          .from('payment_claim')
          .select('*')
          .eq('center_id', scope.centerId)
          .eq('id', claimId)
          .single(),
      ) as Row
      if (claim.status !== 'pending') throw new Error('این اعلام قبلاً بررسی شده.')

      if (!approve) {
        // رد بدون دلیل، خانواده را سردرگم می‌گذارد.
        if (!reason?.trim()) throw new Error('دلیل رد را بنویسید.')
        orThrow(
          await db
            .from('payment_claim')
            .update({
              status: 'rejected',
              reject_reason: reason.trim(),
              reviewed_by: scope.accountId,
              reviewed_at: new Date().toISOString(),
            })
            .eq('center_id', scope.centerId)
            .eq('id', claimId)
            .select('id'),
        )
        return
      }

      // تأیید، پرداخت واقعی را می‌سازد. تا این لحظه هیچ ریالی ثبت نشده.
      const payment = await this.recordPayment({
        invoiceId: claim.invoice_id as string,
        amount: claim.amount as number,
        method: 'اعلام خانواده',
      })
      orThrow(
        await db
          .from('payment_claim')
          .update({
            status: 'approved',
            payment_id: payment.id,
            reviewed_by: scope.accountId,
            reviewed_at: new Date().toISOString(),
          })
          .eq('center_id', scope.centerId)
          .eq('id', claimId)
          .select('id'),
      )
    },


    /* ── دوره حضور — بخش ۵.۳ اصلاح‌شده ────────────────────────── */

    async listOffDayChildren(classId, date) {
      await assertVisible(classId)
      const day = await this.getClassDay(classId, date)
      const inSession = new Set(day.children.map((c) => c.id))
      const all = await childrenOf(classId)
      return all.filter((c) => !inSession.has(c.id))
    },

    async addChildToday(childId, date) {
      const rows = orThrow(await from('child').eq('id', childId)) as Row[]
      const classId = rows[0]?.class_id as string | undefined
      if (!classId) throw new Error('کودک پیدا نشد')
      orThrow(
        await db
          .from('session_extra')
          .upsert(
            { center_id: scope.centerId, child_id: childId, class_id: classId, date,
              added_by: scope.accountId },
            { onConflict: 'child_id,date' },
          )
          .select('id'),
      )
    },

    /** بخش ۵.۹: ارسال، و قفل شدن. پس از این فقط اصلاحیه. */
    async sendReports(classId, date) {
      await assertVisible(classId)
      const children = await childrenOf(classId)
      const now = new Date().toISOString()
      const rows = orThrow(
        await db
          .from('daily_report')
          .update({ status: 'sent', sent_at: now, locked_at: now })
          .eq('center_id', scope.centerId)
          .eq('date', date)
          .in('child_id', children.map((c) => c.id))
          .is('sent_at', null)
          .select('id'),
      ) as Row[]
      return rows.length
    },

    async readOccurred(entity, ids) {
      // رد پای خواندن: همان جدولی که تریگرهای نوشتن هم در آن می‌نویسند.
      await db.from('audit_log').insert(
        ids.map((id) => ({
          center_id: scope.centerId,
          actor_id: scope.accountId,
          action: 'read',
          entity,
          entity_id: id,
        })),
      )
    },
  }
}
