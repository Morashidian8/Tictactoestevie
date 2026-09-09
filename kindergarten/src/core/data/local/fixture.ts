/**
 * داده نمونه محلی — فقط برای اجرای بدون سرور.
 *
 * این داده ساختگی نیست به معنایی که سند منع کرده. سند می‌گوید برای
 * بخش‌هایی که ساخته نشده‌اند داده جعلی نسازید. اینجا فقط یک کلاس واقعی
 * برای همان یک صفحه‌ای است که ساخته شده، تا پیش از برپا شدن Supabase
 * بتوان صفحه را باز کرد و لمس کرد.
 *
 * هیچ‌کدام از این‌ها در ساخت تولید بارگذاری نمی‌شود.
 */
import type { AbsenceNotice, Attendance, Child, ClassRoom, Guardian, MedicationLog } from '../types.ts'

export const CENTER_ID = 'centre-aftab'

export const CLASSES: ClassRoom[] = [
  { id: 'class-golha', centerId: CENTER_ID, name: 'گل‌ها' },
  { id: 'class-setareha', centerId: CENTER_ID, name: 'ستاره‌ها' },
]

const names: [string, string][] = [
  ['سارا', 'احمدی'], ['امیر', 'بیات'], ['نگین', 'پارسا'], ['پارسا', 'توکلی'],
  ['آوا', 'جعفری'], ['رضا', 'حسینی'], ['کیان', 'خانی'], ['مریم', 'داوری'],
  ['هستی', 'رضایی'], ['بردیا', 'زارع'], ['ترمه', 'سعیدی'], ['یاسین', 'شریفی'],
  ['نیکا', 'صادقی'], ['آرش', 'طاهری'], ['رها', 'عباسی'], ['سام', 'فرهادی'],
  ['ملینا', 'قاسمی'], ['کوروش', 'کاظمی'], ['دیانا', 'گودرزی'], ['بنیامین', 'لطفی'],
  ['ویانا', 'محمدی'], ['آریا', 'نادری'], ['سوگند', 'هاشمی'], ['رادین', 'یزدانی'],
  ['هلیا', 'امینی'],
]

export const CHILDREN: Child[] = names.map(([first, last], index) => ({
  id: `child-${index + 1}`,
  classId: index < 25 ? 'class-golha' : 'class-setareha',
  firstName: first,
  lastName: last,
  photoUrl: null,
}))

// کلاس دوم هم چند کودک دارد تا کلید تعویض کلاس معنا پیدا کند.
CHILDREN.push(
  { id: 'child-26', classId: 'class-setareha', firstName: 'ایلیا', lastName: 'وحیدی', photoUrl: null },
  { id: 'child-27', classId: 'class-setareha', firstName: 'باران', lastName: 'کریمی', photoUrl: null },
)

export const GUARDIANS: Record<string, Guardian[]> = Object.fromEntries(
  CHILDREN.map((child) => [
    child.id,
    [
      { id: `${child.id}-g1`, fullName: 'مادر', relation: 'مادر', canPickup: true },
      { id: `${child.id}-g2`, fullName: 'پدر', relation: 'پدر', canPickup: true },
    ],
  ]),
)

/** وضعیت شروع روز: چند کودک آمده‌اند، چند نفر غیبتشان اعلام شده. */
export function seedAttendance(date: string): Attendance[] {
  const arrived: [string, string][] = [
    ['child-1', '08:05'], ['child-2', '08:12'], ['child-4', '08:20'],
    ['child-6', '08:31'], ['child-7', '07:58'], ['child-9', '08:15'],
    ['child-10', '08:22'], ['child-12', '08:03'],
  ]
  return arrived.map(([childId, time]) => ({
    childId,
    date,
    checkInAt: `${date}T${time}:00`,
    checkOutAt: null,
    droppedByGuardianId: `${childId}-g1`,
    arrivalCondition: 'normal' as const,
    arrivalPhotoUrl: null,
  }))
}

export function seedAbsences(date: string): AbsenceNotice[] {
  return [
    { childId: 'child-3', date, reason: 'سرماخوردگی' },
    { childId: 'child-5', date, reason: 'سفر خانوادگی' },
    { childId: 'child-8', date, reason: null },
  ]
}

export function seedMedications(date: string): MedicationLog[] {
  return [
    {
      id: 'med-1',
      childId: 'child-2',
      date,
      name: 'شربت سرماخوردگی',
      dose: 'یک قاشق',
      scheduledTime: '12:00',
      givenAt: null,
    },
  ]
}
