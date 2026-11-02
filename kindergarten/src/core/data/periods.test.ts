import { describe, expect, it } from 'vitest'
import {
  activeEnrollment,
  applicableFields,
  dayEndFor,
  dayStartFor,
  enrolledOn,
  minutesOf,
  periodsAt,
  periodsFor,
  phaseAt,
  shiftPeriods,
  staffOnDutyIds,
  upcomingPeriodAt,
  weekdayOf,
} from './periods.ts'
import type { DayPeriod, Enrollment, StaffShift } from './types.ts'

const PERIODS: DayPeriod[] = [
  {
    id: 'p1', key: 'morning', title: 'صبح',
    startTime: '07:30', endTime: '13:00', sortOrder: 1,
    reportFields: ['mood_morning', 'mood_noon'],
    includedIn: ['morning', 'full_day'],
  },
  {
    id: 'p2', key: 'afternoon', title: 'بعدازظهر',
    startTime: '13:00', endTime: '16:30', sortOrder: 2,
    reportFields: ['nap', 'mood_afternoon'],
    includedIn: ['afternoon', 'full_day'],
  },
]

/** شنبه ۱۴ شهریور ۱۴۰۵ برابر ۵ سپتامبر ۲۰۲۶. */
const saturdayAt = (clock: string): Date => {
  const [h = '0', m = '0'] = clock.split(':')
  return new Date(2026, 8, 5, Number(h), Number(m))
}

describe('بازه‌های روز', () => {
  it('بازه دربرگیرنده یک لحظه را می‌دهد', () => {
    expect(periodsAt(PERIODS, saturdayAt('09:00')).map((p) => p.key)).toEqual(['morning'])
    expect(periodsAt(PERIODS, saturdayAt('15:00')).map((p) => p.key)).toEqual(['afternoon'])
  })

  it('پیش از شروع و پس از پایان کار مهد، هیچ بازه‌ای نیست', () => {
    expect(periodsAt(PERIODS, saturdayAt('06:00'))).toEqual([])
    expect(periodsAt(PERIODS, saturdayAt('18:00'))).toEqual([])
  })

  /*
   * مرز، بحرانی‌ترین نقطه روز است. اینجا بازه‌ها پشت سر هم‌اند و
   * همپوشانی ندارند، ولی تابع جمع برمی‌گرداند تا وقتی مهد مرز را
   * همپوشان کرد، هیچ‌جای کد نشکند.
   */
  it('در مرز، بازه بعدی شروع می‌شود و قبلی تمام', () => {
    expect(periodsAt(PERIODS, saturdayAt('13:00')).map((p) => p.key)).toEqual(['afternoon'])
    expect(periodsAt(PERIODS, saturdayAt('12:59')).map((p) => p.key)).toEqual(['morning'])
  })
})

describe('دوره حضور کودک', () => {
  it('کودک صبحانه‌ای فقط بازه صبح را دارد', () => {
    expect(periodsFor(PERIODS, 'morning').map((p) => p.key)).toEqual(['morning'])
  })

  it('کودک تمام‌روز هر دو را دارد، به ترتیب', () => {
    expect(periodsFor(PERIODS, 'full_day').map((p) => p.key)).toEqual(['morning', 'afternoon'])
  })

  /* ناهار طبق تصمیم مالک محصول برای همه است و به بازه وصل نیست. */
  it('ناهار برای هر سه نوع حضور هست', () => {
    for (const type of ['morning', 'afternoon', 'full_day'] as const) {
      expect(applicableFields(PERIODS, type)).toContain('lunch')
    }
  })

  it('کودک صبحانه‌ای خلق عصر ندارد، نه اینکه خالی داشته باشد', () => {
    const fields = applicableFields(PERIODS, 'morning')
    expect(fields).toContain('mood_morning')
    expect(fields).not.toContain('mood_afternoon')
    expect(fields).not.toContain('nap')
  })

  it('کودک بعدازظهری خلق صبح ندارد', () => {
    const fields = applicableFields(PERIODS, 'afternoon')
    expect(fields).not.toContain('mood_morning')
    expect(fields).toContain('mood_afternoon')
    expect(fields).toContain('nap')
  })

  it('روز کودک از بازه خودش شروع و تمام می‌شود، نه از ساعت کار مهد', () => {
    expect(dayStartFor(PERIODS, 'afternoon')).toBe('13:00')
    expect(dayEndFor(PERIODS, 'morning')).toBe('13:00')
    expect(dayEndFor(PERIODS, 'full_day')).toBe('16:30')
  })
})

