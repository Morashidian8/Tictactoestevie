/** انواع دامنه. آینه شِمای دیتابیس، فقط برای بخش‌هایی که ساخته شده‌اند. */

export type AccountRole = 'manager' | 'teacher' | 'assistant' | 'guardian' | 'platform_admin'

export type ArrivalCondition = 'normal' | 'fever_or_cold' | 'scratch_or_bruise' | 'restless'

export type Mood = 'good' | 'normal' | 'restless' | 'sad'

export type PickupMethod = 'guardian' | 'authorized' | 'code'

export type Center = {
  id: string
  name: string
  workStart: string
  workEnd: string
}

export type ClassRoom = {
  id: string
  centerId: string
  name: string
}

export type Child = {
  id: string
  classId: string | null
  firstName: string
  lastName: string
  photoUrl: string | null
}

export type Guardian = {
  id: string
  fullName: string
  relation: string | null
  canPickup: boolean
}

/** ردیف حضور یک کودک در یک روز. */
export type Attendance = {
  childId: string
  date: string
  checkInAt: string | null
  checkOutAt: string | null
  droppedByGuardianId: string | null
  arrivalCondition: ArrivalCondition
  arrivalPhotoUrl: string | null
}

export type AbsenceNotice = {
  childId: string
  date: string
  reason: string | null
}

/** داروی امروز. تا وقتی givenAt پر نشده، مربی یادآور می‌بیند. */
export type MedicationLog = {
  id: string
  childId: string
  date: string
  name: string
  dose: string | null
  scheduledTime: string | null
  givenAt: string | null
}

/**
 * دامنه دسترسی نشست.
 *
 * بند ۱۱.۱۰: «همه پرس‌وجوها باید به center_id محدود شوند. این قید در لایه
 * دسترسی به داده اعمال شود، نه در هر کوئری جداگانه.»
 *
 * هیچ متد مخزنی center_id نمی‌گیرد. مخزن با این دامنه ساخته می‌شود و قید
 * را خودش می‌بندد، پس فراموش‌کردنش در یک کوئری ممکن نیست.
 */
export type AccessScope = {
  accountId: string
  centerId: string
  role: AccountRole
  /** کلاس‌های تخصیص‌یافته. برای مدیر خالی است، چون به همه کلاس‌ها دسترسی دارد. */
  classIds: string[]
}

/** ثبت ورود سریع، بخش ۵.۳: ساعت جاری، آورنده پیش‌فرض، وضعیت عادی. */
export type CheckInInput = {
  childId: string
  at: Date
  droppedByGuardianId?: string | null
  arrivalCondition?: ArrivalCondition
  arrivalPhotoUrl?: string | null
}

/** نمای یک روز از یک کلاس، همان چیزی که صفحه «امروز» لازم دارد. */
export type ClassDay = {
  classRoom: ClassRoom
  children: Child[]
  attendance: Attendance[]
  absences: AbsenceNotice[]
  medications: MedicationLog[]
}

export interface DataAccess {
  readonly scope: AccessScope
  /** کلاس‌هایی که این حساب می‌بیند. */
  listClasses(): Promise<ClassRoom[]>
  getClassDay(classId: string, date: string): Promise<ClassDay>
  listGuardians(childId: string): Promise<Guardian[]>
  checkIn(input: CheckInInput): Promise<Attendance>
}
