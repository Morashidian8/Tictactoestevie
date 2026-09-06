import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, RotateCcw, X } from 'lucide-react'
import type { Question } from '@/content/types'
import { Chip, cx } from './ui'
import { fa } from '@/lib/format'
import { keywordScore, matchesAny, shuffle } from '@/lib/text'

/* پاسخ کاربر برای هر نوع سؤال */
export type Answer =
  | { type: 'mcq'; value: number | null }
  | { type: 'truefalse'; value: boolean | null }
  | { type: 'fill'; value: string }
  | { type: 'match'; value: Record<number, number> }
  | { type: 'order'; value: number[] }
  | { type: 'short'; value: string }

export function emptyAnswer(q: Question): Answer {
  switch (q.type) {
    case 'mcq': return { type: 'mcq', value: null }
    case 'truefalse': return { type: 'truefalse', value: null }
    case 'fill': return { type: 'fill', value: '' }
    case 'match': return { type: 'match', value: {} }
    case 'order': return { type: 'order', value: [] }
    case 'short': return { type: 'short', value: '' }
  }
}

export function isAnswered(a: Answer): boolean {
  switch (a.type) {
    case 'mcq': return a.value !== null
    case 'truefalse': return a.value !== null
    case 'fill': return a.value.trim().length > 0
    case 'match': return Object.keys(a.value).length > 0
    case 'order': return a.value.length > 0
    case 'short': return a.value.trim().length > 0
  }
}

/** نمرهٔ ۰ تا ۱ */
export function scoreOf(q: Question, a: Answer): number {
  switch (q.type) {
    case 'mcq': return a.type === 'mcq' && a.value === q.answer ? 1 : 0
    case 'truefalse': return a.type === 'truefalse' && a.value === q.answer ? 1 : 0
    case 'fill': return a.type === 'fill' && matchesAny(a.value, q.accept) ? 1 : 0
    case 'short': {
      if (a.type !== 'short') return 0
      const s = keywordScore(a.value, q.keywords)
      return s >= 0.6 ? 1 : s >= 0.34 ? 0.5 : 0
    }
    case 'match': {
      if (a.type !== 'match') return 0
      const total = q.left.length
      let ok = 0
      for (let i = 0; i < total; i++) if (a.value[i] === i) ok++
      return total ? ok / total : 0
    }
    case 'order': {
      if (a.type !== 'order') return 0
      const total = q.items.length
      if (a.value.length !== total) return 0
      let ok = 0
      for (let i = 0; i < total; i++) if (a.value[i] === i) ok++
      return ok === total ? 1 : ok / total < 0.5 ? 0 : 0.5
    }
  }
}

export const TOPIC_ICON: Record<string, string> = {
  'واژگان': '📖', 'معنی و مفهوم': '💭', 'آرایه‌های ادبی': '✨',
  'دستور زبان': '🔤', 'املا و نگارش': '✍️', 'دانش ادبی': '🏛️', 'درک مطلب': '🧠',
}

interface Props {
  q: Question
  index: number
  answer: Answer
  onChange: (a: Answer) => void
  /** پاسخ درست نشان داده شود؟ */
  revealed: boolean
}

/** پراپ‌های مشترک زیرمؤلفه‌های هر نوع سؤال */
type SubProps<T extends Question> = {
  q: T
  answer: Answer
  onChange: (a: Answer) => void
  revealed: boolean
}

export default function QuestionView({ q, index, answer, onChange, revealed }: Props) {
  const correct = revealed ? scoreOf(q, answer) : 0

  return (
    <div className="card overflow-hidden">
      <div className="flex items-start gap-3 border-b border-line bg-surface2/60 p-4">
        <span className="grid size-7 shrink-0 place-items-center rounded-xl bg-accent text-[12px] font-extrabold text-white">
          {fa(index + 1)}
        </span>
        <p className="flex-1 text-[14px] leading-8 font-semibold">{q.prompt}</p>
        <Chip className="shrink-0">{TOPIC_ICON[q.topic]} {q.topic}</Chip>
      </div>

      <div className="p-4">
        {q.type === 'mcq' && (
          <Mcq q={q} answer={answer} onChange={onChange} revealed={revealed} />
        )}
        {q.type === 'truefalse' && (
          <TrueFalse q={q} answer={answer} onChange={onChange} revealed={revealed} />
        )}
        {q.type === 'fill' && (
          <Fill q={q} answer={answer} onChange={onChange} revealed={revealed} />
        )}
        {q.type === 'match' && (
          <Match q={q} answer={answer} onChange={onChange} revealed={revealed} />
        )}
        {q.type === 'order' && (
          <Order q={q} answer={answer} onChange={onChange} revealed={revealed} />
        )}
        {q.type === 'short' && (
          <Short q={q} answer={answer} onChange={onChange} revealed={revealed} />
        )}
      </div>

      {revealed && (
        <motion.div
          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
          className={cx(
            'border-t p-4 text-[13px] leading-7',
            correct >= 1 ? 'border-emerald-500/25 bg-emerald-500/8'
              : correct > 0 ? 'border-amber-500/25 bg-amber-500/8'
                : 'border-rose-500/25 bg-rose-500/8',
          )}
        >
          <p className="mb-1 flex items-center gap-1.5 font-extrabold">
            {correct >= 1 ? <><Check size={15} className="text-emerald-500" /> درست</>
              : correct > 0 ? <>نیمه‌درست</>
                : <><X size={15} className="text-rose-500" /> نادرست</>}
          </p>
          <p className="text-ink2">{q.explain}</p>
        </motion.div>
      )}
    </div>
  )
}

