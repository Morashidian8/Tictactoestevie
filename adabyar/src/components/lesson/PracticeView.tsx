import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, ChevronLeft, RotateCcw, Sparkles } from 'lucide-react'
import type { Lesson } from '@/content/types'
import QuestionView, { emptyAnswer, isAnswered, scoreOf, type Answer } from '@/components/Question'
import { Button, Card, Empty, Progress } from '@/components/ui'
import { useProgress } from '@/store/progress'
import { fa } from '@/lib/format'

export default function PracticeView({ lesson }: { lesson: Lesson }) {
  const qs = lesson.practice
  const [i, setI] = useState(0)
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const { markPractice, addXp } = useProgress()

  const q = qs[i]
  const a = q ? (answers[q.id] ?? emptyAnswer(q)) : null
  const shown = q ? !!revealed[q.id] : false

  const done = Object.keys(revealed).length
  const score = useMemo(
    () => qs.reduce((s, x) => s + (revealed[x.id] ? scoreOf(x, answers[x.id] ?? emptyAnswer(x)) : 0), 0),
    [qs, answers, revealed],
  )

  if (qs.length === 0) {
    return <Empty title="تمرینی برای این درس ثبت نشده" hint="به‌زودی اضافه می‌شود." />
  }

  const check = () => {
    if (!q || !a) return
    setRevealed((r) => ({ ...r, [q.id]: true }))
    const s = scoreOf(q, a)
    addXp(s >= 1 ? 10 : s > 0 ? 5 : 2)
    const nextDone = done + 1
    markPractice(lesson.id, Math.round(((score + s) / qs.length) * 100))
    if (nextDone === qs.length) addXp(15)
  }

  const finished = done === qs.length

  return (
    <div className="space-y-4">
      {/* نوار پیشرفت */}
      <Card className="py-3">
        <div className="mb-2 flex items-center justify-between text-[12px]">
          <span className="font-bold">تمرین {fa(i + 1)} از {fa(qs.length)}</span>
          <span className="text-ink3">امتیاز {fa(Math.round(score * 10) / 10)} از {fa(qs.length)}</span>
        </div>
        <Progress value={(done / qs.length) * 100} tone="grade" />
      </Card>

      {q && a && (
        <motion.div key={q.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          <QuestionView
            q={q} index={i} answer={a} revealed={shown}
            onChange={(next) => setAnswers((m) => ({ ...m, [q.id]: next }))}
          />
        </motion.div>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline" size="md" disabled={i === 0}
          onClick={() => setI((v) => Math.max(0, v - 1))}
        >
          قبلی
        </Button>
        {!shown ? (
          <Button full disabled={!a || !isAnswered(a)} onClick={check}>
            بررسی پاسخ
          </Button>
        ) : i < qs.length - 1 ? (
          <Button full icon={<ChevronLeft size={17} />} onClick={() => setI((v) => v + 1)}>
            تمرین بعدی
          </Button>
        ) : (
          <Button full variant="soft" icon={<CheckCircle2 size={17} />} disabled>
            تمرین‌ها تمام شد
          </Button>
        )}
      </div>

      {/* نقشهٔ سؤال‌ها */}
      <div className="flex flex-wrap gap-2 pt-1">
        {qs.map((x, idx) => {
          const st = revealed[x.id] ? (scoreOf(x, answers[x.id] ?? emptyAnswer(x)) >= 1 ? 'ok' : 'bad') : 'idle'
          return (
            <button
              key={x.id}
              onClick={() => setI(idx)}
              className={
                'size-8 rounded-xl text-[11px] font-extrabold transition ' +
                (idx === i ? 'ring-2 ring-accent ' : '') +
                (st === 'ok' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : st === 'bad' ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                    : 'bg-surface2 text-ink3')
              }
            >
              {fa(idx + 1)}
            </button>
          )
        })}
      </div>

      {finished && (
        <Card className="border-emerald-500/30 bg-emerald-500/5 text-center">
          <Sparkles size={22} className="mx-auto text-emerald-500" />
          <p className="mt-2 text-[14px] font-extrabold">
            آفرین! {fa(Math.round((score / qs.length) * 100))}٪ درست پاسخ دادی
          </p>
          <p className="mt-1 text-[12px] text-ink3">حالا وقت آزمون این درس است.</p>
          <Button
            variant="outline" size="sm" className="mt-3" icon={<RotateCcw size={14} />}
            onClick={() => { setAnswers({}); setRevealed({}); setI(0) }}
          >
            تکرار تمرین‌ها
          </Button>
        </Card>
      )}
    </div>
  )
}
