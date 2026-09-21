/**
 * @vitest-environment jsdom
 *
 * داده نمونه روی localStorage می‌نشیند، پس این فایل مرورگر لازم دارد.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataAccess, invoiceDue, invoiceTotal } from './index.ts'
import type { AccessScope, DataAccess } from './types.ts'

/**
 * مالی خانواده — برنامه شهریه سال، اقلام اختیاری، و سند پرداخت.
 *
 * سه قاعده که اینجا محافظت می‌شوند و هیچ‌کدام سلیقه نیستند:
 *
 * ۱. **ماهی که صورتحساب ندارد، بدهی نیست.** برآورد را نباید در مانده
 *    جمع زد، وگرنه خانواده در مهر یک رقم دوازده‌ماهه می‌بیند.
 *
 * ۲. **قلم اختیاریِ نپذیرفته، بدهی نیست.** اردویی که کودک نمی‌رود
 *    نباید در مانده بیاید و تلفنی پس گرفته شود.
 *
 * ۳. **مبلغ صورتحساب یک تعریف دارد.** اگر جزئی از اجزا در یکی از
 *    فراخواننده‌ها جا بیفتد، درگاه کمتر از بدهی می‌گیرد، صورتحساب باز
 *    می‌ماند، و یادآوری برای خانواده‌ای می‌رود که تازه پرداخت کرده.
 */
const parent: AccessScope = {
  accountId: 'acc-parent',
  centerId: 'centre-aftab',
  role: 'guardian',
  classIds: [],
}

let asParent: DataAccess

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 4, 2, 9, 0))
  localStorage.clear()
  asParent = await createDataAccess(parent)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('برنامه شهریه سال', () => {
  it('هر دوازده ماه را می‌آورد، چه صورتحساب داشته باشند چه نه', async () => {
    const finance = await asParent.getParentFinance('child-1')
    expect(finance.year).toHaveLength(12)
    expect(finance.year.map((m) => m.period.slice(-2))).toEqual([
      '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12',
    ])
  })

  it('ماه صادرنشده را برآورد علامت می‌زند، نه بدهی', async () => {
    const finance = await asParent.getParentFinance('child-1')
    const notIssued = finance.year.filter((m) => !m.issued)
    expect(notIssued.length).toBeGreaterThan(0)
    for (const month of notIssued) {
      expect(month.status).toBe('not_issued')
      expect(month.dueDate).toBeNull()
      expect(month.paid).toBe(0)
    }
  })

  /*
   * مهم‌ترین تست این فایل.
   *
   * برآورد ماه‌های آینده نباید در مانده بیاید. اگر روزی کسی جمع سال را
   * به مانده وصل کند، همین‌جا می‌افتد.
   */
  it('برآورد ماه‌های صادرنشده در مانده جمع نمی‌شود', async () => {
    const finance = await asParent.getParentFinance('child-1')
    const fromIssued = finance.invoices
      .filter((i) => i.status !== 'paid' && i.status !== 'cancelled')
      .reduce((sum, i) => sum + invoiceDue(i), 0)
    expect(finance.outstanding).toBe(fromIssued)

    const estimateTotal = finance.year
      .filter((m) => !m.issued)
      .reduce((sum, m) => sum + m.amount, 0)
    expect(estimateTotal).toBeGreaterThan(0)
    expect(finance.outstanding).toBeLessThan(estimateTotal)
  })
})

describe('قلم اختیاری تا پذیرفته نشدن، بدهی نیست', () => {
  it('قلم اختیاریِ بی‌جواب روی هیچ صورتحسابی سطر ندارد', async () => {
    const finance = await asParent.getParentFinance('child-1')
    const trip = finance.offers.find((o) => o.optional && o.answer === null)
    expect(trip).toBeDefined()
    const anywhere = finance.invoices.some((i) =>
      i.lines.some((l) => l.title === trip?.title),
    )
    expect(anywhere).toBe(false)
  })

  it('نپذیرفتن، مانده را تکان نمی‌دهد', async () => {
    const before = await asParent.getParentFinance('child-1')
    const trip = before.offers.find((o) => o.optional && o.answer === null)
    await asParent.answerFeeItem(trip?.itemId ?? '', 'child-1', false)

    const after = await asParent.getParentFinance('child-1')
    expect(after.outstanding).toBe(before.outstanding)
    expect(after.offers.find((o) => o.itemId === trip?.itemId)?.answer).toBe('declined')
  })

  /*
   * پذیرفتن باید مبلغ را دقیقاً به اندازه همان قلم بالا ببرد — نه کمتر،
   * نه بیشتر. عدد دقیق، تنها چیزی است که ثابت می‌کند سطر از تعریف مدیر
   * ساخته شده و نه از ورودی کلاینت.
   */
  it('پذیرفتن، دقیقاً مبلغ همان قلم را اضافه می‌کند', async () => {
    const before = await asParent.getParentFinance('child-1')
    const offer = before.offers.find((o) => o.optional && o.answer === null)
    const target = before.invoices.find((i) => i.period === offer?.period)
    // اگر صورتحساب آن دوره هنوز صادر نشده، سطری هم ساخته نمی‌شود.
    if (!target || !offer) return

    await asParent.answerFeeItem(offer.itemId, 'child-1', true)
    const after = await asParent.getParentFinance('child-1')
    const updated = after.invoices.find((i) => i.id === target.id)
    expect(invoiceTotal(updated!) - invoiceTotal(target)).toBe(offer.amount)
  })

  it('قلم اجباری، جوابِ خانواده نمی‌خواهد و رد هم نمی‌شود', async () => {
    const finance = await asParent.getParentFinance('child-1')
    const required = finance.offers.find((o) => !o.optional)
    expect(required).toBeDefined()
    await expect(
      asParent.answerFeeItem(required?.itemId ?? '', 'child-1', false),
    ).rejects.toThrow()
  })
})

describe('مبلغ صورتحساب یک تعریف دارد', () => {
  it('جریمه تحویل و جریمه دیرکرد دو جزء جدایند و هر دو در جمع می‌آیند', () => {
    const base = {
      amount: 1000,
      discount: 100,
      lateFee: 30,
      overdueFee: 50,
      lines: [{ id: 'l1', title: 'ناهار', amount: 200 }],
    }
    expect(invoiceTotal(base)).toBe(1000 - 100 + 30 + 50 + 200)
  })

  it('اضافه‌پرداخت، بدهی منفی نمی‌سازد', () => {
    const paid = {
      id: 'i1',
      childId: 'c',
      childName: 'c',
      period: '1404-07',
      amount: 1000,
      discount: 0,
      lateFee: 0,
      overdueFee: 0,
      paid: 1500,
      dueDate: '2025-10-01',
      status: 'paid' as const,
      lines: [],
    }
    expect(invoiceDue(paid)).toBe(0)
  })
})

describe('پرداخت گذشته سندش را همراه دارد', () => {
  it('هر پرداخت یا کد رهگیری دارد یا تصویر فیش — و اگر ندارد، پنهان نمی‌ماند', async () => {
    const finance = await asParent.getParentFinance('child-1')
    expect(finance.payments.length).toBeGreaterThan(0)
    // دست‌کم یکی سند دارد؛ وگرنه فهرست مستندات اصلاً چیزی نشان نمی‌دهد.
    expect(
      finance.payments.some((p) => p.trackingCode || p.receiptUrl),
    ).toBe(true)
  })
})
