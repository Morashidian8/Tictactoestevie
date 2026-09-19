import type { Birthday, Child } from './types.ts'

/**
 * تولدهای پیشِ رو، از روی تاریخ تولد.
 *
 * ── چرا در فایل مشترک ───────────────────────────────────────────
 *
 * هر دو آداپتور (محلی و Supabase) همین را لازم دارند و اگر هرکدام
 * حساب خودش را می‌کرد، روزی یکی «فردا» می‌گفت و دیگری «امروز» — همان
 * جور اختلافی که در نسخهٔ نمایشی دیده نمی‌شود و در مهد واقعی یعنی
 * مربی تبریک را یک روز دیر می‌گوید.
 *
 * ── دو مرزی که رعایت می‌شود ─────────────────────────────────────
 *
 * ۱. **روزِ محلی، نه UTC.** تولد یک تاریخ تقویمی است، نه یک لحظه.
 *    مقایسه روی رشتهٔ `YYYY-MM-DD` انجام می‌شود تا تهران و UTC یک
 *    جواب بدهند؛ `Date` با ساعت، مرزِ نیمه‌شب را جابه‌جا می‌کند.
 *
 * ۲. **۲۹ اسفند و ۲۹ فوریه.** کودکی که در ۲۹ فوریه به دنیا آمده، در
 *    سال غیرکبیسه تولدش ۲۸ فوریه حساب می‌شود، نه اول مارس — وگرنه در
 *    سه سال از چهار سال، تولدش از فهرست جا می‌افتد.
 */
export function upcomingBirthdays(
  children: Child[],
  withinDays: number,
  classNameOf: (classId: string) => string | null,
  today: Date = new Date(),
): Birthday[] {
  const from = localIsoDate(today)
  const rows: Birthday[] = []

  for (const child of children) {
    if (!child.birthDate) continue
    const born = parts(child.birthDate)
    if (!born) continue

    const next = nextOccurrence(born, from)
    const gap = daysBetween(from, next)
    if (gap < 0 || gap > withinDays) continue

    rows.push({
      childId: child.id,
      firstName: child.firstName,
      lastName: child.lastName,
      photoUrl: child.photoUrl,
      className: child.classId ? classNameOf(child.classId) : null,
      date: next,
      turning: Number(next.slice(0, 4)) - born.year,
      inDays: gap,
    })
  }

  /* نزدیک‌ترین اول. تولدِ هم‌روز، به ترتیب نام — نه به ترتیب سن. */
  return rows.sort(
    (a, b) => a.inDays - b.inDays || a.firstName.localeCompare(b.firstName, 'fa'),
  )
}

/** «فردا تولد کیست» — همان چیزی که اعلانِ یک‌روز‌قبل رویش سوار است. */
export function birthdaysTomorrow(rows: Birthday[]): Birthday[] {
  return rows.filter((row) => row.inDays === 1)
}

function parts(iso: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m?.[1] || !m[2] || !m[3]) return null
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

/** روزِ محلی به ISO. `toISOString` روز را با UTC می‌سنجد و شب‌ها یکی عقب می‌افتد. */
function localIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * اولین تکرارِ تولد از `from` به بعد — امسال، وگرنه سال بعد.
 */
function nextOccurrence(
  born: { month: number; day: number },
  from: string,
): string {
  const year = Number(from.slice(0, 4))
  const thisYear = clampToMonth(year, born.month, born.day)
  return thisYear >= from ? thisYear : clampToMonth(year + 1, born.month, born.day)
}

/** ۲۹ فوریه در سال غیرکبیسه، ۲۸ فوریه می‌شود — نه اول مارس. */
function clampToMonth(year: number, month: number, day: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const safe = Math.min(day, last)
  return `${year}-${String(month).padStart(2, '0')}-${String(safe).padStart(2, '0')}`
}

/** فاصلهٔ دو روزِ تقویمی. هر دو ISO و بی ساعت، پس ساعت تابستانی بی‌اثر است. */
function daysBetween(from: string, to: string): number {
  const a = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)))
  const b = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)))
  return Math.round((b - a) / 86_400_000)
}
