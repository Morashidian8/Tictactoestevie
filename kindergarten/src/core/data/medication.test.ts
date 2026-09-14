/**
 * @vitest-environment jsdom
 *
 * انبار محلی از localStorage استفاده می‌کند.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataAccess } from './index.ts'
import type { AccessScope, DataAccess } from './types.ts'

/**
 * درخواست مصرف دارو از سمت خانواده — ارتقای ۳ سند بررسی طراحی.
 *
 * قاعده‌ای که این فایل محافظت می‌کند و مهم‌ترین چیز این ماژول است:
 *
 *   درخواست والد به‌تنهایی مجوز دادن دارو نیست.
 *
 * والد می‌تواند فرم را پر کند و شیشه دارو را در خانه جا بگذارد. اگر
 * سامانه این دو را یکی بگیرد، کارتی می‌سازد که مربی «داده شد» را رویش
 * می‌زند برای دارویی که اصلاً در مهد نبوده.
 */
const parent: AccessScope = {
  accountId: 'acc-parent',
  centerId: 'centre-aftab',
  role: 'guardian',
  classIds: [],
}

const teacher: AccessScope = {
  accountId: 'acc-teacher-golha',
  centerId: 'centre-aftab',
  role: 'teacher',
  classIds: ['class-golha'],
}

/*
 * هر آزمون تاریخ خودش را دارد.
 *
 * انبار درخواست‌ها در حافظه ماژول زندگی می‌کند و پاک کردن localStorage
 * خالی‌اش نمی‌کند. تاریخ جدا یعنی آزمون‌ها روی هم نمی‌ریزند — و از قضا
 * واقعی‌تر هم هست: درخواست‌های دو روز مختلف.
 *
 * همه این تاریخ‌ها روز کاری‌اند (شنبه تا چهارشنبه).
 */
let asParent: DataAccess
let asTeacher: DataAccess

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 2, 11, 9, 0))
  localStorage.clear()
  asParent = await createDataAccess(parent)
  asTeacher = await createDataAccess(teacher)
})

afterEach(() => {
  vi.useRealTimers()
})

const request = (date: string) =>
  asParent.requestMedication({
    childId: 'child-1',
    name: 'شربت سرماخوردگی',
    dose: '۵ سی‌سی',
    times: ['11:30'],
    fromDate: date,
    toDate: date,
  })

describe('اعلام دارو از خانه', () => {
  it('خانواده می‌تواند از شب قبل ثبت کند', async () => {
    const date = '2026-03-14'
    const row = await request(date)
    expect(row.name).toBe('شربت سرماخوردگی')
    expect(row.receivedAt).toBeNull()

    const list = await asParent.listMedicationRequests('child-1', date)
    expect(list).toHaveLength(1)
  })

  it('نام سرپرست اعلام‌کننده ثبت می‌شود، تا مربی بداند از که بپرسد', async () => {
    const row = await request('2026-03-15')
    expect(row.announcedByName).toBeTruthy()
  })

  it('خانواده دیگری نمی‌تواند برای این کودک دارو اعلام کند', async () => {
    await expect(
      asParent.requestMedication({
        childId: 'child-2',
        name: 'قطره',
        dose: '۵ قطره',
        times: ['10:00'],
        fromDate: '2026-03-16',
        toDate: '2026-03-16',
      }),
    ).rejects.toThrow()
  })

  it('بدون ساعت مصرف ثبت نمی‌شود', async () => {
    await expect(
      asParent.requestMedication({
        childId: 'child-1',
        name: 'قطره',
        dose: '۵ قطره',
        times: [],
        fromDate: '2026-03-17',
        toDate: '2026-03-17',
      }),
    ).rejects.toThrow()
  })
})

describe('قاعده ایمنی: تحویل نگرفته، خورانده نمی‌شود', () => {
  it('پیش از تحویل، هیچ یادآوری ساخته نمی‌شود', async () => {
    const date = '2026-03-18'
    await request(date)
    const day = await asTeacher.getClassDay('class-golha', date)
    expect(day.medicationRequests.filter((r) => r.childId === 'child-1')).toHaveLength(1)
    expect(day.medications.filter((m) => m.childId === 'child-1')).toHaveLength(0)
  })

  it('با «تحویل گرفتم»، برای هر ساعت مصرف یک یادآور ساخته می‌شود', async () => {
    const date = '2026-03-21'
    const row = await asParent.requestMedication({
      childId: 'child-1',
      name: 'شربت',
      dose: '۵ سی‌سی',
      times: ['09:00', '13:00'],
      fromDate: date,
      toDate: date,
    })
    const made = await asTeacher.receiveMedication(row.id, date)
    expect(made).toHaveLength(2)
    expect(made.map((m) => m.scheduledTime)).toEqual(['09:00', '13:00'])

    const day = await asTeacher.getClassDay('class-golha', date)
    const mine = day.medicationRequests.find((r) => r.id === row.id)
    expect(mine?.receivedAt).not.toBeNull()
    expect(mine?.receivedByName).toBeTruthy()
  })

  /*
   * قلب این ماژول. تنها راهی که یادآور ساخته می‌شود، گذشتن از «تحویل
   * گرفتم» است — پس حالتِ «داده شد برای دارویی که نرسیده» از طریق رابط
   * اصلاً در دسترس نیست. تریگر پایگاه داده همین را برای مسیرهای دیگر
   * هم می‌بندد؛ گزاره‌اش در rules.sql است.
   */
  it('تنها راه ساختن یادآور، تحویل گرفتن است', async () => {
    const date = '2026-03-22'
    const row = await request(date)
    const before = await asTeacher.getClassDay('class-golha', date)
    expect(before.medications.filter((m) => m.requestId === row.id)).toHaveLength(0)

    await asTeacher.receiveMedication(row.id, date)
    const after = await asTeacher.getClassDay('class-golha', date)
    expect(after.medications.filter((m) => m.requestId === row.id)).toHaveLength(1)
  })

  it('پس از تحویل، ثبت مصرف ممکن می‌شود', async () => {
    const date = '2026-03-23'
    const row = await request(date)
    const [made] = await asTeacher.receiveMedication(row.id, date)
    await expect(asTeacher.markMedicationGiven(made!.id)).resolves.toBeUndefined()

    const day = await asTeacher.getClassDay('class-golha', date)
    expect(day.medications.find((m) => m.id === made!.id)?.givenAt).not.toBeNull()
  })

  it('تحویل گرفتن دوباره، یادآور تکراری نمی‌سازد', async () => {
    const date = '2026-03-24'
    const row = await request(date)
    await asTeacher.receiveMedication(row.id, date)
    await asTeacher.receiveMedication(row.id, date)
    const day = await asTeacher.getClassDay('class-golha', date)
    expect(day.medications.filter((m) => m.requestId === row.id)).toHaveLength(1)
  })
})

describe('لغو از سمت خانواده', () => {
  it('پیش از تحویل ممکن است', async () => {
    const date = '2026-03-25'
    const row = await request(date)
    await asParent.cancelMedicationRequest(row.id)
    expect(await asParent.listMedicationRequests('child-1', date)).toHaveLength(0)
  })

  it('پس از تحویل رد می‌شود، چون دارو دست مهد است', async () => {
    const date = '2026-03-28'
    const row = await request(date)
    await asTeacher.receiveMedication(row.id, date)
    await expect(asParent.cancelMedicationRequest(row.id)).rejects.toThrow(/مربی/)
  })
})
