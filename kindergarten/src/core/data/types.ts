/** انواع دامنه. آینه شِمای دیتابیس، فقط برای بخش‌هایی که ساخته شده‌اند. */
import type { SessionPhase } from './periods.ts'

export type { SessionPhase }

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
  /** چه کسی تحویل گرفت. برای روش code خالی است و نامش در کد ثبت شده. */
  pickedUpById: string | null
  pickupMethod: PickupMethod | null
  /** مربی‌ای که کودک را تحویل گرفت. به سرپرست هم نشان داده می‌شود. */
  checkedInByName: string | null
  /** مربی‌ای که کودک را تحویل داد. */
  checkedOutByName: string | null
  /** بخش ۵.۸: دقایق تأخیر پس از ساعت پایان مهد، خودکار. */
  lateMinutes: number
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
  /** اگر از درخواست خانواده آمده، شناسه‌اش. مربی باید بداند از کجاست. */
  requestId?: string | null
}

/**
 * درخواست مصرف دارو از سمت خانواده — ارتقای ۳ سند بررسی طراحی.
 *
 * قاعده ایمنی که کل این نوع بر آن سوار است:
 * **درخواست والد به‌تنهایی مجوز دادن دارو نیست.**
 *
 * والد می‌تواند فرم را پر کند و شیشه دارو را در خانه جا بگذارد. پس تا
 * `receivedAt` پر نشده، مربی نمی‌تواند «داده شد» بزند — نه در رابط، نه
 * در پایگاه داده.
 */
export type MedicationRequest = {
  id: string
  childId: string
  name: string
  dose: string
  /** می‌تواند بیش از یکی باشد. */
  times: string[]
  fromDate: string
  toDate: string
  note: string | null
  announcedAt: string
  /** نام سرپرستی که اعلام کرده، برای مربی. */
  announcedByName: string | null
  /** مربی شیشه دارو را واقعاً گرفت. تا پر نشدن، خوراندن ممکن نیست. */
  receivedAt: string | null
  receivedByName: string | null
  cancelledAt: string | null
}

export type MedicationRequestInput = {
  childId: string
  name: string
  dose: string
  times: string[]
  fromDate: string
  toDate: string
  note?: string | null
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
  /**
   * فقط کودکانی که در همین لحظه در جلسه‌اند.
   *
   * پیش‌تر کل کلاس بود و مربی صبح، کودکان بعدازظهری را هم می‌دید.
   */
  children: ChildInSession[]
  /**
   * شمار کودکانی که امروز روزشان هست، چه در این لحظه در جلسه باشند چه نه.
   *
   * جدا از children لازم است: کودک صبحانه‌ای ساعت ۱۵ در جلسه نیست ولی
   * امروز آمده بود. شمارش پایان روز و آمار مدیر باید او را ببینند.
   */
  enrolledToday: number
  /** بازه‌های این مرکز، برای ساختن رابط بدون فرض تعداد. */
  periods: DayPeriod[]
  /** بازه یا بازه‌های همین لحظه. در مرز می‌تواند بیش از یکی باشد. */
  currentPeriods: DayPeriod[]
  /**
   * بازه‌ای که پنجره انتقالش باز است ولی هنوز شروع نشده.
   *
   * نوار بازه و بنر موقت نامش را می‌گویند. null یعنی پنجره‌ای باز نیست.
   */
  upcomingPeriod: DayPeriod | null
  /** نسبت مربی به کودک در همین لحظه — بخش ۷.۲. */
  ratio: StaffRatio
  attendance: Attendance[]
  absences: AbsenceNotice[]
  medications: MedicationLog[]
  /** درخواست‌های دارویی که خانواده برای امروز اعلام کرده — ارتقای ۳. */
  medicationRequests: MedicationRequest[]
  reports: DailyReport[]
  incidents: Incident[]
  photos: Photo[]
}

export type MealAmount = 'all' | 'most' | 'little' | 'none'

/** گزارش روزانه یک کودک — بخش ۱۱.۳. */
export type DailyReport = {
  childId: string
  date: string
  lunch: MealAmount | null
  napStart: string | null
  moodMorning: Mood | null
  moodNoon: Mood | null
  moodAfternoon: Mood | null
  teacherNote: string | null
  /**
   * مربی این کودک را جدا دست زده است، پس ثبت گروهی رویش نمی‌نشیند.
   * بخش ۵.۵: «هر کودکی که دست‌نخورده بماند، مقدار گروهی برایش ثبت می‌شود.»
   */
  touched: boolean
}

