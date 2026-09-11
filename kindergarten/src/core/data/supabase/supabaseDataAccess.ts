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
  ParentDay,
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
