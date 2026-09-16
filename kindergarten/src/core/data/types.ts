/** انواع دامنه. آینه شِمای دیتابیس، فقط برای بخش‌هایی که ساخته شده‌اند. */
import type { QuotaLine } from '../notify/index.ts'
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
  /**
   * تاریخ تولد، به شکل ISO. در رابط هرگز خام دیده نمی‌شود.
   *
   * ستونش از مهاجرت ۰۰۰۳ در پایگاه داده بود و فقط پرونده بازرسی
   * می‌خواندش. مربی هم لازمش دارد: در کلاسی که از سه تا شش سال دارد،
   * «چهار سال و یک ماه» به یک نگاه می‌گوید چه انتظاری از این کودک
   * می‌رود — و این تنها عددی درباره کودک است که مقایسه‌ای نیست.
   */
  birthDate: string | null
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

/** یک قلم روی صورتحساب: ناهار، اردو، کاردستی. */
export type InvoiceLine = {
  id: string
  title: string
  amount: number
}

export type Invoice = {
  id: string
  childId: string
  childName: string
  /** دوره به شکل «۱۴۰۵-۰۶». */
  period: string
  amount: number
  discount: number
  /**
   * جریمه تأخیر در **تحویل گرفتن کودک** — بخش ۵.۸.
   * ربطی به دیر پرداختن ندارد؛ آن `overdueFee` است.
   */
  lateFee: number
  /** جریمه دیرکرد **پرداخت**. */
  overdueFee: number
  paid: number
  dueDate: string
  status: InvoiceStatus
  /**
   * اقلامی که این مبلغ از آن‌ها ساخته شده.
   *
   * بی این، خانواده یک عدد بزرگ‌تر از شهریه می‌بیند و باید زنگ بزند
   * بپرسد بابت چیست.
   */
  lines: InvoiceLine[]
}

export type PaymentMethod = 'online' | 'manual_receipt' | 'cash' | 'cheque'

export type Payment = {
  id: string
  invoiceId: string
  amount: number
  paidAt: string
  method: string | null
  receiptNo: string | null
  /** آنلاین یا یکی از مسیرهای فرعی — ارتقای ۱ سند بررسی طراحی. */
  paymentMethod?: PaymentMethod
  /** کد رهگیری، فقط برای پرداخت آنلاین تأییدشده. */
  trackingCode?: string | null
  /**
   * سند پرداخت غیرآنلاین — تصویر فیش.
   *
   * پرداخت آنلاین سندش کد رهگیری است. پیش از این تصویر روی اعلامِ
   * خانواده می‌ماند و با تأیید مدیر گم می‌شد؛ بازرس ردیف می‌دید، سند نه.
   */
  receiptUrl?: string | null
}

/* ── درگاه پرداخت — ارتقای ۱ سند بررسی طراحی ─────────────────── */

/**
 * تراکنشی که تازه باز شده و کاربر باید به درگاه برود.
 *
 * `redirectUrl` جایی است که والد فرستاده می‌شود. `key` کلید ضدتکرار
 * است و همان است که وب‌هوک با آن برمی‌گردد.
 */
export type PaymentIntent = {
  paymentId: string
  key: string
  redirectUrl: string
  amount: number
  psp: string
}

/**
 * نتیجه تأیید، از دید والد.
 *
 * `pending` یعنی هنوز خبری نرسیده — نه موفق، نه ناموفق. این حالت واقعی
 * است و باید متن خودش را داشته باشد، وگرنه والد فکر می‌کند پولش رفته.
 */
export type PaymentResult =
  | { state: 'paid'; trackingCode: string; amount: number }
  | { state: 'failed'; reason: string }
  | { state: 'pending' }

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
/**
 * یک ماه از برنامه شهریه سال.
 *
 * `issued=false` یعنی هنوز صورتحسابی صادر نشده و `amount` **برآورد**
 * است، از روی طرح شهریه — نه بدهی. اگر برآورد را بدهی نشان می‌دادیم،
 * خانواده در مهر یک رقم دوازده‌ماهه می‌دید و می‌ترسید.
 */
export type FeeYearMonth = {
  period: string
  issued: boolean
  amount: number
  discount: number
  extras: number
  lateFee: number
  overdueFee: number
  paid: number
  dueDate: string | null
  status: InvoiceStatus | 'not_issued'
}

