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
  DailyReport,
  Guardian,
  MedicationInput,
  MedicationLog,
  ReportPatch,
} from '../types.ts'
import {
  CENTER_ID,
  CHILDREN,
  CLASSES,
  GUARDIANS,
  seedAbsences,
  seedAttendance,
  seedMedications,
} from './fixture.ts'

type DayState = {
  attendance: Map<string, Attendance>
  absences: AbsenceNotice[]
  medications: MedicationLog[]
  reports: Map<string, DailyReport>
}

const days = new Map<string, DayState>()

function dayState(date: string): DayState {
  let state = days.get(date)
  if (!state) {
    state = {
      attendance: new Map(seedAttendance(date).map((row) => [row.childId, row])),
      absences: seedAbsences(date),
      medications: seedMedications(date),
      reports: new Map(),
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
      const next: DailyReport = {
        ...blank(childId, date),
        ...state.reports.get(childId),
        ...patch,
        touched: true,
      }
      state.reports.set(childId, next)
      return next
    },
  }
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

function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
