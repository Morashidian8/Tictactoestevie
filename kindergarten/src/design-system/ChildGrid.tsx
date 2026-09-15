import { useRef } from 'react'
import { ChildAvatar, type AttendanceState, type AvatarSize } from './ChildAvatar.tsx'
import { MoonIcon, SpoonIcon } from './icons.tsx'
import styles from './ChildGrid.module.css'

export type ChildGridItem = {
  id: string
  firstName: string
  photoUrl?: string | null
  state: AttendanceState
  /** نشان استثنا روی حاشیه آواتار — تصمیم ۰۴ سند بررسی طراحی. */
  flagged?: boolean
  /** متن همین نشان برای صفحه‌خوان. رنگ هرگز تنها حامل معنا نیست. */
  flagLabel?: string
  caption?: string
  /** سن، مثل «۴ سال و ۱ ماه». */
  age?: string | null
  /**
   * آلرژی ثبت‌شده — بخش ۷.۱: «آلرژی غذایی باید همیشه در دید مربی باشد».
   *
   * تا اینجا فقط در پرونده کودک بود، یعنی دو ضربه دورتر از لحظه‌ای که
   * مربی بشقاب را دستش می‌گیرد.
   */
  allergy?: string | null
  /** ناهار امروزش ثبت شده. */
  lunchLogged?: boolean
  /** خوابش ثبت شده. */
  napLogged?: boolean
  /** برچسب کنش برای صفحه‌خوان، مثل «ثبت ورود سارا». */
  actionLabel: string
}

type Props = {
  items: ChildGridItem[]
  avatarSize?: AvatarSize
  /** ضربه کوتاه. در صفحه «امروز» یعنی ثبت سریع با پیش‌فرض‌ها. */
  onSelect: (id: string) => void
  /** نگه‌داشتن انگشت. شیت استثناها را باز می‌کند (بخش ۵.۳ اصلاح‌شده). */
  onHold?: (id: string) => void
}

const HOLD_MS = 450

/**
 * شبکه کودکان — دو ستون کارت.
 *
 * پیش‌تر چهار آواتار معلق در عرض ۳۹۰ پیکسل بود. سه مشکل داشت: آواتار
 * ۶۴ پیکسلی بی‌محفظه به فهرست مخاطبین تلفن شبیه بود، جایی برای وضعیت
 * روز نمی‌ماند، و هدف لمسی فقط خودِ آواتار بود نه یک ناحیه.
 *
 * کارت هر سه را حل می‌کند: محفظه سفید با سایه یعنی «این را می‌شود زد»،
 * ستون کنار عکس جا برای نام، ساعت و وضعیت روز دارد، و کل کارت هدف
 * لمسی است.
 *
 * هزینه‌اش صریح است: دو ستون یعنی نصف کودکان در یک پرده. برای شبکه
 * «امروز» این معامله درست است چون مربی دنبال یک کودک مشخص می‌گردد، نه
 * دنبال مرور کل فهرست. صفحه ثبت گروهی چیدمان خودش را دارد و دست نخورده.
 */
export function ChildGrid({ items, avatarSize, onSelect, onHold }: Props) {
  return (
    <ul className={styles.grid}>
      {items.map((item) => (
        <li key={item.id}>
          <GridCell item={item} avatarSize={avatarSize} onSelect={onSelect} onHold={onHold} />
        </li>
      ))}
    </ul>
  )
}