/**
 * قلم هزینه‌ای که مدیر تعریف کرده و برای این کودک فرستاده.
 *
 * قلم اختیاری تا وقتی خانواده نپذیرفته، بدهی نیست و روی صورتحساب
 * نمی‌نشیند. `answer === null` یعنی هنوز جواب نداده.
 */
export type FeeItemOffer = {
  itemId: string
  title: string
  description: string | null
  amount: number
  period: string
  optional: boolean
  answer: 'accepted' | 'declined' | null
}

/**
 * قلم هزینه از دید مدیر.
 *
 * `issuedCount` با `childCount` فرق دارد و همین تفاوت کل نکته است:
 * قلم اختیاری فقط روی صورتحساب خانواده‌هایی می‌نشیند که پذیرفته‌اند.
 */
export type FeeItem = {
  id: string
  title: string
  description: string | null
  amount: number
  period: string
  optional: boolean
  /** تا منتشر نشده، هیچ خانواده‌ای نمی‌بیندش و روی صورتحسابی نمی‌نشیند. */
  published: boolean
  childCount: number
  acceptedCount: number
  declinedCount: number
  /** چند سطر صورتحساب واقعاً ساخته شده. */
  issuedCount: number
}

export type FeeItemInput = {
  title: string
  description?: string | null
  amount: number
  period: string
  optional: boolean
  /** کل مهد، یا یک کلاس. فهرست کودکان از همین ساخته می‌شود. */
  scope: { kind: 'center' } | { kind: 'class'; classId: string }
}

/* ── ویرایش پرونده کودک به دست خانواده ─────────────────────── */

/**
 * میدانی از پرونده که خانواده می‌تواند ویرایشش کند.
 *
 * فهرست از پایگاه داده می‌آید، نه از کلاینت: فهرست سمت کلاینت دور
 * زدنی است و خانواده نباید بتواند کلاس کودک یا طرح شهریه را عوض کند.
 */
export type ProfileField = {
  key: string
  label: string
  /**
   * میدان ایمنی.
   *
   * تا تأیید مدیر، مربی همچنان مقدار قدیمی را می‌بیند — و برای آلرژی،
   * آن فاصله خطر دارد. رابط باید این را صریح بگوید.
   */
  safetyCritical: boolean
  /** مقدار فعلیِ ثبت‌شده در پرونده. */
  value: string
  /** اگر درخواست بازی برای این میدان هست، مقدار پیشنهادی خانواده. */
  pending: string | null
}

export type ProfileChangeState = 'pending' | 'approved' | 'rejected'

/** درخواست تغییر، از دید مدیر. */
export type ProfileChange = {
  id: string
  childId: string
  childName: string
  field: string
  label: string
  oldValue: string | null
  newValue: string | null
  safetyCritical: boolean
  requestedAt: string
}

/* ── پرونده کارکنان — ماژول ۰۰۲۲ و ۰۰۲۴ ─────────────────────── */

export type StaffDocumentKind =
  | 'health_card'
  | 'degree'
  | 'training'
  | 'national_id'
  | 'criminal_record'
  | 'contract'
  | 'other'

export type StaffDocument = {
  id: string
  kind: StaffDocumentKind
  title: string
  fileUrl: string
  issuedAt: string | null
  /**
   * تاریخ انقضا.
   *
   * کل ارزش این ستون همین است: مدرکی که تاریخ انقضا دارد و کسی نگاهش
   * نمی‌کند، روز بازرسی تبدیل به تخلف می‌شود.
   */
  expiresAt: string | null
  uploadedAt: string
}

export type StaffNoteKind = 'commendation' | 'concern' | 'review' | 'training'

/**
 * یادداشت مدیر درباره یک مربی.
 *
 * `sharedAt` عمداً هست: ارزیابی‌ای که مربی هرگز نمی‌بیند، ارزیابی نیست؛
 * پرونده‌سازی است. این ستون مدیر را وادار نمی‌کند، ولی سکوت را ثبت
 * می‌کند.
 */
export type StaffNote = {
  id: string
  kind: StaffNoteKind
  body: string
  writtenAt: string
  sharedAt: string | null
}

