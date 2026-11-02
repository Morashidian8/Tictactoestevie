import { useCallback, useEffect, useState } from 'react'
import {
  AlertIcon,
  BottomSheet,
  ChoiceGroup,
  EmptyState,
  FileField,
  JalaliDateField,
} from '../../design-system/index.ts'
import { formatCount, formatJalali, toIsoDate } from '../../i18n/index.ts'
import { ROLE_LABEL, useAuth, useData } from '../../core/auth/index.ts'
import type {
  LeaveKind,
  LeaveRequest,
  SlotState,
  StaffDocumentSlot,
  StaffProfile,
} from '../../core/data/index.ts'
import styles from './TeacherProfilePage.module.css'

/**
 * «حساب من» پنل مربی — پرونده خودِ مربی.
 *
 * پیش‌تر این صفحه هم فهرستِ کارها بود هم پرونده شخصی. با آمدن «منو»،
 * فهرست جدا شد و اینجا فقط چیزهایی ماند که **درباره خودِ مربی**اند:
 * مرخصی، کلاس‌ها، مدارک، و بازخورد مدیر.
 *
 * آنچه اینجا **نیست** و عمدی است: هیچ عددی درباره عملکرد خود مربی.
 * شمار رویداد و گزارش، معیار ارزیابی نیست؛ اگر مربی ببیند رویداد ثبت
 * کردن به ضررش تمام می‌شود، کمتر ثبت می‌کند و آسیب به کودک می‌رسد.
 */
const NOTE_LABEL: Record<string, string> = {
  commendation: 'تقدیر',
  review: 'ارزیابی دوره‌ای',
  training: 'دوره لازم',
  concern: 'نکته‌ای برای بهتر شدن',
}

const LEAVE_KINDS: { value: LeaveKind; label: string }[] = [
  { value: 'personal', label: 'شخصی' },
  { value: 'sick', label: 'بیماری' },
  { value: 'family', label: 'خانوادگی' },
  { value: 'other', label: 'سایر' },
]

const LEAVE_KIND_TEXT: Record<string, string> = Object.fromEntries(
  LEAVE_KINDS.map((k) => [k.value, k.label]),
)

const LEAVE_STATE_TEXT: Record<LeaveRequest['state'], string> = {
  pending: 'در انتظار تأیید مدیر',
  approved: 'تأیید شد',
  rejected: 'رد شد',
}

/*
 * حالت هر قلم از چک‌لیست، با **کلمه**.
 *
 * رنگ اینجا فقط همین کلمه را تکرار می‌کند و هیچ خبری تنها با رنگ
 * گفته نمی‌شود — بخش ۱۲.۲.
 */
const SLOT_TEXT: Record<SlotState, string> = {
  missing: 'نفرستاده‌اید',
  pending: 'در انتظار تأیید مدیر',
  rejected: 'رد شد',
  expired: 'منقضی شده',
  expiring: 'رو به انقضا',
  valid: 'تأیید شده',
  none: 'تأیید شده',
}

/** کدام حالت‌ها کاری از مربی می‌خواهند. */
const SLOT_TODO: Record<SlotState, boolean> = {
  missing: true,
  pending: false,
  rejected: true,
  expired: true,
  expiring: true,
  valid: false,
  none: false,
}

/**
 * نوعِ مدرکِ «سایر» عنوان دلخواه می‌خواهد، بقیه عنوانِ خودِ قلم را
 * برمی‌دارند — مربی وسط شیفت نباید عنوان تایپ کند.
 */

