import styles from './EmptyState.module.css'

/**
 * حالت خالی — بخش ۱۲.۹ و ۱۲.۱۰.
 *
 * قاعده سند: «حالت خالی همیشه یک دکمه کنش دارد». وقتی کنشی برای پیشنهاد
 * وجود ندارد، متن باید بگوید قدم بعدی چیست، نه اینکه خلأ را توصیف کند.
 */
type Props = {
  text: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ text, action }: Props) {
  return (
    <div className={styles.root}>
      <p className={`${styles.text} t-body-lg`}>{text}</p>
      {action ? (
        <button
          type="button"
          className={`${styles.action} t-body-lg`}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  )
}
