import { toLatinDigits } from './format'

/** حذف اعراب، یکسان‌سازی ی/ک عربی، نیم‌فاصله و فاصله‌های اضافی */
export function normalizeFa(input: string): string {
  return toLatinDigits(input)
    .replace(/[ً-ٰٟـ]/g, '') // اعراب و کشیده
    .replace(/[ىي]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/[ۀة]/g, 'ه')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ؤ]/g, 'و')
    .replace(/[ئ]/g, 'ی')
    .replace(/‌/g, ' ')
    .replace(/[.،؛:!?؟"'«»()\[\]…\-—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** آیا پاسخ کاربر با یکی از پاسخ‌های پذیرفتنی یکی است؟ */
export function matchesAny(userInput: string, accepted: string[]): boolean {
  const u = normalizeFa(userInput)
  if (!u) return false
  return accepted.some((a) => normalizeFa(a) === u)
}

/** نمره‌دهی پاسخ کوتاه بر پایهٔ کلیدواژه‌ها (۰ تا ۱) */
export function keywordScore(userInput: string, keywords: string[]): number {
  if (keywords.length === 0) return 0
  const u = normalizeFa(userInput)
  if (u.length < 2) return 0
  const hit = keywords.filter((k) => u.includes(normalizeFa(k))).length
  return hit / keywords.length
}

/** بریدن متن برای پیش‌نمایش */
export function excerpt(s: string, n = 90): string {
  return s.length > n ? s.slice(0, n).trimEnd() + '…' : s
}

/** جست‌وجوی ساده با امتیازدهی */
export function searchScore(haystack: string, needle: string): number {
  const h = normalizeFa(haystack)
  const n = normalizeFa(needle)
  if (!n) return 0
  if (h === n) return 100
  if (h.startsWith(n)) return 70
  if (h.includes(n)) return 40
  const words = n.split(' ').filter(Boolean)
  const hits = words.filter((w) => h.includes(w)).length
  return words.length ? (hits / words.length) * 25 : 0
}

/** به‌هم‌ریختن آرایه (Fisher–Yates) با بذر ثابت برای پایداری بین رندرها */
export function shuffle<T>(arr: T[], seed = 1): T[] {
  const a = [...arr]
  let s = seed || 1
  const rnd = () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
