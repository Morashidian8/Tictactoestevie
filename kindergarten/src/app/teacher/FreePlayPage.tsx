import { useCallback, useEffect, useState } from 'react'
import { BackIcon, ChildFace, EmptyState } from '../../design-system/index.ts'
import { formatCount, toIsoDate } from '../../i18n/index.ts'
import { useData } from '../../core/auth/index.ts'
import type { FreePlayBoard, PlaySession } from '../../core/data/index.ts'
import styles from './FreePlayPage.module.css'

/**
 * بازی آزاد — ماژول M8، بخش ۵.۴.
 *
 * سند خودش می‌گوید: «این ماژول منبع تمام تحلیل علایق است و شکننده‌ترین
 * بخش محصول. اگر سنگین طراحی شود، رها می‌شود.»
 *
 * ── چهار قاعده‌ای که این صفحه نمی‌شکند ─────────────────────────
 *
 * ۱. **یک صفحه، بی هیچ گامی.** بالا گوشه‌ها، پایین کودکانِ ثبت‌نشده.
 *    یک ضربه روی کودک، یک ضربه روی گوشه — و تمام.
 *
 * ۲. **مدت زمان پرسیده نمی‌شود.** فراوانی انتخاب برای نقشه علایق کافی
 *    است. پرسیدنِ مدت، ثبت را از بیست ثانیه به دو دقیقه می‌برد.
 *
 * ۳. **کودکِ جابه‌جانشده، خطا نیست.** پایین می‌ماند و صفحه سرزنشش
 *    نمی‌کند. داده ناقص بهتر از داده جعلی است.
 *
 * ۴. **هم‌بازی جدا پرسیده می‌شود.** دو کودک در یک گوشه لزوماً با هم
 *    نبوده‌اند؛ شمردن هم‌گوشگی رابطه‌ای می‌سازد که هیچ‌کس ندیده.
 */