/**
 * یک ردیف کارتابل مدیر.
 *
 * آنچه عمداً اینجا **نیست**: هیچ نمره، رتبه یا مقایسه‌ای بین مربیان.
 * `incidentsLogged` هم در این نما نمی‌آید — اگر مربی ببیند ثبت رخداد به
 * ضررش تمام می‌شود، کمتر ثبت می‌کند و آسیب به کودک می‌رسد.
 */
export type StaffCartableRow = {
  staffId: string
  fullName: string
  role: string
  photoUrl: string | null
  /** روزی که دست‌کم یک ثبت کرده. جایگزین حضور و غیاب پرسنل نیست. */
  daysActive: number
  checkIns: number
  documentsExpired: number
  documentsExpiring: number
  lastReview: string | null
  openConcerns: number
}

/** پرونده کامل یک مربی، از دید مدیر. */
export type StaffProfile = {
  staffId: string
  fullName: string
  role: string
  phone: string | null
  classNames: string[]
  documents: StaffDocument[]
  notes: StaffNote[]
  activity: {
    daysActive: number
    checkIns: number
    checkOuts: number
    reportsWritten: number
    reportsSent: number
    medicationsReceived: number
  }
}

export type StaffDocumentInput = {
  staffId: string
  kind: StaffDocumentKind
  title: string
  fileUrl: string
  issuedAt?: string | null
  expiresAt?: string | null
}

export type StaffNoteInput = {
  staffId: string
  kind: StaffNoteKind
  body: string
  /** با مربی در میان گذاشته شود یا نه. */
  share: boolean
}

/* ── بایگانی حضور و غیاب — ماژول ۰۰۲۲ ───────────────────────── */

/**
 * یک روز از بایگانی حضور کودک.
 *
 * `minutes` وقتی خالی است که خروج ثبت نشده باشد. صفر گذاشتنش یعنی
 * دروغ گفتن درباره ساعتی که کودک آنجا بود.
 */
export type AttendanceDay = {
  date: string
  checkInAt: string | null
  checkOutAt: string | null
  minutes: number | null
  lateMinutes: number
  absent: boolean
  absenceReason: string | null
  droppedBy: string | null
  pickedUpBy: string | null
}

export type AttendanceMonth = {
  days: AttendanceDay[]
  presentDays: number
  absentDays: number
  totalMinutes: number
  lateDays: number
}

/* ── مشاهده و گزارش ماهانه — ماژول ۰۰۲۵ و ۰۰۲۶ ──────────────── */

/**
 * شش عدسی مشاهده.
 *
 * عدسی، برچسبِ کودک نیست — زاویه نگاهِ مربی است. «چالش» یعنی جایی که
 * امروز سخت بود، نه ویژگیِ کودک.
 */
export type ObservationLens =
  | 'interest'
  | 'challenge'
  | 'social'
  | 'skill'
  | 'moment'
  | 'care'

export type Observation = {
  id: string
  date: string
  lens: ObservationLens
  body: string
  staffName: string | null
  /** فقط نام کوچک. گزارش یک کودک نباید مشخصات کودک دیگر را ببرد. */
  peers: string[]
}

export type ObservationInput = {
  childId: string
  lens: ObservationLens
  body: string
  /** هم‌بازی‌ها، اگر مربی دیده باشد. حدس نیست. */
  peerChildIds?: string[]
}

/**
 * واقعیت‌های عددی ماه.
 *
 * هیچ‌کدام نمره نیستند و هیچ‌کدام با میانگین کلاس مقایسه نمی‌شوند: شمار
 * روزهای حضور یک واقعیت است، «بالاتر از میانگین» یک قضاوت.
 */
export type MonthFacts = {
  presentDays: number
  absentDays: number
  totalMinutes: number
  lunchAll: number
  lunchMost: number
  lunchLittle: number
  lunchNone: number
  napDays: number
  moodGood: number
  moodNormal: number
  moodRestless: number
  moodSad: number
  photos: number
  observations: number
}

export type MonthlyReportStatus = 'draft' | 'ready' | 'shared'

/**
 * گزارش ماهانه یک کودک.
 *
 * `teacherSummary` تنها متن تحلیلی گزارش است و یک آدم نوشته‌اش. اپ
 * مصالح را کنار هم می‌گذارد؛ نتیجه‌گیری کار کسی است که کودک را دیده.
 */
