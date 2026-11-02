/**
 * @vitest-environment jsdom
 *
 * آداپتور محلی، ذخیره‌هایش ماژول‌سطح‌اند و بین تست‌های یک فایل زنده
 * می‌مانند. پس هر تست درخواست خودش را با میدان و مقدارش پیدا می‌کند،
 * نه با `[0]` — وگرنه تصمیمِ یک تست روی درخواست تستِ قبلی می‌نشیند.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataAccess } from './index.ts'
import type { AccessScope, DataAccess } from './types.ts'

/**
 * ویرایش پرونده کودک به دست خانواده، با تأیید مدیر.
 *
 * سه قاعده که اینجا محافظت می‌شوند و هیچ‌کدام سلیقه نیستند:
 *
 * ۱. **تا تأیید مدیر، هیچ چیزی عوض نمی‌شود.** اگر مقدار تازه را
 *    می‌نوشتیم و «تأییدنشده» علامتش می‌زدیم، اولین کدی که این علامت را
 *    فراموش می‌کرد، داده تأییدنشده را به مربی نشان می‌داد.
 *
 * ۲. **فهرست میدان‌های قابل ویرایش بسته است.** خانواده نباید بتواند
 *    کلاس کودک یا مرکزش را عوض کند.
 *
 * ۳. **رد، دلیل می‌خواهد.** خانواده‌ای که نمی‌داند چرا رد شده، دوباره
 *    همان را می‌فرستد.
 */
const parent: AccessScope = {
  accountId: 'acc-parent',
  centerId: 'centre-aftab',
  role: 'guardian',
  classIds: [],
}

const manager: AccessScope = {
  accountId: 'acc-manager',
  centerId: 'centre-aftab',
  role: 'manager',
  classIds: [],
}

let asParent: DataAccess
let asManager: DataAccess

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 4, 2, 9, 0))
  localStorage.clear()
  asParent = await createDataAccess(parent)
  asManager = await createDataAccess(manager)
})

afterEach(() => {
  vi.useRealTimers()
})

const allergyOf = async (): Promise<string> => {
  const fields = await asParent.listProfileFields('child-1')
  return fields.find((f) => f.key === 'allergies')?.value ?? ''
}

describe('تا تأیید مدیر، پرونده دست‌نخورده می‌ماند', () => {
  it('درخواست، مقدار پرونده را عوض نمی‌کند', async () => {
    const before = await allergyOf()
    await asParent.requestProfileChange('child-1', 'allergies', 'کیوی')
    expect(await allergyOf()).toBe(before)
  })

  it('ولی مقدار پیشنهادی جدا دیده می‌شود', async () => {
    await asParent.requestProfileChange('child-1', 'allergies', 'کیوی')
    const field = (await asParent.listProfileFields('child-1')).find(
      (f) => f.key === 'allergies',
    )
    expect(field?.pending).toBe('کیوی')
  })

  /*
   * مقدار یکتا برای هر تست.
   *
   * آداپتور محلی، شیء فیکسچر را دست‌کاری می‌کند و فیکسچر یک ماژول ثابت
   * است که بین تست‌های یک فایل زنده می‌ماند. مقدار ثابت یعنی تست دوم
   * روی چیزی می‌نشیند که تست اول جا گذاشته.
   */
  it('با تأیید مدیر، تازه می‌نشیند', async () => {
    await asParent.requestProfileChange('child-1', 'allergies', 'کیوی و انبه')
    const change = (await asManager.listProfileChanges()).find(
      (c) => c.newValue === 'کیوی و انبه',
    )
    await asManager.decideProfileChange(change!.id, true)
    expect(await allergyOf()).toBe('کیوی و انبه')
  })

  it('و با رد، هرگز نمی‌نشیند', async () => {
    const before = await allergyOf()
    await asParent.requestProfileChange('child-1', 'allergies', 'گردو')
    const change = (await asManager.listProfileChanges()).find((c) => c.newValue === 'گردو')
    await asManager.decideProfileChange(change!.id, false, 'با نامه پزشک نمی‌خواند.')
    expect(await allergyOf()).toBe(before)
  })
})

describe('فهرست میدان‌های قابل ویرایش بسته است', () => {
  it('میدانی بیرون از فهرست رد می‌شود', async () => {
    await expect(
      asParent.requestProfileChange('child-1', 'class_id', 'class-other'),
    ).rejects.toThrow()
    await expect(
      asParent.requestProfileChange('child-1', 'center_id', 'centre-other'),
    ).rejects.toThrow()
  })

  it('کودک خانواده دیگر هم رد می‌شود', async () => {
    await expect(
      asParent.requestProfileChange('child-2', 'first_name', 'الف'),
    ).rejects.toThrow()
  })

  it('مقدار تکراری، درخواست تازه نمی‌سازد', async () => {
    const current = await allergyOf()
    await expect(
      asParent.requestProfileChange('child-1', 'allergies', current),
    ).rejects.toThrow()
  })
})

describe('صف مدیر', () => {
  /*
   * ترتیب صف تصادفی نیست: تا مدیر آلرژی تازه را تأیید نکرده، مربی
   * فهرست قدیمی را می‌بیند و آن فاصله می‌تواند به کودک آسیب بزند.
   */
  it('میدان ایمنی بالاتر از میدان معمولی می‌نشیند', async () => {
    await asParent.requestProfileChange('child-1', 'doctor_name', 'دکتر الف')
    await asParent.requestProfileChange('child-1', 'allergies', 'شاه‌بلوط')

    const queue = await asManager.listProfileChanges()
    expect(queue[0]?.field).toBe('allergies')
    expect(queue[0]?.safetyCritical).toBe(true)
  })

  it('برای هر میدان فقط یک درخواست باز می‌ماند، و تازه‌ترین است', async () => {
    await asParent.requestProfileChange('child-1', 'doctor_name', 'دکتر الف')
    await asParent.requestProfileChange('child-1', 'doctor_name', 'دکتر ب')

    const queue = (await asManager.listProfileChanges()).filter(
      (c) => c.field === 'doctor_name',
    )
    expect(queue).toHaveLength(1)
    expect(queue[0]?.newValue).toBe('دکتر ب')
  })

  it('رد بدون دلیل ممکن نیست', async () => {
    await asParent.requestProfileChange('child-1', 'doctor_name', 'دکتر ج')
    const change = (await asManager.listProfileChanges()).find((c) => c.newValue === 'دکتر ج')
    await expect(asManager.decideProfileChange(change!.id, false)).rejects.toThrow()
  })

  it('خانواده صف مدیر را نمی‌بیند', async () => {
    await expect(asParent.listProfileChanges()).rejects.toThrow()
  })
})
