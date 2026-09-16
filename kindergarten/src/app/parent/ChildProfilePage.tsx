import { useCallback, useEffect, useState } from 'react'
import { AlertIcon, CheckIcon, EmptyState } from '../../design-system/index.ts'
import { useData } from '../../core/auth/index.ts'
import type { ProfileField } from '../../core/data/index.ts'
import { AttendanceArchive } from './AttendanceArchive.tsx'
import { Shell } from './MorePage.tsx'
import shared from './MorePage.module.css'
import styles from './ChildProfilePage.module.css'

/**
 * پرونده کودک، از دید خانواده — با امکان ویرایش.
 *
 * خواسته مالک محصول: خانواده اطلاعات کودک را وارد و ویرایش کند، ولی
 * «تایید نهایی برای تغییر نیازمند تایید مدیر باشه».
 *
 * سه چیزی که این صفحه باید صادقانه بگوید و می‌گوید:
 *
 * ۱. **نوشتن، عوض شدن نیست.** تا مدیر تأیید نکند، پرونده دست‌نخورده
 *    می‌ماند. پس مقدار فعلی و مقدار پیشنهادی هر دو دیده می‌شوند، نه
 *    اینکه مقدار تازه جای قبلی را بگیرد و بعد معلوم شود رد شده.
 *
 * ۲. **در این فاصله، مربی هنوز مقدار قبلی را می‌بیند.** برای آلرژی این
 *    یعنی خطر واقعی. صفحه این را پنهان نمی‌کند و به خانواده می‌گوید
 *    اگر فوری است، تلفنی هم خبر بدهد.
 *
 * ۳. **همه چیز ویرایش‌پذیر نیست.** کلاس، شهریه و پرداخت‌کننده کار مهد
 *    است. فهرست میدان‌های قابل ویرایش از سرور می‌آید، نه از اینجا.
 */
export function ChildProfilePage({ childId, childName, onBack }: {
  childId: string
  childName: string
  onBack: () => void
}) {
  const data = useData()
  const [fields, setFields] = useState<ProfileField[] | null>(null)
  const [editing, setEditing] = useState<ProfileField | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setFields(await data.listProfileFields(childId))
    } catch {
      setFields([])
    }
  }, [data, childId])

  useEffect(() => {
    void load()
  }, [load])

  if (!fields) {
    return (
      <Shell title="پرونده کودک" onBack={onBack}>
        <EmptyState text="در حال خواندن…" />
      </Shell>
    )
  }

  const waiting = fields.filter((f) => f.pending !== null)

  return (
    <Shell title={`پرونده ${childName}`} onBack={onBack}>
      {note ? (
        <p className={`${styles.note} t-body`}>
          <CheckIcon size={18} />
          {note}
        </p>
      ) : null}

      {/*
        بنر انتظار، بالای همه‌چیز.
        خانواده‌ای که دیروز آلرژی ثبت کرده باید همین بالا ببیند که هنوز
        اعمال نشده — نه اینکه ته صفحه دنبالش بگردد.
      */}
      {waiting.length > 0 ? (
        <section className={`${shared.card} ${styles.waiting}`} aria-label="منتظر تأیید مهد">
          <p className={`${styles.waitHead} t-body`}>
            <AlertIcon size={20} />
            {waiting.length} تغییر منتظر تأیید مهد است
          </p>
          <p className={`${shared.hint} t-caption`}>
            تا تأیید مدیر، مربی همان اطلاعات قبلی را می‌بیند. اگر موضوع فوری است —
            مثل آلرژی تازه — تلفنی هم به مهد خبر بدهید.
          </p>
        </section>
      ) : null}

      <section className={shared.card} aria-label="اطلاعات کودک">
        <span className={`${shared.cardLabel} t-caption`}>اطلاعات کودک</span>
        {fields.map((field) => (
          <FieldRow key={field.key} field={field} onEdit={() => setEditing(field)} />
        ))}
      </section>

      <p className={`${shared.hint} t-caption`}>
        کلاس، شهریه و سرپرست پرداخت‌کننده را مهد ثبت می‌کند و از اینجا تغییر نمی‌کند.
      </p>

      {/*
        بایگانی حضور، در همین پرونده.

        خواسته مالک محصول: «آخر ماه پروفایل کودک مشخص باشه دقیقا چه
        روزها و ساعت‌هایی حضور داشته». جایش همین‌جاست، نه یک صفحه جدا:
        خانواده وقتی دنبال ساعت‌هاست، دنبال پرونده کودک می‌گردد.
      */}
      <section className={shared.card} aria-label="بایگانی حضور">
        <span className={`${shared.cardLabel} t-caption`}>حضور و غیاب</span>
        <AttendanceArchive childId={childId} />
      </section>

      {editing ? (
        <EditSheet
          field={editing}
          onClose={() => setEditing(null)}
          onDone={async (label) => {
            setEditing(null)
            setNote(`«${label}» برای تأیید مهد فرستاده شد.`)
            await load()
          }}
          onSubmit={(value) => data.requestProfileChange(childId, editing.key, value)}
        />
      ) : null}
    </Shell>
  )
}

