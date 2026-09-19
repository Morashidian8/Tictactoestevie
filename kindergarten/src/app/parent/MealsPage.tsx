import { useCallback, useEffect, useState } from 'react'
import { AlertIcon, BottomSheet, EmptyState, FileField } from '../../design-system/index.ts'
import { formatCount, formatJalali, formatRial, toIsoDate } from '../../i18n/index.ts'
import { useData } from '../../core/auth/index.ts'
import type { MealBasketLine, MealOffer, MealSlot } from '../../core/data/index.ts'
import styles from './MealsPage.module.css'

/**
 * رزرو غذا — از دید خانواده. ماژول ۰۰۳۶.
 *
 * مهد منوی ماه را با قیمت منتشر می‌کند؛ خانواده روزهایی را که می‌خواهد
 * تیک می‌زند، یک‌جا پرداخت می‌کند، و از آن لحظه غذای کودکش نهایی است.
 *
 * ── چهار قاعده که این صفحه نگه می‌دارد ──────────────────────
 *
 * ۱. **پرداخت‌نشده، غذا نیست.** تا پول ننشسته هیچ‌جا به عنوان غذای
 *    کودک دیده نمی‌شود — نه اینجا، نه در فهرست آشپزخانه. صفحه همین
 *    را صریح می‌گوید تا خانواده فردا غافلگیر نشود.
 *
 * ۲. **مهلت، روزِ قبل است.** آشپزخانه صبح خرید می‌کند. روزی که مهلتش
 *    گذشته خاکستری می‌ماند و دلیلش نوشته می‌شود، نه اینکه بی‌صدا
 *    ناپدید شود.
 *
 * ۳. **هشدار آلرژی، نامِ خودِ ماده.** «آلرژی» به خانواده نمی‌گوید
 *    غذا سفارش بدهد یا نه؛ «تخم‌مرغ» می‌گوید. تقاطع در سرور حساب
 *    می‌شود، پس یک باگ رابط نمی‌تواند خاموشش کند.
 *
 * ۴. **رزروِ پرداخت‌شده با یک دکمه لغو نمی‌شود.** پولی جابه‌جا شده و
 *    برگرداندنش تصمیم مدیر است.
 */
const SLOT_TEXT: Record<MealSlot, string> = {
  snack_morning: 'میان‌وعده صبح',
  lunch: 'ناهار',
  snack_afternoon: 'میان‌وعده عصر',
}