function GridCell({
  item,
  avatarSize,
  onSelect,
  onHold,
}: {
  item: ChildGridItem
  avatarSize?: AvatarSize
  onSelect: (id: string) => void
  onHold?: (id: string) => void
}) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const held = useRef(false)

  const startHold = () => {
    if (!onHold) return
    held.current = false
    timer.current = setTimeout(() => {
      held.current = true
      onHold(item.id)
    }, HOLD_MS)
  }

  const cancelHold = () => clearTimeout(timer.current)

  const handleClick = () => {
    // نگه‌داشتن انگشت شیت را باز کرده؛ رها کردن نباید ثبت سریع هم بزند.
    if (held.current) {
      held.current = false
      return
    }
    onSelect(item.id)
  }

  const hasAllergy = Boolean(item.allergy)

  return (
    <button
      type="button"
      className={[styles.cell, styles[item.state], hasAllergy && styles.alert]
        .filter(Boolean)
        .join(' ')}
      onClick={handleClick}
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      onContextMenu={(event) => {
        // نگه‌داشتن انگشت در موبایل منوی متن مرورگر را باز می‌کند.
        if (onHold) event.preventDefault()
      }}
      aria-label={item.actionLabel}
    >
      <ChildAvatar
        id={item.id}
        firstName={item.firstName}
        photoUrl={item.photoUrl}
        state={item.state}
        size={avatarSize}
        flagged={item.flagged}
        flagLabel={item.flagLabel}
        shape="rounded"
        layout="frame"
      />

      <span className={styles.body}>
        {/*
          بخش ۷.۱: آلرژی هم‌ردیف نام، نه بالای آن.
          بالای نام یک سطر به کارت اضافه می‌کرد و ارتفاع را از ۸۸ به ۱۰۷
          می‌برد — یعنی یک ردیف کمتر در هر پرده، برای اطلاعاتی که همین‌جا
          هم جا می‌شود. نوار آجری لبه بالا، خودش از دور دیده می‌شود.
        */}
        <span className={styles.name}>{item.firstName}</span>

        {/*
          سن زیر نام. در کلاسی که از سه تا شش سال دارد، این تنها عددی
          درباره کودک است که مقایسه‌ای نیست — و مربی جانشین از همین
          می‌فهمد با چه کسی طرف است.
        */}
        {item.age ? <span className={`${styles.meta} t-caption`}>{item.age}</span> : null}

        {/*
          بخش ۷.۱: نامِ خودِ آلرژی، نه برچسب «آلرژی».
          «آلرژی» به مربی نمی‌گوید بشقاب را بدهد یا نه؛ «گردو» می‌گوید.
        */}
        {item.allergy ? (
          <span className={styles.allergy}>{item.allergy}</span>
        ) : null}

        {/*
          وضعیت روز، دو گلیف ۱۲ پیکسلی.
          خاموش یعنی ثبت نشده، روشن یعنی ثبت شده. گلیف در هر دو حالت
          --ink است و آنچه عوض می‌شود پرکننده است — رنگ لحن روی تینت
          خودش برای گلیف ۱۲ پیکسلی کافی نیست (نعنایی ۳٫۵۸، انبه‌ای ۳٫۰۷).
        */}
        <span className={styles.activity}>
          <span
            className={`${styles.act} ${item.lunchLogged ? styles.actLunch : ''}`}
            aria-hidden
          >
            <SpoonIcon size={12} />
          </span>
          <span
            className={`${styles.act} ${item.napLogged ? styles.actNap : ''}`}
            aria-hidden
          >
            <MoonIcon size={12} />
          </span>
          {/*
            ساعت ورود کنار آیکون‌ها، نه زیر نام.
            در کارت ۱۷۳ پیکسلی، «۴ سال و ۱۱ ماه · ۸:۰۵» در یک سطر جا
            نمی‌شود و هر دو بریده می‌شوند. اینجا سطر خودش خالی است.
          */}
          <span className={`${styles.time} t-caption tabular`}>
            {item.caption ?? 'نیامده'}
          </span>
        </span>
      </span>

      {/*
        رنگ هرگز تنها حامل معنا نیست — بخش ۱۲.۲. هرچه بالا با پرکننده و
        نقطه گفته شد، اینجا کلمه می‌شود.
      */}
      <span className="sr-only">
        {item.allergy ? `آلرژی: ${item.allergy}. ` : ''}
        {item.lunchLogged ? 'ناهار ثبت شده. ' : 'ناهار ثبت نشده. '}
        {item.napLogged ? 'خواب ثبت شده.' : 'خواب ثبت نشده.'}
      </span>
    </button>
  )
}
