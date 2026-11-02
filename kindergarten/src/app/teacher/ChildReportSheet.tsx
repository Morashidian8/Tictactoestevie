import { useMemo, useState } from 'react'
import { AlertIcon, BottomSheet } from '../../design-system/index.ts'
import { toLatinDigits } from '../../i18n/index.ts'
import { findBannedWords } from '../../core/data/bannedWords.ts'
import type {
  ChildInSession,
  DailyReport,
  MealAmount,
  Mood,
  ReportPatch,
} from '../../core/data/index.ts'
import styles from './ChildReportSheet.module.css'

/**
 * کارت کوچک استثنای یک کودک — بخش ۵.۵ سند.
 *
 * «برای استثنا، یک ضربه روی نام ← کارت کوچک ← تغییر مقدار.»
 *
 * هر کودکی که از اینجا رد شود، دیگر مقدار گروهی نمی‌گیرد. این تنها راه
 * رسیدن به هدف «۲۵ کودک با ۴ استثنا زیر ۹۰ ثانیه» است.
 *
 * بخش ۶ سند دوره حضور: فیلدی که برای این کودک معنا ندارد اصلاً کشیده
 * نمی‌شود. کودک صبحانه‌ای «خلق عصر» ندارد؛ داشتنِ خالی‌اش یعنی مربی هر
 * روز دنبال پر کردن چیزی می‌گردد که وجود ندارد.
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

/*
 * هر بازه خلق به فیلدی در day_period وصل است. نگاشت اینجاست، نه در
 * شرط‌های پراکنده، تا بازه سومِ مهد فقط یک سطر تازه بخواهد.
 */
const BANDS = [
  { key: 'moodMorning', field: 'mood_morning', label: 'صبح' },
  { key: 'moodNoon', field: 'mood_noon', label: 'ظهر' },
  { key: 'moodAfternoon', field: 'mood_afternoon', label: 'عصر' },
] as const

type Props = {
  child: ChildInSession
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

  const has = (field: string) => child.fields.includes(field)
  const bands = BANDS.filter((band) => has(band.field))

  // پیوست ب: هشدار روی متن آزاد مربی، نه مانع.
  const flagged = useMemo(() => findBannedWords(note), [note])

  const save = async () => {
    setBusy(true)
    try {
      /*
       * فقط فیلدهای اعمال‌شدنی فرستاده می‌شوند. اگر خلق عصر را برای
       * کودک صبحانه‌ای هم می‌فرستادیم، null نوشتنش یعنی گزارشش برای
       * همیشه ناقص می‌ماند.
       */
      const patch: ReportPatch = { teacherNote: note.trim() || null }
      if (has('lunch')) patch.lunch = lunch
      for (const band of bands) patch[band.key] = moods[band.key]
      if (has('nap')) patch.napStart = nap.trim() ? toLatinDigits(nap.trim()) : null
      await onSave(patch)
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
      {/*
        چرا این کارت کوتاه‌تر از کارت کودک بغلی است: دوره حضورش فرق
        دارد. بی این یک سطر، مربی فکر می‌کند صفحه ناقص بارگذاری شده.
      */}
      <p className={`${styles.periodNote} t-caption`}>
        {child.periods.map((p) => p.title).join(' و ')}
        {child.addedException ? ' · امروز استثنائاً افزوده شده' : ''}
      </p>

      {has('lunch') ? (
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
      ) : null}

      {/*
        بازه‌های خلقِ همین کودک، نه هر سه تا. «کامل» هم از همین‌ها حساب
        می‌شود — بخش ۵.۹ با تعریف پویای بخش ۶.
      */}
      {bands.map((band) => (
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

      {has('nap') ? (
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
      ) : null}

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
