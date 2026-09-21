import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataAccess } from './index.ts'
import type { AccessScope, DataAccess } from './types.ts'

/**
 * قاعده مرکزی بخش ۵.۵: «هر کودکی که دست‌نخورده بماند، مقدار گروهی برایش
 * ثبت می‌شود.» یعنی استثنا برنده است، نه آخرین نوشته. اگر این بشکند،
 * مربی چهار استثنایش را با یک ضربه از دست می‌دهد.
 */
const scope: AccessScope = {
  accountId: 'acc-1',
  centerId: 'centre-aftab',
  role: 'teacher',
  classIds: ['class-golha'],
}

const DATE = '2026-03-11'
let data: DataAccess

/*
 * ساعت را ثابت می‌کنیم.
 *
 * ثبت گروهی حالا فقط روی کودکان حاضر در بازه فعلی می‌نشیند، پس نتیجه
 * به ساعت اجرای تست بسته است. بدون این، تست شب‌ها می‌افتاد و صبح‌ها
 * پاس می‌شد — بدترین نوع تست.
 */
beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 2, 11, 9, 0))
  data = await createDataAccess(scope)
})

afterEach(() => {
  vi.useRealTimers()
})

async function reportFor(childId: string, date: string) {
  const day = await data.getClassDay('class-golha', date)
  return day.reports.find((r) => r.childId === childId)
}

