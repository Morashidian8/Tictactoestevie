import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/* ================================================================
   اشتراک
   نسخهٔ فعلی به‌صورت آفلاین با «کد فعال‌سازی» کار می‌کند تا بعداً
   بتوان بدون تغییر رابط، درگاه پرداخت (زرین‌پال/بازار) را جایگزین کرد.
   نکتهٔ امنیتی: اعتبارسنجی سمت کلاینت فقط سدّ راحتی است؛ برای
   انتشار تجاری باید تأیید نهایی روی سرور انجام شود. (docs/MONETIZATION.md)
   ================================================================ */

export type Plan = 'free' | 'premium'

export interface Entitlement {
  plan: Plan
  /** میلی‌ثانیه؛ null یعنی مادام‌العمر */
  expiresAt: number | null
  code: string | null
}

interface EntState extends Entitlement {
  activate: (code: string) => { ok: boolean; message: string }
  clear: () => void
  isPremium: () => boolean
}

/** کدهای نمونه برای تست و معرفی — در نسخهٔ تجاری از سرور بگیرید */
const DEMO_CODES: Record<string, { days: number | null; label: string }> = {
  'ADAB-1404-DEMO': { days: 7, label: 'هفت روز رایگان' },
  'ADAB-YEAR-TEST': { days: 365, label: 'یک‌سالهٔ آزمایشی' },
  'ADAB-LIFE-TEST': { days: null, label: 'مادام‌العمر آزمایشی' },
}

export const useEntitlement = create<EntState>()(
  persist(
    (set, get) => ({
      plan: 'free',
      expiresAt: null,
      code: null,

      activate: (raw) => {
        const code = raw.trim().toUpperCase()
        const found = DEMO_CODES[code]
        if (!found) return { ok: false, message: 'کد فعال‌سازی معتبر نیست.' }
        set({
          plan: 'premium',
          code,
          expiresAt: found.days === null ? null : Date.now() + found.days * 864e5,
        })
        return { ok: true, message: `اشتراک «${found.label}» فعال شد.` }
      },

      clear: () => set({ plan: 'free', expiresAt: null, code: null }),

      isPremium: () => {
        const { plan, expiresAt } = get()
        if (plan !== 'premium') return false
        return expiresAt === null || expiresAt > Date.now()
      },
    }),
    { name: 'adabyar.entitlement.v1' },
  ),
)

/** قاعدهٔ دسترسی رایگان: ستایش و دو درس نخست هر پایه */
export function isFreeLesson(number: number): boolean {
  return number <= 2
}
