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
import type {
  AccessScope,
  Attendance,
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
} from '../types.ts'
import { isInCurrentWeek } from '../../../i18n/week.ts'
import { supabase } from './client.ts'

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
  lateMinutes: (r.late_minutes as number | null) ?? 0,
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
})

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
  const due = amount - discount + lateFee
  const today = new Date().toISOString().slice(0, 10)
  const status: InvoiceStatus =
    r.status === 'cancelled'
      ? 'cancelled'
      : paid >= due
        ? 'paid'
        : paid > 0
          ? 'partially_paid'
          : today > (r.due_date as string)
            ? 'overdue'
            : 'issued'
  return {
    id: r.id as string,
    childId: r.child_id as string,
    childName: `${child?.first_name ?? ''} ${child?.last_name ?? ''}`.trim() || '—',
    period: r.period as string,
    amount,
    discount,
    lateFee,
    paid,
    dueDate: r.due_date as string,
    status,
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

export function createSupabaseDataAccess(scope: AccessScope): DataAccess {
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


  /** بخش ۱۵.۴: باقی‌مانده سهمیه ماه جاری. */
  const smsRemaining = async (): Promise<number> => {
    const period = new Date().toISOString().slice(0, 7)
    const rows = orThrow(await from('sms_quota').eq('period', period)) as Row[]
    const row = rows[0]
    if (!row) return 0
    return (
      ((row.allocated as number) ?? 0) +
      ((row.extra_purchased as number) ?? 0) -
      ((row.used as number) ?? 0)
    )
  }

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

  return {
    scope,
    listClasses,

    async getClassDay(classId, date) {
      await assertVisible(classId)
      const classes = await listClasses()
      const classRoom = classes.find((c) => c.id === classId)
      if (!classRoom) throw new Error('کلاس پیدا نشد')

      const children = await childrenOf(classId)
      const ids = children.map((c) => c.id)
      if (ids.length === 0) {
        return { classRoom, children, attendance: [], absences: [], medications: [], reports: [], incidents: [], photos: [] }
      }

      const [attendance, absences, medications, reports, incidents, photos] = await Promise.all([
        from('attendance').eq('date', date).in('child_id', ids),
        from('absence_notice').eq('date', date).in('child_id', ids),
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
        attendance: (orThrow(attendance) as Row[]).map(asAttendance),
        absences: (orThrow(absences) as Row[]).map((r) => ({
          childId: r.child_id as string,
          date: r.date as string,
          reason: (r.reason as string | null) ?? null,
        })),
        medications: (orThrow(medications) as Row[]).map(asMedication),
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

    /**
     * بخش ۵.۵: فقط روی کودکان دست‌نخورده می‌نشیند. شرط touched=false در
     * خود UPDATE است، نه در کد، تا رقابت دو مربی هم‌زمان استثنا را پاک
     * نکند.
     */
    async applyBulk(classId, date, values: BulkValues) {
      await assertVisible(classId)
      const children = await childrenOf(classId)
      const ids = children.map((c) => c.id)
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

      const patch: Row = {}
      if (values.lunch !== null) patch.lunch = values.lunch
      if (values.napStart !== null) patch.nap_start = toTime(values.napStart)
      if (values.mood !== null) {
        // بخش ۵.۵: نوار گروهی «خلق عمومی امروز» است، پس هر سه بازه را پر
        // می‌کند. وگرنه هیچ گزارشی هرگز کامل نمی‌شد.
        patch.mood_morning = values.mood
        patch.mood_noon = values.mood
        patch.mood_afternoon = values.mood
      }
      if (Object.keys(patch).length === 0) return []

      const rows = orThrow(
        await db
          .from('daily_report')
          .update(patch)
          .eq('center_id', scope.centerId)
          .eq('date', date)
          .in('child_id', ids)
          .eq('touched', false)
          .is('locked_at', null)
          .select(),
      ) as Row[]
      return rows.map(asReport)
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
            escalation_reason: input.headOrFace ? 'head_or_face' : null,
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

    async getDaySummary(classId, date): Promise<DaySummary> {
      const day = await this.getClassDay(classId, date)
      const reports = new Map(day.reports.map((r) => [r.childId, r]))

      const complete: string[] = []
      const incomplete: DaySummary['incomplete'] = []
      for (const child of day.children) {
        const r = reports.get(child.id)
        const missing: string[] = []
        if (!r?.lunch) missing.push('ناهار')
        if (!r?.napStart) missing.push('خواب')
        if (!r?.moodMorning || !r?.moodNoon || !r?.moodAfternoon) missing.push('خلق')
        if (missing.length === 0) complete.push(child.id)
        else incomplete.push({ childId: child.id, missing })
      }

      const notes = orThrow(
        await from('daily_report')
          .in('child_id', day.children.map((c) => c.id))
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
        withoutNoteThisWeek: day.children.filter((c) => !notedThisWeek.has(c.id)).map((c) => c.id),
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
        from('attendance').eq('child_id', childId).eq('date', date),
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
        checkOutAt: (attendance?.check_out_at as string | null) ?? null,
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
          const complete = day.children.filter((c) => {
            const r = reports.get(c.id)
            return (
              r?.lunch && r?.napStart && r?.moodMorning && r?.moodNoon && r?.moodAfternoon
            )
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
        enrolled += day.children.length
        const absent = new Set(day.absences.map((a) => a.childId))
        const byChild = new Map(day.attendance.map((a) => [a.childId, a]))
        for (const child of day.children) {
          const row = byChild.get(child.id)
          if (row?.checkInAt && !row.checkOutAt) present += 1
          if (!row?.checkInAt && !absent.has(child.id)) {
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
        // پیش از ساعت نُه، «نیامده» هنوز «بی‌خبر» نیست — بخش ۵.۱.
        unaccounted: now.getHours() >= 9 ? unaccounted : [],
        pendingIncidents: pending,
        classes: perClass.map(({ room, day, complete }) => ({
          classId: room.id,
          name: room.name,
          complete,
          total: day.children.length,
          sent: day.reports.some((r) => r.touched) && complete === day.children.length,
        })),
        pendingClaims: (
          orThrow(await from('payment_claim').eq('status', 'pending')) as Row[]
        ).length,
        smsRemaining: await smsRemaining(),
      }
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
      const issued = invoices.reduce((sum, i) => sum + i.amount - i.discount + i.lateFee, 0)
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
      const remaining = view.amount - view.discount + view.lateFee - view.paid
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
          .update({ status: paid >= view.amount - view.discount + view.lateFee ? 'paid' : 'partially_paid' })
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
        return { isPayer: false, invoices: [], payments: [], claims: [], outstanding: 0 }
      }

      const rows = orThrow(
        await db
          .from('invoice')
          .select('*, child:child_id(first_name, last_name), payment(amount, paid_at, method, receipt_no, id, invoice_id)')
          .eq('center_id', scope.centerId)
          .eq('child_id', childId)
          .order('period', { ascending: false }),
      ) as Row[]

      const invoices = rows.map(asInvoice)
      const payments = rows.flatMap((r) =>
        ((r.payment as Row[] | null) ?? []).map((p): Payment => ({
          id: p.id as string,
          invoiceId: r.id as string,
          amount: p.amount as number,
          paidAt: p.paid_at as string,
          method: (p.method as string | null) ?? null,
          receiptNo: (p.receipt_no as string | null) ?? null,
        })),
      )
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

      return {
        isPayer: true,
        invoices,
        payments,
        claims,
        outstanding: invoices
          .filter((i) => i.status !== 'paid' && i.status !== 'cancelled')
          .reduce((sum, i) => sum + (i.amount - i.discount + i.lateFee - i.paid), 0),
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
        await from('message').eq('thread_id', thread.id as string).order('created_at'),
      ) as Row[]
      return {
        childId,
        childName: `${child?.first_name ?? ''} ${child?.last_name ?? ''}`.trim(),
        messages: rows.map((r): Message => ({
          id: r.id as string,
          childId,
          body: r.body as string,
          mine: r.sender_id === scope.accountId,
          senderName: r.sender_id === scope.accountId ? 'خودم' : 'طرف مقابل',
          sentAt: (r.sent_at as string | null) ?? null,
          queuedUntil: (r.queued_until as string | null) ?? null,
        })),
        hours,
      }
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
      const remaining = invoice.amount - invoice.discount + invoice.lateFee - invoice.paid - pending
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
  } as DataAccess & { readOccurred: (entity: string, ids: string[]) => Promise<void> }
}