describe('روزهای هفته', () => {
  it('شنبه صفر است، مثل تقویم ایرانی', () => {
    expect(weekdayOf(saturdayAt('09:00'))).toBe(0)
    expect(weekdayOf(new Date(2026, 8, 6, 9))).toBe(1)
  })

  const threeDays: Enrollment = {
    id: 'e1', childId: 'c1', classId: 'k1',
    startDate: '1404-01-01', endDate: null,
    attendanceType: 'full_day', weekdays: [0, 2, 4],
    feePlanId: null, discountPercent: 0,
  }

  it('کودک سه‌روزه فقط در روزهای خودش می‌آید', () => {
    expect(enrolledOn(threeDays, saturdayAt('09:00'))).toBe(true)
    expect(enrolledOn(threeDays, new Date(2026, 8, 6, 9))).toBe(false)
  })

  it('بدون ثبت‌نام فعال، هیچ روزی روز او نیست', () => {
    expect(enrolledOn(null, saturdayAt('09:00'))).toBe(false)
  })
})

describe('ثبت‌نام فعال', () => {
  const past: Enrollment = {
    id: 'e-old', childId: 'c1', classId: 'k1',
    startDate: '1404-01-01', endDate: '1404-06-31',
    attendanceType: 'morning', weekdays: [0, 1, 2, 3, 4],
    feePlanId: null, discountPercent: 0,
  }
  const now: Enrollment = { ...past, id: 'e-new', startDate: '1404-07-01', endDate: null, attendanceType: 'full_day' }

  /*
   * همین دلیلِ نشستن دوره حضور روی ثبت‌نام است، نه روی کودک: کودکی که
   * از صبحانه‌ای به تمام‌روز رفته، تاریخچه‌اش می‌ماند.
   */
  it('ردیفی را می‌دهد که تاریخ در بازه‌اش است', () => {
    expect(activeEnrollment([past, now], '1404-05-01')?.attendanceType).toBe('morning')
    expect(activeEnrollment([past, now], '1404-08-01')?.attendanceType).toBe('full_day')
  })

  it('پیش از اولین ثبت‌نام، هیچ‌کدام', () => {
    expect(activeEnrollment([past, now], '1403-12-01')).toBeNull()
  })
})

describe('شیفت مربی', () => {
  const shift = (staffId: string, start: string, end: string): StaffShift[] =>
    [0, 1, 2, 3, 4].map((weekday) => ({
      id: `${staffId}-${weekday}`, staffId, classId: 'k1', weekday,
      startTime: start, endTime: end,
      effectiveFrom: '1404-01-01', effectiveTo: null,
    }))

  /*
   * همین دلیلِ تعریف شیفت با ساعت است، نه با بازه: اگر با بازه تعریف
   * می‌شد، تفاوت این دو مربی اصلاً قابل بیان نبود.
   */
  it('مربی تا ظهر یک بازه را می‌پوشاند، مربی تمام‌روز هر دو را', () => {
    const short = shiftPeriods(PERIODS, shift('s1', '07:30', '13:00'), saturdayAt('09:00'), '1405-06-14')
    const long = shiftPeriods(PERIODS, shift('s2', '07:30', '16:30'), saturdayAt('09:00'), '1405-06-14')
    expect(short.map((p) => p.key)).toEqual(['morning'])
    expect(long.map((p) => p.key)).toEqual(['morning', 'afternoon'])
  })

  it('شیفتی که فقط بخشی از بازه را بگیرد، همان بازه را می‌پوشاند', () => {
    const overlap = shiftPeriods(PERIODS, shift('s3', '12:30', '16:30'), saturdayAt('09:00'), '1405-06-14')
    expect(overlap.map((p) => p.key)).toEqual(['morning', 'afternoon'])
  })

  /* بخش ۷.۲: هیچ‌جا نباید فرض کند «مربی فعال» یک نفر است. */
  it('در یک لحظه می‌تواند بیش از یک مربی سر کار باشد', () => {
    const both = [...shift('s1', '07:30', '13:00'), ...shift('s2', '07:30', '16:30')]
    expect(staffOnDutyIds(both, saturdayAt('09:00'), '1405-06-14').sort()).toEqual(['s1', 's2'])
    expect(staffOnDutyIds(both, saturdayAt('15:00'), '1405-06-14')).toEqual(['s2'])
  })

  it('شیفتی که هنوز اثرگذار نشده شمرده نمی‌شود', () => {
    const future = shift('s4', '07:30', '16:30').map((s) => ({ ...s, effectiveFrom: '1406-01-01' }))
    expect(staffOnDutyIds(future, saturdayAt('09:00'), '1405-06-14')).toEqual([])
  })
})

