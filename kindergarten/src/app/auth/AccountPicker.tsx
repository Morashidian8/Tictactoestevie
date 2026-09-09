import { useState } from 'react'
import { StatusChip } from '../../design-system/index.ts'
import { ROLE_LABEL, useAuth } from '../../core/auth/index.ts'
import styles from './SignIn.module.css'

/**
 * انتخاب حساب — بخش ۳.۲ سند.
 *
 * فقط وقتی دیده می‌شود که یک شماره بیش از یک حساب داشته باشد. تا وقتی
 * انتخابی نشده، حساب فعالی وجود ندارد و هیچ داده‌ای خوانده نمی‌شود.
 */
export function AccountPicker() {
  const { session, selectAccount, signOut } = useAuth()
  const [error, setError] = useState<string | null>(null)
  if (!session) return null

  return (
    <main className={styles.screen}>
      <h1 className={`${styles.title} t-h1`}>با کدام حساب وارد می‌شوید؟</h1>
      <p className={`${styles.hint} t-body`}>
        این شماره بیش از یک حساب دارد. دسترسی‌ها با هم ترکیب نمی‌شوند.
      </p>

      <div className={styles.accountList}>
        {session.accounts.map((account) => (
          <button
            key={account.id}
            type="button"
            className={styles.account}
            onClick={() => {
              setError(null)
              selectAccount(account.id).catch((cause: unknown) =>
                setError(cause instanceof Error ? cause.message : 'حساب انتخاب نشد.'),
              )
            }}
          >
            <span className={`${styles.accountName} t-body-lg`}>{account.displayName}</span>
            <span className={styles.accountMeta}>
              <StatusChip tone="turquoise">{ROLE_LABEL[account.role]}</StatusChip>{' '}
              <span className="t-caption">{account.centerName}</span>
            </span>
          </button>
        ))}
      </div>

      {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}

      <button type="button" className={`${styles.link} t-body`} onClick={() => void signOut()}>
        ورود با شماره دیگر
      </button>
    </main>
  )
}
