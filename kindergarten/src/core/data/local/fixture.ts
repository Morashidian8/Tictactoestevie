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
import type {
  AbsenceNotice,
  Attendance,
  Child,
  ClassRoom,
  Guardian,
  MedicationLog,
  PickupOption,
} from '../types.ts'

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

/**
 * تحویل‌گیرندگان مجاز، غیر از سرپرستان — بخش ۵.۸.
 * فقط برای چند کودک تعریف شده تا هر دو حالت آزمودنی باشد: کودکی که
 * فهرستش فقط سرپرست دارد، و کودکی که فرد سوم هم دارد.
 */
export const AUTHORIZED: Record<string, Omit<PickupOption, 'kind'>[]> = {
  'child-1': [
    { id: 'auth-1', fullName: 'زهرا احمدی', relation: 'مادربزرگ', photoUrl: null },
  ],
  'child-3': [
    { id: 'auth-3', fullName: 'فاطمه پارسا', relation: 'مادربزرگ', photoUrl: null },
    { id: 'auth-4', fullName: 'رضا پارسا', relation: 'دایی', photoUrl: null },
  ],
  'child-4': [
    { id: 'auth-2', fullName: 'حسن توکلی', relation: 'عمو', photoUrl: null },
  ],
  'child-6': [
    { id: 'auth-5', fullName: 'سمیرا حسینی', relation: 'خاله', photoUrl: null },
  ],
}

/**
 * کدهای تحویل امروز — بخش ۵.۸.
 * سرپرست از اپ خودش کد می‌گیرد و به فرد می‌دهد. اینجا دو نمونه هست تا
 * مسیر درست و مسیر رد شدن هر دو آزمودنی باشد.
 */
export type PickupCodeEntry = {
  code: string
  childId: string
  date: string
  bearerName: string
  photoUrl: string | null
  usedAt: string | null
}

export const PICKUP_CODES: PickupCodeEntry[] = []

/** کدهای نمونه برای همان روزی که اپ باز می‌شود. */
export function seedPickupCodes(date: string): void {
  if (PICKUP_CODES.some((c) => c.date === date)) return
  PICKUP_CODES.push(
    { code: '4729', childId: 'child-2', date, bearerName: 'راننده سرویس، آقای رستمی', photoUrl: null, usedAt: null },
    { code: '8315', childId: 'child-6', date, bearerName: 'خاله، مریم صادقی', photoUrl: null, usedAt: null },
  )
}

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
    pickedUpById: null,
    pickupMethod: null,
    lateMinutes: 0,
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


/**
 * شماره سرپرست هر کودک — بخش ۱۵.
 *
 * پنل پیامک بدون شماره کار نمی‌کند، پس مهم است که سامانه بتواند نشان
 * دهد شماره کدام خانواده‌ها را ندارد. عمداً دو کودک بدون شماره مانده‌اند
 * تا آن حالت هم دیده شود؛ در مهد واقعی هم همیشه چند خانواده جا می‌مانند.
 */
export const GUARDIAN_PHONES: Record<string, string> = Object.fromEntries(
  CHILDREN.filter((c) => c.id !== 'child-5' && c.id !== 'child-11').map((child, index) => [
    child.id,
    `0912${String(1000000 + index * 37).slice(0, 7)}`,
  ]),
)


/* ── مالی — ماژول M5 ─────────────────────────────────────────── */

/**
 * مبلغ‌ها به ریال‌اند، مثل ستون bigint دیتابیس. تبدیل به تومان کار
 * لایه i18n است تا هیچ‌جای دیگری تقسیم بر ده نکند.
 */
export const FEE_PLANS = [
  { id: 'plan-full', title: 'تمام‌وقت', amount: 45_000_000, period: 'monthly' as const, active: true },
  { id: 'plan-half', title: 'نیمه‌وقت', amount: 28_000_000, period: 'monthly' as const, active: true },
]

/** کدام کودک کدام پلن را دارد، و تخفیف خواهر و برادر. */
export const CHILD_FEES: Record<string, { planId: string; discountPercent: number }> =
  Object.fromEntries(
    CHILDREN.map((child, index) => [
      child.id,
      {
        planId: index % 4 === 0 ? 'plan-half' : 'plan-full',
        // بخش ۸: تخفیف خواهر و برادر. سارا و هستی یک خانواده‌اند.
        discountPercent: child.id === 'child-9' ? 15 : 0,
      },
    ]),
  )

/** سرپرست پرداخت‌کننده هر کودک — بخش ۶.۵. فقط او مالی را می‌بیند. */
export const PAYER: Record<string, string> = Object.fromEntries(
  CHILDREN.map((child) => [child.id, `${child.id}-g1`]),
)

/* ── پرونده پزشکی — بخش ۷.۱ ──────────────────────────────────── */

export const MEDICAL: Record<string, {
  bloodType: string | null
  allergies: string[]
  chronicConditions: string | null
  dailyMedication: string | null
  doctorName: string | null
  doctorPhone: string | null
}> = {
  'child-1': {
    bloodType: 'O+',
    allergies: ['تخم‌مرغ', 'بادام‌زمینی'],
    chronicConditions: null,
    dailyMedication: null,
    doctorName: 'دکتر نادری',
    doctorPhone: '02188001122',
  },
  'child-3': {
    bloodType: 'A-',
    allergies: ['شیر گاو'],
    chronicConditions: 'آسم خفیف',
    dailyMedication: 'اسپری در صورت نیاز',
    doctorName: 'دکتر رحیمی',
    doctorPhone: '02188003344',
  },
  'child-7': {
    bloodType: 'B+',
    allergies: [],
    chronicConditions: null,
    dailyMedication: null,
    doctorName: null,
    doctorPhone: null,
  },
}

export const CONSENTS: Record<string, string[]> = {
  'child-1': ['photo_capture', 'emergency_care'],
  'child-3': ['photo_capture', 'photo_group_publish', 'emergency_care', 'medication'],
  'child-9': ['photo_capture'],
}
