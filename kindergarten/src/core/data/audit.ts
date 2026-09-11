/**
 * رد پای خواندن — بند ۱۱.۹ سند.
 *
 * نوشتن در پایگاه داده رد پا می‌گذارد و تریگر را نمی‌شود دور زد (مهاجرت
 * ۰۰۱۱). خواندن اما تریگر ندارد؛ SELECT در پستگرس تریگر نمی‌پذیرد. پس
 * رد پای خواندن اینجا زده می‌شود، در همان لایه‌ای که قید center_id هم
 * بسته می‌شود.
 *
 * فقط سه موجودیت حساس لاگ می‌شوند: پرونده پزشکی، عکس، و رویداد. بقیه
 * خواندن‌ها حجم رد پا را بی‌فایده بالا می‌برند.
 *
 * این یک روکش است، نه فراخوانی پراکنده در تک‌تک متدها: هر پیاده‌سازی
 * DataAccess که از createDataAccess رد شود رد پا می‌گذارد، و افزودن
 * متد تازه نمی‌تواند آن را جا بیندازد.
 */
import type { DataAccess, ReadAuditEntity, ReadAuditSink } from './types.ts'

/** رد پای خواندن را روی هر پیاده‌سازی می‌نشاند. */
export function withReadAudit(inner: DataAccess, sink: ReadAuditSink): DataAccess {
  const log = (entity: ReadAuditEntity, ids: (string | null | undefined)[]) => {
    const clean = ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
    if (clean.length === 0) return
    // رد پا نباید مسیر اصلی را بشکند یا کند کند: شکستش بلعیده می‌شود و
    // خودش منتظر نمی‌ماند.
    void Promise.resolve()
      .then(() => sink.readOccurred(entity, clean))
      .catch(() => undefined)
  }

  return {
    ...inner,

    async getClassDay(classId, date) {
      const day = await inner.getClassDay(classId, date)
      log('photo', day.photos.map((p) => p.id))
      log('incident', day.incidents.map((i) => i.id))
      log('medical_profile', day.children.map((c) => c.id))
      return day
    },

    async getParentDay(childId, date) {
      const day = await inner.getParentDay(childId, date)
      log('photo', day.photos.map((p) => p.id))
      log('incident', day.incidents.map((i) => i.id))
      return day
    },
  }
}