/** مقادیری که ثبت گروهی روی کل کلاس می‌نشاند — بخش ۵.۵. */
export type BulkValues = {
  lunch: MealAmount | null
  mood: Mood | null
  napStart: string | null
}

/** تغییری که روی یک کودک به‌تنهایی اعمال می‌شود. */
export type ReportPatch = Partial<
  Pick<DailyReport, 'lunch' | 'napStart' | 'moodMorning' | 'moodNoon' | 'moodAfternoon' | 'teacherNote'>
>

/**
 * روز کودک، همان‌طور که خانواده می‌بیند — بخش ۶.۳ سند.
 *
 * ترتیب فیلدها ترتیب اهمیت در صفحه است، و آن ترتیب تصادفی نیست: «عکس‌های
 * امروز، تنها چیزی است که والد واقعاً برایش می‌آید».
 *
 * آنچه عمداً اینجا نیست: فهرست فعالیت‌ها، درصد، نمودار، و هر مقایسه‌ای با
 * کودکان دیگر. بند ۱۰.۱ مقایسه در خروجی خانواده را ممنوع کرده.
 */
export type ParentDay = {
  child: Child
  date: string
  /**
   * گزارش تا وقتی فرستاده نشده به خانواده نمی‌رسد — بخش ۵.۹.
   * تا آن موقع خانواده فقط ورود و خروج را می‌بیند.
   */
  sent: boolean
  checkInAt: string | null
  droppedByName: string | null
  /** مربی‌ای که کودک را تحویل گرفت — خواسته سرپرستان. */
  checkedInByName: string | null
  checkOutAt: string | null
  pickedUpByName: string | null
  /** مربی‌ای که کودک را تحویل داد. */
  checkedOutByName: string | null
  lunch: MealAmount | null
  napMinutes: number | null
  moodMorning: Mood | null
  moodNoon: Mood | null
  moodAfternoon: Mood | null
  teacherNote: string | null
  needsFromHome: { id: string; text: string; done: boolean }[]
  /** اصلاحیه‌های پس از ارسال — بخش ۵.۹. جدا از متن اصلی. */
  amendments: Amendment[]
  /** فقط عکس‌هایی که این کودک در آن‌ها تگ خورده — بخش ۶.۶. */
  photos: Photo[]
  /**
   * رویدادهایی که خانواده حق دیدنشان را دارد: جزئی مستقیم، و متوسط یا
   * بالا فقط پس از تأیید مدیر — بخش ۳.۳ قاعده دوم.
   */
  incidents: Incident[]
}

/**
 * خلاصه پایان روز — بخش ۵.۹ سند.
 *
 * «تعداد گزارش‌های کامل و ناقص، با فهرست ناقص‌ها؛ عکس‌های بدون تگ؛
 * کودکان بدون یادداشت در این هفته.»
 */
export type DaySummary = {
  complete: string[]
  /** ناقص، به‌علاوه اینکه چه چیزی کم دارد. */
  incomplete: { childId: string; missing: string[] }[]
  untaggedPhotos: number
  /** کودکانی که این هفته هیچ یادداشتی نگرفته‌اند. */
  withoutNoteThisWeek: string[]
  /**
   * نام کوچک هر کودکی که در این خلاصه شمرده شده.
   *
   * صفحه بستن روز نمی‌تواند نام‌ها را از ClassDay بگیرد: آن فقط کودکانِ
   * همین لحظه را دارد و ساعت ۱۶:۳۰ کودک صبحانه‌ای رفته است. بدون این،
   * فهرست ناقص‌ها نامِ خالی نشان می‌داد.
   */
  names: Record<string, string>
  /** اگر گزارش‌های امروز فرستاده شده‌اند، زمانش. */
  sentAt: string | null
}

/** کسی که مجاز است کودک را تحویل بگیرد — بخش ۵.۸. */
export type PickupOption = {
  id: string
  fullName: string
  relation: string | null
  photoUrl: string | null
  /** سرپرست یا تحویل‌گیرنده مجاز. روش ثبت خروج از همین می‌آید. */
  kind: 'guardian' | 'authorized'
}

export type CheckOutInput = {
  childId: string
  at: Date
  method: PickupMethod
  /** برای روش guardian و authorized. */
  personId?: string | null
  /** برای روش code. */
  code?: string | null
}

