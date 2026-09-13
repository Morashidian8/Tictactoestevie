import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataAccess } from './index.ts'
import { toIsoDate } from '../../i18n/index.ts'
import type { AccessScope, DataAccess } from './types.ts'

/**
 * بستن روز — بخش ۵.۹ سند.
 *
 * قاعده‌ای که اینجا مهم است: پس از ارسال، گزارش قفل می‌شود. سند
 * می‌گوید «تغییر بعدی فقط به شکل اصلاحیه ثبت می‌شود». اگر این نبندد،
 * چیزی که خانواده دیده بی‌سروصدا عوض می‌شود.
 *
 * از زمانی که کودکان دوره حضور جدا دارند، «کامل» دیگر یک تعریف ثابت
 * نیست: کودک صبحانه‌ای خواب و خلق عصر ندارد، پس نداشتنش نقص نیست.
 * تاریخ‌های این فایل همه روز کاری‌اند (شنبه تا چهارشنبه)؛ روز تعطیل
 * اصلاً کودکی ندارد که گزارشش ناقص باشد.
 */
const scope: AccessScope = {
  accountId: 'acc-1',
  centerId: 'centre-aftab',
  role: 'teacher',
  classIds: ['class-golha'],
}

const CLASS = 'class-golha'
let data: DataAccess

/*
 * ساعت ثابت، وگرنه تست شب‌ها می‌افتد: ثبت گروهی فقط روی کودکان بازه
 * فعلی می‌نشیند و نیمه‌شب هیچ بازه‌ای باز نیست.
 */
beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 2, 11, 9, 0))
  data = await createDataAccess(scope)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('شمارش کامل و ناقص', () => {
  it('گزارش دست‌نخورده ناقص است و می‌گوید چه کم دارد', async () => {
    const date = '2026-04-04'
    const summary = await data.getDaySummary(CLASS, date)
    expect(summary.complete).toHaveLength(0)
    expect(summary.incomplete[0]?.missing).toEqual(['ناهار', 'خواب', 'خلق'])
  })

  /*
   * کودک صبحانه‌ای نه خواب دارد نه خلق عصر. پیش‌تر همین باعث می‌شد
   * گزارشش تا آخر روز ناقص بماند و مربی دنبال چیزی بگردد که وجود ندارد.
   */
  it('کودک صبحانه‌ای برای نداشتن خواب ناقص شمرده نمی‌شود', async () => {
    const date = '2026-04-05'
    await data.applyBulk(CLASS, date, { lunch: 'most', mood: 'good', napStart: null })
    const summary = await data.getDaySummary(CLASS, date)
    // child-3 صبحانه‌ای است
    expect(summary.complete).toContain('child-3')
    expect(summary.incomplete.find((i) => i.childId === 'child-3')).toBeUndefined()
  })

  /*
   * یک ثبت گروهی صبح، کلاس را کامل نمی‌کند: کودک بعدازظهری هنوز نیامده
   * و اصلاً در جلسه نیست. کامل شدنِ کلاس دو ثبت می‌خواهد، یکی در هر بازه.
   */
  it('ثبت گروهی صبح کودک بعدازظهری را کامل نمی‌کند', async () => {
    const date = '2026-04-05'
    await data.applyBulk(CLASS, date, { lunch: 'most', mood: 'good', napStart: '13:00' })
    const summary = await data.getDaySummary(CLASS, date)
    // child-4 بعدازظهری است و صبح در جلسه نبوده
    expect(summary.incomplete.map((i) => i.childId)).toContain('child-4')
    // child-1 تمام‌روز است: صبحش پر شده ولی بعدازظهرش هنوز نه
    expect(summary.incomplete.find((i) => i.childId === 'child-1')?.missing).toEqual([
      'خواب',
      'خلق',
    ])
  })

  it('ثبت گروهی در هر دو بازه، کل کلاس را کامل می‌کند', async () => {
    const date = '2026-04-05'
    await data.applyBulk(CLASS, date, { lunch: 'most', mood: 'good', napStart: '13:00' })
    vi.setSystemTime(new Date(2026, 3, 5, 14, 0))
    await data.applyBulk(CLASS, date, { lunch: 'most', mood: 'good', napStart: '13:00' })

    const summary = await data.getDaySummary(CLASS, date)
    expect(summary.incomplete).toHaveLength(0)
    expect(summary.complete.length).toBeGreaterThan(0)
  })

  it('ثبت گروهی بدون خواب، گزارش تمام‌روز را ناقص می‌گذارد', async () => {
    const date = '2026-04-06'
    await data.applyBulk(CLASS, date, { lunch: 'most', mood: 'good', napStart: null })
    vi.setSystemTime(new Date(2026, 3, 6, 14, 0))
    await data.applyBulk(CLASS, date, { lunch: null, mood: 'good', napStart: null })

    const summary = await data.getDaySummary(CLASS, date)
    // child-1 تمام‌روز است، پس خواب برایش معنا دارد و تنها چیزی است که مانده
    expect(summary.incomplete.find((i) => i.childId === 'child-1')?.missing).toEqual(['خواب'])
  })

  it('تفکیک بازه‌های خلق در استثنای هر کودک ممکن می‌ماند', async () => {
    const date = '2026-04-07'
    await data.applyBulk(CLASS, date, { lunch: 'most', mood: 'good', napStart: null })
    vi.setSystemTime(new Date(2026, 3, 7, 14, 0))
    await data.applyBulk(CLASS, date, { lunch: null, mood: 'good', napStart: '13:00' })
    await data.saveChildReport('child-1', date, { moodAfternoon: 'restless' })

    const day = await data.getClassDay(CLASS, date)
    const report = day.reports.find((r) => r.childId === 'child-1')
    expect(report?.moodMorning).toBe('good')
    expect(report?.moodAfternoon).toBe('restless')
    // و همچنان کامل می‌ماند
    expect((await data.getDaySummary(CLASS, date)).complete).toContain('child-1')
  })
})

