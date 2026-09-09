import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AvatarFace,
  CheckIcon,
  QuickAction,
  StatusChip,
  SyncBadge,
} from '../../design-system/index.ts'
import { formatCount, formatJalali, toIsoDate, toLatinDigits } from '../../i18n/index.ts'
import { useAuth, useData } from '../../core/auth/index.ts'
import {
  currentMoodBand,
  suggestNoteTargets,
  type BulkValues,
  type Child,
  type ClassDay,
  type DailyReport,
  type MealAmount,
  type Mood,
} from '../../core/data/index.ts'
import { ChildReportSheet, LUNCH_LABEL, MOOD_LABEL } from './ChildReportSheet.tsx'
import { PhotoTagSheet } from './PhotoTagSheet.tsx'
import photoStyles from './PhotoTagSheet.module.css'
import { compressImage } from '../../core/media/index.ts'
import styles from './BulkEntryPage.module.css'

/**
 * صفحه ثبت گروهی — بخش ۵.۵ سند. «مهم‌ترین صفحه سامانه.»
 *
 * پنجره طلایی زمان خواب است و بودجه‌اش سه دقیقه. هدف پذیرش: کلاس ۲۵ نفره
 * با ۴ استثنا، زیر ۹۰ ثانیه. هر تصمیم این صفحه از همین عدد می‌آید.
 *
 * ساختار از خود سند: بالا ثبت یکجا برای کل کلاس، پایین فهرست کودکان.
 * هر کودکی که دست‌نخورده بماند مقدار گروهی می‌گیرد؛ برای استثنا یک ضربه
 * روی سطر و کارت کوچک باز می‌شود.
 */

const LUNCH: MealAmount[] = ['all', 'most', 'little', 'none']

/**
 * نوار گروهی سه گزینه دارد، نه چهار. بخش ۵.۵ می‌گوید این نوار برای «خلق
 * عمومی کلاس» است، یعنی حالت غالب. «گریان» از شیت استثنای هر کودک ثبت
 * می‌شود، چون هرگز حالت غالب یک کلاس نیست.
 */
const BULK_MOOD: Mood[] = ['good', 'normal', 'restless']

const BAND_LABEL = { morning: 'صبح', noon: 'ظهر', afternoon: 'عصر' } as const

type Props = { onBack: () => void }