/** نتیجه بررسی کد تحویل — بخش ۵.۸. */
export type PickupCodeCheck = {
  valid: boolean
  bearerName: string | null
  photoUrl: string | null
  /** چرا رد شد. برای پیامی که به مربی نشان داده می‌شود. */
  reason: 'ok' | 'unknown' | 'used' | 'wrong_day' | 'other_child'
}

export type IncidentType = 'fall' | 'conflict' | 'bite' | 'fever' | 'vomit' | 'other'
export type IncidentSeverity = 'minor' | 'notify_parent' | 'medical_attention'
export type IncidentLocation = 'classroom' | 'yard' | 'kitchen' | 'restroom' | 'stairs' | 'other'
export type MinorCategory = 'fall_no_injury' | 'surface_scratch' | 'verbal_dispute' | 'food_spill'

export type IncidentInput = {
  childId: string
  occurredAt: Date
  type: IncidentType
  severity: IncidentSeverity
  location: IncidentLocation
  minorCategory?: MinorCategory | null
  description: string
  actionTaken: string
  hasPhoto?: boolean
  headOrFace?: boolean
  otherChildId?: string | null
}

export type Incident = {
  id: string
  childId: string
  occurredAt: string
  type: IncidentType
  severity: IncidentSeverity
  location: IncidentLocation
  description: string
  /** اگر شدت خودکار بالا رفته، دلیلش. */
  escalationReason: 'photo_attached' | 'head_or_face' | 'repeated_7d' | null
  requiresApproval: boolean
}

/** عکسی که به کودکان تگ خورده — بخش ۵.۵ و ۶.۶. */
export type Photo = {
  id: string
  date: string
  previewUrl: string
  childIds: string[]
  published: boolean
}

/** دارویی که سرپرست صبح تحویل داده — بخش ۵.۳. */
export type MedicationInput = {
  childId: string
  date: string
  name: string
  dose?: string | null
  scheduledTime?: string | null
  handedByGuardianId?: string | null
}

/* ── اعلام پرداخت خانواده — بخش ۸ ───────────────────────────── */

export type ClaimStatus = 'pending' | 'approved' | 'rejected'

/**
 * خانواده می‌گوید «پرداخت کردم» و رسید می‌گذارد. این هنوز پرداخت نیست.
 *
 * تا مدیر رسید را ندیده و تأیید نکرده، هیچ ریالی در دفتر مالی ثبت
 * نمی‌شود؛ وگرنه هر خانواده‌ای می‌توانست بدهی خودش را صفر کند.
 */
export type PaymentClaim = {
  id: string
  invoiceId: string
  childId: string
  childName: string
  period: string
  amount: number
  receiptUrl: string | null
  note: string | null
  status: ClaimStatus
  declaredAt: string
  rejectReason: string | null
}

export type PaymentClaimInput = {
  invoiceId: string
  amount: number
  /** عکس رسید. تا وصل شدن استوریج، نشانی محلی مرورگر است. */
  receiptUrl?: string | null
  note?: string | null
}

/* ── اصلاحیه پس از قفل شدن گزارش — بخش ۵.۹ ──────────────────── */

/**
 * پس از ارسال، گزارش قفل است و تغییر فقط به شکل اصلاحیه ثبت می‌شود.
 * سرپرست اصلاحیه را جدا می‌بیند، نه به‌جای متن اصلی.
 */
export type Amendment = {
  id: string
  childId: string
  date: string
  text: string
  createdAt: string
}

/* ── مالی — بخش ۸ و ماژول M5 ────────────────────────────────── */

export type FeePeriod = 'monthly' | 'termly' | 'yearly'
export type InvoiceStatus = 'issued' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled'

export type FeePlan = {
  id: string
  title: string
  /** به ریال. نمایش به تومان کار لایه i18n است، نه لایه داده. */
  amount: number
  period: FeePeriod
  active: boolean
  childCount: number
}

export type Invoice = {
  id: string
  childId: string
  childName: string
  /** دوره به شکل «۱۴۰۵-۰۶». */
  period: string
  amount: number
  discount: number
  lateFee: number
  paid: number
  dueDate: string
  status: InvoiceStatus
}

export type Payment = {
  id: string
  invoiceId: string
  amount: number
  paidAt: string
  method: string | null
  receiptNo: string | null
}

/**
 * نمای مالی مدیر — بخش ۸.
 *
 * آنچه عمداً اینجا نیست: درآمد در برابر هزینه، و هر تحلیل مالی دیگری.
 * فاز ۳ سند است.
 */
