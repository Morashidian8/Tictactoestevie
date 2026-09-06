import type { Lesson, LessonMeta } from './types'
import { ALL_META, CURRICULUM } from './curriculum'

/* هر فایلی که در پوشهٔ lessons ساخته شود، خودکار ثبت می‌شود.
   نام فایل باید دقیقاً برابر id درس باشد: g7-l1.ts */
const modules = import.meta.glob<{ default: Lesson }>('./lessons/*.ts')

const READY = new Set(
  Object.keys(modules).map((p) => p.replace('./lessons/', '').replace('.ts', '')),
)

const cache = new Map<string, Lesson>()

export function isReady(id: string): boolean {
  return READY.has(id)
}

export async function loadLesson(id: string): Promise<Lesson | null> {
  const hit = cache.get(id)
  if (hit) return hit
  const loader = modules[`./lessons/${id}.ts`]
  if (!loader) return null
  const mod = await loader()
  cache.set(id, mod.default)
  return mod.default
}

/** فهرست پایه با وضعیت آماده‌بودن محتوا */
export function lessonsOf(grade: number): LessonMeta[] {
  return (CURRICULUM[grade] ?? []).map((m) => ({ ...m, ready: READY.has(m.id) }))
}

export function metaOf(id: string): LessonMeta | undefined {
  const m = ALL_META.find((x) => x.id === id)
  return m && { ...m, ready: READY.has(m.id) }
}

export function readyCount(grade: number): number {
  return (CURRICULUM[grade] ?? []).filter((m) => READY.has(m.id)).length
}

export function allReadyMeta(): LessonMeta[] {
  return ALL_META.filter((m) => READY.has(m.id)).map((m) => ({ ...m, ready: true }))
}

/** درس بعدی و قبلی در همان پایه */
export function neighbors(id: string): { prev?: LessonMeta; next?: LessonMeta } {
  const meta = ALL_META.find((x) => x.id === id)
  if (!meta) return {}
  const list = CURRICULUM[meta.grade] ?? []
  const i = list.findIndex((x) => x.id === id)
  return {
    prev: i > 0 ? { ...list[i - 1], ready: READY.has(list[i - 1].id) } : undefined,
    next: i >= 0 && i < list.length - 1 ? { ...list[i + 1], ready: READY.has(list[i + 1].id) } : undefined,
  }
}