export function BulkEntryPage({ onBack }: Props) {
  const data = useData()
  const { queue } = useAuth()

  const [classId, setClassId] = useState<string | null>(null)
  const [day, setDay] = useState<ClassDay | null>(null)
  const [lunch, setLunch] = useState<MealAmount | null>(null)
  const [mood, setMood] = useState<Mood | null>(null)
  const [napStart, setNapStart] = useState('')
  const [appliedAt, setAppliedAt] = useState<number | null>(null)
  const [sheetFor, setSheetFor] = useState<string | null>(null)
  // عکسی که تازه انتخاب شده و هنوز تگ نخورده — بخش ۵.۵.
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null)
  const [retagging, setRetagging] = useState<string | null>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(0)

  const date = useMemo(() => toIsoDate(new Date()), [])

  useEffect(() => queue.subscribe((status) => setPending(status.pending)), [queue])

  useEffect(() => {
    data
      .listClasses()
      .then((list) => setClassId((current) => current ?? list[0]?.id ?? null))
      .catch((cause: unknown) => setError(messageOf(cause)))
  }, [data])

  const load = useCallback(async () => {
    if (!classId) return
    try {
      setDay(await data.getClassDay(classId, date))
    } catch (cause) {
      setError(messageOf(cause))
    }
  }, [classId, data, date])

  useEffect(() => {
    void load()
  }, [load])

  const reports = useMemo(
    () => new Map((day?.reports ?? []).map((r) => [r.childId, r])),
    [day],
  )

  const applyToAll = () => {
    if (!classId) return
    const values: BulkValues = {
      lunch,
      mood,
      napStart: napStart.trim() ? toLatinDigits(napStart.trim()) : null,
    }
    void queue
      .submit('text', () => data.applyBulk(classId, date, values))
      .then(() => {
        setAppliedAt(Date.now())
        return load()
      })
      .catch((cause: unknown) => setError(messageOf(cause)))
  }

  const children = day?.children ?? []
  const exceptions = children.filter((c) => reports.get(c.id)?.touched).length

  // بخش ۵.۵: چرخش پیشنهاد یادداشت، تا هیچ کودکی از قلم نیفتد.
  const suggested = useMemo(
    () => new Set(suggestNoteTargets(children.map((c) => c.id), date)),
    [children, date],
  )
  const suggestedNames = children.filter((c) => suggested.has(c.id)).map((c) => c.firstName)

  const sheetChild = children.find((c) => c.id === sheetFor) ?? null
  const photos = day?.photos ?? []
  const retagPhoto = photos.find((p) => p.id === retagging) ?? null

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return
    try {
      const compressed = await compressImage(file)
      setPendingPhoto(compressed.previewUrl)
    } catch {
      setError('این عکس خوانده نشد. دوباره انتخاب کنید.')
    }
  }
  const nothingChosen = !lunch && !mood && !napStart.trim()

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="بازگشت به امروز">
          {/* آیکون جهت‌دار، پس قرینه می‌شود — بخش ۱۲.۶ */}
          <svg
            className="mirror"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <span className={`${styles.title} t-body-lg`}>
          ثبت روز · {day?.classRoom.name ?? '—'}
        </span>
        <span className="t-body-lg" style={{ color: 'var(--ink-muted)' }}>
          {formatJalali(new Date(), 'short')}
        </span>
        <SyncBadge pending={pending} />
      </header>

      <div className={styles.body}>
        {/* ── بالا: ثبت یکجا برای کل کلاس ── */}
        <section className={styles.bulk} aria-label="ثبت یکجا برای کل کلاس">
          <div className={styles.row}>
            <span className={`${styles.rowLabel} t-caption`}>ناهار</span>
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
          </div>

          {/*
            گزارش سه بازه خلق دارد (بخش ۱۱.۳) و نوار گروهی یک انتخاب.
            انتخاب روی بازه ساعت جاری می‌نشیند، چون بخش ۵.۲ سه پنجره
            فرصت در روز تعریف کرده و مربی در هرکدام یک بار سر می‌زند.
            نام بازه نوشته می‌شود، وگرنه مربی نمی‌داند دارد کدام را پر
            می‌کند.
          */}
          <div className={styles.row}>
            <span className={`${styles.rowLabel} t-caption`}>
              خلق {BAND_LABEL[currentMoodBand()]}
            </span>
            <div className={styles.choices}>
              {BULK_MOOD.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`${styles.choice} t-body-lg`}
                  aria-pressed={mood === value}
                  onClick={() => setMood(mood === value ? null : value)}
                >
                  {MOOD_LABEL[value]}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.row}>
            <span className={`${styles.rowLabel} t-caption`}>خواب، ساعت شروع</span>
            <input
              className={styles.napInput}
              inputMode="numeric"
              placeholder="13:00"
              value={napStart}
              onChange={(event) => setNapStart(event.target.value)}
              aria-label="ساعت شروع خواب"
            />
          </div>

          {appliedAt ? (
            <p className={`${styles.applied} t-caption`}>
              روی {formatCount(children.length - exceptions)} کودک اعمال شد.
              {exceptions > 0
                ? ` ${formatCount(exceptions)} استثنا دست‌نخورده ماند.`
                : ''}
            </p>
          ) : null}
        </section>

        {suggestedNames.length > 0 ? (
          <section className={styles.suggest}>
            <span className={`${styles.suggestLabel} t-caption`}>یادداشت پیشنهادی امروز</span>
            <span className={`${styles.suggestNames} t-body-lg`}>
              {suggestedNames.join(' · ')}
            </span>
          </section>
        ) : null}

        {/*
          بخش ۵.۵: عکس در همین پنجره طلایی از گالری انتخاب و تگ می‌شود.
          صف عکس از صف متن جداست (بخش ۱۴.۲)، پس آپلود سنگین ثبت روز را
          عقب نمی‌اندازد.
        */}
        <section className={styles.bulk} aria-label="عکس‌های امروز">
          <span className={`${styles.rowLabel} t-caption`}>
            عکس‌های امروز {photos.length > 0 ? `(${formatCount(photos.length)})` : ''}
          </span>

          {photos.length > 0 ? (
            <div className={photoStyles.strip}>
              {photos.map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  className={photoStyles.stripItem}
                  onClick={() => setRetagging(photo.id)}
                  aria-label={`تگ‌های عکس، ${formatCount(photo.childIds.length)} کودک`}
                >
                  <img className={photoStyles.stripImg} src={photo.previewUrl} alt="" />
                  <span
                    className={`${photoStyles.stripBadge} ${
                      photo.childIds.length === 0 ? photoStyles.stripBadgeWarn : ''
                    } t-caption`}
                  >
                    {photo.childIds.length === 0
                      ? 'بدون تگ'
                      : formatCount(photo.childIds.length)}
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            className={`${photoStyles.addPhoto} t-body-lg`}
            onClick={() => photoInput.current?.click()}
          >
            افزودن عکس از گالری
          </button>
          <input
            ref={photoInput}
            className={photoStyles.hiddenInput}
            type="file"
            accept="image/*"
            onChange={(event) => {
              void pickPhoto(event.target.files?.[0])
              event.target.value = ''
            }}
          />
        </section>

        {/* ── پایین: فهرست کودکان ── */}
        <div className={styles.listHead}>
          <span className={`${styles.listTitle} t-h2`}>کودکان</span>
          <span className={`${styles.listCount} t-caption`}>
            {formatCount(exceptions)} استثنا از {formatCount(children.length)}
          </span>
        </div>

        <div className={styles.list}>
          {children.map((child) => (
            <ChildRow
              key={child.id}
              child={child}
              report={reports.get(child.id)}
              suggested={suggested.has(child.id)}
              onOpen={() => setSheetFor(child.id)}
            />
          ))}
        </div>

        {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}
      </div>

      {/*
        کنش اصلی این صفحه «اعمال روی همه» است، نه بازگشت. بخش ۱۲.۲
        می‌گوید فیروزه‌ای فقط برای کنش اصلی است.
        بخش ۵.۵ این دکمه را در کارت بالا نشان می‌دهد، ولی وایرفریم بخش
        ۱۳.۱ کنش پایانی را در نوار پایین می‌گذارد. اینجا نوار پایین
        انتخاب شد، چون فهرست ۲۵ نفره بلند است و مربی نباید برای زدن
        دکمه به بالای صفحه برگردد. بازگشت با پیکان سرصفحه است.
      */}
      <QuickAction onClick={applyToAll} disabled={nothingChosen}>
        اعمال روی همه
      </QuickAction>

      {pendingPhoto ? (
        <PhotoTagSheet
          previewUrl={pendingPhoto}
          children={children}
          onClose={() => setPendingPhoto(null)}
          onSave={async (childIds) => {
            await queue.submit('photo', () => data.addPhoto(date, pendingPhoto, childIds))
            await load()
          }}
        />
      ) : null}

      {retagPhoto ? (
        <PhotoTagSheet
          previewUrl={retagPhoto.previewUrl}
          children={children}
          initialTags={retagPhoto.childIds}
          onClose={() => setRetagging(null)}
          onSave={async (childIds) => {
            await queue.submit('photo', () => data.setPhotoTags(retagPhoto.id, childIds))
            await load()
          }}
        />
      ) : null}

      {sheetChild ? (
        <ChildReportSheet
          child={sheetChild}
          report={reports.get(sheetChild.id) ?? null}
          suggested={suggested.has(sheetChild.id)}
          onClose={() => setSheetFor(null)}
          onSave={async (patch) => {
            await queue.submit('text', () => data.saveChildReport(sheetChild.id, date, patch))
            await load()
          }}
        />
      ) : null}
    </div>
  )
}

function ChildRow({
  child,
  report,
  suggested,
  onOpen,
}: {
  child: Child
  report: DailyReport | undefined
  suggested: boolean
  onOpen: () => void
}) {
  const parts: string[] = []
  if (report?.lunch) parts.push(`ناهار: ${LUNCH_LABEL[report.lunch]}`)
  const mood = report?.moodAfternoon ?? report?.moodNoon ?? report?.moodMorning
  if (mood) parts.push(`خلق: ${MOOD_LABEL[mood]}`)
  if (report?.teacherNote) parts.push('یادداشت دارد')

  return (
    <button type="button" className={styles.item} onClick={onOpen}>
      <span className={styles.avatar}>
        <AvatarFace seed={child.id} />
      </span>

      <span className={styles.itemMain}>
        <span className={`${styles.itemName} t-body-lg`}>{child.firstName}</span>
        <span className={`${styles.itemValues} t-caption`}>
          {parts.length > 0 ? parts.join(' · ') : 'هنوز ثبت نشده'}
        </span>
      </span>

      {suggested && !report?.teacherNote ? (
        <StatusChip tone="turquoise">یادداشت</StatusChip>
      ) : null}

      {report?.touched ? (
        <span className={`${styles.exception} t-caption`}>
          <CheckIcon size={12} />
          استثنا
        </span>
      ) : null}
    </button>
  )
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'ثبت نشد.'
}
