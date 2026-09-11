import { useCallback, useEffect, useState } from 'react'
import { CheckIcon, CrossIcon } from '../../design-system/index.ts'
import { formatJalali, toPersianDigits } from '../../i18n/index.ts'
import { useData } from '../../core/auth/index.ts'
import type { PickupOption, PickupPlan, PlanDirection } from '../../core/data/index.ts'
import styles from './TomorrowCard.module.css'

/**
 * «فردا» در پنل خانواده — بخش ۵.۸ و ۶.۴.
 *
 * دو تصمیم جدا، چون در یک روز ممکن است هر دو فرق کنند:
 *   چه کسی می‌آورد
 *   چه کسی می‌برد
 *
 * هر کدام دو راه دارد و فقط دو راه:
 *   فرد در فهرست مجاز است  → یک تیک. مربی فردا همان را می‌بیند.
 *   فرد در فهرست نیست      → نامش نوشته می‌شود و سامانه کد می‌سازد.
 *
 * قاعده سفت بخش ۵.۸ شل نمی‌شود: مربی هنوز یا از فهرست مجاز تأیید
 * می‌کند یا با کد. این صفحه فقط راه دوم را از شب قبل آماده می‌کند تا
 * خانواده سر در گم نشود و مربی دم در معطل نماند.
 */

const DIRECTION_LABEL: Record<PlanDirection, string> = {
  drop_off: 'چه کسی می‌آورد',
  pickup: 'چه کسی می‌برد',
}

type Props = {
  childId: string
  childName: string
}

export function TomorrowCard({ childId, childName }: Props) {
  const data = useData()
  const [options, setOptions] = useState<PickupOption[]>([])
  const [plans, setPlans] = useState<PickupPlan[]>([])
  const [editing, setEditing] = useState<PlanDirection | null>(null)
  const [error, setError] = useState<string | null>(null)

  const tomorrow = tomorrowIso()

  const load = useCallback(async () => {
    try {
      const [allowed, saved] = await Promise.all([
        data.listPickupOptions(childId),
        data.getChildPlans(childId, tomorrow),
      ])
      setOptions(allowed)
      setPlans(saved)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'خوانده نشد.')
    }
  }, [childId, data, tomorrow])

  useEffect(() => {
    void load()
  }, [load])

  const planFor = (direction: PlanDirection) => plans.find((p) => p.direction === direction) ?? null

  const save = async (
    direction: PlanDirection,
    personId: string | null,
    newPerson: { fullName: string; phone: string } | null,
  ) => {
    try {
      await data.savePlan({ childId, date: tomorrow, direction, personId, newPerson })
      setEditing(null)
      setError(null)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت نشد.')
    }
  }

  const clear = async (direction: PlanDirection) => {
    await data.clearPlan(childId, tomorrow, direction)
    setEditing(null)
    await load()
  }

  return (
    <section className={styles.card}>
      <header className={styles.head}>
        <h2 className={`${styles.title} t-h2`}>فردا</h2>
        <span className={`${styles.date} t-caption`}>
          {formatJalali(new Date(Date.parse(`${tomorrow}T09:00:00`)), 'weekday')}
        </span>
      </header>

      {(['drop_off', 'pickup'] as const).map((direction) => {
        const plan = planFor(direction)
        return (
          <div key={direction} className={styles.row}>
            <span className={`${styles.rowLabel} t-caption`}>{DIRECTION_LABEL[direction]}</span>

            {editing === direction ? (
              <Picker
                options={options}
                childName={childName}
                onCancel={() => setEditing(null)}
                onPick={(personId) => save(direction, personId, null)}
                onNew={(person) => save(direction, null, person)}
              />
            ) : plan ? (
              <div className={styles.chosen}>
                <span className={`${styles.person} t-body`}>{plan.personName}</span>
                {plan.code ? (
                  <p className={`${styles.codeLine} t-body`}>
                    کد تحویل: <b className={styles.code}>{toPersianDigits(plan.code)}</b>
                    <span className={`${styles.codeHint} t-caption`}>
                      این کد را به ایشان بدهید. مربی همین را می‌پرسد و فقط فردا کار می‌کند.
                    </span>
                  </p>
                ) : (
                  <span className={`${styles.codeHint} t-caption`}>
                    ایشان در فهرست مجاز هستند، پس کد لازم نیست.
                  </span>
                )}
                <div className={styles.actions}>
                  <button type="button" className={styles.link} onClick={() => setEditing(direction)}>
                    تغییر
                  </button>
                  <button type="button" className={styles.link} onClick={() => void clear(direction)}>
                    مثل همیشه
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className={`${styles.asUsual} t-body`}
                onClick={() => setEditing(direction)}
              >
                <span>مثل همیشه</span>
                <span className={styles.link}>تغییر برای فردا</span>
              </button>
            )}
          </div>
        )
      })}

      {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}
    </section>
  )
}

/** انتخاب فرد: از فهرست مجاز، یا کسی تازه. */
function Picker({
  options,
  childName,
  onPick,
  onNew,
  onCancel,
}: {
  options: PickupOption[]
  childName: string
  onPick: (personId: string) => void
  onNew: (person: { fullName: string; phone: string }) => void
  onCancel: () => void
}) {
  const [mode, setMode] = useState<'list' | 'new'>('list')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')

  if (mode === 'new') {
    return (
      <div className={styles.picker}>
        <p className={`${styles.pickerNote} t-caption`}>
          چون ایشان در فهرست مجاز {childName} نیستند، سامانه یک کد یکبارمصرف می‌سازد.
        </p>
        <label className={`${styles.field} t-caption`}>
          نام و نسبت
          <input
            className={styles.input}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="مثلاً: عمو، رضا احمدی"
            aria-label="نام فرد"
          />
        </label>
        <label className={`${styles.field} t-caption`}>
          شماره تماس
          <input
            className={styles.input}
            value={phone}
            inputMode="tel"
            onChange={(event) => setPhone(event.target.value)}
            aria-label="شماره فرد"
          />
        </label>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.primary} t-body`}
            disabled={fullName.trim().length === 0}
            onClick={() => onNew({ fullName, phone })}
          >
            ساخت کد
          </button>
          <button type="button" className={styles.link} onClick={() => setMode('list')}>
            بازگشت به فهرست
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.picker}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`${styles.option} t-body`}
          onClick={() => onPick(option.id)}
        >
          <CheckIcon size={18} />
          <span className={styles.person}>{option.fullName}</span>
          {option.relation ? (
            <span className={`${styles.relation} t-caption`}>{option.relation}</span>
          ) : null}
        </button>
      ))}
      <button type="button" className={`${styles.option} t-body`} onClick={() => setMode('new')}>
        <CrossIcon size={18} />
        <span className={styles.person}>کس دیگری می‌آید</span>
      </button>
      <button type="button" className={styles.link} onClick={onCancel}>
        انصراف
      </button>
    </div>
  )
}

/** فردا به وقت محلی، نه UTC — وگرنه شب‌ها یک روز جلو می‌افتد. */
function tomorrowIso(): string {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
