/**
 * مخزن محلی — فقط برای اجرای بدون سرور.
 *
 * قید مرکز و کلاس اینجا هم دقیقاً مثل مخزن واقعی اعمال می‌شود، تا رفتار
 * دو پیاده‌سازی یکی باشد و صفحه نفهمد با کدام‌یک کار می‌کند.
 */
import type {
  AbsenceNotice,
  AccessScope,
  Attendance,
  CheckInInput,
  ClassDay,
  DataAccess,
  BulkValues,
  CheckOutInput,
  DailyReport,
  DaySummary,
  Incident,
  IncidentInput,
  Photo,
  PickupCodeCheck,
  PickupOption,
  Guardian,
  MedicationInput,
  MedicationLog,
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
  seedAbsences,
  seedAttendance,
  seedMedications,
} from './fixture.ts'

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

function dayState(date: string): DayState {
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
  }
  return state
}

export function createLocalDataAccess(scope: AccessScope): DataAccess {
  if (scope.centerId !== CENTER_ID) {
    throw new Error('داده محلی فقط برای همان یک مرکز نمونه است')
  }

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

  return {
    scope,

    async listClasses() {
      const allowed = visibleClassIds()
      return CLASSES.filter((c) => allowed.includes(c.id))
    },

    async getClassDay(classId, date): Promise<ClassDay> {
      assertVisible(classId)
      const classRoom = CLASSES.find((c) => c.id === classId)
      if (!classRoom) throw new Error('کلاس پیدا نشد')

      const children = CHILDREN.filter((c) => c.classId === classId)
      const ids = new Set(children.map((c) => c.id))
      const state = dayState(date)

      return {
        classRoom,
        children,
        attendance: [...state.attendance.values()].filter((a) => ids.has(a.childId)),
        absences: state.absences.filter((a) => ids.has(a.childId)),
        medications: state.medications.filter((m) => ids.has(m.childId)),
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
        lateMinutes: 0,
      }
      state.attendance.set(input.childId, row)

      // ثبت ورود، اعلام غیبت همان روز را باطل می‌کند.
      state.absences = state.absences.filter((a) => a.childId !== input.childId)
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
      return row
    },

    async applyBulk(classId, date, values: BulkValues): Promise<DailyReport[]> {
      assertVisible(classId)
      const state = dayState(date)
      const written: DailyReport[] = []

      for (const child of CHILDREN.filter((c) => c.classId === classId)) {
        const current = state.reports.get(child.id)
        // بخش ۵.۵: کودکی که مربی جدا دست زده، مقدار گروهی نمی‌گیرد.
        if (current?.touched) continue

        const next: DailyReport = {
          ...blank(child.id, date),
          ...current,
          lunch: values.lunch ?? current?.lunch ?? null,
          napStart: values.napStart ?? current?.napStart ?? null,
          ...moodPatch(values.mood, current),
          touched: false,
        }
        state.reports.set(child.id, next)
        written.push(next)
      }

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
      return next
    },

    async listPickupOptions(childId): Promise<PickupOption[]> {
      const child = CHILDREN.find((c) => c.id === childId)
      if (!child?.classId) return []
      assertVisible(child.classId)

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
        // بخش ۵.۸: پس از ساعت پایان مهد، دقایق تأخیر خودکار ثبت می‌شود.
        lateMinutes: lateMinutesAfter(input.at),
      }
      state.attendance.set(input.childId, next)
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
      return row
    },

    async addPhoto(date, previewUrl, childIds): Promise<Photo> {
      const state = dayState(date)
      const row: Photo = {
        id: `pho-${Math.random().toString(36).slice(2, 10)}`,
        date,
        previewUrl,
        childIds,
        // بخش ۵.۵: عکس بدون تگ منتشر نمی‌شود.
        published: childIds.length > 0,
      }
      state.photos.push(row)
      return row
    },

    async setPhotoTags(photoId, childIds): Promise<Photo> {
      for (const state of days.values()) {
        const photo = state.photos.find((p) => p.id === photoId)
        if (photo) {
          photo.childIds = childIds
          photo.published = childIds.length > 0
          return photo
        }
      }
      throw new Error('عکس پیدا نشد')
    },

    async getDaySummary(classId, date): Promise<DaySummary> {
      assertVisible(classId)
      const state = dayState(date)
      const children = CHILDREN.filter((c) => c.classId === classId)

      const complete: string[] = []
      const incomplete: DaySummary['incomplete'] = []

      for (const child of children) {
        const report = state.reports.get(child.id)
        const missing = missingParts(report)
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
        sentAt: state.sentAt,
      }
    },

    async sendReports(classId, date): Promise<number> {
      assertVisible(classId)
      const state = dayState(date)
      if (state.sentAt) throw new Error('گزارش‌های امروز قبلاً فرستاده شده‌اند.')

      state.sentAt = new Date().toISOString()
      return CHILDREN.filter((c) => c.classId === classId).length
    },
  }
}

/**
 * بخش ۵.۹: «کامل» یعنی غذا و خواب و هر سه بازه خلق پر شده باشند.
 * همان تعریفی که تریگر دیتابیس هم به کار می‌برد.
 */
function missingParts(report: DailyReport | undefined): string[] {
  const missing: string[] = []
  if (!report?.lunch) missing.push('ناهار')
  if (!report?.napStart) missing.push('خواب')
  if (!report?.moodMorning || !report?.moodNoon || !report?.moodAfternoon) missing.push('خلق')
  return missing
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
 * نوار گروهی یک انتخاب خلق دارد ولی گزارش سه بازه (بخش ۱۱.۳). انتخاب
 * روی بازه‌ای می‌نشیند که ساعت جاری در آن است، چون «خلق عمومی کلاس»
 * یعنی حال کلاس همین حالا. مرزهای بازه در سند نیامده و اینجا فرض شده.
 */
function moodPatch(mood: DailyReport['moodNoon'], current: DailyReport | undefined) {
  if (!mood) return {}
  const band = currentMoodBand()
  return {
    moodMorning:   band === 'morning'   ? mood : current?.moodMorning   ?? null,
    moodNoon:      band === 'noon'      ? mood : current?.moodNoon      ?? null,
    moodAfternoon: band === 'afternoon' ? mood : current?.moodAfternoon ?? null,
  }
}

export type MoodBand = 'morning' | 'noon' | 'afternoon'

export function currentMoodBand(now: Date = new Date()): MoodBand {
  const hour = now.getHours()
  if (hour < 12) return 'morning'
  if (hour < 15) return 'noon'
  return 'afternoon'
}

/**
 * بخش ۵.۸: پس از ساعت پایان مهد، شمارنده فعال و دقایق تأخیر خودکار ثبت
 * و به صورتحساب اضافه می‌شود. ساعت پایان از تنظیمات مرکز می‌آید؛ تا وصل
 * شدن آن، پیش‌فرض سند به کار می‌رود.
 */
const WORK_END_HOUR = 16
const WORK_END_MINUTE = 30

function lateMinutesAfter(at: Date): number {
  const end = new Date(at)
  end.setHours(WORK_END_HOUR, WORK_END_MINUTE, 0, 0)
  return Math.max(0, Math.round((at.getTime() - end.getTime()) / 60000))
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
