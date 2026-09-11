/**
 * @vitest-environment jsdom
 *
 * فقط این فایل مرورگر لازم دارد، چون پایداری داده نمونه از localStorage
 * استفاده می‌کند. بقیه تست‌ها در node اجرا می‌شوند؛ دو تای آن‌ها فایل
 * منبع را می‌خوانند و زیر jsdom می‌شکنند.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createDataAccess } from './index.ts'
import type { AccessScope, DataAccess } from './types.ts'

/**
 * روز کودک از دید خانواده — بخش ۶.۳ سند.
 *
 * دو قاعده که اینجا محافظت می‌شوند و هیچ‌کدام سلیقه نیستند:
 *
 * ۱. سرپرست فقط کودک خودش را می‌بیند (بخش ۶.۵).
 * ۲. رویداد متوسط یا بالا بدون تأیید مدیر به سرپرست نمی‌رسد (بخش ۳.۳،
 *    قاعده سفت دوم). این یکی مهم‌ترین است: شکستنش یعنی خانواده خبر بدی
 *    را پیش از آنکه مدیر بتواند تماس بگیرد می‌بیند.
 */
const parent: AccessScope = {
  accountId: 'acc-parent',
  centerId: 'centre-aftab',
  role: 'guardian',
  classIds: [],
}

const teacher: AccessScope = {
  accountId: 'acc-teacher',
  centerId: 'centre-aftab',
  role: 'teacher',
  classIds: ['class-golha'],
}

let asParent: DataAccess
let asTeacher: DataAccess

beforeEach(() => {
  localStorage.clear()
  asParent = createDataAccess(parent)
  asTeacher = createDataAccess(teacher)
})

describe('سرپرست فقط کودک خودش را می‌بیند', () => {
  it('فهرست کودکانش را می‌دهد', async () => {
    const mine = await asParent.listMyChildren()
    expect(mine.map((c) => c.id)).toEqual(['child-1', 'child-9'])
  })

  it('کودک خانواده دیگر را نمی‌دهد', async () => {
    await expect(asParent.getParentDay('child-2', '2026-05-01')).rejects.toThrow()
  })
})

describe('گزارش پیش از ارسال به خانواده نمی‌رسد', () => {
  it('تا ارسال نشدن، غذا و خواب و یادداشت خالی‌اند', async () => {
    const date = '2026-05-02'
    await asTeacher.applyBulk('class-golha', date, {
      lunch: 'most',
      mood: 'good',
      napStart: '13:00',
    })
    await asTeacher.saveChildReport('child-1', date, { teacherNote: 'برج ساخت.' })

    const day = await asParent.getParentDay('child-1', date)
    expect(day.sent).toBe(false)
    expect(day.lunch).toBeNull()
    expect(day.teacherNote).toBeNull()
    expect(day.napMinutes).toBeNull()
  })

  it('ولی ورود و خروج همان لحظه دیده می‌شود', async () => {
    const date = '2026-05-12'
    await asTeacher.checkIn({ childId: 'child-1', at: new Date(`${date}T08:05:00`) })
    const day = await asParent.getParentDay('child-1', date)
    expect(day.checkInAt).not.toBeNull()
    expect(day.sent).toBe(false)
  })

  it('پس از ارسال، همه‌چیز می‌آید', async () => {
    const date = '2026-05-22'
    await asTeacher.applyBulk('class-golha', date, {
      lunch: 'most',
      mood: 'good',
      napStart: '13:00',
    })
    await asTeacher.saveChildReport('child-1', date, { teacherNote: 'برج ساخت.' })
    await asTeacher.sendReports('class-golha', date)

    const day = await asParent.getParentDay('child-1', date)
    expect(day.sent).toBe(true)
    expect(day.lunch).toBe('most')
    expect(day.teacherNote).toBe('برج ساخت.')
    expect(day.napMinutes).toBeGreaterThan(0)
  })
})

/*
 * هر آزمون روز خودش را دارد.
 *
 * انبار داده نمونه در حافظه ماژول زندگی می‌کند و پاک کردن localStorage
 * آن را خالی نمی‌کند. روز جدا یعنی آزمون‌ها روی هم نمی‌ریزند، و از قضا
 * واقعی‌تر هم هست: رویدادهای دو روز مختلف.
 */
describe('قاعده سفت: رویداد جدی بدون تأیید مدیر به خانواده نمی‌رسد', () => {
  it('رویداد جزئی مستقیم می‌رسد', async () => {
    const date = '2026-05-03'
    await asTeacher.createIncident({
      childId: 'child-1',
      occurredAt: new Date(`${date}T10:00:00`),
      type: 'fall',
      severity: 'minor',
      location: 'yard',
      minorCategory: 'surface_scratch',
      description: 'زمین خورد.',
      actionTaken: 'شست‌وشو شد.',
    })

    const day = await asParent.getParentDay('child-1', date)
    expect(day.incidents).toHaveLength(1)
  })

  it('رویداد نیازمند اطلاع والد، تا تأیید نشدن نمی‌رسد', async () => {
    const date = '2026-05-13'
    await asTeacher.createIncident({
      childId: 'child-1',
      occurredAt: new Date(`${date}T11:00:00`),
      type: 'fever',
      severity: 'notify_parent',
      location: 'classroom',
      description: 'تب داشت.',
      actionTaken: 'تماس گرفته شد.',
    })

    const day = await asParent.getParentDay('child-1', date)
    expect(day.incidents).toHaveLength(0)
  })

  it('رویدادی که خودکار ارتقا یافته هم نمی‌رسد', async () => {
    const date = '2026-05-23'
    // عکس ضمیمه، شدت را از جزئی بالا می‌برد (بخش ۵.۶).
    await asTeacher.createIncident({
      childId: 'child-1',
      occurredAt: new Date(`${date}T12:00:00`),
      type: 'fall',
      severity: 'minor',
      location: 'yard',
      minorCategory: 'surface_scratch',
      description: 'زمین خورد.',
      actionTaken: 'پانسمان شد.',
      hasPhoto: true,
    })

    const day = await asParent.getParentDay('child-1', date)
    expect(day.incidents).toHaveLength(0)
  })
})

describe('عکس', () => {
  it('فقط عکسی که این کودک در آن تگ خورده', async () => {
    const date = '2026-05-04'
    await asTeacher.addPhoto(date, 'blob:a', ['child-1'])
    await asTeacher.addPhoto(date, 'blob:b', ['child-2'])

    const day = await asParent.getParentDay('child-1', date)
    expect(day.photos).toHaveLength(1)
    expect(day.photos[0]?.previewUrl).toBe('blob:a')
  })

  it('عکس بدون تگ به هیچ خانواده‌ای نمی‌رسد', async () => {
    const date = '2026-05-14'
    await asTeacher.addPhoto(date, 'blob:c', [])
    const day = await asParent.getParentDay('child-1', date)
    expect(day.photos.map((p) => p.previewUrl)).not.toContain('blob:c')
  })
})