export function FreePlayPage({ classId, onBack }: {
  classId: string | null
  onBack: () => void
}) {
  const data = useData()
  const [session, setSession] = useState<PlaySession>(() =>
    new Date().getHours() < 13 ? 'morning' : 'afternoon',
  )
  const [board, setBoard] = useState<FreePlayBoard | null>(null)
  /** کودکی که انتخاب شده و منتظر گوشه است. */
  const [holding, setHolding] = useState<string | null>(null)
  const [pairing, setPairing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const date = toIsoDate(new Date())

  const load = useCallback(async () => {
    if (!classId) return
    try {
      setBoard(await data.getFreePlayBoard(classId, date, session))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'خوانده نشد.')
    }
  }, [data, classId, date, session])

  useEffect(() => {
    void load()
  }, [load])

  const place = async (cornerId: string) => {
    if (!holding) return
    const childId = holding
    setHolding(null)
    try {
      await data.setFreeChoice(childId, date, session, cornerId)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
    }
  }

  const lift = async (childId: string) => {
    try {
      await data.clearFreeChoice(childId, date, session)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'برداشته نشد.')
    }
  }

  if (pairing && board) {
    return (
      <PairPage
        board={board}
        date={date}
        onBack={() => {
          setPairing(false)
          void load()
        }}
      />
    )
  }

  const placedCount = board ? Object.keys(board.placed).length : 0
  const unplaced = board ? board.children.filter((c) => !board.placed[c.id]) : []

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="بازگشت">
          <BackIcon size={22} />
        </button>
        <span className={`${styles.title} t-h2`}>بازی آزاد</span>
        {/*
          نوبت، در سرصفحه و قابل تعویض.
          کودکی که صبح بلوک بازی کرده و بعدازظهر نقاشی، دو انتخاب کرده
          نه یکی — و نقشه علایق باید هر دو را ببیند.
        */}
        <div className={styles.sessions}>
          <button
            type="button"
            className={styles.session}
            aria-pressed={session === 'morning'}
            onClick={() => setSession('morning')}
          >
            صبح
          </button>
          <button
            type="button"
            className={styles.session}
            aria-pressed={session === 'afternoon'}
            onClick={() => setSession('afternoon')}
          >
            بعدازظهر
          </button>
        </div>
      </header>

      {board === null ? (
        <EmptyState text="در حال خواندن…" />
      ) : (
        <div className={styles.body}>
          <p className={`${styles.hint} t-body`}>
            {holding
              ? 'حالا گوشه‌اش را بزنید.'
              : 'روی کودک بزنید، بعد روی گوشه‌ای که رفت.'}
          </p>

          <div className={styles.corners}>
            {board.corners.map((corner) => {
              const inside = Object.entries(board.placed)
                .filter(([, cornerId]) => cornerId === corner.id)
                .map(([childId]) => childId)
              return (
                <button
                  key={corner.id}
                  type="button"
                  className={`${styles.corner} ${holding ? styles.cornerReady : ''}`}
                  onClick={() => void place(corner.id)}
                  disabled={!holding && inside.length === 0}
                >
                  <span className={styles.cornerGlyph} aria-hidden>
                    {corner.glyph ?? '•'}
                  </span>
                  <span className={`${styles.cornerTitle} t-caption`}>{corner.title}</span>
                  <span className={styles.cornerKids}>
                    {inside.map((childId) => (
                      <span
                        key={childId}
                        className={styles.dot}
                        role="button"
                        tabIndex={0}
                        aria-label="برداشتن"
                        onClick={(event) => {
                          // برداشتن از گوشه، بی آنکه ضربه به خودِ گوشه برسد.
                          event.stopPropagation()
                          void lift(childId)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void lift(childId)
                        }}
                      />
                    ))}
                  </span>
                </button>
              )
            })}
          </div>

          <section className={styles.tray} aria-label="ثبت‌نشده">
            <p className={`${styles.trayLabel} t-caption`}>
              ثبت‌نشده ({formatCount(unplaced.length)})
            </p>
            {/*
              کودکِ جابه‌جانشده، خطا نیست و صفحه سرزنشش نمی‌کند.
              رنگ هشدار ندارد و هیچ عددِ قرمزی رویش نیست.
            */}
            {unplaced.length === 0 ? (
              <p className={`${styles.hint} t-caption`}>همه ثبت شدند.</p>
            ) : (
              <div className={styles.faces}>
                {unplaced.map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    className={`${styles.face} ${holding === child.id ? styles.faceOn : ''}`}
                    onClick={() => setHolding(holding === child.id ? null : child.id)}
                  >
                    <span className={styles.faceArt}>
                      <ChildFace id={child.id} photoUrl={child.photoUrl} />
                    </span>
                    <span className={`${styles.faceName} t-caption`}>{child.firstName}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <p className={`${styles.hint} t-caption`}>
            {formatCount(placedCount)} ثبت شد. حتی هفته‌ای سه بار هم برای گزارش ماه کافی است.
          </p>

          <button type="button" className={styles.action} onClick={() => setPairing(true)}>
            کدام‌ها بیشتر با هم بودند؟
          </button>

          {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}
        </div>
      )}
    </div>
  )
}

/* ── ثبت جفت بازی ───────────────────────────────────────────── */

/**
 * پرسش اختیاری پایان روز — بخش ۵.۴.
 *
 * چرا جدا از خودِ گوشه‌ها: دو کودک در یک گوشه لزوماً با هم نبوده‌اند.
 * تنها راهِ دانستنِ «با هم بودند»، این است که مربی دیده باشد و بگوید.
 * هفته‌ای دو تا سه بار کافی است.
 */
function PairPage({ board, date, onBack }: {
  board: FreePlayBoard
  date: string
  onBack: () => void
}) {
  const data = useData()
  const [first, setFirst] = useState<string | null>(null)
  const [pairs, setPairs] = useState(board.pairs)
  const [error, setError] = useState<string | null>(null)

  /*
   * همه کودکان، نه فقط ثبت‌نشده‌ها.
   *
   * کودکی که گوشه‌اش ثبت شده هم با کسی بازی کرده — اگر فهرست جفت فقط
   * ثبت‌نشده‌ها را می‌داد، بیشترِ جفت‌ها اصلاً قابل ثبت نبودند.
   */
  const named = board.children

  const toggle = async (childId: string) => {
    if (!first) {
      setFirst(childId)
      return
    }
    if (first === childId) {
      setFirst(null)
      return
    }
    const [a, b] = first < childId ? [first, childId] : [childId, first]
    const already = pairs.some((p) => p.a === a && p.b === b)
    setFirst(null)
    try {
      await data.setPlayPair(date, a, b, !already)
      setPairs((current) =>
        already
          ? current.filter((p) => !(p.a === a && p.b === b))
          : [...current, { a, b }],
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
    }
  }

  const nameOf = (id: string) => named.find((c) => c.id === id)?.firstName ?? '—'

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="بازگشت">
          <BackIcon size={22} />
        </button>
        <span className={`${styles.title} t-h2`}>کدام‌ها با هم بودند</span>
      </header>

      <div className={styles.body}>
        <p className={`${styles.hint} t-body`}>
          {first ? 'حالا نفر دوم را بزنید.' : 'دو کودک را پشت هم بزنید تا جفت شوند.'}
        </p>
        {/*
          اختیاری بودنش صریح گفته می‌شود.
          مربی‌ای که فکر کند هر روز اجباری است، کل ماژول را رها می‌کند.
        */}
        <p className={`${styles.hint} t-caption`}>
          اختیاری است. هفته‌ای دو تا سه بار برای گزارش ماه کافی است.
        </p>

        <div className={styles.faces}>
          {named.map((child) => (
            <button
              key={child.id}
              type="button"
              className={`${styles.face} ${first === child.id ? styles.faceOn : ''}`}
              onClick={() => void toggle(child.id)}
            >
              <span className={styles.faceArt}>
                <ChildFace id={child.id} photoUrl={child.photoUrl} />
              </span>
              <span className={`${styles.faceName} t-caption`}>{child.firstName}</span>
            </button>
          ))}
        </div>

        <section className={styles.tray} aria-label="جفت‌های امروز">
          <p className={`${styles.trayLabel} t-caption`}>
            جفت‌های امروز ({formatCount(pairs.length)})
          </p>
          {pairs.length === 0 ? (
            <p className={`${styles.hint} t-caption`}>هنوز جفتی ثبت نشده.</p>
          ) : (
            pairs.map((pair) => (
              <p key={`${pair.a}-${pair.b}`} className={`${styles.pair} t-body`}>
                {nameOf(pair.a)} و {nameOf(pair.b)}
              </p>
            ))
          )}
        </section>

        {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}
      </div>
    </div>
  )
}