describe('ثبت گروهی', () => {
  it('روی کودکان حاضر در بازه فعلی می‌نشیند', async () => {
    const written = await data.applyBulk('class-golha', DATE, {
      lunch: 'most',
      mood: 'good',
      napStart: '13:00',
    })
    const day = await data.getClassDay('class-golha', DATE)
    expect(written.length).toBe(day.children.length)
    expect(written.length).toBeGreaterThan(0)
    expect(written.every((r) => r.lunch === 'most')).toBe(true)

    // کودک بعدازظهری صبح در جلسه نیست، پس مقدار گروهی نمی‌گیرد.
    expect(day.children.every((c) => c.attendanceType !== 'afternoon')).toBe(true)
  })

  /*
   * ناهار برای همه است و به بازه وصل نیست، ولی خواب فیلد بازه بعدازظهر
   * است. صبح هیچ‌کس خواب نمی‌گیرد — حتی کودک تمام‌روز که بعدازظهر
   * خواهدش داشت. عصر که شد، همان کودک می‌گیردش و کودک صبحانه‌ای نه.
   */
  it('خواب فقط در بازه خودش و فقط روی کودکی که آن بازه را دارد', async () => {
    await data.applyBulk('class-golha', DATE, {
      lunch: 'most',
      mood: 'good',
      napStart: '13:00',
    })
    const morning = await data.getClassDay('class-golha', DATE)
    for (const child of morning.children) {
      const report = morning.reports.find((r) => r.childId === child.id)
      expect(report?.lunch).toBe('most')
      expect(report?.napStart).toBeNull()
    }

    vi.setSystemTime(new Date(2026, 2, 11, 14, 0))
    await data.applyBulk('class-golha', DATE, { lunch: null, mood: null, napStart: '13:00' })
    const afternoon = await data.getClassDay('class-golha', DATE)
    expect(afternoon.children.length).toBeGreaterThan(0)
    for (const child of afternoon.children) {
      const report = afternoon.reports.find((r) => r.childId === child.id)
      // هر کودکی که عصر در جلسه است، بازه بعدازظهر را دارد
      expect(child.fields).toContain('nap')
      expect(report?.napStart).toBe('13:00')
    }
  })

  /*
   * ثبت گروهی عصر نباید خلق صبحِ ثبت‌شده را عوض کند. بدون قید بخش ۶،
   * مقدار عصر بی‌سروصدا روی هر سه بازه می‌نشست و گزارش صبح از بین
   * می‌رفت بی‌آنکه کسی بفهمد.
   */
  it('ثبت گروهی عصر، خلق صبح را بازنمی‌نویسد', async () => {
    await data.applyBulk('class-golha', DATE, { lunch: null, mood: 'good', napStart: null })
    vi.setSystemTime(new Date(2026, 2, 11, 14, 0))
    await data.applyBulk('class-golha', DATE, { lunch: null, mood: 'restless', napStart: null })

    const day = await data.getClassDay('class-golha', DATE)
    const report = day.reports.find((r) => r.childId === 'child-1')
    expect(report?.moodMorning).toBe('good')
    expect(report?.moodNoon).toBe('good')
    expect(report?.moodAfternoon).toBe('restless')
  })

  it('خلق فقط روی بازه‌هایی می‌نشیند که برای کودک وجود دارند', async () => {
    await data.applyBulk('class-golha', DATE, { lunch: null, mood: 'good', napStart: null })
    const day = await data.getClassDay('class-golha', DATE)
    const morningOnly = day.children.find((c) => c.attendanceType === 'morning')
    expect(morningOnly).toBeDefined()
    const report = day.reports.find((r) => r.childId === morningOnly!.id)
    expect(report?.moodMorning).toBe('good')
    // برای او عصری وجود ندارد، پس خالی می‌ماند نه پرشده.
    expect(report?.moodAfternoon).toBeNull()
  })

  it('کودک استثنا مقدار گروهی نمی‌گیرد', async () => {
    const date = '2026-03-14'
    await data.saveChildReport('child-2', date, { lunch: 'none' })
    await data.applyBulk('class-golha', date, { lunch: 'all', mood: 'good', napStart: '13:00' })

    expect((await reportFor('child-2', date))?.lunch).toBe('none')
    expect((await reportFor('child-1', date))?.lunch).toBe('all')
  })

  it('ثبت گروهی دوباره هم استثنا را برنمی‌گرداند', async () => {
    const date = '2026-03-15'
    await data.saveChildReport('child-3', date, { lunch: 'little' })
    await data.applyBulk('class-golha', date, { lunch: 'all', mood: 'good', napStart: '13:00' })
    await data.applyBulk('class-golha', date, { lunch: 'most', mood: 'normal', napStart: '13:15' })

    const kept = await reportFor('child-3', date)
    expect(kept?.lunch).toBe('little')
    expect(kept?.touched).toBe(true)
    expect((await reportFor('child-1', date))?.lunch).toBe('most')
  })

  it('استثنای پس از ثبت گروهی، مقدار گروهی را کنار می‌زند', async () => {
    const date = '2026-03-16'
    vi.setSystemTime(new Date(2026, 2, 16, 14, 0))
    await data.applyBulk('class-golha', date, { lunch: 'all', mood: 'good', napStart: '13:00' })
    await data.saveChildReport('child-6', date, { lunch: 'none' })

    expect((await reportFor('child-6', date))?.lunch).toBe('none')
    // خواب گروهی نباید با استثنای ناهار پاک شود
    expect((await reportFor('child-6', date))?.napStart).toBe('13:00')
  })

  /*
   * «استثنا» یعنی نوشته مربی پاک نشود، نه اینکه کودک تا آخر روز از ثبت
   * گروهی بیفتد.
   *
   * با دو بازه، قاعده قدیمی این بود: کودکی که مربی صبح ناهارش را جدا
   * زده بود، عصر خواب گروهی هم نمی‌گرفت و مربی باید تک‌تک واردش می‌کرد.
   */
  it('کودک استثنا در بازه بعد، جاهای خالی‌اش پر می‌شود', async () => {
    const date = '2026-03-17'
    vi.setSystemTime(new Date(2026, 2, 17, 9, 0))
    await data.saveChildReport('child-1', date, { lunch: 'none' })
    await data.applyBulk('class-golha', date, { lunch: 'all', mood: 'good', napStart: null })

    vi.setSystemTime(new Date(2026, 2, 17, 14, 0))
    await data.applyBulk('class-golha', date, { lunch: 'all', mood: 'normal', napStart: '13:00' })

    const report = await reportFor('child-1', date)
    // نوشته مربی سر جایش
    expect(report?.lunch).toBe('none')
    expect(report?.moodMorning).toBe('good')
    // و جای خالی بعدازظهر پر شد
    expect(report?.napStart).toBe('13:00')
    expect(report?.moodAfternoon).toBe('normal')
    // و همچنان استثنا شمرده می‌شود
    expect(report?.touched).toBe(true)
  })

  it('کلاس دیگر را دست نمی‌زند', async () => {
    const date = '2026-03-15'
    await expect(
      data.applyBulk('class-setareha', date, { lunch: 'all', mood: 'good', napStart: '13:00' }),
    ).rejects.toThrow()
  })
})
