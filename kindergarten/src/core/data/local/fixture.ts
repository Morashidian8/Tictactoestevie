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
  DayPeriod,
  Enrollment,
  StaffShift,
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

/*
 * عکس کودکان نمونه — بیست چهره ساختگی در public/faces.
 *
 * نگاشت دستی است و ترتیبی نیست: چهره‌های ورق اصلی به ترتیب پسر و دختر
 * یک‌درمیان‌اند و نام‌های نمونه نیستند، پس نگاشت ساده «کودک n به عکس n»
 * نگین را پسر و امیر را دختر می‌کرد. برای مربی ایرانی این یعنی داده
 * نمونه بی‌دقت است، و اولین چیزی است که به چشمش می‌آید.
 *
 * پنج کودک آخر عمداً عکس ندارند و همان چهره کشیده‌شده AvatarFace را
 * می‌گیرند؛ مهد واقعی هم هرگز عکس همه را ندارد و صفحه باید هر دو حالت
 * را نشان بدهد.
 *
 * BASE_URL از Vite می‌آید تا زیر زیرپوشه سایت هم نشانی درست بماند.
 */
const FACES: Record<string, number> = {
  // دخترها: چهره‌های ۲، ۴، ۶، ۸، ۱۰، ۱۲، ۱۴، ۱۶، ۱۸، ۲۰
  'child-1': 2,   // سارا
  'child-3': 4,   // نگین
  'child-5': 6,   // آوا
  'child-8': 8,   // مریم
  'child-9': 10,  // هستی
  'child-11': 12, // ترمه
  'child-13': 14, // نیکا
  'child-15': 16, // رها
  'child-17': 18, // ملینا
  'child-19': 20, // دیانا
  // پسرها: چهره‌های ۱، ۳، ۵، ۷، ۹، ۱۱، ۱۳، ۱۵، ۱۷، ۱۹
  'child-2': 1,   // امیر
  'child-4': 3,   // پارسا
  'child-6': 5,   // رضا
  'child-7': 7,   // کیان
  'child-10': 9,  // بردیا
  'child-12': 11, // یاسین
  'child-14': 13, // آرش
  'child-16': 15, // سام
  'child-18': 17, // کوروش
  'child-20': 19, // بنیامین
}

/*
 * عکس‌ها از ماژول خوانده می‌شوند، نه از public.
 *
 * در public می‌ماندند و Vite بی‌قید و شرط کپی‌شان می‌کرد، یعنی بیست عکس
 * کودکِ نمونه وارد بیلد تولید هم می‌شد. از این‌جا بخشی از گراف ماژول‌اند
 * و با همین فایل از بیلد تولید بیرون می‌مانند — همان قاعده‌ای که
 * build.test.ts می‌سنجد. نشانی هم خودکار زیر هر base path درست می‌ماند.
 */
const FACE_URLS = import.meta.glob<string>('./faces/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
})

const faceOf = (id: string): string | null => {
  const n = FACES[id]
  return n ? (FACE_URLS[`./faces/child-${n}.webp`] ?? null) : null
}

/**
 * تاریخ تولد نمونه.
 *
 * مهدی که فقط چهارساله داشته باشد، رابط را امتحان نمی‌کند: سن باید از
 * سه تا شش پخش باشد تا هم متن «۳ سال و ۱۱ ماه» و هم «۶ سال» دیده شوند.
 * پخش‌کردن از روی شاخص است، نه تصادفی، تا نسخه نمایشی هر بار یکی باشد.
 */
/*
 * تاریخ تولد هر کودک.
 *
 * سن بین سه تا شش سال پخش می‌شود، و روزِ تولد عمداً روی تمام سال
 * پخش **نمی‌شود**: چهار کودک اول تولدشان در همین هفته پیشِ رو می‌افتد
 * (یکی فردا، یکی امروز) وگرنه در نسخهٔ نمایشی «تولدهای پیش رو» همیشه
 * خالی دیده می‌شود و کسی نمی‌فهمد این قابلیت هست.
 *
 * ماه و روز از امروز حساب می‌شود، نه ثابت: داده‌ای که به تاریخِ نوشته
 * شدنش گره بخورد، شش ماه بعد دوباره خالی است.
 */
const SOON = [1, 0, 3, 6] as const

const birthOf = (index: number): string => {
  const months = 36 + ((index * 7) % 36)
  const born = new Date()
  born.setMonth(born.getMonth() - months)
  const soon = SOON[index]
  if (soon !== undefined) {
    // همان سال تولد، ولی ماه و روزش را به روزهای پیشِ رو می‌بریم.
    const target = new Date()
    target.setDate(target.getDate() + soon)
    born.setMonth(target.getMonth(), target.getDate())
  } else {
    born.setDate(1 + ((index * 3) % 27))
  }
  return toIsoDay(born)
}