/* ---------------- چهارگزینه‌ای ---------------- */
function Mcq({ q, answer, onChange, revealed }: SubProps<Extract<Question, { type: 'mcq' }>>) {
  const v = answer.type === 'mcq' ? answer.value : null
  return (
    <div className="space-y-2">
      {q.choices.map((c, i) => {
        const picked = v === i
        const right = revealed && i === q.answer
        const wrong = revealed && picked && i !== q.answer
        return (
          <button
            key={i}
            disabled={revealed}
            onClick={() => onChange({ type: 'mcq', value: i })}
            className={cx(
              'press flex w-full items-center gap-3 rounded-2xl border p-3 text-right text-[13.5px] leading-7',
              right ? 'border-emerald-500 bg-emerald-500/10'
                : wrong ? 'border-rose-500 bg-rose-500/10 shake'
                  : picked ? 'border-accent bg-accentsoft'
                    : 'border-line bg-surface',
            )}
          >
            <span className={cx(
              'grid size-6 shrink-0 place-items-center rounded-lg text-[11px] font-extrabold',
              right ? 'bg-emerald-500 text-white' : wrong ? 'bg-rose-500 text-white'
                : picked ? 'bg-accent text-white' : 'bg-surface2 text-ink3',
            )}>
              {fa(i + 1)}
            </span>
            <span className="flex-1">{c}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ---------------- درست / نادرست ---------------- */
function TrueFalse({ q, answer, onChange, revealed }: SubProps<Extract<Question, { type: 'truefalse' }>>) {
  const v = answer.type === 'truefalse' ? answer.value : null
  return (
    <div className="grid grid-cols-2 gap-3">
      {[true, false].map((b) => {
        const picked = v === b
        const right = revealed && b === q.answer
        const wrong = revealed && picked && b !== q.answer
        return (
          <button
            key={String(b)}
            disabled={revealed}
            onClick={() => onChange({ type: 'truefalse', value: b })}
            className={cx(
              'press rounded-2xl border py-4 text-sm font-extrabold',
              right ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : wrong ? 'border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400 shake'
                  : picked ? 'border-accent bg-accentsoft text-accent'
                    : 'border-line bg-surface text-ink2',
            )}
          >
            {b ? '✓ درست' : '✗ نادرست'}
          </button>
        )
      })}
    </div>
  )
}

/* ---------------- جای خالی ---------------- */
function Fill({ q, answer, onChange, revealed }: SubProps<Extract<Question, { type: 'fill' }>>) {
  const v = answer.type === 'fill' ? answer.value : ''
  const ok = revealed && matchesAny(v, q.accept)
  return (
    <div>
      <input
        value={v}
        disabled={revealed}
        onChange={(e) => onChange({ type: 'fill', value: e.target.value })}
        placeholder="پاسخ را بنویس…"
        className={cx(
          'h-12 w-full rounded-2xl border bg-surface px-4 text-sm outline-none',
          revealed ? (ok ? 'border-emerald-500' : 'border-rose-500') : 'border-line focus:border-accent',
        )}
      />
      {revealed && !ok && (
        <p className="mt-2 text-[12px] text-ink2">
          پاسخ درست: <span className="font-extrabold text-emerald-600 dark:text-emerald-400">{q.accept[0]}</span>
        </p>
      )}
    </div>
  )
}

/* ---------------- پاسخ کوتاه ---------------- */
function Short({ q, answer, onChange, revealed }: SubProps<Extract<Question, { type: 'short' }>>) {
  const v = answer.type === 'short' ? answer.value : ''
  return (
    <div>
      <textarea
        value={v}
        disabled={revealed}
        rows={3}
        onChange={(e) => onChange({ type: 'short', value: e.target.value })}
        placeholder="پاسخت را با جملهٔ خودت بنویس…"
        className="w-full resize-none rounded-2xl border border-line bg-surface p-3.5 text-[13.5px] leading-7 outline-none focus:border-accent"
      />
      {revealed && (
        <div className="mt-3 rounded-2xl bg-surface2 p-3">
          <p className="mb-1 text-[11px] font-extrabold text-ink3">پاسخ نمونه</p>
          <p className="text-[13px] leading-7">{q.sample}</p>
        </div>
      )}
    </div>
  )
}

/* ---------------- تطبیقی ---------------- */
function Match({ q, answer, onChange, revealed }: SubProps<Extract<Question, { type: 'match' }>>) {
  const pairs = answer.type === 'match' ? answer.value : {}
  const [activeLeft, setActiveLeft] = useState<number | null>(null)
  const rightOrder = useMemo(
    () => shuffle(q.right.map((_, i) => i), q.id.length * 17 + 3),
    [q.id, q.right],
  )

  const pick = (rightIdx: number) => {
    if (activeLeft === null || revealed) return
    const next = { ...pairs }
    for (const k of Object.keys(next)) if (next[+k] === rightIdx) delete next[+k]
    next[activeLeft] = rightIdx
    onChange({ type: 'match', value: next })
    setActiveLeft(null)
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-2">
          {q.left.map((l, i) => {
            const paired = pairs[i] !== undefined
            const right = revealed && pairs[i] === i
            return (
              <button
                key={i}
                disabled={revealed}
                onClick={() => setActiveLeft(activeLeft === i ? null : i)}
                className={cx(
                  'w-full rounded-xl border p-2.5 text-right text-[12.5px] leading-6',
                  revealed ? (right ? 'border-emerald-500 bg-emerald-500/10' : paired ? 'border-rose-500 bg-rose-500/10' : 'border-line')
                    : activeLeft === i ? 'border-accent bg-accentsoft'
                      : paired ? 'border-accent/40 bg-surface2' : 'border-line bg-surface',
                )}
              >
                {l}
                {paired && (
                  <span className="mt-1 block truncate text-[10px] text-accent">← {q.right[pairs[i]]}</span>
                )}
              </button>
            )
          })}
        </div>
        <div className="space-y-2">
          {rightOrder.map((ri) => {
            const used = Object.values(pairs).includes(ri)
            return (
              <button
                key={ri}
                disabled={revealed}
                onClick={() => pick(ri)}
                className={cx(
                  'w-full rounded-xl border p-2.5 text-right text-[12.5px] leading-6',
                  used ? 'border-line bg-surface2 text-ink3' : 'border-line bg-surface',
                  activeLeft !== null && !used && 'border-accent/50',
                )}
              >
                {q.right[ri]}
              </button>
            )
          })}
        </div>
      </div>
      {!revealed && (
        <p className="mt-3 text-[11px] text-ink3">
          اول یکی از گزینه‌های ستون راست را انتخاب کن، بعد جفتش را از ستون چپ.
        </p>
      )}
      {revealed && (
        <div className="mt-3 rounded-2xl bg-surface2 p-3 text-[12px] leading-7">
          <p className="mb-1 font-extrabold text-ink3">پاسخ درست</p>
          {q.left.map((l, i) => <p key={i}>{l} ← {q.right[i]}</p>)}
        </div>
      )}
    </div>
  )
}

/* ---------------- مرتب‌سازی ---------------- */
function Order({ q, answer, onChange, revealed }: SubProps<Extract<Question, { type: 'order' }>>) {
  const chosen = answer.type === 'order' ? answer.value : []
  const pool = useMemo(
    () => shuffle(q.items.map((_, i) => i), q.id.length * 23 + 7),
    [q.id, q.items],
  )
  const remaining = pool.filter((i) => !chosen.includes(i))

  return (
    <div className="space-y-3">
      <div className="min-h-14 space-y-2 rounded-2xl border border-dashed border-line p-2">
        {chosen.length === 0 && (
          <p className="py-2 text-center text-[11px] text-ink3">به ترتیب درست انتخاب کن</p>
        )}
        {chosen.map((idx, pos) => {
          const right = revealed && idx === pos
          return (
            <div
              key={idx}
              className={cx(
                'flex items-center gap-2 rounded-xl border p-2.5 text-[12.5px] leading-6',
                revealed ? (right ? 'border-emerald-500 bg-emerald-500/10' : 'border-rose-500 bg-rose-500/10')
                  : 'border-accent/40 bg-accentsoft',
              )}
            >
              <span className="grid size-5 shrink-0 place-items-center rounded-md bg-accent text-[10px] font-bold text-white">
                {fa(pos + 1)}
              </span>
              <span className="flex-1">{q.items[idx]}</span>
            </div>
          )
        })}
      </div>

      {!revealed && (
        <>
          <div className="flex flex-wrap gap-2">
            {remaining.map((i) => (
              <button
                key={i}
                onClick={() => onChange({ type: 'order', value: [...chosen, i] })}
                className="press rounded-xl border border-line bg-surface px-3 py-2 text-[12.5px]"
              >
                {q.items[i]}
              </button>
            ))}
          </div>
          {chosen.length > 0 && (
            <button
              onClick={() => onChange({ type: 'order', value: [] })}
              className="flex items-center gap-1 text-[11px] font-bold text-ink3"
            >
              <RotateCcw size={12} /> از نو
            </button>
          )}
        </>
      )}

      {revealed && (
        <div className="rounded-2xl bg-surface2 p-3 text-[12px] leading-7">
          <p className="mb-1 font-extrabold text-ink3">ترتیب درست</p>
          {q.items.map((t, i) => <p key={i}>{fa(i + 1)}. {t}</p>)}
        </div>
      )}
    </div>
  )
}