describe('ساعت', () => {
  it('به دقیقه تبدیل می‌شود، چون مقایسه رشته‌ای برای ساعت کافی نیست', () => {
    expect(minutesOf('09:05')).toBe(545)
    expect(minutesOf('13:00')).toBe(780)
  })
})

/**
 * پنجره انتقال — تصمیم ۰۳ سند بررسی طراحی.
 *
 * قاعده‌ای که این‌ها محافظت می‌کنند: هیچ کودکی نباید ناگهان از شبکه
 * ظاهر یا ناپدید شود. هر تغییر دست‌کم نیم‌ساعت از قبل دیده شده است.
 */
describe('پنجره انتقال بازه‌ها', () => {
  const morning = periodsFor(PERIODS, 'morning')
  const afternoon = periodsFor(PERIODS, 'afternoon')
  const fullDay = periodsFor(PERIODS, 'full_day')
  const at = (h: number, m = 0) => new Date(2026, 2, 11, h, m)

  it('کودک بعدازظهری، نیم‌ساعت پیش از بازه‌اش پیدا می‌شود', () => {
    expect(phaseAt(afternoon, at(12, 25))).toBeNull()
    expect(phaseAt(afternoon, at(12, 30))).toBe('upcoming')
    expect(phaseAt(afternoon, at(12, 59))).toBe('upcoming')
    expect(phaseAt(afternoon, at(13, 0))).toBe('current')
  })

  it('کودک صبحانه‌ای، نیم‌ساعت پس از بازه‌اش می‌ماند و بعد می‌رود', () => {
    expect(phaseAt(morning, at(12, 59))).toBe('current')
    expect(phaseAt(morning, at(13, 0))).toBe('departing')
    expect(phaseAt(morning, at(13, 29))).toBe('departing')
    expect(phaseAt(morning, at(13, 30))).toBeNull()
  })

  /*
   * کودک تمام‌روز سر مرز هیچ‌وقت از شبکه بیرون نمی‌رود: پایان بازه صبح
   * همان آغاز بازه بعدازظهر است، پس همیشه current می‌ماند.
   */
  it('کودک تمام‌روز سر مرز از شبکه بیرون نمی‌رود', () => {
    for (const [h, m] of [[12, 30], [12, 59], [13, 0], [13, 30]] as const) {
      expect(phaseAt(fullDay, at(h, m))).toBe('current')
    }
  })

  it('بیرون از ساعت کار هیچ‌کس در فهرست نیست', () => {
    expect(phaseAt(fullDay, at(6, 0))).toBeNull()
    expect(phaseAt(fullDay, at(22, 0))).toBeNull()
  })

  it('نیم‌ساعت پیش از شروع کار، بازه صبح پنجره‌اش باز می‌شود', () => {
    expect(phaseAt(morning, at(7, 0))).toBe('upcoming')
    expect(phaseAt(morning, at(6, 59))).toBeNull()
  })

  it('بازه در راه، نامش را می‌دهد — برای بنر و نوار بازه', () => {
    expect(upcomingPeriodAt(PERIODS, at(12, 45))?.key).toBe('afternoon')
    expect(upcomingPeriodAt(PERIODS, at(9, 0))).toBeNull()
    expect(upcomingPeriodAt(PERIODS, at(13, 15))).toBeNull()
  })

  /*
   * طول پنجره توکن است، نه ثابت. مرکزی که مرز را جابه‌جا کند یا پنجره
   * کوتاه‌تری بخواهد، نباید به کد دست بزند.
   */
  it('طول پنجره قابل تنظیم است', () => {
    expect(phaseAt(afternoon, at(12, 45), 10)).toBeNull()
    expect(phaseAt(afternoon, at(12, 55), 10)).toBe('upcoming')
    expect(upcomingPeriodAt(PERIODS, at(12, 45), 10)).toBeNull()
  })
})
