/**
 * فشرده‌سازی عکس سمت کلاینت — بخش ۱۴.۳ سند.
 *
 * «حداکثر ۱۶۰۰ پیکسل بُعد بزرگ‌تر، کیفیت ۰.۷، خروجی WebP با جایگزین JPEG.»
 *
 * چرا سمت کلاینت: بند ۱۴.۴ می‌گوید هزینه استوریج با فشرده‌سازی اجباری
 * کنترل می‌شود، و مهد ۸۰ نفره روزی حدود صد عکس می‌فرستد. آپلود عکس خام
 * از اینترنت ضعیف کلاس، هم گران است هم کند.
 *
 * واترمارک اینجا زده نمی‌شود. بند ۱۴.۳ می‌گوید واترمارک سمت سرور است، و
 * درست هم همین است: واترمارکی که کلاینت بزند، کلاینت می‌تواند نزند.
 */

/** بُعد بزرگ‌تر تصویر پس از فشرده‌سازی، بخش ۱۴.۳. */
export const MAX_EDGE = 1600

/** کیفیت خروجی، بخش ۱۴.۳. */
export const QUALITY = 0.7

/** بُعد بزرگ‌تر تصویر بندانگشتی. در همان مرحله ساخته می‌شود. */
export const THUMB_EDGE = 240

export type CompressedImage = {
  blob: Blob
  thumb: Blob
  width: number
  height: number
  /** نشانی موقت برای پیش‌نمایش. مصرف‌کننده باید آزادش کند. */
  previewUrl: string
}

/** ابعاد مقصد، با حفظ نسبت و بدون بزرگ‌کردن تصویر کوچک. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const scale = maxEdge / longest
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

async function draw(
  source: ImageBitmap,
  maxEdge: number,
  type: string,
): Promise<{ blob: Blob; width: number; height: number }> {
  const size = fitWithin(source.width, source.height, maxEdge)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height

  const context = canvas.getContext('2d')
  if (!context) throw new Error('بوم تصویر ساخته نشد.')
  context.drawImage(source, 0, 0, size.width, size.height)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, QUALITY),
  )
  if (!blob) throw new Error('تصویر فشرده نشد.')
  return { blob, ...size }
}

/** آیا مرورگر WebP می‌سازد؟ اگر نه، JPEG جایگزین می‌شود. */
function preferredType(): string {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  return canvas.toDataURL('image/webp').startsWith('data:image/webp')
    ? 'image/webp'
    : 'image/jpeg'
}

/**
 * یک فایل از دوربین یا گالری را به عکس آماده آپلود تبدیل می‌کند، به‌علاوه
 * بندانگشتی‌اش که در همان مرحله ساخته می‌شود (بخش ۱۴.۳ گام ۲).
 */
export async function compressImage(file: File): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file)
  try {
    const type = preferredType()
    const full = await draw(bitmap, MAX_EDGE, type)
    const thumb = await draw(bitmap, THUMB_EDGE, type)
    return {
      blob: full.blob,
      thumb: thumb.blob,
      width: full.width,
      height: full.height,
      previewUrl: URL.createObjectURL(full.blob),
    }
  } finally {
    bitmap.close()
  }
}
