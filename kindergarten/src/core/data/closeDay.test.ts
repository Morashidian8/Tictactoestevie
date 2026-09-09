import { beforeEach, describe, expect, it } from 'vitest'
import { createDataAccess } from './index.ts'
import { toIsoDate } from '../../i18n/index.ts'
import type { AccessScope, DataAccess } from './types.ts'

/**
 * بستن روز — بخش ۵.۹ سند.
 *
 * قاعده‌ای که اینجا مهم است: پس از ارسال، گزارش قفل می‌شود. سند
 * می‌گوید «تغییر بعدی فقط به شکل اصلاحیه ثبت می‌شود». اگر این نبندد،
 * چیزی که خانواده دیده بی‌سروصدا عوض می‌شود.
 */
const scope: AccessScope = {
  accountId: 'acc-1',
  centerId: 'centre-aftab',
  role: 'teacher',
  classIds: ['class-golha'],
}

const CLASS = 'class-golha'
let data: DataAccess

beforeEach(() => {
  data = createDataAccess(scope)
})

describe('شمارش کامل و ناقص', () => {
  it('گزارش دست‌نخورده ناقص است و می‌گوید چه کم دارد', async () => {
    const date = '2026-04-01'
    const summary = await data.getDaySummary(CLASS, date)
    expect(summary.complete).toHaveLength(0)
    expect(summary.incomplete[0]?.missing).toEqual(['ناهار', 'خواب', 'خلق'])
  })

  it('ثبت گروهی به‌تنهایی گزارش را کامل نمی‌کند', async () => {
    const date = '2026-04-02'
    await data.applyBulk(CLASS, date, { lunch: 'most', mood: 'good', napStart: '13:00' })
    const summary = await data.getDaySummary(CLASS, date)
    // نوار گروهی فقط یک بازه خلق را پر می‌کند؛ دو بازه دیگر می‌ماند.
    expect(summary.complete).toHaveLength(0)
    expect(summary.incomplete[0]?.missing).toEqual(['خلق'])
  })

  it('با پر شدن هر سه بازه خلق، کامل می‌شود', async () => {
    const date = '2026-04-03'
    await data.applyBulk(CLASS, date, { lunch: 'most', mood: 'good', napStart: '13:00' })
    await data.saveChildReport('child-1', date, {
      moodMorning: 'good',
      moodNoon: 'good',
      moodAfternoon: 'normal',
    })
    const summary = await data.getDaySummary(CLASS, date)
    expect(summary.complete).toContain('child-1')
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
    const date = '2026-04-10'
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