export function TeacherProfilePage() {
  const data = useData()
  const { session } = useAuth()
  const [file, setFile] = useState<StaffProfile | null>(null)
  const [leave, setLeave] = useState<LeaveRequest[] | null>(null)
  const [asking, setAsking] = useState(false)
  const [slots, setSlots] = useState<StaffDocumentSlot[] | null>(null)
  const [sending, setSending] = useState<StaffDocumentSlot | null>(null)

  useEffect(() => {
    data.getMyStaffFile().then(setFile).catch(() => setFile(null))
  }, [data])

  const loadSlots = useCallback(() => {
    data.getMyDocumentChecklist().then(setSlots).catch(() => setSlots([]))
  }, [data])

  useEffect(() => {
    loadSlots()
  }, [loadSlots])

  const loadLeave = useCallback(() => {
    data.listMyLeave().then(setLeave).catch(() => setLeave([]))
  }, [data])

  useEffect(() => {
    loadLeave()
  }, [loadLeave])

  const me = session?.active
  if (!me) return <EmptyState text="در حال خواندن…" />

  const toFix = (slots ?? []).filter((slot) => SLOT_TODO[slot.state])

  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <span className={`${styles.label} t-caption`}>حساب من</span>
        <p className={`${styles.name} t-h2`}>{me.displayName}</p>
        <p className={`${styles.muted} t-body`}>{ROLE_LABEL[me.role]}</p>
      </section>

      {/*
        مرخصی — درخواست و تاریخچه.

        تا امروز راهش تلگرام و تماس بود: هیچ ردی نمی‌ماند، و مدیری که
        صبح شیفت را می‌چیند نمی‌دانست چند نفر کم دارد.

        «درخواست» است نه «اعلام»: تا مدیر تأیید نکند، مرخصی نیست و
        هیچ‌جای برنامه دیده نمی‌شود. متن وضعیت همین را می‌گوید تا مربی
        فردا غافلگیر نشود.
      */}
      <section className={styles.card}>
        <span className={`${styles.label} t-caption`}>مرخصی</span>
        <button type="button" className={`${styles.actionRow} t-body`} onClick={() => setAsking(true)}>
          درخواست مرخصی
        </button>
        {leave === null ? (
          <p className={`${styles.muted} t-body`}>در حال خواندن…</p>
        ) : leave.length === 0 ? (
          <p className={`${styles.muted} t-body`}>هنوز درخواستی نداده‌اید.</p>
        ) : (
          leave.map((row) => (
            <article key={row.id} className={styles.note}>
              <p className={`${styles.noteTop} t-body`}>
                <b>
                  {formatJalali(new Date(row.starts), 'short')}
                  {row.days > 1 ? ` تا ${formatJalali(new Date(row.ends), 'short')}` : ''}
                </b>
                <span
                  className={row.state === 'rejected' ? styles.expired : styles.muted}
                >
                  {LEAVE_STATE_TEXT[row.state]}
                </span>
              </p>
              <p className={`${styles.muted} t-caption`}>
                {LEAVE_KIND_TEXT[row.kind] ?? row.kind} · {formatCount(row.days)} روز
              </p>
              {/*
                دلیلِ رد، همین‌جا و کنار خودِ درخواست.
                مربی‌ای که بی دلیل «نه» می‌شنود، دفعه بعد اصلاً درخواست
                نمی‌دهد و همان روز غیبت می‌کند.
              */}
              {row.decisionNote ? (
                <p className={`${styles.row} t-body`}>{row.decisionNote}</p>
              ) : null}
            </article>
          ))
        )}
      </section>

      <section className={styles.card}>
        <span className={`${styles.label} t-caption`}>کلاس‌های من</span>
        {file === null ? (
          <p className={`${styles.muted} t-body`}>در حال خواندن…</p>
        ) : file.classNames.length === 0 ? (
          <p className={`${styles.muted} t-body`}>هنوز کلاسی به شما داده نشده.</p>
        ) : (
          file.classNames.map((name) => (
            <p key={name} className={`${styles.row} t-body`}>
              {name}
            </p>
          ))
        )}
      </section>

      {/*
        مدارک، از دید خودِ مربی — و اینجا **کارِ** خودِ مربی هم هست.

        تا ۰۰۳۹ این بخش فقط فهرستِ خواندنی بود و زیرش نوشته بود
        «بارگذاری مدارک کار مدیر است». یعنی مدیر باید ده نفر را دنبال
        می‌کرد، کاغذها را می‌گرفت، عکس می‌گرفت و خودش بارگذاری می‌کرد.
        حالا مربی خودش می‌فرستد و مدیر فقط تأیید می‌کند.

        یک ردیف برای هر **خواسته**، نه برای هر مدرک: فهرستی که فقط
        داشته‌ها را نشان بدهد، کسی از رویش نمی‌فهمد چه کم دارد.
      */}
      <section className={styles.card}>
        <span className={`${styles.label} t-caption`}>مدارک من</span>

        {toFix.length > 0 ? (
          <p className={`${styles.warn} t-body`}>
            <AlertIcon size={18} />
            {formatCount(toFix.length)} مدرک مانده که باید بفرستید یا تازه‌اش کنید.
          </p>
        ) : null}

        {slots === null ? (
          <p className={`${styles.muted} t-body`}>در حال خواندن…</p>
        ) : slots.length === 0 ? (
          <p className={`${styles.muted} t-body`}>مدیر هنوز فهرست مدارک را نچیده.</p>
        ) : (
          slots.map((slot) => (
            <div key={slot.requirementId} className={styles.slot}>
              <p className={`${styles.docRow} t-body`}>
                <span>{slot.title}</span>
                {/*
                  حالت با **کلمه** گفته می‌شود، نه با رنگ — بخش ۱۲.۲.
                  رنگ فقط تکرارش می‌کند.
                */}
                <b className={SLOT_TODO[slot.state] ? styles.expired : styles.muted}>
                  {SLOT_TEXT[slot.state]}
                </b>
              </p>

              {slot.state === 'valid' || slot.state === 'expiring' ? (
                <p className={`${styles.muted} t-caption`}>
                  {slot.expiresAt
                    ? `اعتبار تا ${formatJalali(new Date(slot.expiresAt), 'short')}`
                    : 'بدون تاریخ انقضا'}
                </p>
              ) : null}

              {/*
                دلیلِ رد، همین‌جا و کنار خودِ مدرک.
                مربی‌ای که فقط «رد شد» می‌بیند، همان عکس را دوباره
                می‌فرستد و مدیر دوباره ردش می‌کند.
              */}
              {slot.state === 'rejected' && slot.reviewNote ? (
                <p className={`${styles.warn} t-caption`}>{slot.reviewNote}</p>
              ) : null}

              {slot.note && slot.state === 'missing' ? (
                <p className={`${styles.muted} t-caption`}>{slot.note}</p>
              ) : null}

              {slot.state === 'pending' ? null : (
                <button
                  type="button"
                  className={`${styles.actionRow} t-body`}
                  onClick={() => setSending(slot)}
                >
                  {slot.state === 'missing' ? 'بارگذاری' : 'فرستادن نسخه تازه'}
                </button>
              )}
            </div>
          ))
        )}
      </section>

      {/*
        یادداشت‌های مدیر — فقط آن‌ها که با خودِ مربی در میان گذاشته شده.

        ارزیابی‌ای که مربی هرگز نمی‌بیند، ارزیابی نیست؛ پرونده‌سازی است.
        این بخش همان چیزی است که آن قاعده را واقعی می‌کند.
      */}
      <section className={styles.card}>
        <span className={`${styles.label} t-caption`}>بازخورد مدیر</span>
        {file === null ? (
          <p className={`${styles.muted} t-body`}>در حال خواندن…</p>
        ) : file.notes.length === 0 ? (
          <p className={`${styles.muted} t-body`}>هنوز بازخوردی با شما در میان گذاشته نشده.</p>
        ) : (
          file.notes.map((note) => (
            <article key={note.id} className={styles.note}>
              <p className={`${styles.noteTop} t-body`}>
                <b>{NOTE_LABEL[note.kind] ?? note.kind}</b>
                <span className={styles.muted}>
                  {formatJalali(new Date(note.writtenAt), 'short')}
                </span>
              </p>
              <p className={`${styles.row} t-body`}>{note.body}</p>
            </article>
          ))
        )}
      </section>

      {/*
        آنچه عمداً اینجا نیست: هیچ عددی درباره عملکرد خود مربی، و هیچ
        مقایسه‌ای با مربیان دیگر. شمار رخداد و گزارش، معیار ارزیابی
        نیست — اگر مربی ببیند ثبت رخداد به ضررش تمام می‌شود، کمتر ثبت
        می‌کند و آسیب به کودک می‌رسد.
      */}
      <p className={`${styles.muted} t-caption`}>
        برای خروج از حساب، کلید حساب کاربری در بالای صفحه.
      </p>

      {asking ? (
        <LeaveSheet
          onClose={() => setAsking(false)}
          onDone={() => {
            setAsking(false)
            loadLeave()
          }}
        />
      ) : null}

      {sending ? (
        <DocumentSheet
          slot={sending}
          onClose={() => setSending(null)}
          onDone={() => {
            setSending(null)
            loadSlots()
          }}
        />
      ) : null}
    </div>
  )
}