export type FinanceOverview = {
  period: string
  issued: number
  collected: number
  outstanding: number
  overdue: Invoice[]
  unpaid: Invoice[]
  plans: FeePlan[]
}

export type PaymentInput = {
  invoiceId: string
  amount: number
  method?: string | null
  receiptNo?: string | null
}

/** نمای مالی خانواده. فقط سرپرست پرداخت‌کننده — بخش ۶.۵. */
export type ParentFinance = {
  /** اگر این حساب پرداخت‌کننده نیست، false و بقیه خالی است. */
  isPayer: boolean
  invoices: Invoice[]
  payments: Payment[]
  /** اعلام‌های خودش، تا بداند کدامشان هنوز منتظر تأیید مدیر است. */
  claims: PaymentClaim[]
  outstanding: number
}

/* ── پرونده کودک — ماژول M1 ─────────────────────────────────── */

export type ConsentType =
  | 'photo_capture'
  | 'photo_group_publish'
  | 'field_trip'
  | 'medication'
  | 'emergency_care'

export type MedicalProfile = {
  childId: string
  bloodType: string | null
  /** بخش ۷.۱: آلرژی غذایی باید همیشه در دید مربی باشد. */
  allergies: string[]
  chronicConditions: string | null
  dailyMedication: string | null
  doctorName: string | null
  doctorPhone: string | null
}

export type ChildProfile = {
  child: Child
  className: string | null
  guardians: (Guardian & { phone: string | null; isPayer: boolean })[]
  authorized: PickupOption[]
  medical: MedicalProfile
  consents: { type: ConsentType; granted: boolean }[]
}

/* ── اعلام غیبت — بخش ۶.۴ ───────────────────────────────────── */

export type AbsenceInput = {
  childId: string
  date: string
  reason: string | null
}

/* ── پیام با ساعت کاری — بخش ۶.۶ ────────────────────────────── */

export type Message = {
  id: string
  childId: string
  body: string
  /** فرستنده از دید بیننده: خودش یا طرف مقابل. */
  mine: boolean
  senderName: string
  sentAt: string | null
  /** بیرون از ساعت کاری، پیام تا این زمان در صف می‌ماند — بخش ۶.۶. */
  queuedUntil: string | null
}

export type MessageThread = {
  childId: string
  childName: string
  messages: Message[]
  /** ساعت کاری پیام مهد، برای نوشتن روی صفحه. */
  hours: { start: string; end: string }
}

/* ── بازه روز، دوره حضور، و شیفت ─────────────────────────────── */

export type AttendanceType = 'morning' | 'afternoon' | 'full_day'

/**
 * یک بازه از روز. مرجع مشترک دوره حضور کودک و شیفت مربی.
 *
 * تعدادش هیچ‌جا فرض نمی‌شود: مهد می‌تواند مرز را جابه‌جا کند یا بازه
 * سوم اضافه کند.
 */
export type DayPeriod = {
  id: string
  key: string
  title: string
  startTime: string
  endTime: string
  sortOrder: number
  /** فیلدهای گزارش که به این بازه تعلق دارند. ناهار عمداً اینجا نیست. */
  reportFields: string[]
  /** در کدام نوع‌های حضور می‌آید. روی خود بازه است، نه در کد. */
  includedIn: AttendanceType[]
}

/**
 * دوره حضور کودک — ویژگی ثبت‌نام، نه ویژگی کودک.
 *
 * روی child نمی‌نشیند تا کودکی که از صبحانه‌ای به تمام‌روز تغییر می‌کند
 * تاریخچه‌اش را از دست ندهد، و شهریه به همین ردیف بچسبد.
 */
export type Enrollment = {
  id: string
  childId: string
  classId: string
  startDate: string
  endDate: string | null
  attendanceType: AttendanceType
  /** روزهای هفته‌ای که می‌آید. شنبه صفر. */
  weekdays: number[]
  feePlanId: string | null
  discountPercent: number
}

/** شیفت مربی — با ساعت، نه با بازه. */
export type StaffShift = {
  id: string
  staffId: string
  classId: string
  weekday: number
  startTime: string
  endTime: string
  effectiveFrom: string
  effectiveTo: string | null
}

