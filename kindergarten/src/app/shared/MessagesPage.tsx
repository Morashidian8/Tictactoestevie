import { useCallback, useEffect, useRef, useState } from 'react'
import { BackIcon, ChatIcon, EmptyState } from '../../design-system/index.ts'
import { formatJalali, formatTime, toPersianDigits } from '../../i18n/index.ts'
import { ROLE_LABEL, useData } from '../../core/auth/index.ts'
import type {
  Conversation,
  ConversationSummary,
  MessageCandidate,
} from '../../core/data/index.ts'
import styles from './MessagesPage.module.css'

/**
 * صندوق پیام — یکی، برای هر سه نقش.
 *
 * خواسته مالک محصول: سرپرست انتخاب کند به کدام مربی پیام بدهد، مربی به
 * هر سرپرستی که خواست، و مدیر جداگانه به هر مربی یا سرپرست.
 *
 * چهار چیزی که این صفحه باید صادقانه بگوید و می‌گوید:
 *
 * ۱. **گفتگو با یک نفر است، نه با «مهد».** نسخه پیشین یک اتاق برای هر
 *    کودک داشت و همه مربیان در آن بودند؛ نمی‌شد گفت این پیام برای کدام
 *    مربی است.
 *
 * ۲. **هیچ شماره‌ای دیده نمی‌شود.** نه در فهرست، نه در گفتگو. انتخاب با
 *    نام و زمینه است (کلاس مربی، نام کودکِ سرپرست).
 *
 * ۳. **فهرست انتخاب از سرور می‌آید.** همان قاعده‌ای که اجازه فرستادن را
 *    می‌دهد، فهرست را هم می‌سازد — پس کسی در فهرست نمی‌آید که پیامش رد
 *    شود.
 *
 * ۴. **بیرون از ساعت کاری، نوشتن آزاد است و رسیدن صبر می‌کند.** فقط در
 *    گفتگوهایی که یک سرشان خانواده است. مدیر و مربی هر ساعتی می‌نویسند.
 */
