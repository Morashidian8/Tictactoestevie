/**
 * انتخاب لایه احراز هویت، هم‌سو با انتخاب لایه داده.
 *
 * مثل core/data، شاخه انتخاب‌نشده با import پویا از بیلد بیرون می‌ماند؛
 * پس شماره‌های نمونه و نام مهد نمونه وارد ساخت تولید نمی‌شوند.
 */
import { DATA_SOURCE } from '../data/index.ts'
import type { AuthAdapter } from './types.ts'

export async function createAuthAdapter(): Promise<AuthAdapter> {
  if (DATA_SOURCE === 'local') {
    const { createLocalAuthAdapter } = await import('./localAuthAdapter.ts')
    return createLocalAuthAdapter()
  }
  const { createSupabaseAuthAdapter } = await import('./supabaseAuthAdapter.ts')
  return createSupabaseAuthAdapter()
}