export type MonthlyReport = {
  id: string | null
  childId: string
  childName: string
  period: string
  status: MonthlyReportStatus
  teacherSummary: string | null
  meetingNotes: string | null
  /** مشاهده‌های ماه، دسته‌بندی‌شده به عدسی. */
  observations: Observation[]
  /** کودکانی که بیشتر با او بوده‌اند — از مشاهده، نه از هم‌کلاسی. */
  peers: { firstName: string; times: number }[]
  facts: MonthFacts
  /** عدسی‌هایی که هنوز هیچ مشاهده‌ای ندارند. */
  gaps: { lens: ObservationLens; seen: number }[]
  /** پیش‌نویس ماشین، اگر ساخته شده باشد. */
  assistedDraft: string | null
}

/* ── پرونده بازرسی — ماژول ۰۰۲۳ ─────────────────────────────── */

export type CenterDocumentKind =
  | 'operating_licence'
  | 'liability_insurance'
  | 'fire_safety'
  | 'building_safety'
  | 'health_permit'
  | 'lease'
  | 'other'

export type CenterDocument = {
  id: string
  kind: CenterDocumentKind
  title: string
  issuer: string | null
  referenceNo: string | null
  issuedAt: string | null
  /** مجوز فعالیتِ منقضی یعنی مهد حق کار ندارد — مهم‌ترین ستون. */
  expiresAt: string | null
  note: string | null
}

export type CenterDocumentInput = {
  kind: CenterDocumentKind
  title: string
  issuer?: string | null
  referenceNo?: string | null
  expiresAt?: string | null
  note?: string | null
}

/** از کجا باید این قلم را ثابت کرد. */
export type RequirementSource = 'center_document' | 'staff_document' | 'app_report' | 'manual'

/** وضعیت انقضا: معتبر، نزدیک انقضا، منقضی، یا بی‌تاریخ. */
export type DocumentState = 'valid' | 'expiring' | 'expired' | 'none'

/**
 * یک قلم از چک‌لیست بازرسی.
 *
 * فهرست **داده است، نه کد**: مقررات از استانی به استان دیگر فرق دارد و
 * بازرسِ امسال چیزی می‌خواهد که پارسال نمی‌خواست. مهد ردیف اضافه
 * می‌کند؛ اپ فقط سازوکار را می‌دهد.
 */
export type InspectionRequirement = {
  id: string
  title: string
  source: RequirementSource
  satisfied: boolean
  expiresAt: string | null
  state: DocumentState
  note: string | null
}

export type InspectionVisit = {
  id: string
  visitedOn: string
  authority: string
  inspectorName: string | null
  findings: string | null
  /** آنچه باید رفع شود. تا `resolvedAt` پر نشود، باز است. */
  actionRequired: string | null
  resolvedAt: string | null
}

export type InspectionVisitInput = {
  visitedOn: string
  authority: string
  inspectorName?: string | null
  findings?: string | null
  actionRequired?: string | null
}

/** پرونده بازرسی، یک‌جا. */
export type InspectionFile = {
  requirements: InspectionRequirement[]
  documents: CenterDocument[]
  visits: InspectionVisit[]
  ready: number
  total: number
  expiring: number
  openActions: number
}

/* ── بازی آزاد و نقشه علایق — ماژول M8 ──────────────────────── */

export type ActivityCorner = {
  id: string
  title: string
  glyph: string | null
}

export type PlaySession = 'morning' | 'afternoon'

/**
 * وضعیت یک نوبت بازی آزاد.
 *
 * `unplaced` کودکانی‌اند که هنوز جابه‌جا نشده‌اند — و **خطا نیستند**.
 * بخش ۵.۴: داده ناقص بهتر از داده جعلی است.
 */
export type FreePlayBoard = {
  corners: ActivityCorner[]
  /** شناسه کودک → شناسه گوشه. کودکِ بی‌مدخل، ثبت نشده. */
  placed: Record<string, string>
  /**
   * همه کودکان نوبت — نه فقط ثبت‌نشده‌ها.
   *
   * «ثبت‌نشده» از این فهرست منهای `placed` درمی‌آید. یک فهرست، یک
   * مشتق: اگر دو فهرست جدا بود، ثبت جفتی فقط کودکانِ ثبت‌نشده را
   * می‌دید و کودکی که گوشه‌اش ثبت شده از فهرست جفت‌ها می‌افتاد.
   */
  children: { id: string; firstName: string; photoUrl: string | null }[]
  /** جفت‌های ثبت‌شده امروز. */
  pairs: { a: string; b: string }[]
}

