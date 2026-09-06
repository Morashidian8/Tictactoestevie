const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']

/** تبدیل ارقام لاتین به فارسی */
export function fa(input: string | number): string {
  return String(input).replace(/\d/g, (d) => FA_DIGITS[+d])
}

/** تبدیل ارقام فارسی/عربی به لاتین — برای مقایسهٔ پاسخ‌ها */
export function toLatinDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
}

export function faOrdinal(n: number): string {
  const names = ['', 'اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم', 'هفتم', 'هشتم', 'نهم', 'دهم',
    'یازدهم', 'دوازدهم', 'سیزدهم', 'چهاردهم', 'پانزدهم', 'شانزدهم', 'هفدهم', 'هجدهم', 'نوزدهم', 'بیستم']
  return names[n] ?? fa(n)
}

export function gradeName(g: number): string {
  const names: Record<number, string> = {
    7: 'هفتم', 8: 'هشتم', 9: 'نهم', 10: 'دهم', 11: 'یازدهم', 12: 'دوازدهم',
  }
  return names[g] ?? fa(g)
}

/** «۳ دقیقه پیش» / «دیروز» */
export function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'همین حالا'
  if (s < 3600) return `${fa(Math.floor(s / 60))} دقیقه پیش`
  if (s < 86400) return `${fa(Math.floor(s / 3600))} ساعت پیش`
  if (s < 172800) return 'دیروز'
  return `${fa(Math.floor(s / 86400))} روز پیش`
}

/** کلید روز شمسی — پایهٔ محاسبهٔ «روزهای پیاپی» */
export function dayKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA-u-ca-persian-nu-latn', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

export function jalaliToday(): string {
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date())
}

export function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return fa(`${m}:${String(s).padStart(2, '0')}`)
}
