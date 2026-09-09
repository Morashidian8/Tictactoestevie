import { useState } from 'react'
import { AlertIcon, AvatarFace, BottomSheet, CheckIcon } from '../../design-system/index.ts'
import { formatCount } from '../../i18n/index.ts'
import type { Child } from '../../core/data/index.ts'
import styles from './PhotoTagSheet.module.css'

/**
 * تگ کردن عکس — بخش ۵.۵ و ۶.۶ سند.
 *
 * «مربی در طول روز با دوربین معمولی عکس می‌گیرد. در این پنجره از گالری
 * انتخاب می‌کند و به کودکان تگ می‌زند. عکس بدون تگ منتشر نمی‌شود.»
 *
 * چرا تگ اجباری است: بخش ۶.۶ می‌گوید سرپرست فقط عکسی را می‌بیند که کودک
 * خودش در آن تگ خورده. عکس بدون تگ یعنی عکسی که هیچ خانواده‌ای نمی‌بیند
 * و بند ۱۴.۴ پس از هفت روز پاکش می‌کند.
 */
type Props = {
  previewUrl: string
  children: Child[]
  initialTags?: string[]
  onClose: () => void
  onSave: (childIds: string[]) => Promise<void>
}

export function PhotoTagSheet({ previewUrl, children, initialTags, onClose, onSave }: Props) {
  const [tagged, setTagged] = useState<Set<string>>(new Set(initialTags ?? []))
  const [busy, setBusy] = useState(false)

  const toggle = (id: string) =>
    setTagged((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <BottomSheet
      title="این عکس از کیست؟"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className={`${styles.primary} t-body-lg`}
            disabled={busy || tagged.size === 0}
            onClick={() => {
              setBusy(true)
              void onSave([...tagged]).then(onClose).finally(() => setBusy(false))
            }}
          >
            {tagged.size > 0
              ? `ثبت برای ${formatCount(tagged.size)} کودک`
              : 'دست‌کم یک کودک را انتخاب کنید'}
          </button>
          <button type="button" className={`${styles.secondary} t-body-lg`} onClick={onClose}>
            انصراف
          </button>
        </>
      }
    >
      <img className={styles.preview} src={previewUrl} alt="عکس انتخاب‌شده" />

      <p className={`${styles.rule} t-body`}>
        <span className={styles.ruleIcon} aria-hidden><AlertIcon size={18} /></span>
        <span>
          عکس بدون تگ برای هیچ خانواده‌ای فرستاده نمی‌شود و پس از هفت روز پاک می‌شود.
        </span>
      </p>

      <h3 className={`${styles.legend} t-caption`}>روی هر کودکی که در عکس است بزنید</h3>

      <div className={styles.children}>
        {children.map((child) => {
          const on = tagged.has(child.id)
          return (
            <button
              key={child.id}
              type="button"
              className={styles.cell}
              aria-pressed={on}
              onClick={() => toggle(child.id)}
            >
              <span className={styles.face}>
                <span className={styles.faceInner}>
                  <AvatarFace seed={child.id} />
                </span>
                {on ? (
                  <span className={styles.tick} aria-hidden>
                    <CheckIcon size={14} />
                  </span>
                ) : null}
              </span>
              <span className={`${styles.name} t-caption`}>{child.firstName}</span>
            </button>
          )
        })}
      </div>
    </BottomSheet>
  )
}
