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
 * دو شماره نمونه. اولی فقط یک حساب دارد و مستقیم وارد می‌شود؛ دومی دو
 * حساب دارد تا صفحه انتخاب حساب و جابه‌جایی قابل آزمایش باشد.
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

export const DEV_PHONES = Object.keys(ACCOUNTS)

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
      const accounts = ACCOUNTS[phone] ?? []
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
