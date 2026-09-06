import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Award, Clock, Play, RotateCcw, Send, TriangleAlert } from 'lucide-react'
import type { Lesson, QTopic } from '@/content/types'
import QuestionView, { emptyAnswer, isAnswered, scoreOf, type Answer } from '@/components/Question'
import { Button, Card, Chip, Empty, Progress, Ring } from '@/components/ui'
import { useProgress } from '@/store/progress'
import { fa, mmss } from '@/lib/format'

type Phase = 'intro' | 'running' | 'result'

export default function ExamView({ lesson }: { lesson: Lesson }) {
  const paper = lesson.exam
  const qs = paper.questions
  const [phase, setPhase] = useState<Phase>('intro')
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [i, setI] = useState(0)
  const [left, setLeft] = useState(paper.minutes * 60)
  const started = useRef(0)
  const { saveExam, addXp, award } = useProgress()

  useEffect(() => {
    if (phase !== 'running') return
    const t = setInterval(() => {
      setLeft((v) => {
        if (v <= 1) { clearInterval(t); finish(); return 0 }
        return v - 1
      })
    }, 1000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const totalPoints = useMemo(() => qs.reduce((s, q) => s + (q.points ?? 1), 0), [qs])

  const result = useMemo(() => {
    let got = 0
    const weak: QTopic[] = []
    for (const q of qs) {
      const a = answers[q.id] ?? emptyAnswer(q)
      const s = scoreOf(q, a)
      got += s * (q.points ?? 1)
      if (s < 1 && !weak.includes(q.topic)) weak.push(q.topic)
    }
    return { got, weak }
  }, [qs, answers])

  function finish() {
    const seconds = Math.round((Date.now() - started.current) / 1000)
    setPhase('result')
    const pct = totalPoints ? (result.got / totalPoints) * 100 : 0
    saveExam({
      lessonId: lesson.id, score: result.got, total: totalPoints,
      at: Date.now(), seconds, weakTopics: result.weak,
    })
    addXp(Math.round(pct / 2) + 10)
    if (pct === 100) award('آزمون بی‌نقص')
    if (pct >= paper.passScore) award('قبولی در آزمون درس')
  }

  if (qs.length === 0) {
    return <Empty title="آزمونی برای این درس ثبت نشده" hint="به‌زودی اضافه می‌شود." />
  }

  /* ---------- معرفی ---------- */
  if (phase === 'intro') {
    return (
      <Card className="text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-3xl bg-accentsoft text-accent">
          <Award size={28} />
        </div>
        <p className="mt-4 text-[16px] font-extrabold">آزمون {lesson.title}</p>
        <p className="mt-2 text-[13px] leading-7 text-ink2">
          {fa(qs.length)} سؤال — {fa(paper.minutes)} دقیقه — نمرهٔ قبولی {fa(paper.passScore)} از ۱۰۰
        </p>
        <div className="my-5 flex flex-wrap justify-center gap-2">
          {[...new Set(qs.map((q) => q.topic))].map((t) => <Chip key={t}>{t}</Chip>)}
        </div>
        <p className="mb-5 rounded-2xl bg-surface2 p-3 text-[12px] leading-7 text-ink2">
          بعد از شروع، زمان‌سنج فعال می‌شود. می‌توانی بین سؤال‌ها جابه‌جا شوی و در پایان «تحویل آزمون» را بزنی.
        </p>
        <Button
          size="lg" full icon={<Play size={18} />}
          onClick={() => { started.current = Date.now(); setPhase('running') }}
        >
          شروع آزمون
        </Button>
      </Card>
    )
  }

  /* ---------- کارنامه ---------- */
  if (phase === 'result') {
    const pct = totalPoints ? Math.round((result.got / totalPoints) * 100) : 0
    const passed = pct >= paper.passScore
    const mark = Math.round((pct / 5)) / 2 // نمره از ۲۰

    return (
      <div className="space-y-4">
        <Card className="text-center">
          <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <Ring value={pct} size={120} stroke={10}>
              <div>
                <p className="text-2xl font-extrabold">{fa(mark)}</p>
                <p className="text-[10px] text-ink3">از ۲۰</p>
              </div>
            </Ring>
          </motion.div>
          <p className={`mt-3 text-[15px] font-extrabold ${passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {passed ? 'قبول شدی! 🎉' : 'نیاز به مرور بیشتر داری'}
          </p>
          <p className="mt-1 text-[12px] text-ink3">
            {fa(pct)}٪ پاسخ درست — {fa(Math.round(result.got * 10) / 10)} از {fa(totalPoints)} نمره
          </p>
        </Card>

        {result.weak.length > 0 && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <p className="mb-2 flex items-center gap-2 text-[13px] font-extrabold text-gold">
              <TriangleAlert size={16} /> این بخش‌ها را دوباره مرور کن
            </p>
            <div className="flex flex-wrap gap-2">
              {result.weak.map((t) => <Chip key={t} tone="gold">{t}</Chip>)}
            </div>
          </Card>
        )}

        <p className="pt-1 text-[13px] font-extrabold">پاسخ‌نامهٔ تشریحی</p>
        <div className="space-y-3">
          {qs.map((q, idx) => (
            <QuestionView
              key={q.id} q={q} index={idx}
              answer={answers[q.id] ?? emptyAnswer(q)}
              revealed onChange={() => {}}
            />
          ))}
        </div>

        <Button
          variant="outline" full icon={<RotateCcw size={16} />}
          onClick={() => { setAnswers({}); setI(0); setLeft(paper.minutes * 60); setPhase('intro') }}
        >
          آزمون دوباره
        </Button>
      </div>
    )
  }

  /* ---------- در حال آزمون ---------- */
  const q = qs[i]
  const a = answers[q.id] ?? emptyAnswer(q)
  const answeredCount = qs.filter((x) => isAnswered(answers[x.id] ?? emptyAnswer(x))).length
  const low = left < 60

  return (
    <div className="space-y-4">
      <Card className="sticky top-28 z-20 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12px] font-bold">
            سؤال {fa(i + 1)} از {fa(qs.length)}
          </span>
          <span className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-[12px] font-extrabold ${low ? 'bg-rose-500/15 text-rose-500' : 'bg-surface2 text-ink2'}`}>
            <Clock size={13} /> {mmss(left)}
          </span>
        </div>
        <Progress value={(answeredCount / qs.length) * 100} tone="grade" />
      </Card>

      <motion.div key={q.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}>
        <QuestionView
          q={q} index={i} answer={a} revealed={false}
          onChange={(next) => setAnswers((m) => ({ ...m, [q.id]: next }))}
        />
      </motion.div>

      <div className="flex gap-2">
        <Button variant="outline" disabled={i === 0} onClick={() => setI((v) => v - 1)}>قبلی</Button>
        {i < qs.length - 1 ? (
          <Button full onClick={() => setI((v) => v + 1)}>بعدی</Button>
        ) : (
          <Button full icon={<Send size={16} />} onClick={finish}>تحویل آزمون</Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {qs.map((x, idx) => {
          const done = isAnswered(answers[x.id] ?? emptyAnswer(x))
          return (
            <button
              key={x.id}
              onClick={() => setI(idx)}
              className={
                'size-8 rounded-xl text-[11px] font-extrabold ' +
                (idx === i ? 'ring-2 ring-accent ' : '') +
                (done ? 'bg-accentsoft text-accent' : 'bg-surface2 text-ink3')
              }
            >
              {fa(idx + 1)}
            </button>
          )
        })}
      </div>

      {i === qs.length - 1 && answeredCount < qs.length && (
        <p className="text-center text-[11px] text-ink3">
          {fa(qs.length - answeredCount)} سؤال بی‌پاسخ مانده است.
        </p>
      )}
    </div>
  )
}
