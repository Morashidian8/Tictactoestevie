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
  /** چه کسی تحویل گرفت. برای روش code خالی است و نامش در کد ثبت شده. */
  pickedUpById: string | null
  pickupMethod: PickupMethod | null
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
  checkOutAt: string | null
  pickedUpByName: string | null
  lunch: MealAmount | null
  napMinutes: number | null
  moodMorning: Mood | null
  moodNoon: Mood | null
  moodAfternoon: Mood | null
  teacherNote: string | null
  needsFromHome: { id: string; text: string; done: boolean }[]
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
  /** وضعیت ثبت هر کلاس: کامل، ناقص، یا دست‌نخورده. */
  classes: { classId: string; name: string; complete: number; total: number; sent: boolean }[]
  smsRemaining: number
}

export type IncidentDecision = 'send_to_family' | 'call_then_send' | 'archive'

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

  /** پیش از ارسال: چند گیرنده، چند پیامک، و چه کسانی شماره ندارند. */
  previewNotice(input: NoticeInput): Promise<NoticeAudience>

  publishNotice(input: NoticeInput): Promise<Notice>

  listNotices(limit: number): Promise<Notice[]>

  /**
   * ارسال گزارش‌های روز — بخش ۵.۹.
   * پس از ارسال، گزارش‌ها قفل می‌شوند و تغییر بعدی فقط اصلاحیه است.
   */
  sendReports(classId: string, date: string): Promise<number>
}
