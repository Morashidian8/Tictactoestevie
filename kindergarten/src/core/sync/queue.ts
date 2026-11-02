/**
 * صف آفلاین — بخش ۱۴.۲ سند.
 *
 * دو صف مجزا لازم است: صف داده متنی با اولویت بالا و صف عکس با اولویت
 * پایین، تا آپلود سنگین ثبت متنی را عقب نیندازد.
 *
 * در این مرحله فقط رابط و یک پیاده‌سازی گذرا وجود دارد. همه نوشتن‌ها از
 * همین‌جا رد می‌شوند تا وقتی صف واقعی آمد، هیچ صفحه‌ای عوض نشود.
 */

export type QueueLane = 'text' | 'photo'

export type QueueStatus = {
  /** تعداد ثبت‌های منتظر. SyncBadge فقط وقتی این بزرگ‌تر از صفر است دیده می‌شود. */
  pending: number
}

export interface WriteQueue {
  /**
   * یک نوشتن را اجرا می‌کند. صف واقعی این را محلی می‌نشاند و بعداً
   * همگام می‌کند؛ پیاده‌سازی گذرا مستقیم اجرایش می‌کند.
   */
  submit<T>(lane: QueueLane, task: () => Promise<T>): Promise<T>
  getStatus(): QueueStatus
  subscribe(listener: (status: QueueStatus) => void): () => void
}

/**
 * پیاده‌سازی گذرا: بدون ماندگاری، بدون تلاش دوباره.
 *
 * شمارنده در حین اجرا بالا می‌رود تا SyncBadge همین حالا هم رفتار درست
 * داشته باشد، ولی با بستن اپ همه‌چیز از دست می‌رود. صف ماندگار جلسه بعد.
 */
export function createPassthroughQueue(): WriteQueue {
  let pending = 0
  const listeners = new Set<(status: QueueStatus) => void>()

  const emit = () => {
    const status = { pending }
    for (const listener of listeners) listener(status)
  }

  return {
    async submit(_lane, task) {
      pending += 1
      emit()
      try {
        return await task()
      } finally {
        pending -= 1
        emit()
      }
    },
    getStatus: () => ({ pending }),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
