/**
 * نقطه ورود لایه دسترسی به داده.
 *
 * بند ۱۱.۱۰: قید center_id اینجا یک‌جا بسته می‌شود. هیچ صفحه‌ای مخزن را
 * خودش نمی‌سازد و هیچ متدی center_id نمی‌گیرد.
 *
 * دو پیاده‌سازی وجود دارد و صفحه نمی‌داند با کدام کار می‌کند:
 *   local     برای اجرای بدون سرور، پیش از برپا شدن Supabase
 *   supabase  پیاده‌سازی واقعی، وقتی نشانی و کلید تنظیم شده باشد
 */
import type { AccessScope, DataAccess } from './types.ts'
import { createLocalDataAccess } from './local/localDataAccess.ts'

export function createDataAccess(scope: AccessScope): DataAccess {
  return createLocalDataAccess(scope)
}

export * from './types.ts'
export { NOTES_PER_DAY, suggestNoteTargets } from './noteRotation.ts'
export { currentMoodBand, type MoodBand } from './local/localDataAccess.ts'
export {
  indexAbsences,
  indexAttendance,
  resolveState,
  tally,
  UNACCOUNTED_AFTER_HOUR,
  type DayTally,
} from './attendanceState.ts'
