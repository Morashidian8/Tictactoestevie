/**
 * نقطه ورود لایه دسترسی به داده.
 *
 * بند ۱۱.۱۰: قید center_id اینجا یک‌جا بسته می‌شود. هیچ صفحه‌ای مخزن را
 * خودش نمی‌سازد و هیچ متدی center_id نمی‌گیرد.
 *
 * دو پیاده‌سازی هست و صفحه نمی‌داند با کدام کار می‌کند:
 *   local     داده نمونه، بدون سرور. فقط توسعه و نسخه نمایشی.
 *   supabase  پیاده‌سازی واقعی.
 *
 * انتخاب با VITE_DATA_SOURCE است و در زمان بیلد ثابت می‌شود، نه در زمان
 * اجرا. به همین دلیل هم import پویاست: شاخه‌ای که انتخاب نشده، همراه
 * فایل داده نمونه‌اش از بیلد بیرون می‌ماند. تست build.test.ts همین را
 * روی خروجی واقعی می‌سنجد.
 */
import type { AccessScope, DataAccess, ReadAuditSink } from './types.ts'
import { withReadAudit } from './audit.ts'

/**
 * حالت پیش‌فرض: توسعه و نسخه نمایشی داده محلی می‌گیرند، بیلد تولید
 * Supabase. صریح نوشتن VITE_DATA_SOURCE بر هر دو مقدم است.
 */
const SOURCE: 'local' | 'supabase' =
  import.meta.env.VITE_DATA_SOURCE === 'local'
    ? 'local'
    : import.meta.env.VITE_DATA_SOURCE === 'supabase'
      ? 'supabase'
      : import.meta.env.DEV || import.meta.env.VITE_DEMO === '1'
        ? 'local'
        : 'supabase'

export const DATA_SOURCE = SOURCE

export async function createDataAccess(scope: AccessScope): Promise<DataAccess> {
  if (SOURCE === 'local') {
    const { createLocalDataAccess, createLocalAuditSink } = await import(
      './local/localDataAccess.ts'
    )
    return withReadAudit(createLocalDataAccess(scope), createLocalAuditSink(scope))
  }
  const { createSupabaseDataAccess } = await import('./supabase/supabaseDataAccess.ts')
  const inner = createSupabaseDataAccess(scope)
  return withReadAudit(inner, inner as unknown as ReadAuditSink)
}

export * from './types.ts'
export { withReadAudit } from './audit.ts'
export { NOTES_PER_DAY, suggestNoteTargets } from './noteRotation.ts'
export {
  indexAbsences,
  indexAttendance,
  resolveState,
  tally,
  UNACCOUNTED_AFTER_HOUR,
  type DayTally,
} from './attendanceState.ts'
