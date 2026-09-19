import { describe, expect, it } from 'vitest'
import { birthdaysTomorrow, upcomingBirthdays } from './birthdays.ts'
import type { Child } from './types.ts'

const child = (id: string, birthDate: string | null, firstName = id): Child => ({
  id,
  classId: 'class-golha',
  firstName,
  lastName: 'نمونه',
  photoUrl: null,
  birthDate,
})

const nameOf = () => 'گل‌ها'
const on = (iso: string) => new Date(`${iso}T09:00:00`)

describe('تولدهای پیشِ رو', () => {
  it('امروز صفر روز مانده، فردا یک روز', () => {
    const rows = upcomingBirthdays(
      [child('a', '2021-06-10'), child('b', '2021-06-11')],
      14,
      nameOf,
      on('2026-06-10'),
    )
    expect(rows.map((r) => [r.childId, r.inDays])).toEqual([
      ['a', 0],
      ['b', 1],
    ])
  })

  it('تولدی که گذشته، برای سال بعد حساب می‌شود و در بازه نمی‌آید', () => {
    const rows = upcomingBirthdays([child('a', '2021-06-09')], 14, nameOf, on('2026-06-10'))
    expect(rows).toEqual([])
  })

  it('از مرز سال رد می‌شود', () => {
    const rows = upcomingBirthdays([child('a', '2021-01-02')], 14, nameOf, on('2026-12-28'))
    expect(rows[0]?.date).toBe('2027-01-02')
    expect(rows[0]?.inDays).toBe(5)
    expect(rows[0]?.turning).toBe(6)
  })

  it('بیرون از بازه نمی‌آید', () => {
    const rows = upcomingBirthdays([child('a', '2021-07-01')], 14, nameOf, on('2026-06-10'))
    expect(rows).toEqual([])
  })

  it('کودک بی تاریخ تولد، ردیف نمی‌سازد', () => {
    expect(upcomingBirthdays([child('a', null)], 14, nameOf, on('2026-06-10'))).toEqual([])
  })

  /*
   * ۲۹ فوریه: در سال غیرکبیسه به ۲۸ می‌افتد، نه اول مارس. اگر به مارس
   * می‌افتاد، در سه سال از چهار سال تولدش از فهرست جا می‌ماند.
   */
  it('۲۹ فوریه در سال غیرکبیسه، ۲۸ فوریه می‌شود', () => {
    const rows = upcomingBirthdays([child('a', '2020-02-29')], 10, nameOf, on('2026-02-25'))
    expect(rows[0]?.date).toBe('2026-02-28')
  })

  it('و در سال کبیسه سر جای خودش می‌ماند', () => {
    const rows = upcomingBirthdays([child('a', '2020-02-29')], 10, nameOf, on('2028-02-25'))
    expect(rows[0]?.date).toBe('2028-02-29')
  })

  it('نزدیک‌ترین اول، و هم‌روزها به ترتیب نام', () => {
    const rows = upcomingBirthdays(
      [
        child('far', '2021-06-20', 'زهرا'),
        child('b', '2021-06-11', 'بهار'),
        child('a', '2021-06-11', 'آوا'),
      ],
      14,
      nameOf,
      on('2026-06-10'),
    )
    expect(rows.map((r) => r.childId)).toEqual(['a', 'b', 'far'])
  })

  it('چند سالش می‌شود، نه چند سالش هست', () => {
    const rows = upcomingBirthdays([child('a', '2021-06-11')], 14, nameOf, on('2026-06-10'))
    expect(rows[0]?.turning).toBe(5)
  })

  it('«فردا» فقط یک‌روزمانده‌ها را برمی‌دارد', () => {
    const rows = upcomingBirthdays(
      [child('today', '2021-06-10'), child('tomorrow', '2021-06-11'), child('later', '2021-06-14')],
      14,
      nameOf,
      on('2026-06-10'),
    )
    expect(birthdaysTomorrow(rows).map((r) => r.childId)).toEqual(['tomorrow'])
  })

  /*
   * مرزِ نیمه‌شب. با `toISOString` روزِ محلیِ شب، یک روز عقب می‌افتد و
   * «امروز» می‌شد «فردا» — یعنی مربی تبریک را یک روز دیر می‌گفت.
   */
  it('شبِ دیروقت هم همان روز را می‌گوید', () => {
    const rows = upcomingBirthdays(
      [child('a', '2021-06-10')],
      14,
      nameOf,
      new Date('2026-06-10T23:30:00'),
    )
    expect(rows[0]?.inDays).toBe(0)
  })
})
