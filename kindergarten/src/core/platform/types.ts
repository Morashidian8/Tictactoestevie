/**
 * لایهٔ سکو — کارِ اپراتور، جدا از کارِ مهد.
 *
 * ── چرا رابط جدا و نه چند متد روی `DataAccess` ──────────────────
 *
 * `DataAccess` قید مرکز را در خودش بسته است (بند ۱۱.۱۰): هیچ متدی
 * `center_id` نمی‌گیرد، چون همه‌شان به یک مرکز تعلق دارند. اپراتوری که
 * چهل مرکز را می‌گرداند، به هیچ‌کدام تعلق ندارد.
 *
 * چسباندن `listCenters` به آن رابط یعنی هر صفحهٔ مهد هم می‌توانست
 * صدایش بزند. مرزی که در پایگاه داده کشیده شده — اپراتور بیرون از مدل
 * مستأجر — همین‌جا هم کشیده می‌شود.
 *
 * ── خط قرمز، همان که در مهاجرت ۰۰۴۱ نوشته شد ────────────────────
 *
 * اینجا هیچ متدی نیست که پروندهٔ کودک، گزارش، پیام یا صورتحساب بدهد.
 * اپراتور **شمار** می‌بیند، نه سطر. اگر روزی کسی خواست متدی اضافه کند
 * که نام کودکی را برگرداند، همین‌جا بایستد.
 */

/** یک مهد، از دید اپراتور. همه‌چیز عدد است. */
export type CenterSummary = {
  centerId: string
  name: string
  /** نام طرح فروش. متن آزاد است تا قیمت‌گذاری در کد قفل نشود. */
  plan: string | null
  /** تهی یعنی بی‌پایان — مهدهای خودمان و پایلوت‌ها. */
  activeUntil: string | null
  licenceActive: boolean
  children: number
  staff: number
  families: number
  /** آخرین روزی که ثبتی داشته. تهی یعنی هنوز شروع نکرده. */
  lastActivity: string | null
}

/** مهد تازه، با مدیر اولش. مهدِ بی‌مدیر بی‌فایده است. */
export type NewCenter = {
  name: string
  managerName: string
  managerPhone: string
  plan?: string | null
  activeUntil?: string | null
}

export type PlatformAccess = {
  /** فهرست مهدها با شمار و وضعیت اشتراک. */
  listCenters(): Promise<CenterSummary[]>

  /** ساخت مهد و مدیر اولش، با یک تراکنش. شناسهٔ مهد برمی‌گردد. */
  createCenter(input: NewCenter): Promise<string>

  /** تمدید، تغییر طرح، یا بستن یک مهد. */
  setCenterLicence(
    centerId: string,
    plan: string | null,
    activeUntil: string | null,
  ): Promise<void>
}
