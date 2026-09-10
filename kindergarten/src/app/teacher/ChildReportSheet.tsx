import { useMemo, useState } from 'react'
import { AlertIcon, BottomSheet } from '../../design-system/index.ts'
import { toLatinDigits } from '../../i18n/index.ts'
import { findBannedWords } from '../../core/data/bannedWords.ts'
import type { Child, DailyReport, MealAmount, Mood, ReportPatch } from '../../core/data/index.ts'
import styles from './ChildReportSheet.module.css'

/**
 * کارت کوچک استثنای یک کودک — بخش ۵.۵ سند.
 *
 * «برای استثنا، یک ضربه روی نام ← کارت کوچک ← تغییر مقدار.»
 *
 * هر کودکی که از اینجا رد شود، دیگر مقدار گروهی نمی‌گیرد. این تنها راه
 * رسیدن به هدف «۲۵ کودک با ۴ استثنا زیر ۹۰ ثانیه» است.
 */

export const LUNCH_LABEL: Record<MealAmount, string> = {
  all: 'همه',
  most: 'بیشترش',
  little: 'کمی',
  none: 'هیچ',
}

export const MOOD_LABEL: Record<Mood, string> = {
  good: 'خوب',
  normal: 'عادی',
  restless: 'بی‌قرار',
  sad: 'گریان',
}

const LUNCH: MealAmount[] = ['all', 'most', 'little', 'none']
const MOOD: Mood[] = ['good', 'normal', 'restless', 'sad']

const BANDS = [
  { key: 'moodMorning', label: 'صبح' },
  { key: 'moodNoon', label: 'ظهر' },
  { key: 'moodAfternoon', label: 'عصر' },
] as const

type Props = {
  child: Child
  report: DailyReport | null
  suggested: boolean
  onClose: () => void
  onSave: (patch: ReportPatch) => Promise<void>
}

export function ChildReportSheet({ child, report, suggested, onClose, onSave }: Props) {
  const [lunch, setLunch] = useState<MealAmount | null>(report?.lunch ?? null)
  const [moods, setMoods] = useState({
    moodMorning: report?.moodMorning ?? null,
    moodNoon: report?.moodNoon ?? null,
    moodAfternoon: report?.moodAfternoon ?? null,
  })
  const [nap, setNap] = useState(report?.napStart ?? '')
  const [note, setNote] = useState(report?.teacherNote ?? '')
  const [busy, setBusy] = useState(false)

  // پیوست ب: هشدار روی متن آزاد مربی، نه مانع.
  const flagged = useMemo(() => findBannedWords(note), [note])

  const save = async () => {
    setBusy(true)
    try {
      await onSave({
        lunch,
        ...moods,
        napStart: nap.trim() ? toLatinDigits(nap.trim()) : null,
        teacherNote: note.trim() || null,
      })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <BottomSheet
      title={child.firstName}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className={`${styles.primary} t-body-lg`}
            onClick={() => void save()}
            disabled={busy}
          >
            ذخیره استثنا
          </button>
          <button type="button" className={`${styles.secondary} t-body-lg`} onClick={onClose}>
            انصراف
          </button>
        </>
      }
    >
      <section className={styles.section}>
        <h3 className={`${styles.legend} t-caption`}>ناهار</h3>
        <div className={styles.choices}>
          {LUNCH.map((value) => (
            <button
              key={value}
              type="button"
              className={`${styles.choice} t-body-lg`}
              aria-pressed={lunch === value}
              onClick={() => setLunch(lunch === value ? null : value)}
            >
              {LUNCH_LABEL[value]}
            </button>
          ))}
        </div>
      </section>

      {/* سه بازه خلق. بخش ۵.۹ گزارش را وقتی «کامل» می‌داند که هر سه پر باشد. */}
      {BANDS.map((band) => (
        <section key={band.key} className={styles.section}>
          <h3 className={`${styles.legend} t-caption`}>خلق {band.label}</h3>
          <div className={styles.choices}>
            {MOOD.map((value) => (
              <button
                key={value}
                type="button"
                className={`${styles.choice} t-body-lg`}
                aria-pressed={moods[band.key] === value}
                onClick={() =>
                  setMoods((current) => ({
                    ...current,
                    [band.key]: current[band.key] === value ? null : value,
                  }))
                }
              >
                {MOOD_LABEL[value]}
              </button>
            ))}
          </div>
        </section>
      ))}

      <section className={styles.section}>
        <h3 className={`${styles.legend} t-caption`}>خواب، ساعت شروع</h3>
        <input
          className={`${styles.choice} t-body-lg`}
          style={{ direction: 'ltr', textAlign: 'start', maxInlineSize: '8rem' }}
          inputMode="numeric"
          placeholder="۱۳:۰۰"
          value={nap}
          onChange={(event) => setNap(event.target.value)}
          aria-label="ساعت شروع خواب"
        />
      </section>

      <section className={styles.section}>
        <h3 className={`${styles.legend} t-caption`}>یادداشت مربی</h3>

        {suggested && !note.trim() ? (
          <p className={`${styles.suggestBanner} t-body`}>
            امروز نوبت {child.firstName} است. یک جمله کافی است.
          </p>
        ) : null}

        <textarea
          className={styles.note}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="امروز اولین بار…"
          aria-label="یادداشت مربی"
        />

        {flagged.length > 0 ? (
          <p className={`${styles.warning} t-body`}>
            <span className={styles.warningIcon} aria-hidden>
              <AlertIcon size={18} />
            </span>
            <span>
              «{flagged.join('» و «')}» برچسب است، نه مشاهده. بنویسید چه دیدید:
              «دو بار اسباب‌بازی را از دیگری گرفت.»
            </span>
          </p>
        ) : (
          <p className={`${styles.hint} t-caption`}>اجباری نیست. آنچه دیدید بنویسید، نه آنچه برداشت کردید.</p>
        )}
      </section>
    </BottomSheet>
  )
}