/* ── شیت درخواست مرخصی ──────────────────────────────────────── */

function LeaveSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const data = useData()
  const [kind, setKind] = useState<LeaveKind>('personal')
  const [starts, setStarts] = useState<string | null>(toIsoDate(new Date()))
  /* پایان عمداً خالی می‌ماند: خالی یعنی همان یک روز، که حالت غالب است. */
  const [ends, setEnds] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!starts) {
      setError('روز مرخصی را از تقویم انتخاب کنید.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await data.requestLeave({ kind, starts, ends: ends ?? starts, reason })
      onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
      setBusy(false)
    }
  }

  return (
    /*
     * شیتِ مشترک، نه پس‌زمینه و کارتِ ساختِ همین صفحه.
     *
     * نسخه اولِ همین فایل کلاس‌های `sheet`/`field`/`primary` را صدا زد
     * که در CSS این صفحه وجود ندارند — و CSS Modules برای کلاس ناموجود
     * `undefined` می‌دهد، یعنی شیتی بی‌استایل که نه تایپ‌اسکریپت
     * می‌گیردش نه تست. همان باگی که در فرم مدرک مربی دیده شد.
     */
    <BottomSheet
      title="درخواست مرخصی"
      onClose={onClose}
      footer={
        <button
          type="button"
          className={`${styles.actionRow} t-body-lg`}
          onClick={() => void submit()}
          disabled={busy}
        >
          فرستادن برای مدیر
        </button>
      }
    >
      <ChoiceGroup label="نوع" options={LEAVE_KINDS} value={kind} onChange={setKind} />

      <JalaliDateField label="از روز" value={starts} onChange={setStarts} allowClear={false} />
      <JalaliDateField label="تا روز — خالی یعنی همان یک روز" value={ends} onChange={setEnds} />

      <label className={`${styles.leaveField} t-caption`}>
        توضیح برای مدیر
        <textarea
          className={styles.leaveText}
          rows={3}
          value={reason}
          aria-label="توضیح مرخصی"
          onChange={(event) => setReason(event.target.value)}
        />
      </label>

      <p className={`${styles.muted} t-caption`}>
        تا تأیید مدیر، این مرخصی نیست. جوابش را همین‌جا می‌بینید.
      </p>

      {error ? <p className={`${styles.warn} t-caption`}>{error}</p> : null}
    </BottomSheet>
  )
}


