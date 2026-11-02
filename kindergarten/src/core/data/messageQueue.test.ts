/**
 * @vitest-environment jsdom
 *
 * لایه داده نمونه روی localStorage می‌نشیند، پس این فایل مرورگر لازم دارد.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataAccess } from './index.ts'
import type { AccessScope, DataAccess } from './types.ts'

/**
 * صفِ ساعت کاری پیام — بخش ۶.۶.
 *
 * قاعده یک جمله است: «نوشتن همیشه آزاد است؛ رسیدن است که صبر می‌کند.»
 * زیر همان کادرِ نوشتن هم همین به خانواده وعده داده می‌شود.
 *
 * تا پیش از این، سامانه آن وعده را دو جور می‌شکست:
 *
 *   ۱. پیامِ در صف **همان لحظه** در گفتگوی طرف مقابل دیده می‌شد. یعنی
 *      مربی نصف‌شب پیام را می‌خواند، در حالی که بالای صفحه نوشته بود
 *      «صبح تحویل می‌شود».
 *   ۲. و هیچ‌وقت هم «رسیده» نمی‌شد: هیچ کاری `sent_at` را پر نمی‌کرد،
 *      پس آن پیام تا ابد در پیش‌نمایش و شمارِ نخوانده‌ها غایب می‌ماند.
 *
 * صف یک **زمان تحویل** است، نه حالتی که کسی باید بعداً عوضش کند. این
 * تست هر دو سرِ آن را می‌بندد.
 */
const teacher: AccessScope = {
  accountId: 'acc-teacher-golha',
  centerId: 'centre-aftab',
  role: 'teacher',
  classIds: ['class-golha'],
}

const parent: AccessScope = {
  accountId: 'acc-parent',
  centerId: 'centre-aftab',
  role: 'guardian',
  classIds: [],
}

/**
 * مربی دوم، فقط برای سنجشِ شمارِ نخوانده.
 *
 * انبار بین تست‌های این فایل پاک نمی‌شود، پس گفتگویی که تست‌های پیشین
 * پیام‌هایشان را در آن ریخته‌اند شمارِ مطلق نمی‌دهد. یک گفتگوی دست‌نخورده
 * می‌دهد.
 */
const otherTeacher: AccessScope = {
  accountId: 'staff-nasrin',
  centerId: 'centre-aftab',
  role: 'teacher',
  classIds: ['class-golha'],
}

let asTeacher: DataAccess
let asParent: DataAccess
let asOtherTeacher: DataAccess

/*
 * هر تست متن یکتای خودش را دارد.
 *
 * انبارِ داده نمونه ماژولی است و بین تست‌های یک فایل پاک نمی‌شود، پس
 * شمردن کلِ پیام‌های یک گفتگو بین تست‌ها می‌لغزد. سنجش روی «همین متن»
 * است، که هم دقیق‌تر است هم مستقل از ترتیب اجرا.
 */
let seq = 0
const note = () => `پیام آزمون ${(seq += 1)}`

const bodies = (thread: { messages: { body: string }[] }) => thread.messages.map((m) => m.body)