/** کودک، همراه آنچه امروز درباره‌اش صادق است. */
export type ChildInSession = Child & {
  attendanceType: AttendanceType
  /**
   * جایگاه کودک در همین لحظه — تصمیم ۰۳ سند بررسی طراحی.
   *
   * شبکه اصلی فقط current را می‌گیرد. upcoming و departing در بخش‌های
   * تفکیک‌شده پایین می‌نشینند، تا تغییر ساعت ۱۳:۰۰ ناگهانی نباشد.
   */
  phase: SessionPhase
  /** بازه‌هایی که امروز برای او معنا دارند. */
  periods: DayPeriod[]
  /** فیلدهای گزارش که برای او قابل اعمال‌اند. */
  fields: string[]
  dayStart: string | null
  dayEnd: string | null
  /**
   * امروز روزِ او نیست ولی مربی دستی به فهرست افزوده — استثنا.
   * بخش ۵.۳ اصلاح‌شده: کودک سه‌روزه گاهی روز چهارم هم می‌آید.
   */
  addedException: boolean
}

/** نسبت مربی به کودک در یک لحظه — بخش ۷.۲. */
export type StaffRatio = {
  children: number
  staff: number
  maxAllowed: number
  breached: boolean
}

/* ── برنامه فردا — بخش ۵.۸ و ۶.۴ ───────────────────────────── */

/** «چه کسی می‌آورد» و «چه کسی می‌برد» دو تصمیم جدایند. */
export type PlanDirection = 'drop_off' | 'pickup'

/**
 * اعلام خانواده برای یک روز.
 *
 * دو حالت دارد و فقط دو حالت:
 *   فرد در فهرست مجاز است  → یک تیک، بدون کد. مربی همان را می‌بیند.
 *   فرد در فهرست نیست      → مشخصاتش نوشته می‌شود و سامانه کد می‌سازد.
 *
 * بخش ۵.۸ قاعده سفت دارد: بدون فهرست مجاز و بدون کد، ثبت نمی‌شود. این
 * اعلام آن قاعده را شل نمی‌کند؛ فقط راه دومش را از قبل آماده می‌کند.
 */
export type PickupPlan = {
  id: string
  childId: string
  date: string
  direction: PlanDirection
  personName: string
  /** اگر فرد مجاز بود، شناسه‌اش. برای فرد ناشناس خالی است. */
  personId: string | null
  photoUrl: string | null
  /** کد یکبارمصرف، فقط برای فرد بیرون از فهرست مجاز. */
  code: string | null
  note: string | null
}

export type PickupPlanInput = {
  childId: string
  date: string
  direction: PlanDirection
  /** یکی از این دو: فرد مجاز، یا مشخصات فرد تازه. */
  personId?: string | null
  newPerson?: { fullName: string; phone: string } | null
  note?: string | null
}

/* ── اطلاع‌رسانی مهد — بخش ۱۵.۳ ─────────────────────────────── */

export type NoticeKind = 'announcement' | 'closure' | 'delayed_opening'

export type ClosureReason =
  | 'weather'
  | 'air_quality'
  | 'official_holiday'
  | 'utility_outage'
  | 'health'
  | 'other'

export type NoticeInput = {
  kind: NoticeKind
  /** خالی یعنی کل مهد. */
  classId?: string | null
  title: string
  body: string
  reason?: ClosureReason | null
  /** فقط در «تأخیر در بازگشایی». */
  reopenAt?: string | null
  date?: string | null
  /** بخش ۱۵.۲: در شرایط اضطراری پیامک مسیر اصلی است، نه پشتیبان. */
  sendSms: boolean
}

export type Notice = {
  id: string
  kind: NoticeKind
  classId: string | null
  title: string
  body: string
  publishedAt: string | null
  smsSentCount: number
  seenInAppCount: number
}

/** پیش از ارسال، مدیر باید بداند به چند نفر می‌رود و سهمیه چقدر مانده. */
export type NoticeAudience = {
  families: number
  staff: number
  /** خانواده‌هایی که شماره ثبت‌شده ندارند و پیامک به آن‌ها نمی‌رسد. */
  withoutPhone: { childId: string; childName: string; guardianName: string }[]
  smsRemaining: number
  smsNeeded: number
}

/* ── داشبورد مدیر — بخش ۱۳.۳ ────────────────────────────────── */

