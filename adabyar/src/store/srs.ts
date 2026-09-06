import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { dayKey } from '@/lib/format'

/* جعبهٔ لایتنر با پنج خانه — فاصلهٔ مرور بر حسب روز */
export const BOX_INTERVALS = [0, 1, 3, 7, 16]

export interface Card {
  id: string
  lessonId: string
  front: string
  back: string
  kind: 'واژه' | 'آرایه' | 'نکته' | 'بیت'
  box: number
  /** روزِ (شمسیِ) مرور بعدی */
  due: string
  seen: number
  correct: number
}

interface SrsState {
  cards: Record<string, Card>
  addMany: (cards: Omit<Card, 'box' | 'due' | 'seen' | 'correct'>[]) => void
  answer: (id: string, ok: boolean) => void
  removeLesson: (lessonId: string) => void
  reset: () => void
}

function addDays(days: number): string {
  return dayKey(new Date(Date.now() + days * 864e5))
}

export const useSrs = create<SrsState>()(
  persist(
    (set) => ({
      cards: {},

      addMany: (incoming) =>
        set((s) => {
          const cards = { ...s.cards }
          for (const c of incoming) {
            if (cards[c.id]) continue
            cards[c.id] = { ...c, box: 0, due: dayKey(), seen: 0, correct: 0 }
          }
          return { cards }
        }),

      answer: (id, ok) =>
        set((s) => {
          const c = s.cards[id]
          if (!c) return s
          const box = ok ? Math.min(c.box + 1, BOX_INTERVALS.length - 1) : 0
          return {
            cards: {
              ...s.cards,
              [id]: {
                ...c,
                box,
                due: addDays(BOX_INTERVALS[box]),
                seen: c.seen + 1,
                correct: c.correct + (ok ? 1 : 0),
              },
            },
          }
        }),

      removeLesson: (lessonId) =>
        set((s) => {
          const cards = { ...s.cards }
          for (const k of Object.keys(cards)) if (cards[k].lessonId === lessonId) delete cards[k]
          return { cards }
        }),

      reset: () => set({ cards: {} }),
    }),
    { name: 'adabyar.srs.v1' },
  ),
)

/** کارت‌هایی که امروز باید مرور شوند */
export function dueCards(cards: Record<string, Card>): Card[] {
  const today = dayKey()
  return Object.values(cards)
    .filter((c) => c.due <= today)
    .sort((a, b) => a.box - b.box || a.seen - b.seen)
}
