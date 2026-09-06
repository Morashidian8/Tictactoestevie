import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GradeId } from '@/content/types'

export type ThemeMode = 'light' | 'dark' | 'system'

interface SettingsState {
  theme: ThemeMode
  /** بزرگ‌نمایی متن مطالعه ۰٫۸ تا ۱٫۶ */
  readerScale: number
  /** نمایش ابیات با خط نستعلیق */
  nastaliq: boolean
  /** نمایش خودکار معنی زیر هر بیت */
  autoMeaning: boolean
  grade: GradeId | null
  nickname: string
  /** هدف روزانه بر حسب دقیقه */
  dailyGoal: number
  soundOn: boolean
  onboarded: boolean
  set: (patch: Partial<SettingsState>) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      readerScale: 1,
      nastaliq: false,
      autoMeaning: true,
      grade: null,
      nickname: '',
      dailyGoal: 20,
      soundOn: true,
      onboarded: false,
      set: (patch) => set(patch),
    }),
    { name: 'adabyar.settings.v1' },
  ),
)

/** اعمال تم روی <html> */
export function applyTheme(theme: ThemeMode) {
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#0b0f22' : '#f6f2ea')
}