describe('کودکان بدون یادداشت این هفته', () => {
  it('کودکی که یادداشت گرفته از فهرست بیرون می‌رود', async () => {
    const today = toIsoDate(new Date())
    const before = await data.getDaySummary(CLASS, today)
    expect(before.withoutNoteThisWeek).toContain('child-5')

    await data.saveChildReport('child-5', today, { teacherNote: 'امروز برج ساخت.' })

    const after = await data.getDaySummary(CLASS, today)
    expect(after.withoutNoteThisWeek).not.toContain('child-5')
  })

  it('یادداشت خالی حساب نمی‌شود', async () => {
    const today = toIsoDate(new Date())
    await data.saveChildReport('child-6', today, { teacherNote: '   ' })
    const summary = await data.getDaySummary(CLASS, today)
    expect(summary.withoutNoteThisWeek).toContain('child-6')
  })
})

describe('ارسال و قفل', () => {
  it('ارسال، تعداد گزارش‌ها را برمی‌گرداند و زمان می‌گذارد', async () => {
    const date = '2026-04-08'
    const count = await data.sendReports(CLASS, date)
    expect(count).toBeGreaterThan(0)
    expect((await data.getDaySummary(CLASS, date)).sentAt).not.toBeNull()
  })

  it('پس از ارسال، ویرایش گزارش رد می‌شود', async () => {
    const date = '2026-04-11'
    await data.saveChildReport('child-1', date, { lunch: 'all' })
    await data.sendReports(CLASS, date)

    await expect(data.saveChildReport('child-1', date, { lunch: 'none' })).rejects.toThrow(
      /اصلاحیه/,
    )
  })

  it('ارسال دوباره همان روز رد می‌شود', async () => {
    const date = '2026-04-12'
    await data.sendReports(CLASS, date)
    await expect(data.sendReports(CLASS, date)).rejects.toThrow()
  })

  it('قفل یک روز، روز دیگر را نمی‌بندد', async () => {
    await data.sendReports(CLASS, '2026-04-13')
    await expect(
      data.saveChildReport('child-1', '2026-04-14', { lunch: 'all' }),
    ).resolves.toBeTruthy()
  })
})