export function MealsPage({ childId }: { childId: string }) {
  const data = useData()
  const [offers, setOffers] = useState<MealOffer[] | null>(null)
  const [basket, setBasket] = useState<MealBasketLine[]>([])
  const [paying, setPaying] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /* یک ماه پیش رو. منو ماهانه منتشر می‌شود. */
  const from = toIsoDate(new Date())
  const to = (() => {
    const end = new Date()
    end.setDate(end.getDate() + 30)
    return toIsoDate(end)
  })()

  const load = useCallback(async () => {
    try {
      setOffers(await data.listMealOffers(childId, from, to))
      setBasket(await data.listMealBasket(childId))
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'خوانده نشد.')
      setOffers([])
    }
  }, [data, childId, from, to])

  useEffect(() => {
    void load()
  }, [load])

  const act = async (id: string, run: () => Promise<void>, done: string) => {
    setBusy(id)
    setError(null)
    try {
      await run()
      setNote(done)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
    } finally {
      setBusy(null)
    }
  }

  const total = basket.reduce((sum, line) => sum + line.price, 0)

  /* فقط وعده‌های قیمت‌دار. وعده بی قیمت داخل شهریه است و رزروی ندارد. */
  const sellable = (offers ?? []).filter((o) => o.price !== null)
  const byDay = new Map<string, MealOffer[]>()
  for (const offer of sellable) {
    byDay.set(offer.date, [...(byDay.get(offer.date) ?? []), offer])
  }

  return (
    <div className={styles.page}>
      {note ? <p className={`${styles.note} t-body`}>{note}</p> : null}

      {/*
        سبد، بالای همه‌چیز و چسبان.

        خانواده‌ای که پنج روز تیک زده باید همیشه ببیند چقدر شده و دکمه
        پرداخت کجاست؛ ته یک فهرست سی‌روزه، آن دکمه پیدا نمی‌شود.
      */}
      {basket.length > 0 ? (
        <section className={styles.basket} aria-label="سبد رزرو">
          <p className={`${styles.basketTop} t-body`}>
            <b>{formatCount(basket.length)} وعده رزروشده</b>
            <span className="tabular">{formatRial(total)}</span>
          </p>
          <p className={`${styles.basketWarn} t-caption`}>
            <span aria-hidden><AlertIcon size={15} /></span>
            تا پرداخت نکنید، غذا برای کودکتان کنار گذاشته نمی‌شود.
          </p>
          <button
            type="button"
            className={`${styles.pay} t-body-lg`}
            onClick={() => setPaying(true)}
          >
            پرداخت {formatRial(total)}
          </button>
        </section>
      ) : null}

      {offers === null ? (
        <EmptyState text="در حال خواندن…" />
      ) : byDay.size === 0 ? (
        <EmptyState text="مهد هنوز منوی قابل رزروی منتشر نکرده." />
      ) : (
        [...byDay.entries()].map(([date, meals]) => (
          <section key={date} className={styles.day} aria-label={`غذای ${date}`}>
            <p className={`${styles.dayName} t-body-lg`}>
              {formatJalali(new Date(date), 'weekday')}
            </p>

            {meals.map((meal) => {
              const line = basket.find((b) => b.date === meal.date && b.slot === meal.slot)
              const closed = !meal.orderable && meal.orderState === null
              return (
                <article key={meal.menuDayId} className={styles.meal}>
                  <div className={styles.mealMain}>
                    <p className={`${styles.mealTop} t-body`}>
                      <span className={styles.muted}>{SLOT_TEXT[meal.slot]}</span>
                      <b>{meal.title}</b>
                    </p>
                    {meal.ingredients.length > 0 ? (
                      <p className={`${styles.muted} t-caption`}>{meal.ingredients.join('، ')}</p>
                    ) : null}
                    <p className={`${styles.price} t-caption tabular`}>
                      {formatRial(meal.price ?? 0)}
                      {meal.capacity !== null
                        ? `، ${formatCount(Math.max(meal.capacity - meal.taken, 0))} جا مانده`
                        : ''}
                    </p>

                    {/*
                      هشدار آلرژی، نامِ خودِ ماده — بخش ۷.۱ و ۱۲.۲.
                      رنگ دارد و کلمه هم دارد.
                    */}
                    {meal.allergyHits.length > 0 ? (
                      <p className={`${styles.hit} t-caption`}>
                        <span aria-hidden><AlertIcon size={15} /></span>
                        {meal.allergyHits.join('، ')} — با آلرژی ثبت‌شده کودکتان می‌خورد.
                      </p>
                    ) : null}

                    {/*
                      روزی که مهلتش گذشته یا ظرفیتش پر شده، بی‌صدا ناپدید
                      نمی‌شود؛ می‌ماند و دلیلش نوشته می‌شود.
                    */}
                    {closed ? (
                      <p className={`${styles.muted} t-caption`}>
                        {meal.capacity !== null && meal.taken >= meal.capacity
                          ? 'ظرفیت این روز پر شده.'
                          : `مهلت رزرو تا ${formatJalali(new Date(meal.orderBy), 'short')} بود.`}
                      </p>
                    ) : null}
                  </div>

                  {meal.orderState === 'confirmed' ? (
                    <span className={`${styles.done} t-caption`}>نهایی شد</span>
                  ) : line ? (
                    <button
                      type="button"
                      className={`${styles.drop} t-body-sm`}
                      disabled={busy === meal.menuDayId}
                      onClick={() =>
                        void act(
                          meal.menuDayId,
                          () => data.cancelMealOrder(line.orderId),
                          'از سبد برداشته شد.',
                        )
                      }
                    >
                      برداشتن
                    </button>
                  ) : meal.orderable ? (
                    <button
                      type="button"
                      className={`${styles.add} t-body-sm`}
                      disabled={busy === meal.menuDayId}
                      onClick={() =>
                        void act(
                          meal.menuDayId,
                          () => data.reserveMeal(childId, meal.menuDayId),
                          'به سبد اضافه شد.',
                        )
                      }
                    >
                      رزرو
                    </button>
                  ) : null}
                </article>
              )
            })}
          </section>
        ))
      )}

      {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}

      {paying ? (
        <PaySheet
          total={total}
          onClose={() => setPaying(false)}
          onDone={async (message) => {
            setPaying(false)
            setNote(message)
            await load()
          }}
          childId={childId}
        />
      ) : null}
    </div>
  )
}

/* ── شیت پرداخت سبد ─────────────────────────────────────────── */

/**
 * دو راه پرداخت، با ترتیبِ عمدی.
 *
 * درگاه اول است چون همان لحظه نهایی می‌کند؛ کارت‌به‌کارت دوم است چون
 * رسید می‌خواهد و تا تأیید مدیر، غذا کنار گذاشته نمی‌شود. صفحه این
 * تفاوت را پنهان نمی‌کند — خانواده‌ای که فکر کند کارش تمام شده، فردا
 * غافلگیر می‌شود.
 */
function PaySheet({ childId, total, onClose, onDone }: {
  childId: string
  total: number
  onClose: () => void
  onDone: (message: string) => Promise<void>
}) {
  const data = useData()
  const [receipt, setReceipt] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pay = async (method: 'online' | 'manual_receipt') => {
    setBusy(true)
    setError(null)
    try {
      await data.payMealBasket(childId, method, receipt)
      await onDone(
        method === 'online'
          ? 'پرداخت شد. غذای کودکتان نهایی است.'
          : 'رسید ثبت شد. تا تأیید مدیر، غذا نهایی نیست.',
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'پرداخت نشد.')
      setBusy(false)
    }
  }

  return (
    <BottomSheet title={`پرداخت ${formatRial(total)}`} onClose={onClose}>
      <button
        type="button"
        className={`${styles.payPrimary} t-body-lg`}
        disabled={busy}
        onClick={() => void pay('online')}
      >
        پرداخت اینترنتی
      </button>
      <p className={`${styles.muted} t-caption`}>
        همان لحظه نهایی می‌شود و غذای کودکتان کنار گذاشته می‌شود.
      </p>

      <p className={`${styles.or} t-caption`}>یا</p>

      <FileField
        label="تصویر رسید کارت‌به‌کارت"
        value={receipt}
        onChange={setReceipt}
        hint="تا مدیر رسید را تأیید نکند، غذا نهایی نمی‌شود."
      />
      <button
        type="button"
        className={`${styles.paySecondary} t-body-lg`}
        disabled={busy || !receipt}
        onClick={() => void pay('manual_receipt')}
      >
        فرستادن رسید
      </button>

      {error ? <p className={`${styles.error} t-caption`}>{error}</p> : null}
    </BottomSheet>
  )
}