function FieldRow({ field, onEdit }: { field: ProfileField; onEdit: () => void }) {
  return (
    <button type="button" className={styles.field} onClick={onEdit}>
      <span className={styles.fieldMain}>
        <span className={`${styles.fieldLabel} t-caption`}>
          {field.label}
          {/*
            میدان ایمنی علامت دارد. نه برای ترساندن — برای اینکه خانواده
            بداند چرا این یکی مهم‌تر است و چرا باید تلفنی هم بگوید.
          */}
          {field.safetyCritical ? <span className={styles.safety}>ایمنی</span> : null}
        </span>
        <span className={`${styles.fieldValue} t-body`}>
          {field.value || <span className={styles.blank}>ثبت نشده</span>}
        </span>
        {/*
          مقدار پیشنهادی جای مقدار فعلی را نمی‌گیرد، زیرش می‌نشیند.
          وگرنه خانواده فکر می‌کند عوض شده و بعد می‌بیند رد شده.
        */}
        {field.pending !== null ? (
          <span className={`${styles.pending} t-caption`}>
            منتظر تأیید: {field.pending || '—'}
          </span>
        ) : null}
      </span>
      <span className={`${styles.edit} t-caption`}>ویرایش</span>
    </button>
  )
}

function EditSheet({ field, onClose, onDone, onSubmit }: {
  field: ProfileField
  onClose: () => void
  onDone: (label: string) => Promise<void>
  onSubmit: (value: string) => Promise<void>
}) {
  const [value, setValue] = useState(field.pending ?? field.value)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await onSubmit(value)
      await onDone(field.label)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'فرستاده نشد.')
      setBusy(false)
    }
  }

  return (
    <div className={shared.sheetBackdrop} role="dialog" aria-label={`ویرایش ${field.label}`}>
      <div className={shared.sheet}>
        <p className={`${shared.sheetTitle} t-h2`}>{field.label}</p>

        <label className={`${shared.field} t-caption`}>
          مقدار تازه
          <input
            className={shared.input}
            value={value}
            aria-label={`مقدار ${field.label}`}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>

        {field.key === 'allergies' ? (
          <p className={`${shared.hint} t-caption`}>
            چند مورد را با «،» از هم جدا کنید.
          </p>
        ) : null}

        <p className={`${shared.hint} t-caption`}>
          مقدار فعلی: {field.value || 'ثبت نشده'}
        </p>
        {/*
          وعده‌ای که این صفحه نمی‌دهد: «ذخیره شد».
          چیزی ذخیره نمی‌شود؛ درخواستی فرستاده می‌شود.
        */}
        <p className={`${shared.hint} t-caption`}>
          این تغییر برای مدیر مهد فرستاده می‌شود و تا تأیید او اعمال نمی‌شود.
        </p>

        {error ? <p className={`${shared.error} t-caption`}>{error}</p> : null}

        <div className={shared.sheetActions}>
          <button type="button" className={shared.secondary} onClick={onClose}>
            انصراف
          </button>
          <button
            type="button"
            className={`${shared.primary} t-body`}
            disabled={busy || value.trim() === field.value.trim()}
            onClick={() => void submit()}
          >
            فرستادن برای تأیید
          </button>
        </div>
      </div>
    </div>
  )
}
