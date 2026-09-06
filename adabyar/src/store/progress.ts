import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { dayKey } from '@/lib/format'
import type { QTopic } from '@/content/types'

export interface LessonProgress {
  /** درصد مطالعهٔ بخش تدریس (۰..۱۰۰) */
  read: number
  /** بهترین درصد تمرین */
  practice: number
  /** بهترین درصد آزمون */
  exam: number
  lastSeen: number
}

export interface ExamResult {
  lessonId: string
  score: number
  total: number
  at: number
  seconds: number
  /** پاسخ غلط‌ها بر حسب ریزموضوع */
  weakTopics: QTopic[]
}

interface ProgressState {
  lessons: Record<string, LessonProgress>
  xp: number
  /** روزهای پیاپی */
  streak: number
  lastActiveDay: string
  /** دقیقهٔ مطالعه به تفکیک روز */
  minutesByDay: Record<string, number>
  results: ExamResult[]
  badges: string[]
  bookmarks: string[]

  touch: () => void
  addXp: (n: number) => void
  addMinutes: (m: number) => void
  markRead: (lessonId: string, pct: number) => void
  markPractice: (lessonId: string, pct: number) => void
  saveExam: (r: ExamResult) => void
  toggleBookmark: (lessonId: string) => void
  award: (badge: string) => void
  reset: () => void
}

const emptyLesson = (): LessonProgress => ({ read: 0, practice: 0, exam: 0, lastSeen: 0 })

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      lessons: {},
      xp: 0,
      streak: 0,
      lastActiveDay: '',
      minutesByDay: {},
      results: [],
      badges: [],
      bookmarks: [],

      touch: () => {
        const today = dayKey()
        const { lastActiveDay, streak } = get()
        if (lastActiveDay === today) return
        const yesterday = dayKey(new Date(Date.now() - 864e5))
        set({
          lastActiveDay: today,
          streak: lastActiveDay === yesterday ? streak + 1 : 1,
        })
      },

      addXp: (n) => set((s) => ({ xp: s.xp + n })),

      addMinutes: (m) =>
        set((s) => {
          const k = dayKey()
          return { minutesByDay: { ...s.minutesByDay, [k]: (s.minutesByDay[k] ?? 0) + m } }
        }),

      markRead: (lessonId, pct) =>
        set((s) => {
          const cur = s.lessons[lessonId] ?? emptyLesson()
          return {
            lessons: {
              ...s.lessons,
              [lessonId]: { ...cur, read: Math.max(cur.read, pct), lastSeen: Date.now() },
            },
          }
        }),

      markPractice: (lessonId, pct) =>
        set((s) => {
          const cur = s.lessons[lessonId] ?? emptyLesson()
          return {
            lessons: {
              ...s.lessons,
              [lessonId]: { ...cur, practice: Math.max(cur.practice, pct), lastSeen: Date.now() },
            },
          }
        }),

      saveExam: (r) =>
        set((s) => {
          const cur = s.lessons[r.lessonId] ?? emptyLesson()
          const pct = r.total ? Math.round((r.score / r.total) * 100) : 0
          return {
            results: [r, ...s.results].slice(0, 200),
            lessons: {
              ...s.lessons,
              [r.lessonId]: { ...cur, exam: Math.max(cur.exam, pct), lastSeen: Date.now() },
            },
          }
        }),

      toggleBookmark: (lessonId) =>
        set((s) => ({
          bookmarks: s.bookmarks.includes(lessonId)
            ? s.bookmarks.filter((x) => x !== lessonId)
            : [...s.bookmarks, lessonId],
        })),

      award: (badge) =>
        set((s) => (s.badges.includes(badge) ? s : { badges: [...s.badges, badge] })),

      reset: () =>
        set({
          lessons: {}, xp: 0, streak: 0, lastActiveDay: '',
          minutesByDay: {}, results: [], badges: [], bookmarks: [],
        }),
    }),
    { name: 'adabyar.progress.v1' },
  ),
)

/** سطح از روی XP — هر سطح ۲۵٪ سخت‌تر از قبلی */
export function levelOf(xp: number): { level: number; into: number; need: number } {
  let level = 1
  let need = 100
  let rest = xp
  while (rest >= need) {
    rest -= need
    level++
    need = Math.round(need * 1.25)
  }
  return { level, into: rest, need }
}

export const LEVEL_TITLES = [
  'نوآموز', 'دانش‌آموز', 'سخن‌شناس', 'نکته‌دان', 'ادیب',
  'سخنور', 'شاعرمنش', 'استاد سخن', 'خداوندگار سخن',
]

export function levelTitle(level: number): string {
  return LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)]
}
