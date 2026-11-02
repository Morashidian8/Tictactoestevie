/**
 * احراز هویت واقعی — بخش ۳.۲ سند.
 *
 * یک auth.users برای هر شماره، چند user_account روی آن. حساب فعال در
 * جدول active_account می‌نشیند، همان جایی که سیاست‌های سطر-محور آن را
 * می‌خوانند؛ پس «دسترسی‌ها هرگز ترکیب نمی‌شوند» در دیتابیس هم بسته است،
 * نه فقط در رابط.
 *
 * هشدار صداقت: مثل لایه داده، این کد هنوز روی نمونه زنده اجرا نشده.
 */
import { supabase } from '../data/supabase/client.ts'
import type { AccountOption, AuthAdapter, Session } from './types.ts'

/** شماره ایرانی را به شکلی که Supabase می‌خواهد درمی‌آورد. */
function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('98')) return `+${digits}`
  if (digits.startsWith('0')) return `+98${digits.slice(1)}`
  return `+98${digits}`
}

export function createSupabaseAuthAdapter(): AuthAdapter {
  const db = supabase()

  const accountsFor = async (): Promise<AccountOption[]> => {
    const { data, error } = await db
      .from('user_account')
      .select('id, center_id, role, staff:staff_id(full_name), guardian:guardian_id(full_name), center:center_id(name), staff_class(class_id)')
      .eq('active', true)
    if (error) throw new Error(error.message)
    return (data ?? []).map((row): AccountOption => {
      const r = row as Record<string, unknown>
      const staff = r.staff as { full_name?: string } | null
      const guardian = r.guardian as { full_name?: string } | null
      const center = r.center as { name?: string } | null
      return {
        id: r.id as string,
        centerId: r.center_id as string,
        centerName: center?.name ?? '',
        role: r.role as AccountOption['role'],
        displayName: staff?.full_name ?? guardian?.full_name ?? '',
        classIds: ((r.staff_class as { class_id: string }[] | null) ?? []).map((c) => c.class_id),
      }
    })
  }

  return {
    async requestCode(phone) {
      const { error } = await db.auth.signInWithOtp({ phone: toE164(phone) })
      if (error) throw new Error(error.message)
    },

    async verifyCode(phone, code) {
      const { error } = await db.auth.verifyOtp({ phone: toE164(phone), token: code, type: 'sms' })
      if (error) throw new Error(error.message)
      return accountsFor()
    },

    async selectAccount(accountId) {
      const { data: auth } = await db.auth.getUser()
      if (!auth.user) throw new Error('نشستی وجود ندارد')
      const { error } = await db
        .from('active_account')
        .upsert({ auth_user_id: auth.user.id, user_account_id: accountId }, { onConflict: 'auth_user_id' })
      if (error) throw new Error(error.message)
    },

    async restore(): Promise<Session | null> {
      const { data: auth } = await db.auth.getUser()
      if (!auth.user) return null
      const accounts = await accountsFor()
      const { data: active } = await db
        .from('active_account')
        .select('user_account_id')
        .eq('auth_user_id', auth.user.id)
        .maybeSingle()
      const activeId = (active as { user_account_id?: string } | null)?.user_account_id
      return {
        phone: auth.user.phone ?? '',
        accounts,
        // بخش ۳.۲: تا انتخاب نشده، حساب فعالی نیست و داده‌ای خوانده نمی‌شود.
        active: accounts.find((a) => a.id === activeId) ?? null,
      }
    },

    async signOut() {
      await db.auth.signOut()
    },
  }
}
