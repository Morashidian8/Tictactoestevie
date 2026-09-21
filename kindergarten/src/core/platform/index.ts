/**
 * نقطهٔ ورود لایهٔ سکو.
 *
 * مثل لایهٔ داده، انتخاب در زمان بیلد ثابت می‌شود و import پویاست تا
 * شاخهٔ انتخاب‌نشده همراه داده نمونه‌اش از بیلد بیرون بماند.
 */
import { DATA_SOURCE } from '../data/index.ts'
import type { PlatformAccess } from './types.ts'

export type { CenterSummary, NewCenter, PlatformAccess } from './types.ts'

export async function createPlatformAccess(): Promise<PlatformAccess> {
  if (DATA_SOURCE === 'local') {
    const { createLocalPlatformAccess } = await import('./localPlatformAccess.ts')
    return createLocalPlatformAccess()
  }
  const { createSupabasePlatformAccess } = await import('./supabasePlatformAccess.ts')
  return createSupabasePlatformAccess()
}
