/**
 * به‌روزرسانی زنده بین مربیان — ارتقای ۴ سند بررسی طراحی.
 *
 * تا اینجا صفحه «امروز» هر سی ثانیه خودش را تازه می‌کرد. صبح مهد، سی
 * ثانیه یعنی دو مربی یک ورود را ثبت می‌کنند یا یکی دنبال کودکی می‌گردد
 * که همکارش تحویلش گرفته.
 *
 * معماری تازه: اتصال پایدار سوکت، با هدف زیر دو ثانیه. ولی اینترنت
 * موبایل ایران قطع می‌شود، پس سه قاعده مقاومت از اول در طرح‌اند:
 *
 *   ۱. قطع اتصال هرگز صفحه را نمی‌شکند — فراخوانی دوره‌ای برمی‌گردد.
 *   ۲. اتصال دوباره با عقب‌نشینی نمایی، تا سقف سی ثانیه.
 *   ۳. پس از هر اتصال دوباره، یک بار کل روز خوانده می‌شود؛ رویدادهای
 *      حین قطعی از دست رفته‌اند و هیچ سوکتی آن‌ها را برنمی‌گرداند.
 *
 * صف نوشتن آفلاین دست‌نخورده می‌ماند. سوکت برای خواندن است؛ نوشتن از
 * قبل صف خودش را دارد و آن معماری درست است.
 */

/** رویدادهایی که بین مربیان یک کلاس پخش می‌شوند. */
export type LiveEvent =
  | 'attendance'
  | 'absence'
  | 'medication'
  | 'session_extra'
  | 'report_locked'

export type LiveState = 'connected' | 'reconnecting' | 'offline'

export type LiveStatus = {
  state: LiveState
  /**
   * هر بار که اتصال از نو برقرار می‌شود بالا می‌رود.
   *
   * صفحه از همین می‌فهمد که باید یک بار کامل بخواند، نه اینکه به
   * رویدادهای بعدی تکیه کند.
   */
  epoch: number
}

export interface LiveChannel {
  /** رویدادهای یک کلاس. تابع برگشتی اشتراک را می‌بندد. */
  subscribe(classId: string, listener: (event: LiveEvent) => void): () => void
  /** وضعیت اتصال، برای نشانگر سرصفحه. */
  watch(listener: (status: LiveStatus) => void): () => void
  getStatus(): LiveStatus
  close(): void
}

/** فاصله تلاش دوباره: ۱، ۲، ۴، ۸، ۱۶، و بعد سقف ۳۰ ثانیه. */
export function backoffMs(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, attempt))
}

/**
 * فاصله فراخوانی دوره‌ای، وقتی سوکت در دسترس نیست.
 *
 * همان سی ثانیه پیشین: لایه پشتیبان است، نه مسیر اصلی، و نباید باتری
 * و سهمیه اینترنت را بخورد.
 */
export const FALLBACK_POLL_MS = 30_000

/**
 * پیاده‌سازی محلی: بدون سوکت.
 *
 * نسخه نمایشی سرور ندارد، ولی چند تب مرورگر دارد — و مسئله واقعی هم
 * همین است: دو مربی، دو دستگاه. BroadcastChannel همان نقش را بازی
 * می‌کند و رفتار صفحه دقیقاً همانی می‌شود که با سوکت خواهد بود.
 */
export function createLocalLiveChannel(): LiveChannel {
  const listeners = new Map<string, Set<(event: LiveEvent) => void>>()
  const watchers = new Set<(status: LiveStatus) => void>()
  let status: LiveStatus = { state: 'connected', epoch: 1 }

  type Message = { classId: string; event: LiveEvent }
  const channel =
    typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('kg.live')

  if (channel) {
    channel.onmessage = (message: MessageEvent<Message>) => {
      const { classId, event } = message.data
      for (const listener of listeners.get(classId) ?? []) listener(event)
    }
  } else {
    // مرورگری که BroadcastChannel ندارد، همان لایه پشتیبان را می‌گیرد.
    status = { state: 'offline', epoch: 1 }
  }

  const emit = () => {
    for (const watcher of watchers) watcher(status)
  }

  return {
    subscribe(classId, listener) {
      const set = listeners.get(classId) ?? new Set()
      set.add(listener)
      listeners.set(classId, set)
      return () => set.delete(listener)
    },
    watch(listener) {
      watchers.add(listener)
      listener(status)
      return () => watchers.delete(listener)
    },
    getStatus: () => status,
    close() {
      channel?.close()
      status = { state: 'offline', epoch: status.epoch }
      emit()
    },
  }
}

/**
 * پخش یک رویداد به بقیه دستگاه‌ها.
 *
 * در پیاده‌سازی واقعی لازم نیست: نوشتن در پایگاه داده خودش رویداد
 * Realtime می‌سازد. اینجا چون سروری نیست، نویسنده خودش خبر می‌دهد.
 */
export function announceLocal(classId: string, event: LiveEvent): void {
  if (typeof BroadcastChannel === 'undefined') return
  const channel = new BroadcastChannel('kg.live')
  channel.postMessage({ classId, event })
  channel.close()
}