/**
 * نقشه علایق یک کودک.
 *
 * منبع **منحصراً** ثبت بازی آزاد است — نه خلق، نه غذا، نه مشاهده.
 * `sample` زیر آستانه یعنی نمودار نشان داده نمی‌شود.
 */
export type InterestMap = {
  corners: { id: string; title: string; glyph: string | null; times: number }[]
  sample: number
  /** آستانه انتشار — بخش ۹. زیر این، نمودار معنا ندارد. */
  threshold: number
  /** هم‌بازی‌ها، از ثبت جفتی نه از هم‌گوشه بودن. */
  partners: { childId: string; firstName: string; times: number }[]
}

export type ReminderKind = 'due_soon' | 'due_today' | 'overdue'

/**
 * یادآوری‌هایی که رفته.
 *
 * خانواده باید ببیند کِی و از چه راهی خبر شده؛ ادعای «پیامک نیامد»
 * بی این فهرست قابل بررسی نیست.
 */
export type PaymentReminderLog = {
  id: string
  period: string
  kind: ReminderKind
  channel: 'app' | 'sms'
  sentAt: string
}

export type ParentFinance = {
  /** اگر این حساب پرداخت‌کننده نیست، false و بقیه خالی است. */
  isPayer: boolean
  invoices: Invoice[]
  payments: Payment[]
  /** اعلام‌های خودش، تا بداند کدامشان هنوز منتظر تأیید مدیر است. */
  claims: PaymentClaim[]
  outstanding: number
  /** دوازده ماه سال جاری، صادرشده و نشده. */
  year: FeeYearMonth[]
  /** سال جلالی‌ای که `year` به آن مربوط است، مثل «۱۴۰۴». */
  yearLabel: string
  /** قلم‌های اختیاری که منتظر جواب خانواده‌اند، و جواب‌داده‌ها. */
  offers: FeeItemOffer[]
  reminders: PaymentReminderLog[]
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
  /**
   * کدام طرفِ گفتگو. گفتگو دو طرف دارد — خانواده و مهد — نه دو نفر.
   *
   * پیش‌تر `mine` از مقایسه نام حساب می‌شد. مشکلش این بود که مهد چند
   * مربی دارد: پیامی که مربی صبح فرستاده، برای مربی بعدازظهر «مالِ
   * طرف مقابل» دیده می‌شد، در حالی که هر دو یک طرف‌اند.
   */
  senderRole: 'family' | 'staff'
  /** نام واقعی فرستنده. خانواده باید بداند با که حرف می‌زند. */
  senderName: string
  sentAt: string | null
  /** بیرون از ساعت کاری، پیام تا این زمان در صف می‌ماند — بخش ۶.۶. */
  queuedUntil: string | null
}

/**
 * یک گفتگو در فهرست صندوق مربی.
 *
 * تا اینجا خانواده می‌توانست پیام بفرستد و مربی هیچ صندوق ورودی
 * نداشت — پیام ثبت می‌شد و به جایی نمی‌رسید.
 */
export type ThreadSummary = {
  childId: string
  childName: string
  photoUrl: string | null
  /** آخرین پیام، برای پیش‌نمایش. */
  lastBody: string | null
  lastAt: string | null
  /** آخرین پیام از خانواده بوده و هنوز جوابی نرفته. */
  awaitingReply: boolean
  /** پیام‌هایی که هنوز در صف ساعت کاری‌اند. */
  queued: number
}

export type MessageThread = {
  childId: string
  childName: string
  messages: Message[]
  /** ساعت کاری پیام مهد، برای نوشتن روی صفحه. */
  hours: { start: string; end: string }
}

/* ── گفتگوی نفر به نفر ──────────────────────────────────────── */

/**
 * یک گفتگو در صندوق، از دید یک عضو.
 *
 * «طرف مقابل» یک نفر است، نه یک طرف: مدیر با مربیِ مشخص حرف می‌زند و
 * سرپرست با مربیِ مشخص. شماره هیچ‌کس اینجا نیست — فقط شناسه حساب و نام.
 */
