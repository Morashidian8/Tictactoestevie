/**
 * کلاینت Supabase — بخش ۱۴.۱ سند.
 *
 * نشانی و کلید از متغیر محیطی می‌آیند. بند ۱۰.۲: میزبانی باید داخل کشور
 * باشد، پس نشانی هرگز در کد ثابت نوشته نمی‌شود.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null

export function supabase(): SupabaseClient {
  if (cached) return cached
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      'VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY تنظیم نشده‌اند. ' +
        'برای اجرای بدون سرور، VITE_DATA_SOURCE=local بگذارید.',
    )
  }
  cached = createClient(url, key, { auth: { persistSession: true } })
  return cached
}