export function MessagesPage({ onCountChanged, onBack }: {
  /** شمار نخوانده‌ها، برای نشان روی نوار پایین. */
  onCountChanged?: (unread: number) => void
  /**
   * کلید بازگشت در سرصفحه.
   *
   * وقتی صندوق مقصدِ نوار پایین است لازم نیست — نوار خودش راه برگشت
   * است. وقتی از فهرست «منو» باز می‌شود لازم است، وگرنه صفحه بن‌بست
   * می‌شود.
   */
  onBack?: () => void
}) {
  const data = useData()
  const [list, setList] = useState<ConversationSummary[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)

  const load = useCallback(async () => {
    try {
      const rows = await data.listConversations()
      setList(rows)
      onCountChanged?.(rows.reduce((sum, r) => sum + r.unread, 0))
    } catch {
      setList([])
    }
  }, [data, onCountChanged])

  useEffect(() => {
    void load()
  }, [load])

  if (openId) {
    return (
      <ChatView
        conversationId={openId}
        onBack={() => {
          setOpenId(null)
          void load()
        }}
      />
    )
  }

  if (picking) {
    return (
      <PickPerson
        onBack={() => setPicking(false)}
        onPicked={async (accountId) => {
          const id = await data.openConversation(accountId)
          setPicking(false)
          setOpenId(id)
        }}
      />
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        {onBack ? (
          <button type="button" className={styles.back} onClick={onBack} aria-label="بازگشت">
            <BackIcon size={22} />
          </button>
        ) : null}
        <span className={`${styles.title} t-h2`}>پیام‌ها</span>
        <button type="button" className={`${styles.newChat} t-body`} onClick={() => setPicking(true)}>
          گفتگوی تازه
        </button>
      </div>

      {list === null ? (
        <EmptyState text="در حال خواندن…" />
      ) : list.length === 0 ? (
        /* حالت خالی دعوت به کنش است، نه یک جمله خبری — بخش ۱۲.۱۰. */
        <EmptyState text="هنوز گفتگویی ندارید. با «گفتگوی تازه» شروع کنید." />
      ) : (
        <ul className={styles.list}>
          {list.map((row) => (
            <li key={row.id}>
              <button type="button" className={styles.row} onClick={() => setOpenId(row.id)}>
                <span className={styles.avatar} aria-hidden>
                  <ChatIcon size={20} />
                </span>
                <span className={styles.main}>
                  <span className={`${styles.name} t-body`}>
                    {row.otherName}
                    <span className={styles.role}>{ROLE_LABEL[row.otherRole]}</span>
                  </span>
                  {/* زمینه کودک، فقط وقتی گفتگو درباره کودکی است. */}
                  {row.childName ? (
                    <span className={`${styles.about} t-caption`}>درباره {row.childName}</span>
                  ) : null}
                  <span className={`${styles.preview} t-caption`}>
                    {row.lastBody ?? 'هنوز پیامی رد و بدل نشده.'}
                  </span>
                </span>
                <span className={styles.end}>
                  {row.lastAt ? (
                    <span className={`${styles.when} t-caption`}>
                      {formatJalali(new Date(row.lastAt), 'short')}
                    </span>
                  ) : null}
                  {row.unread > 0 ? (
                    <span className={styles.unread}>{toPersianDigits(row.unread)}</span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ── انتخاب طرف گفتگو ───────────────────────────────────────── */

function PickPerson({ onBack, onPicked }: {
  onBack: () => void
  onPicked: (accountId: string) => Promise<void>
}) {
  const data = useData()
  const [people, setPeople] = useState<MessageCandidate[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    data.listMessageCandidates().then(setPeople).catch(() => setPeople([]))
  }, [data])

  const pick = async (accountId: string) => {
    setBusy(true)
    setError(null)
    try {
      await onPicked(accountId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'گفتگو باز نشد.')
      setBusy(false)
    }
  }

  const groups: { role: MessageCandidate['role']; label: string }[] = [
    { role: 'manager', label: 'مدیر' },
    { role: 'teacher', label: 'مربیان' },
    { role: 'guardian', label: 'خانواده‌ها' },
  ]

  return (
    <div className={styles.page}>
      <header className={styles.chatHead}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="بازگشت">
          <BackIcon size={22} />
        </button>
        <span className={`${styles.title} t-h2`}>گفتگوی تازه</span>
      </header>

      {people === null ? (
        <EmptyState text="در حال خواندن…" />
      ) : people.length === 0 ? (
        <EmptyState text="کسی برای گفتگو پیدا نشد." />
      ) : (
        groups.map((group) => {
          const rows = people.filter((p) => p.role === group.role)
          if (rows.length === 0) return null
          return (
            <section key={group.role} className={styles.group}>
              <p className={`${styles.groupTitle} t-caption`}>{group.label}</p>
              <ul className={styles.list}>
                {rows.map((person) => (
                  <li key={person.accountId}>
                    <button
                      type="button"
                      className={styles.row}
                      disabled={busy}
                      onClick={() => void pick(person.accountId)}
                    >
                      <span className={styles.main}>
                        <span className={`${styles.name} t-body`}>{person.fullName}</span>
                        {/*
                          زمینه، تا انتخاب حدس نباشد: دو مربی می‌توانند
                          هم‌نام باشند و نام کلاس است که می‌گوید کدام.
                        */}
                        {person.context ? (
                          <span className={`${styles.about} t-caption`}>{person.context}</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })
      )}

      {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}
    </div>
  )
}

/* ── خودِ گفتگو ─────────────────────────────────────────────── */

function ChatView({ conversationId, onBack }: {
  conversationId: string
  onBack: () => void
}) {
  const data = useData()
  const [chat, setChat] = useState<Conversation | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      setChat(await data.getConversation(conversationId))
      await data.markConversationRead(conversationId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'خوانده نشد.')
    }
  }, [data, conversationId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [chat?.messages.length])

  const send = async () => {
    const text = draft.trim()
    if (!text) return
    setBusy(true)
    setError(null)
    try {
      await data.sendToConversation(conversationId, text)
      setDraft('')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'فرستاده نشد.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.chatHead}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="بازگشت">
          <BackIcon size={22} />
        </button>
        <span className={styles.chatWho}>
          <span className={`${styles.title} t-h2`}>{chat?.otherName ?? '…'}</span>
          {chat?.childName ? (
            <span className={`${styles.about} t-caption`}>درباره {chat.childName}</span>
          ) : chat ? (
            <span className={`${styles.about} t-caption`}>{ROLE_LABEL[chat.otherRole]}</span>
          ) : null}
        </span>
      </header>

      {/*
        ساعت کاری فقط در گفتگوهایی که یک سرشان خانواده است — بخش ۶.۶.
        در گفتگوی مدیر و مربی نوشته نمی‌شود، چون قاعده‌اش را ندارد.
      */}
      {chat?.hours ? (
        <p className={`${styles.hours} t-caption`}>
          ساعت کاری پیام: {toPersianDigits(chat.hours.start)} تا {toPersianDigits(chat.hours.end)}.
          بیرون از این ساعت پیام فرستاده می‌شود ولی صبح تحویل می‌شود.
        </p>
      ) : null}

      <div className={styles.thread}>
        {chat && chat.messages.length === 0 ? (
          <p className={`${styles.empty} t-body`}>هنوز پیامی رد و بدل نشده.</p>
        ) : null}
        {chat?.messages.map((message) => (
          <div
            key={message.id}
            className={`${styles.bubble} ${message.mine ? styles.bubbleMine : ''}`}
          >
            <p className={`${styles.bubbleBody} t-body`}>{message.body}</p>
            <p className={`${styles.bubbleMeta} t-caption`}>
              {message.senderName}
              {' · '}
              {/*
                پیامِ در صف، «فرستاده شد» نمی‌گوید.
                وعده‌ای که اپ نمی‌تواند نگه دارد، بدتر از سکوت است.
              */}
              {message.sentAt
                ? formatTime(new Date(message.sentAt))
                : message.queuedUntil
                  ? `در صف تا ${formatTime(new Date(message.queuedUntil))}`
                  : '—'}
            </p>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {error ? <p className={`${styles.error} t-body`}>{error}</p> : null}

      <div className={styles.composer}>
        <textarea
          className={styles.input}
          value={draft}
          rows={2}
          aria-label="متن پیام"
          placeholder="پیامتان را بنویسید…"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          type="button"
          className={`${styles.send} t-body`}
          disabled={busy || draft.trim().length === 0}
          onClick={() => void send()}
        >
          فرستادن
        </button>
      </div>
    </div>
  )
}
