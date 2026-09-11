/**
 * مخزن محلی — فقط برای اجرای بدون سرور.
 *
 * قید مرکز و کلاس اینجا هم دقیقاً مثل مخزن واقعی اعمال می‌شود، تا رفتار
 * دو پیاده‌سازی یکی باشد و صفحه نفهمد با کدام‌یک کار می‌کند.
 */
import type {
  AbsenceNotice,
  AccessScope,
  ReadAuditSink,
  Notice,
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
  GUARDIAN_PHONES,
  seedAbsences,
  seedAttendance,
  seedMedications,
} from './fixture.ts'
import { UNACCOUNTED_AFTER_HOUR } from '../attendanceState.ts'

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
    }
    for (const [date, stored] of Object.entries(payload.days ?? {})) {
      days.set(date, {
        attendance: new Map(stored.attendance),
        absences: stored.absences,
        medications: stored.medications,
        reports: new Map(stored.reports),
        incidents: stored.incidents,
        photos: stored.photos,
        sentAt: stored.sentAt,
      })
    }
    for (const [key, list] of payload.needs ?? []) NEEDS.set(key, list)
    if (payload.codes?.length) {
      PICKUP_CODES.splice(0, PICKUP_CODES.length, ...payload.codes)
    }
  } catch {
    // داده ذخیره‌شده خراب بود. از نمونه تازه شروع می‌کنیم.
  }
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

/** بخش ۱۵.۴: سهمیه پیامک هرگز نامحدود نیست. */
const SMS_ALLOCATED = 500
let smsUsed = 0
const smsRemaining = () => SMS_ALLOCATED - smsUsed

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
        previewUrl,
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
        checkOutAt: attendance?.checkOutAt ?? null,
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
      const now = new Date()
      const present = [...state.attendance.values()].filter(
        (a) => a.checkInAt && !a.checkOutAt,
      ).length

      const absent = new Set(state.absences.map((a) => a.childId))
      const unaccounted = CHILDREN.filter(
        (c) => !state.attendance.get(c.id)?.checkInAt && !absent.has(c.id),
      ).map((c) => ({
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
        // پیش از ساعت نُه، «نیامده» هنوز «بی‌خبر» نیست — بخش ۵.۱.
        unaccounted: now.getHours() >= UNACCOUNTED_AFTER_HOUR ? unaccounted : [],
        pendingIncidents: state.incidents
          .filter((i) => i.requiresApproval)
          .map((i) => ({ ...i, childName: nameOf(i.childId) })),
        classes: CLASSES.map((room) => {
          const kids = CHILDREN.filter((c) => c.classId === room.id)
          const complete = kids.filter(
            (c) => missingParts(state.reports.get(c.id)).length === 0,
          ).length
          return {
            classId: room.id,
            name: room.name,
            complete,
            total: kids.length,
            sent: state.sentAt !== null,
          }
        }),
        smsRemaining: smsRemaining(),
      }
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
      if (input.sendSms) smsUsed += audience.smsNeeded

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
function missingParts(report: DailyReport | undefined): string[] {
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
function moodPatch(mood: DailyReport['moodNoon'], _current: DailyReport | undefined) {
  if (!mood) return {}
  return { moodMorning: mood, moodNoon: mood, moodAfternoon: mood }
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