export type ConversationSummary = {
  id: string
  otherAccountId: string
  otherName: string
  otherRole: AccountRole
  /** کودکِ زمینه، اگر گفتگو درباره کودکی باشد. گفتگوی مدیر و مربی ندارد. */
  childId: string | null
  childName: string | null
  lastBody: string | null
  lastAt: string | null
  unread: number
}

/** کسی که می‌شود با او گفتگوی تازه باز کرد. */
export type MessageCandidate = {
  accountId: string
  fullName: string
  role: AccountRole
  /** مربی: نام کلاس‌هایش. سرپرست: نام کودکانش. تا انتخاب، حدس نباشد. */
  context: string | null
}

/** یک پیام در گفتگوی نفر به نفر. */
export type ChatMessage = {
  id: string
  body: string
  mine: boolean
  senderName: string
  sentAt: string | null
  /** بیرون از ساعت کاری، پیام تا این زمان در صف می‌ماند — بخش ۶.۶. */
  queuedUntil: string | null
}

export type Conversation = {
  id: string
  otherName: string
  otherRole: AccountRole
  childName: string | null
  messages: ChatMessage[]
  /**
   * ساعت کاری، فقط وقتی یک سرِ گفتگو خانواده است.
   *
   * خالی یعنی این گفتگو صفِ ساعت کاری ندارد — مدیر و مربی هر ساعتی
   * می‌نویسند و پیام همان لحظه می‌رسد.
   */
  hours: { start: string; end: string } | null
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
  /**
   * آلرژی‌های ثبت‌شده — بخش ۷.۱.
   *
   * سند از اول گفته بود «آلرژی غذایی باید همیشه در دید مربی باشد»، ولی
   * تا اینجا فقط در پرونده کودک بود: دو ضربه دورتر از لحظه‌ای که مربی
   * بشقاب را دستش می‌گیرد. حالا روی کارت شبکه می‌نشیند.
   *
   * خالی یعنی «ثبت نشده»، نه «ندارد». تفاوتش در رابط دیده نمی‌شود و
   * نباید هم دیده شود: کارتی که چیزی ندارد، چیزی نمی‌گوید.
   */
  allergies: string[]
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
  /**
   * سهمیه پیامک، دو سطل جدا — ارتقای ۴.
   *
   * تا اینجا یک عدد بود. مسئله‌اش این است که مدیری که سهمیه‌اش را برای
   * اطلاعیه‌های ماه سوزانده، همان عدد را می‌بیند و نمی‌داند که آیا
   * فردا می‌تواند حادثه را خبر دهد یا نه. دو سطل، دو عدد.
   */
  smsQuota: QuotaLine[]
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

  /**
   * فهرست کودکان فعال کل مرکز — فقط مدیر.
   *
   * جدا از getClassDay لازم است: آن فقط کودکانِ همین لحظه را می‌دهد و
   * ساعت نه صبح، کودک بعدازظهری در آن نیست. پراکندگی سنی داشبورد باید
   * کل مهد را ببیند، وگرنه هر ساعت عدد دیگری می‌دهد.
   */
  listCenterChildren(): Promise<Child[]>

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

  /* ── درگاه پرداخت — ارتقای ۱ ──────────────────────────────── */

  /** تراکنش را باز می‌کند و نشانی درگاه را می‌دهد. پرداخت نیست. */
  startOnlinePayment(invoiceId: string): Promise<PaymentIntent>

  /**
   * وضعیت تراکنش را از سرور می‌پرسد.
   *
   * بازگشت مرورگر سند نیست؛ این تابع است که می‌گوید چه شد. تا وقتی
   * پاسخ `pending` است، صورتحساب دست‌نخورده می‌ماند.
   */
  checkOnlinePayment(key: string): Promise<PaymentResult>

  /**
   * جواب خانواده به یک قلم اختیاری.
   *
   * پذیرفتن، سطر صورتحساب می‌سازد؛ نپذیرفتن هیچ بدهی‌ای نمی‌سازد —
   * اردویی که کودک نمی‌رود نباید در مانده بیاید.
   */
  answerFeeItem(itemId: string, childId: string, accept: boolean): Promise<void>

  /* ── پرونده کودک — ماژول M1 ───────────────────────────────── */

  getChildProfile(childId: string): Promise<ChildProfile>

  /* ── اعلام غیبت — بخش ۶.۴ ─────────────────────────────────── */

  declareAbsence(input: AbsenceInput): Promise<void>

  /** اطلاعیه‌هایی که به این حساب مربوط‌اند. */
  listMyNotices(): Promise<Notice[]>

  /* ── پیام با ساعت کاری — بخش ۶.۶ ──────────────────────────── */

  /**
   * صندوق گفتگوهای مربی — همه کودکان کلاس‌هایش که پیامی دارند.
   *
   * شماره هیچ‌کس در این مسیر نیست: گفتگو با شناسه کودک کلید می‌خورد و
   * پیام‌ها نام فرستنده را حمل می‌کنند، نه شماره‌اش.
   */
  listThreads(): Promise<ThreadSummary[]>

  getThread(childId: string): Promise<MessageThread>

  sendMessage(childId: string, body: string): Promise<Message>

  /* ── گفتگوی نفر به نفر ────────────────────────────────────── */

  /** صندوق من — همه گفتگوهایی که عضوشانم، تازه‌ترین اول. */
  listConversations(): Promise<ConversationSummary[]>

  /**
   * با چه کسانی می‌توانم گفتگوی تازه باز کنم.
   *
   * فهرست از سرور می‌آید و همان قاعده‌ای را می‌خواند که اجازه فرستادن
   * را می‌دهد — پس فهرست و مجوز نمی‌توانند با هم فرق کنند.
   */
  listMessageCandidates(): Promise<MessageCandidate[]>

  /** گفتگو را باز یا پیدا می‌کند. دوباره‌اجراپذیر. */
  openConversation(otherAccountId: string, aboutChildId?: string): Promise<string>

  getConversation(conversationId: string): Promise<Conversation>

  sendToConversation(conversationId: string, body: string): Promise<void>

  /** خواندن گفتگو. شمار نخوانده‌ها از همین‌جا صفر می‌شود. */
  markConversationRead(conversationId: string): Promise<void>

  /* ── پرونده کارکنان — مدیر ────────────────────────────────── */

  /** کارتابل مدیر. بدون نمره و بدون مقایسه — فقط فعالیت و کاستی مدرک. */
  getStaffCartable(from: string, to: string): Promise<StaffCartableRow[]>

  getStaffProfile(staffId: string): Promise<StaffProfile>

  uploadStaffDocument(input: StaffDocumentInput): Promise<void>

  addStaffNote(input: StaffNoteInput): Promise<void>

  /**
   * خروجی متنی پرونده کارکنان، برای بازرس.
   *
   * همان چیزی که روی صفحه است، نه بیشتر: خروجی‌ای که چیزی را نشان دهد
   * که مدیر خودش ندیده، یعنی دو حقیقت.
   */
  exportStaffFile(): Promise<string>

  /** مربی: مدارک و یادداشت‌های خودش (فقط آن‌ها که با او در میان گذاشته شده). */
  getMyStaffFile(): Promise<StaffProfile>

  /* ── بایگانی حضور و غیاب ──────────────────────────────────── */

  /**
   * روزهای حضور کودک در یک بازه، با ساعت ورود و خروج.
   *
   * خواسته مالک محصول: «آخر ماه پروفایل کودک مشخص باشه دقیقا چه روزها
   * و ساعت‌هایی حضور داشته».
   */
  getAttendanceMonth(childId: string, from: string, to: string): Promise<AttendanceMonth>

  /* ── بازی آزاد — ماژول M8 ─────────────────────────────────── */

  getFreePlayBoard(classId: string, date: string, session: PlaySession): Promise<FreePlayBoard>

  /**
   * ثبت انتخاب یک کودک.
   *
   * دوباره زدن، نظر عوض کردن است نه انتخاب دوم — ردیف را جابه‌جا
   * می‌کند، ردیف دوم نمی‌سازد.
   */
  setFreeChoice(
    childId: string,
    date: string,
    session: PlaySession,
    cornerId: string,
  ): Promise<void>

  /** برداشتن یک ثبت. کودک به فهرست «ثبت‌نشده» برمی‌گردد. */
  clearFreeChoice(childId: string, date: string, session: PlaySession): Promise<void>

  /** ثبت جفت بازی — پرسش اختیاری پایان روز. */
  setPlayPair(date: string, childA: string, childB: string, paired: boolean): Promise<void>

  getInterestMap(childId: string, from: string, to: string): Promise<InterestMap>

  /**
   * کودکانی که در بازه، جفتی برایشان ثبت نشده.
   *
   * برای مربی و مدیر، نه خانواده — و عمداً «منزوی» نامش نیست: نبودِ
   * ثبت یعنی کسی ننوشته، نه اینکه کودک تنها بوده.
   */
  listUnpairedChildren(from: string, to: string): Promise<{ childId: string; fullName: string }[]>

  /* ── پرونده بازرسی ────────────────────────────────────────── */

  getInspectionFile(): Promise<InspectionFile>

  /** چک‌لیست آغازین. نقطه شروع است، نه فهرست قانونی. */
  seedInspectionChecklist(): Promise<number>

  addInspectionRequirement(title: string, note?: string): Promise<void>

  /** غیرفعال کردن قلمی که این مهد لازمش ندارد. حذف نمی‌شود. */
  setRequirementActive(requirementId: string, active: boolean): Promise<void>

  uploadCenterDocument(input: CenterDocumentInput): Promise<void>

  recordInspectionVisit(input: InspectionVisitInput): Promise<void>

  /** بستن یک اقدام لازم. تاریخ رفع ثبت می‌شود، نه فقط یک تیک. */
  resolveInspectionAction(visitId: string): Promise<void>

  /* ── مشاهده و گزارش ماهانه ────────────────────────────────── */

  /** ثبت یک مشاهده. جمله خودِ مربی، بی هیچ ساختاری جز طول. */
  addObservation(input: ObservationInput): Promise<void>

  listObservations(childId: string, from: string, to: string): Promise<Observation[]>

  /** گزارش ماه، با همه مصالحش. اگر هنوز ساخته نشده، پیش‌نویس خالی. */
  getMonthlyReport(childId: string, period: string): Promise<MonthlyReport>

  /**
   * پیش‌نویس کمکی — گزینه (ب).
   *
   * مدل فقط جمله‌های خودِ مربی را می‌بیند: نه حضور، نه خلق، نه غذا، نه
   * نام کودکان دیگر. خروجی پیش‌نویس است، نه گزارش؛ تا مربی ویرایشش
   * نکند و جمع‌بندی ننویسد، چیزی به خانواده نمی‌رود.
   */
  buildAssistedDraft(childId: string, period: string): Promise<string>

  /** ذخیره جمع‌بندی مربی. */
  saveMonthlyReport(
    childId: string,
    period: string,
    patch: { teacherSummary?: string; meetingNotes?: string },
  ): Promise<void>

  /** ارسال به خانواده. بی جمع‌بندی مربی، رد می‌شود. */
  shareMonthlyReport(childId: string, period: string): Promise<void>

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

  /* ── ویرایش پرونده کودک ───────────────────────────────────── */

  /** میدان‌های قابل ویرایش، با مقدار فعلی و درخواست بازِ هر کدام. */
  listProfileFields(childId: string): Promise<ProfileField[]>

  /**
   * درخواست تغییر از سوی خانواده.
   *
   * **هیچ ستونی را عوض نمی‌کند.** تا مدیر تأیید نکند، پرونده کودک
   * دست‌نخورده می‌ماند و مربی مقدار قبلی را می‌بیند.
   */
  requestProfileChange(childId: string, field: string, value: string): Promise<void>

  /** صف مدیر. میدان‌های ایمنی اول. */
  listProfileChanges(): Promise<ProfileChange[]>

  /** تصمیم مدیر. رد، دلیل می‌خواهد تا خانواده بداند چه شد. */
  decideProfileChange(requestId: string, approve: boolean, reason?: string): Promise<void>

  /* ── اقلام هزینه — مدیر ───────────────────────────────────── */

  listFeeItems(period: string): Promise<FeeItem[]>

  /**
   * قلم را می‌سازد و به کودکان دامنه‌اش می‌بندد — ولی منتشر نمی‌کند.
   *
   * ساختن و فرستادن دو کار جدایند: فرستادن، بیرونی و برگشت‌ناپذیر
   * است و باید ضربه خودش را داشته باشد.
   */
  createFeeItem(input: FeeItemInput): Promise<FeeItem>

  /**
   * انتشار: از این لحظه خانواده‌ها می‌بینندش و سطرهای صورتحساب
   * ساخته می‌شوند. شمار سطرهای ساخته‌شده برمی‌گردد.
   */
  publishFeeItem(itemId: string): Promise<number>

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
