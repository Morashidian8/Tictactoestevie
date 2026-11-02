/**
 * احراز هویت محلی — فقط برای اجرای بدون سرور.
 *
 * جریان و قواعد دقیقاً همان‌اند: شماره، کد یکبارمصرف، و اگر شماره بیش از
 * یک حساب داشت، صفحه انتخاب حساب. تنها تفاوت این است که کد به‌جای پیامک
 * روی صفحه نوشته می‌شود.
 *
 * در ساخت تولید بارگذاری نمی‌شود.
 */
import { CENTER_ID } from '../data/local/fixture.ts'
import type { AccountOption, AuthAdapter, Session } from './types.ts'

const STORAGE_KEY = 'kg.dev.session'
const CENTER_NAME = 'مهد آفتاب'

/**
 * شماره‌های نمونه.
 *
 * چهار مربی، نه دو تا. مهد واقعی سه تا چهار مربی دارد و شیفت‌هایشان با
 * بازه‌های روز یکی نیست: یکی تمام‌روز، یکی تا ظهر، یکی از ظهر. بدون هر
 * سه، حالت «بیش از یک مربی همزمان سر کار» و حالت «مربی‌ای که فقط نیمی
 * از بازه‌ها را می‌بیند» در نسخه نمایشی اصلاً دیده نمی‌شوند.
 *
 * شناسه هر حساب همان شناسه کارکن در staff_shift است، تا نام مربیِ
 * تحویل‌گیرنده از همان‌جا بیاید.
 */
const ACCOUNTS: Record<string, AccountOption[]> = {
  '09120000001': [
    {
      id: 'acc-teacher-golha',
      centerId: CENTER_ID,
      centerName: CENTER_NAME,
      role: 'teacher',
      displayName: 'زهرا محمدی',
      classIds: ['class-golha'],
    },
  ],
  // سرپرست. بخش ۶.۵: همه سرپرستان تأییدشده گزارش و عکس را می‌بینند.
  '09120000003': [
    {
      id: 'acc-parent',
      centerId: CENTER_ID,
      centerName: CENTER_NAME,
      role: 'guardian',
      displayName: 'مادر سارا',
      classIds: [],
    },
  ],
  // مربی تا ظهر. بازه بعدازظهر را اصلاً نمی‌بیند.
  '09120000004': [
    {
      id: 'staff-maryam',
      centerId: CENTER_ID,
      centerName: CENTER_NAME,
      role: 'teacher',
      displayName: 'سمیه رحیمی',
      classIds: ['class-golha'],
    },
  ],
  // مربی از ظهر. نیم‌ساعت با شیفت صبح همپوشانی دارد — همان مرزی که
  // نسبت مربی به کودک در آن بحرانی می‌شود.
  '09120000005': [
    {
      id: 'staff-nasrin',
      centerId: CENTER_ID,
      centerName: CENTER_NAME,
      role: 'teacher',
      displayName: 'نسرین کاظمی',
      classIds: ['class-golha'],
    },
  ],
  // مربی کلاس دیگر. برای آزمودن اینکه کلاس دیگری را نمی‌بیند.
  '09120000006': [
    {
      id: 'staff-elham',
      centerId: CENTER_ID,
      centerName: CENTER_NAME,
      role: 'teacher',
      displayName: 'الهام نوری',
      classIds: ['class-setareha'],
    },
  ],
  /*
   * پشتیبانی محصول — کنسول اپراتور.
   *
   * در نسخهٔ واقعی این حساب اصلاً `user_account` ندارد و از جدول
   * `platform_admin` شناخته می‌شود (مهاجرت ۰۰۴۱). اینجا چون آداپتور
   * نمایشی همه‌چیز را از یک شکل می‌خواند، همان شکل را می‌گیرد؛ مرکزش
   * هم تزئینی است و هیچ‌جا خوانده نمی‌شود.
   */
  '09120000009': [
    {
      id: 'acc-platform',
      centerId: CENTER_ID,
      centerName: CENTER_NAME,
      role: 'platform_admin',
      displayName: 'پشتیبانی محصول',
      classIds: [],
    },
  ],
  '09120000002': [
    {
      id: 'acc-teacher-both',
      centerId: CENTER_ID,
      centerName: CENTER_NAME,
      role: 'teacher',
      displayName: 'مریم رضایی',
      classIds: ['class-golha', 'class-setareha'],
    },
    {
      id: 'acc-manager',
      centerId: CENTER_ID,
      centerName: CENTER_NAME,
      role: 'manager',
      displayName: 'مریم رضایی',
      classIds: [],
    },
  ],
}

