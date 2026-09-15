import { useCallback, useEffect, useState } from 'react'
import {
  AlertIcon,
  ChildFace,
  BackIcon,
  EmptyState,
  StatusChip,
} from '../../design-system/index.ts'
import { formatCount, formatJalali, formatTime, toPersianDigits } from '../../i18n/index.ts'
import { useData } from '../../core/auth/index.ts'
import type { MessageThread, ThreadSummary } from '../../core/data/index.ts'
import styles from './InboxPage.module.css'

/**
 * صندوق پیام مربی — بخش ۶.۶.
 *
 * تا اینجا خانواده می‌توانست پیام بفرستد و مربی هیچ صندوق ورودی
 * نداشت: پیام ثبت می‌شد و به جایی نمی‌رسید. این صفحه همان حلقه را
 * می‌بندد.
 *
 * شماره هیچ‌کس در این مسیر نیست. گفتگو با شناسه کودک کلید می‌خورد و
 * پیام‌ها نام فرستنده را حمل می‌کنند، نه شماره‌اش — پس نه خانواده
 * شماره مربی را می‌بیند، نه مربی شماره خانواده را.
 */
export function InboxPage({
  onBack,
  onChanged,
}: {
  onBack: () => void
  /** پس از هر جوابی صدا زده می‌شود، تا نشان تب تازه شود. */
  onChanged?: () => void
}) {
  const data = useData()
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setThreads(await data.listThreads())
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'خوانده نشد.')
    }
  }, [data])

  useEffect(() => {
    void load()
  }, [load])

  if (openId) {
    return (
      <ChatPage
        childId={openId}
        onBack={() => {
          setOpenId(null)
          void load()
        }}
        onSent={() => {
          void load()
          onChanged?.()
        }}
      />
    )
  }

  const waiting = threads.filter((t) => t.awaitingReply).length

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="بازگشت به امروز">
          <BackIcon size={20} />
        </button>
        <h1 className={`${styles.title} t-h2`}>پیام‌ها</h1>
        {waiting > 0 ? (
          <StatusChip tone="coral">{formatCount(waiting)} منتظر جواب</StatusChip>
        ) : null}
      </header>

      {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}

      {threads.length === 0 ? (
        <EmptyState text="هنوز پیامی از خانواده‌ها نرسیده." />
      ) : (
        <ul className={styles.list}>
          {threads.map((thread) => (
            <li key={thread.childId}>
              <button
                type="button"
                className={`${styles.row} ${thread.awaitingReply ? styles.rowWaiting : ''}`}
                onClick={() => setOpenId(thread.childId)}
              >
                <span className={styles.face}>
                  <ChildFace id={thread.childId} photoUrl={thread.photoUrl} />
                </span>

                <span className={styles.body}>
                  <span className={styles.top}>
                    <span className={`${styles.name} t-body-lg`}>{thread.childName}</span>
                    {thread.lastAt ? (
                      <span className={`${styles.when} t-caption tabular`}>
                        {sameDay(thread.lastAt)
                          ? formatTime(new Date(thread.lastAt))
                          : formatJalali(new Date(thread.lastAt), 'short')}
                      </span>
                    ) : null}
                  </span>
                  <span className={`${styles.preview} t-body`}>{thread.lastBody}</span>
                  {/*
                    پیامی که هنوز در صف ساعت کاری است، باید دیده شود:
                    مربی نباید فکر کند خانواده جوابش را گرفته.
                  */}
                  {thread.queued > 0 ? (
                    <span className={`${styles.queued} t-caption`}>
                      <AlertIcon size={13} />
                      {formatCount(thread.queued)} پیام در صف ساعت کاری
                    </span>
                  ) : null}
                </span>

                {/* رنگ تنها حامل معنا نیست — بخش ۱۲.۲ */}
                {thread.awaitingReply ? (
                  <span className={`${styles.badge} t-caption`}>منتظر جواب</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** همان روز است یا نه. پیام امروز ساعت می‌گیرد، قدیمی‌تر تاریخ. */
function sameDay(iso: string): boolean {
  const then = new Date(iso)
  const now = new Date()
  return (
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate()
  )
}

/**
 * گفتگو با خانواده یک کودک.
 *
 * همان قاعده بخش ۶.۶ که در پنل والد هست، از این سمت: بیرون از ساعت
 * کاری پیام فرستاده می‌شود ولی تحویلش عقب می‌افتد، و همین گفته می‌شود.
 */
function ChatPage({
  childId,
  onBack,
  onSent,
}: {
  childId: string
  onBack: () => void
  onSent?: () => void
}) {
  const data = useData()
  const [thread, setThread] = useState<MessageThread | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setThread(await data.getThread(childId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'خوانده نشد.')
    }
  }, [data, childId])

  useEffect(() => {
    void load()
  }, [load])

  const send = async () => {
    if (!draft.trim() || busy) return
    setBusy(true)
    try {
      await data.sendMessage(childId, draft)
      setDraft('')
      setError(null)
      await load()
      onSent?.()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'فرستاده نشد.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="بازگشت به پیام‌ها">
          <BackIcon size={20} />
        </button>
        <h1 className={`${styles.title} t-h2`}>{thread?.childName ?? '—'}</h1>
      </header>

      {thread ? (
        <>
          <p className={`${styles.hours} t-caption`}>
            ساعت کاری پیام: {toPersianDigits(thread.hours.start)} تا{' '}
            {toPersianDigits(thread.hours.end)}
          </p>

          {thread.messages.length === 0 ? (
            <EmptyState text="هنوز پیامی رد و بدل نشده." />
          ) : (
            <div className={styles.thread}>
              {thread.messages.map((message) => (
                <div
                  key={message.id}
                  className={`${styles.bubble} ${message.mine ? styles.bubbleMine : ''}`}
                >
                  {/*
                    نام فرستنده فقط روی پیام طرف مقابل. روی پیام خودت،
                    نامت را دوباره خواندن معنا ندارد.
                  */}
                  {!message.mine ? (
                    <span className={`${styles.who} t-caption`}>{message.senderName}</span>
                  ) : null}
                  <p className={`${styles.bubbleBody} t-body`}>{message.body}</p>
                  <span className={`${styles.bubbleMeta} t-caption tabular`}>
                    {message.sentAt ? (
                      formatTime(new Date(message.sentAt))
                    ) : (
                      <>
                        <AlertIcon size={13} />
                        در صف تا{' '}
                        {message.queuedUntil
                          ? formatTime(new Date(message.queuedUntil))
                          : 'صبح'}
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}

          <div className={styles.composer}>
            <textarea
              className={styles.text}
              rows={2}
              value={draft}
              aria-label="متن پیام"
              placeholder="جوابتان را بنویسید"
              onChange={(event) => setDraft(event.target.value)}
            />
            <button
              type="button"
              className={styles.send}
              onClick={() => void send()}
              disabled={!draft.trim() || busy}
            >
              فرستادن
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
