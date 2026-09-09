import { beforeEach, describe, expect, it } from 'vitest'
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

beforeEach(() => {
  data = createDataAccess(scope)
})

async function reportFor(childId: string, date: string) {
  const day = await data.getClassDay('class-golha', date)
  return day.reports.find((r) => r.childId === childId)
}

describe('ثبت گروهی', () => {
  it('روی همه کودکان کلاس می‌نشیند', async () => {
    const written = await data.applyBulk('class-golha', DATE, {
      lunch: 'most',
      mood: 'good',
      napStart: '13:00',
    })
    const day = await data.getClassDay('class-golha', DATE)
    expect(written.length).toBe(day.children.length)
    expect(written.every((r) => r.lunch === 'most')).toBe(true)
    expect(written.every((r) => r.napStart === '13:00')).toBe(true)
  })

  it('کودک استثنا مقدار گروهی نمی‌گیرد', async () => {
    const date = '2026-03-12'
    await data.saveChildReport('child-2', date, { lunch: 'none' })
    await data.applyBulk('class-golha', date, { lunch: 'all', mood: 'good', napStart: '13:00' })

    expect((await reportFor('child-2', date))?.lunch).toBe('none')
    expect((await reportFor('child-1', date))?.lunch).toBe('all')
  })

  it('ثبت گروهی دوباره هم استثنا را برنمی‌گرداند', async () => {
    const date = '2026-03-13'
    await data.saveChildReport('child-3', date, { lunch: 'little' })
    await data.applyBulk('class-golha', date, { lunch: 'all', mood: 'good', napStart: '13:00' })
    await data.applyBulk('class-golha', date, { lunch: 'most', mood: 'normal', napStart: '13:15' })

    const kept = await reportFor('child-3', date)
    expect(kept?.lunch).toBe('little')
    expect(kept?.touched).toBe(true)
    expect((await reportFor('child-1', date))?.lunch).toBe('most')
  })

  it('استثنای پس از ثبت گروهی، مقدار گروهی را کنار می‌زند', async () => {
    const date = '2026-03-14'
    await data.applyBulk('class-golha', date, { lunch: 'all', mood: 'good', napStart: '13:00' })
    await data.saveChildReport('child-4', date, { lunch: 'none' })

    expect((await reportFor('child-4', date))?.lunch).toBe('none')
    // خواب گروهی نباید با استثنای ناهار پاک شود
    expect((await reportFor('child-4', date))?.napStart).toBe('13:00')
  })

  it('کلاس دیگر را دست نمی‌زند', async () => {
    const date = '2026-03-15'
    await expect(
      data.applyBulk('class-setareha', date, { lunch: 'all', mood: 'good', napStart: '13:00' }),
    ).rejects.toThrow()
  })
})