/** کد نمونه. در جریان واقعی، کد تصادفی است و با پیامک می‌رود. */
export const DEV_CODE = '11111'

/**
 * شماره‌های نمونه، با نام نه با شماره ردیف.
 *
 * پیش‌تر صفحه ورود با اندیس از فهرست می‌خواند و افزودن یک حساب تازه
 * برچسب‌ها را جابه‌جا می‌کرد.
 */
export const DEV_PHONES = {
  teacher: '09120000001',
  teacherAndManager: '09120000002',
  guardian: '09120000003',
  teacherMorning: '09120000004',
  teacherAfternoon: '09120000005',
  teacherOtherClass: '09120000006',
  platform: '09120000009',
} as const

/**
 * نامِ مهد، از همان جایی که پوسته می‌خواندش.
 *
 * در نسخه واقعی `supabaseAuthAdapter` نام را زنده از جدول `center`
 * می‌گیرد، پس تغییرِ مدیر همان لحظه در صفحه انتخاب حساب هم دیده
 * می‌شود. اینجا دو ماژول جدا هستند و بی این، مدیر نام مهد را عوض
 * می‌کرد و صفحه انتخاب حساب هنوز نامِ قدیمی را نشان می‌داد.
 */
function centreName(): string {
  try {
    const raw = localStorage.getItem('kg.centre')
    const parsed = raw ? (JSON.parse(raw) as { name?: unknown }) : null
    return typeof parsed?.name === 'string' && parsed.name ? parsed.name : CENTER_NAME
  } catch {
    return CENTER_NAME
  }
}

const named = (list: AccountOption[]): AccountOption[] =>
  list.map((account) => ({ ...account, centerName: centreName() }))

export function createLocalAuthAdapter(): AuthAdapter {
  let pendingPhone: string | null = null

  const persist = (session: Session | null) => {
    try {
      if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // حالت ناشناس مرورگر. نشست فقط تا بستن صفحه می‌ماند.
    }
  }

  const read = (): Session | null => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? (JSON.parse(raw) as Session) : null
    } catch {
      return null
    }
  }

  return {
    async requestCode(phone) {
      if (!ACCOUNTS[phone]) {
        throw new Error('برای این شماره حسابی تعریف نشده است.')
      }
      pendingPhone = phone
    },

    async verifyCode(phone, code) {
      if (pendingPhone !== phone) {
        throw new Error('ابتدا کد را درخواست کنید.')
      }
      if (code !== DEV_CODE) {
        throw new Error('کد درست نیست. دوباره وارد کنید.')
      }
      const accounts = named(ACCOUNTS[phone] ?? [])
      // بخش ۳.۲: صفحه انتخاب حساب فقط وقتی می‌آید که بیش از یک حساب باشد.
      // با یک حساب، مستقیم وارد می‌شود.
      persist({ phone, accounts, active: accounts.length === 1 ? accounts[0]! : null })
      return accounts
    },

    async selectAccount(accountId) {
      const session = read()
      if (!session) throw new Error('نشستی وجود ندارد.')
      const next = session.accounts.find((a) => a.id === accountId)
      // همان بررسی‌ای که سیاست active_account در دیتابیس می‌کند: حساب
      // انتخاب‌شده باید از آنِ همین شماره باشد.
      if (!next) throw new Error('این حساب به این شماره تعلق ندارد.')
      persist({ ...session, active: next })
    },

    async restore() {
      return read()
    },

    async signOut() {
      pendingPhone = null
      persist(null)
    },
  }
}
