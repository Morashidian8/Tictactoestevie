/**
 * ارقام فارسی — بخش ۱۲.۴ سند.
 *
 * قاعده: ارقام فارسی در متن و رابط، ارقام لاتین در فیلدهای ورودی عددی
 * و شماره تلفن. پس این ماژول هر دو جهت تبدیل را می‌دهد و انتخاب با
 * فراخوان است، نه با پیش‌فرض سراسری.
 */

const PERSIAN_ZERO = 0x06f0
const LATIN_DIGITS = /[0-9]/g
const PERSIAN_DIGITS = /[۰-۹]/g
const ARABIC_DIGITS = /[٠-٩]/g

/** ارقام لاتین را به فارسی تبدیل می‌کند. برای نمایش در رابط. */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(LATIN_DIGITS, (d) =>
    String.fromCharCode(PERSIAN_ZERO + Number(d)),
  )
}

/**
 * ارقام فارسی و عربی را به لاتین تبدیل می‌کند.
 * هر ورودی کاربر پیش از رفتن به لایه داده باید از اینجا رد شود، چون
 * صفحه‌کلید فارسی ارقام فارسی می‌دهد و پایگاه داده لاتین می‌خواهد.
 */
export function toLatinDigits(input: string): string {
  return input
    .replace(PERSIAN_DIGITS, (d) => String(d.charCodeAt(0) - PERSIAN_ZERO))
    .replace(ARABIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660))
}

const countFormatter = new Intl.NumberFormat('fa-IR', { useGrouping: false })
const amountFormatter = new Intl.NumberFormat('fa-IR', { useGrouping: true })

/** شمارش ساده بدون جداکننده: «۱۸ حاضر». */
export function formatCount(value: number): string {
  return countFormatter.format(value)
}

/**
 * مبلغ با جداکننده هزارگان و واحد «تومان» با فاصله — بخش ۱۲.۴.
 * واحد اینجا چسبیده است تا هیچ صفحه‌ای خودش «تومان» را دستی ننویسد.
 */
export function formatToman(value: number): string {
  return `${amountFormatter.format(value)} تومان`
}

/**
 * مبلغ ذخیره‌شده به ریال، نمایش‌داده‌شده به تومان.
 *
 * ستون‌های مالی دیتابیس به ریال‌اند (bigint) و مردم به تومان حرف
 * می‌زنند. تقسیم بر ده فقط اینجا انجام می‌شود تا هیچ صفحه‌ای خودش این
 * کار را نکند و هیچ‌جا ده برابر نشود.
 */
export function formatRial(value: number): string {
  return formatToman(Math.round(value / 10))
}