/** روزِ محلی. `toISOString` شب‌ها یک روز عقب می‌افتد. */
const toIsoDay = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`

export const CHILDREN: Child[] = names.map(([first, last], index) => ({
  id: `child-${index + 1}`,
  classId: index < 25 ? 'class-golha' : 'class-setareha',
  firstName: first,
  lastName: last,
  photoUrl: faceOf(`child-${index + 1}`),
  birthDate: birthOf(index),
}))

// کلاس دوم هم چند کودک دارد تا کلید تعویض کلاس معنا پیدا کند.
CHILDREN.push(
  { id: 'child-26', classId: 'class-setareha', firstName: 'ایلیا', lastName: 'وحیدی', photoUrl: null, birthDate: birthOf(25) },
  { id: 'child-27', classId: 'class-setareha', firstName: 'باران', lastName: 'کریمی', photoUrl: null, birthDate: birthOf(26) },
)

/**
 * سرپرستان هر کودک. نام واقعی می‌گیرند، نه «مادر» و «پدر»: در پرونده
 * کودک نام و نسبت کنار هم می‌نشینند و «مادر مادر» خوانده نمی‌شود.
 * نام خانوادگی از خود کودک می‌آید تا خانواده یکدست به نظر برسد.
 */
const MOTHER_NAMES = ['مریم', 'زهرا', 'فاطمه', 'سمیرا', 'نرگس', 'الهام', 'شیوا']
const FATHER_NAMES = ['علی', 'محمد', 'حسین', 'رضا', 'امیر', 'سعید', 'بهرام']

export const GUARDIANS: Record<string, Guardian[]> = Object.fromEntries(
  CHILDREN.map((child, index) => [
    child.id,
    [
      {
        id: `${child.id}-g1`,
        fullName: `${MOTHER_NAMES[index % MOTHER_NAMES.length]} ${child.lastName}`,
        relation: 'مادر',
        canPickup: true,
      },
      {
        id: `${child.id}-g2`,
        fullName: `${FATHER_NAMES[index % FATHER_NAMES.length]} ${child.lastName}`,
        relation: 'پدر',
        canPickup: true,
      },
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

/**
 * وضعیت شروع روز: **هیچ کودکی وارد نشده**.
 *
 * نسخه اول هشت کودک را از پیش وارد نشان می‌داد تا صفحه پر دیده شود.
 * ولی حضور، چیزی است که مربی یکی‌یکی ثبت می‌کند؛ نمایشِ ورودی که کسی
 * ثبت نکرده، همان دروغی است که سامانه حضور نباید بگوید. روز با فهرست
 * خالی شروع می‌شود و هر ورود، ثبت خودش را می‌خواهد.
 *
 * غیبت‌های اعلام‌شده (seedAbsences) می‌مانند، چون آن‌ها را خانواده
 * اعلام کرده است، نه سامانه.
 */
export function seedAttendance(date: string): Attendance[] {
  void date
  return []
}

export function seedAbsences(date: string): AbsenceNotice[] {
  return [
    { childId: 'child-3', date, reason: 'سرماخوردگی' },
    { childId: 'child-5', date, reason: 'سفر خانوادگی' },
    { childId: 'child-8', date, reason: null },
  ]
}

/**
 * دارو، **از پیش هیچ**.
 *
 * دارو فقط وقتی در برنامه روز می‌آید که سرپرست ثبتش کرده باشد
 * (requestMedication ← receiveMedication). یک شربت پیش‌فرض یعنی مربی
 * یادآوریِ دارویی را می‌بیند که هیچ خانواده‌ای نخواسته — و همان ابتدای
 * کار به یادآوری‌های دارو بی‌اعتماد می‌شود.
 */
export function seedMedications(date: string): MedicationLog[] {
  void date
  return []
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

/**
 * وضعیت واکسیناسیون و کد ملی — ارتقای ۲ سند بررسی طراحی.
 *
 * عمداً ناقص است: مهد واقعی هم پرونده همه کودکان را کامل ندارد، و نمای
 * آمادگی بازرسی تا وقتی همه‌چیز کامل باشد هیچ کاری نمی‌کند.
 */
export const VACCINATION: Record<string, 'complete' | 'incomplete' | 'unrecorded'> =
  Object.fromEntries(
    CHILDREN.map((child, index) => [
      child.id,
      index % 7 === 3 ? 'incomplete' : index % 11 === 5 ? 'unrecorded' : 'complete',
    ]),
  )

export const NATIONAL_IDS: Record<string, string> = Object.fromEntries(
  CHILDREN.filter((_, index) => index % 9 !== 4).map((child, index) => [
    child.id,
    `00${String(12345670 + index).padStart(8, '0')}`,
  ]),
)

/**
 * کارت بهداشت مربیان.
 *
 * یکی عمداً نزدیک انقضاست و یکی ثبت‌نشده: مدیر باید ببیند نمای آمادگی
 * وقتی کار دارد چه شکلی است، نه فقط وقتی همه‌چیز سبز است.
 */
export const HEALTH_CARDS: Record<
  string,
  { number: string | null; issuedAt: string | null; expiresAt: string | null }
> = {
  'staff-zahra': { number: 'HC-1041', issuedAt: '1404-02-10', expiresAt: '1405-02-10' },
  'staff-maryam': { number: 'HC-1042', issuedAt: '1403-12-01', expiresAt: '1404-12-01' },
  'staff-nasrin': { number: 'HC-1043', issuedAt: '1404-06-20', expiresAt: '1405-06-20' },
  'staff-elham': { number: null, issuedAt: null, expiresAt: null },
}

export const CONSENTS: Record<string, string[]> = {
  'child-1': ['photo_capture', 'emergency_care'],
  'child-3': ['photo_capture', 'photo_group_publish', 'emergency_care', 'medication'],
  'child-9': ['photo_capture'],
}


/* ── بازه روز، دوره حضور، و شیفت مربی ────────────────────────── */

/**
 * دو بازه پیش‌فرض. مرز پایان ناهار است و مهد می‌تواند جابه‌جایش کند.
 *
 * ناهار عمداً در هیچ بازه‌ای نیست: طبق تصمیم مالک محصول برای همه کودکان
 * است. خواب در بعدازظهر است چون کودکی که بعد از ناهار می‌رود نمی‌خوابد.
 */
export const DAY_PERIODS: DayPeriod[] = [
  {
    id: 'period-morning',
    key: 'morning',
    title: 'صبح',
    startTime: '07:30',
    endTime: '13:00',
    sortOrder: 1,
    reportFields: ['mood_morning', 'mood_noon'],
    includedIn: ['morning', 'full_day'],
  },
  {
    id: 'period-afternoon',
    key: 'afternoon',
    title: 'بعدازظهر',
    startTime: '13:00',
    endTime: '16:30',
    sortOrder: 2,
    reportFields: ['nap', 'mood_afternoon'],
    includedIn: ['afternoon', 'full_day'],
  },
]

/**
 * دوره حضور هر کودک.
 *
 * عمداً هر سه نوع در داده نمونه هست، وگرنه هیچ‌کدام از قاعده‌های تازه
 * در نسخه نمایشی دیده نمی‌شوند. چند کودک هم سه‌روزه‌اند.
 */
const MORNING_ONLY = new Set(['child-3', 'child-7', 'child-11', 'child-15', 'child-19'])
const AFTERNOON_ONLY = new Set(['child-4', 'child-8', 'child-12', 'child-16', 'child-20'])
const THREE_DAYS = new Set(['child-5', 'child-13'])

export const ENROLLMENTS: Enrollment[] = CHILDREN.filter((c) => c.classId).map((child) => ({
  id: `enr-${child.id}`,
  childId: child.id,
  classId: child.classId!,
  startDate: '1404-01-01',
  endDate: null,
  attendanceType: MORNING_ONLY.has(child.id)
    ? 'morning'
    : AFTERNOON_ONLY.has(child.id)
      ? 'afternoon'
      : 'full_day',
  weekdays: THREE_DAYS.has(child.id) ? [0, 2, 4] : [0, 1, 2, 3, 4],
  feePlanId: CHILD_FEES[child.id]?.planId ?? null,
  discountPercent: CHILD_FEES[child.id]?.discountPercent ?? 0,
}))

/**
 * شیفت چهار مربی.
 *
 * عمداً هر سه الگو هست: تمام‌روز، تا ظهر، و از ظهر. همپوشانی صبح هم
 * هست تا حالت «بیش از یک مربی سر کار» دیده شود.
 */
const SHIFT_PLAN: [string, string, string, string][] = [
  // شناسه، کلاس، شروع، پایان
  ['staff-zahra', 'class-golha', '07:30', '16:30'],
  ['staff-maryam', 'class-golha', '07:30', '13:00'],
  ['staff-nasrin', 'class-golha', '12:30', '16:30'],
  ['staff-elham', 'class-setareha', '07:30', '16:30'],
]

export const STAFF_NAMES: Record<string, string> = {
  'staff-zahra': 'زهرا محمدی',
  'staff-maryam': 'مریم رضایی',
  'staff-nasrin': 'نسرین کاظمی',
  'staff-elham': 'الهام نوری',
}

export const STAFF_SHIFTS: StaffShift[] = SHIFT_PLAN.flatMap(
  ([staffId, classId, start, end]) =>
    [0, 1, 2, 3, 4].map((weekday) => ({
      id: `shift-${staffId}-${weekday}`,
      staffId,
      classId,
      weekday,
      startTime: start,
      endTime: end,
      effectiveFrom: '1404-01-01',
      effectiveTo: null,
    })),
)