/* ── شیت فرستادن مدرک ───────────────────────────────────────── */

/**
 * بارگذاری یک قلم از چک‌لیست، از پنل خودِ مربی.
 *
 * نوع و عنوان از خودِ قلم می‌آید و دستِ مربی نیست: قلم «کارت بهداشت»
 * است و اگر مربی بتواند عنوانش را عوض کند، ردیفِ چک‌لیست پر نمی‌شود و
 * هر دو طرف فکر می‌کنند کار تمام است.
 */
function DocumentSheet({ slot, onClose, onDone }: {
  slot: StaffDocumentSlot
  onClose: () => void
  onDone: () => void
}) {
  const data = useData()
  const [image, setImage] = useState<string | null>(null)
  const [expires, setExpires] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!image) {
      setError('تصویر مدرک را انتخاب کنید.')
      return
    }
    /*
     * تاریخ انقضا فقط جایی که قلم می‌خواهد.
     *
     * اجبارِ تاریخ روی مدرکی که تاریخ ندارد، مربی را وادار می‌کند
     * تاریخِ الکی بزند — و آن تاریخ بعداً «مدرک معتبر» نشان می‌دهد.
     */
    if (slot.needsExpiry && !expires) {
      setError('تاریخ اعتبار این مدرک لازم است.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await data.submitMyDocument({
        kind: slot.kind,
        title: slot.title,
        fileUrl: image,
        expiresAt: expires,
      })
      onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'فرستاده نشد.')
      setBusy(false)
    }
  }

  return (
    <BottomSheet
      title={slot.title}
      onClose={onClose}
      footer={
        <button
          type="button"
          className={`${styles.actionRow} t-body-lg`}
          onClick={() => void submit()}
          disabled={busy}
        >
          فرستادن برای مدیر
        </button>
      }
    >
      {slot.note ? <p className={`${styles.muted} t-body`}>{slot.note}</p> : null}

      <FileField
        label="تصویر مدرک"
        value={image}
        onChange={setImage}
        hint="تا وصل شدن فضای ذخیره‌سازی، تصویر فقط در همین مرورگر می‌ماند."
      />

      {slot.needsExpiry ? (
        <JalaliDateField label="اعتبار تا" value={expires} onChange={setExpires} />
      ) : null}

      <p className={`${styles.muted} t-caption`}>
        تا تأیید مدیر، این مدرک ثبت‌شده حساب نمی‌شود. جوابش را همین‌جا می‌بینید.
      </p>

      {error ? <p className={`${styles.warn} t-caption`}>{error}</p> : null}
    </BottomSheet>
  )
}