export type ManagerDashboard = {
  date: string
  present: number
  enrolled: number
  unaccounted: { childId: string; name: string; guardianPhone: string | null }[]
  /** رویدادهایی که منتظر تصمیم مدیرند — بخش ۳.۳. */
  pendingIncidents: (Incident & { childName: string })[]
  /**
   * وضعیت ثبت هر کلاس، به‌علاوه نسبت مربی به کودک در همین لحظه.
   *
   * بخش ۷: نسبت باید در هر لحظه حساب شود، نه یک بار در روز. مدیر تنها
   * کسی است که هر دو کلاس را با هم می‌بیند، پس هشدار مرز اینجا معنا
   * دارد.
   */
  classes: {
    classId: string
    name: string
    complete: number
    total: number
    sent: boolean
    ratio: StaffRatio
  }[]
  /** اعلام‌های پرداخت که منتظر تصمیم مدیرند — بخش ۸. */
  pendingClaims: number
  smsRemaining: number
}

export type IncidentDecision = 'send_to_family' | 'call_then_send' | 'archive'

/* ── پرونده بازرسی — ارتقای ۲ سند بررسی طراحی ──────────────── */

export type VaccinationStatus = 'complete' | 'incomplete' | 'unrecorded'

/** سه عددی که مدیر باید **پیش از** بازرسی ببیند، نه بعدش. */
export type AuditReadiness = {
  incompleteVaccination: number
  missingNationalId: number
  expiringHealthCards: number
}

export type AuditChildRow = {
  fullName: string
  nationalId: string | null
  birthDate: string | null
  className: string | null
  attendanceType: AttendanceType | null
  guardianName: string | null
  guardianPhone: string | null
  enrolledSince: string | null
}

export type AuditHealthRow = {
  className: string | null
  fullName: string
  allergies: string
  conditions: string
  vaccinationStatus: VaccinationStatus
  updatedAt: string | null
}

/** وضعیت کارت بهداشت. «نزدیک انقضا» از «منقضی» جداست، چون کار فرق دارد. */
export type HealthCardState = 'معتبر' | 'نزدیک انقضا' | 'منقضی' | 'ثبت نشده'

export type AuditStaffRow = {
  fullName: string
  role: string
  cardNumber: string | null
  issuedAt: string | null
  expiresAt: string | null
  cardState: HealthCardState
}

/**
 * پرونده کامل بازرسی.
 *
 * حساس‌ترین خروجی کل سامانه: کد ملی، شماره تماس و وضعیت سلامت کودکان
 * در یک جا. بخش ۱۰.۲ دسترسی نقش‌محور و لاگ دسترسی را الزامی کرده، پس
 * ساختنش هم مثل خواندن پرونده پزشکی ثبت می‌شود.
 */
export type AuditFile = {
  centerName: string
  builtAt: string
  builtBy: string
  children: AuditChildRow[]
  health: AuditHealthRow[]
  staff: AuditStaffRow[]
}

/**
 * موجودیت‌های حساسی که خواندنشان هم رد پا می‌گذارد — بند ۱۱.۹.
 * نوشتن روی دوازده جدول با تریگر پایگاه داده لاگ می‌شود (مهاجرت ۰۰۱۱)؛
 * خواندن تریگر ندارد و فقط این سه مورد ارزش لاگ شدن دارند.
 */
export type ReadAuditEntity = 'medical_profile' | 'photo' | 'incident'

export interface ReadAuditSink {
  readOccurred(entity: ReadAuditEntity, ids: string[]): Promise<void>
}

export interface DataAccess {
  readonly scope: AccessScope
  /** کلاس‌هایی که این حساب می‌بیند. */
  listClasses(): Promise<ClassRoom[]>
  getClassDay(classId: string, date: string): Promise<ClassDay>
  listGuardians(childId: string): Promise<Guardian[]>
  checkIn(input: CheckInInput): Promise<Attendance>
  /** ثبت داروی امروز. تا خورانده نشدنش، مربی یادآور می‌بیند. */
  addMedication(input: MedicationInput): Promise<MedicationLog>

  /* ── درخواست دارو از خانواده — ارتقای ۳ ───────────────────── */

  /** خانواده از شب قبل اعلام می‌کند. مجوز دادن دارو نیست. */
  requestMedication(input: MedicationRequestInput): Promise<MedicationRequest>

  /** درخواست‌های یک کودک در یک تاریخ، از دید خانواده. */
  listMedicationRequests(childId: string, date: string): Promise<MedicationRequest[]>

  /** خانواده پیش از تحویل می‌تواند لغو کند. */
  cancelMedicationRequest(requestId: string): Promise<void>