/** شب، بیرون از ۰۸:۰۰ تا ۱۶:۳۰. */
const NIGHT = new Date(2026, 4, 2, 23, 10)
/** صبح روز بعد، پس از ساعت تحویل. */
const MORNING = new Date(2026, 4, 3, 8, 30)

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(NIGHT)
  localStorage.clear()
  asTeacher = await createDataAccess(teacher)
  asParent = await createDataAccess(parent)
  asOtherTeacher = await createDataAccess(otherTeacher)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('پیامِ شبانهٔ خانواده تا صبح نمی‌رسد', () => {
  it('فرستنده پیام خودش را می‌بیند، با برچسب صف', async () => {
    const text = note()
    const id = await asParent.openConversation('acc-teacher-golha')
    await asParent.sendToConversation(id, text)

    const mine = (await asParent.getConversation(id)).messages.find((m) => m.body === text)
    expect(mine?.sentAt).toBeNull()
    expect(mine?.queuedUntil).not.toBeNull()
  })

  it('ولی گیرنده هنوز نمی‌بیندش', async () => {
    const text = note()
    const id = await asParent.openConversation('acc-teacher-golha')
    await asParent.sendToConversation(id, text)

    expect(bodies(await asTeacher.getConversation(id))).not.toContain(text)
  })

  it('و در شمار نخوانده‌های گیرنده هم نمی‌آید', async () => {
    const text = note()
    const id = await asParent.openConversation('acc-teacher-golha')
    await asTeacher.markConversationRead(id)
    await asParent.sendToConversation(id, text)

    const inbox = await asTeacher.listConversations()
    expect(inbox.find((row) => row.id === id)?.unread ?? 0).toBe(0)
  })

  it('و در پیش‌نمایش فهرستِ گیرنده هم نمی‌نشیند', async () => {
    const text = note()
    const id = await asParent.openConversation('acc-teacher-golha')
    await asParent.sendToConversation(id, text)

    const inbox = await asTeacher.listConversations()
    expect(inbox.find((row) => row.id === id)?.lastBody).not.toBe(text)
  })
})

describe('صبح که شد، خودش رسیده است', () => {
  it('گیرنده متن را می‌بیند', async () => {
    const text = note()
    const id = await asParent.openConversation('acc-teacher-golha')
    await asParent.sendToConversation(id, text)

    vi.setSystemTime(MORNING)
    expect(bodies(await asTeacher.getConversation(id))).toContain(text)
  })

  it('و «رسیده» علامت می‌خورد، نه «در صف»', async () => {
    const text = note()
    const id = await asParent.openConversation('acc-teacher-golha')
    await asParent.sendToConversation(id, text)

    vi.setSystemTime(MORNING)
    const row = (await asTeacher.getConversation(id)).messages.find((m) => m.body === text)
    expect(row?.sentAt).not.toBeNull()
  })

  it('یک نخوانده می‌شود', async () => {
    const text = note()
    const id = await asParent.openConversation('staff-nasrin')
    await asParent.sendToConversation(id, text)

    vi.setSystemTime(MORNING)
    const inbox = await asOtherTeacher.listConversations()
    expect(inbox.find((row) => row.id === id)?.unread).toBe(1)
  })

  it('و در پیش‌نمایش فهرست می‌آید', async () => {
    const text = note()
    const id = await asParent.openConversation('acc-teacher-golha')
    await asParent.sendToConversation(id, text)

    vi.setSystemTime(MORNING)
    const inbox = await asTeacher.listConversations()
    expect(inbox.find((row) => row.id === id)?.lastBody).toBe(text)
  })
})

describe('ساعت کاری فقط قاعدهٔ خانواده است', () => {
  it('پیام مربی به مربی شبانه هم همان لحظه می‌رسد', async () => {
    /*
     * مدیری که شب یازده به مربی می‌نویسد نباید تا صبح صبر کند. قاعده
     * ساعت کاری برای محافظت از خانواده است، نه یک قاعده عمومی.
     */
    const text = note()
    const id = await asTeacher.openConversation('staff-nasrin')
    await asTeacher.sendToConversation(id, text)

    const row = (await asTeacher.getConversation(id)).messages.find((m) => m.body === text)
    expect(row?.sentAt).not.toBeNull()
    expect(row?.queuedUntil).toBeNull()
  })
})

describe('در ساعت کاری، صفی در کار نیست', () => {
  it('پیام خانواده همان لحظه می‌رسد', async () => {
    vi.setSystemTime(new Date(2026, 4, 3, 9, 0))
    const text = note()
    const id = await asParent.openConversation('acc-teacher-golha')
    await asParent.sendToConversation(id, text)

    const row = (await asTeacher.getConversation(id)).messages.find((m) => m.body === text)
    expect(row?.sentAt).not.toBeNull()
  })
})