  /**
   * مربی شیشه دارو را تحویل گرفت.
   *
   * همین یک ضربه زنجیره مسئولیت را کامل می‌کند و تازه از اینجا
   * «داده شد» ممکن می‌شود.
   */
  receiveMedication(requestId: string, date: string): Promise<MedicationLog[]>

  /**
   * ثبت گروهی — بخش ۵.۵.
   * روی هر کودکی می‌نشیند که جدا دست‌نخورده باشد. کودکی که مربی استثنایش
   * کرده، دست‌نخورده نمی‌ماند و مقدار گروهی رویش نمی‌رود.
   */
  applyBulk(classId: string, date: string, values: BulkValues): Promise<DailyReport[]>

  /** استثنای یک کودک. پس از این، ثبت گروهی رویش نمی‌نشیند. */
  saveChildReport(childId: string, date: string, patch: ReportPatch): Promise<DailyReport>

  /** کسانی که مجازند این کودک را تحویل بگیرند — بخش ۵.۸. */
  listPickupOptions(childId: string): Promise<PickupOption[]>

  /** بررسی کد تحویل. نام و عکس آورنده را می‌دهد تا مربی چهره را تطبیق دهد. */
  checkPickupCode(childId: string, code: string, date: string): Promise<PickupCodeCheck>

  /**
   * ثبت خروج — بخش ۵.۸.
   * اگر فرد در فهرست مجاز نباشد و کد هم نداشته باشد، رد می‌شود. این یک
   * هشدار قابل رد شدن نیست.
   */
  checkOut(input: CheckOutInput): Promise<Attendance>

  /** ثبت رویداد — بخش ۵.۶. شدت ممکن است خودکار بالا برود. */
  createIncident(input: IncidentInput): Promise<Incident>

  /** افزودن عکس با تگ کودکان — بخش ۵.۵. عکس بدون تگ منتشر نمی‌شود. */
  addPhoto(date: string, previewUrl: string, childIds: string[]): Promise<Photo>

  /** تگ‌های یک عکس را عوض می‌کند. */
  setPhotoTags(photoId: string, childIds: string[]): Promise<Photo>

  /** خلاصه پایان روز — بخش ۵.۹. */
  getDaySummary(classId: string, date: string): Promise<DaySummary>

  /** کودکانی که این حساب سرپرستشان است — بخش ۶.۵. */
  listMyChildren(): Promise<Child[]>

  /** روز کودک از دید خانواده — بخش ۶.۳. */
  getParentDay(childId: string, date: string): Promise<ParentDay>

  /** تیک زدن «انجام شد» روی درخواست از خانه — بخش ۶.۳. */
  setNeedDone(childId: string, date: string, needId: string, done: boolean): Promise<void>

  /* ── درخواست از خانه، سمت مربی — بخش ۵.۹ بند ۶ ─────────────── */

  /**
   * درخواست‌های از خانه را برای یک کلاس می‌نویسد.
   *
   * روی گزارش همان روز می‌نشیند و خانواده آن را در گزارش امشب می‌بیند،
   * یعنی وقتی هنوز فرصت آماده کردن فردا را دارد.
   */
  setClassNeeds(classId: string, date: string, texts: string[]): Promise<number>

  /* ── برنامه فردا — بخش ۵.۸ و ۶.۴ ──────────────────────────── */

  /** اعلام‌های یک کلاس برای یک روز. مربی می‌بیند، نمی‌سازد. */
  listPlans(classId: string, date: string): Promise<PickupPlan[]>

  /** اعلام خانواده. اگر فرد مجاز نباشد، کد ساخته می‌شود. */
  savePlan(input: PickupPlanInput): Promise<PickupPlan>

  /** برداشتن اعلام؛ یعنی فردا مثل همیشه است. */
  clearPlan(childId: string, date: string, direction: PlanDirection): Promise<void>

  /** اعلام‌های خانواده برای یک کودک در یک روز. */
  getChildPlans(childId: string, date: string): Promise<PickupPlan[]>

  /* ── مدیر — بخش ۱۳.۳ ──────────────────────────────────────── */

  getManagerDashboard(date: string): Promise<ManagerDashboard>

  /** تصمیم مدیر درباره رویداد در انتظار — بخش ۳.۳. */
  decideIncident(incidentId: string, decision: IncidentDecision): Promise<void>

  /* ── پرونده بازرسی — ارتقای ۲ ─────────────────────────────── */

  /** سه عدد آمادگی، برای دیدن پیش از بازرسی. */
  getAuditReadiness(): Promise<AuditReadiness>

  /**
   * ساخت پرونده بازرسی. فقط مدیر، و ساختنش در audit_log ثبت می‌شود.
   */
  buildAuditFile(): Promise<AuditFile>

  /** پیش از ارسال: چند گیرنده، چند پیامک، و چه کسانی شماره ندارند. */
  previewNotice(input: NoticeInput): Promise<NoticeAudience>

  publishNotice(input: NoticeInput): Promise<Notice>

  listNotices(limit: number): Promise<Notice[]>

  /* ── دوره حضور و بازه — بخش ۵.۳ اصلاح‌شده ─────────────────── */

  /**
   * کودکی که امروز روزش نیست ولی آمده.
   *
   * کودک سه‌روزه گاهی روز چهارم هم می‌آید؛ بدون این، مربی هیچ راهی
   * برای ثبت ورودش ندارد.
   */
  addChildToday(childId: string, date: string): Promise<void>

  /** کودکانی از این کلاس که امروز روزشان نیست، برای افزودن دستی. */
  listOffDayChildren(classId: string, date: string): Promise<Child[]>

  /* ── مالی — ماژول M5 ──────────────────────────────────────── */

  /** نمای مالی مدیر برای یک دوره. */
  getFinance(period: string): Promise<FinanceOverview>

  /**
   * صدور گروهی صورتحساب یک دوره — بخش ۸.
   * روی کودکی که قبلاً صورتحساب همان دوره را دارد دوباره نمی‌نشیند.
   */
  issueInvoices(period: string, dueDate: string): Promise<number>

  /** ثبت پرداخت دستی و رسید. درگاه آنلاین فاز ۳ است. */
  recordPayment(input: PaymentInput): Promise<Payment>

  /** یادآوری پیامکی معوقات. تعداد پیامک فرستاده‌شده را برمی‌گرداند. */
  remindOverdue(period: string): Promise<number>

  /** نمای مالی خانواده. فقط سرپرست پرداخت‌کننده — بخش ۶.۵. */
  getParentFinance(childId: string): Promise<ParentFinance>

  /* ── پرونده کودک — ماژول M1 ───────────────────────────────── */

  getChildProfile(childId: string): Promise<ChildProfile>

  /* ── اعلام غیبت — بخش ۶.۴ ─────────────────────────────────── */

  declareAbsence(input: AbsenceInput): Promise<void>

  /** اطلاعیه‌هایی که به این حساب مربوط‌اند. */
  listMyNotices(): Promise<Notice[]>

  /* ── پیام با ساعت کاری — بخش ۶.۶ ──────────────────────────── */

  getThread(childId: string): Promise<MessageThread>

  sendMessage(childId: string, body: string): Promise<Message>

  /* ── دارو — بخش ۵.۳ ───────────────────────────────────────── */

  /** علامت زدن اینکه دارو خورانده شد. پس از این یادآور می‌رود. */
  markMedicationGiven(medicationId: string): Promise<void>

  /* ── اصلاحیه — بخش ۵.۹ ────────────────────────────────────── */

  /**
   * ثبت اصلاحیه روی گزارشِ قفل‌شده.
   * تنها راه تغییر پس از ارسال؛ متن اصلی دست‌نخورده می‌ماند.
   */
  addAmendment(childId: string, date: string, text: string): Promise<Amendment>

  listAmendments(classId: string, date: string): Promise<Amendment[]>

  /* ── اعلام پرداخت — بخش ۸ ─────────────────────────────────── */

  /** خانواده اعلام می‌کند پرداخت کرده و رسید می‌گذارد. */
  declarePayment(input: PaymentClaimInput): Promise<PaymentClaim>

  /** اعلام‌های در انتظار تصمیم مدیر. */
  listPaymentClaims(status: ClaimStatus): Promise<PaymentClaim[]>

  /**
   * تصمیم مدیر. تأیید، پرداخت واقعی را می‌سازد و صورتحساب را به‌روز
   * می‌کند؛ رد، دلیل می‌خواهد تا خانواده بداند چه شد.
   */
  decidePaymentClaim(claimId: string, approve: boolean, reason?: string): Promise<void>

  /**
   * ارسال گزارش‌های روز — بخش ۵.۹.
   * پس از ارسال، گزارش‌ها قفل می‌شوند و تغییر بعدی فقط اصلاحیه است.
   */
  sendReports(classId: string, date: string): Promise<number>
}
