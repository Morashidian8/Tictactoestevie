import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Clock, Send, Shuffle, Timer } from 'lucide-react'
import type { Lesson, Question, QTopic } from '@/content/types'
import QuestionView, { emptyAnswer, scoreOf, type Answer } from '@/components/Question'
import { Button, Card, Chip, Empty, Progress, Ring, cx } from '@/components/ui'
import { allReadyMeta, loadLesson } from '@/content/registry'
import { useSettings } from '@/store/settings'
import { useProgress } from '@/store/progress'
import { fa, gradeName, mmss } from '@/lib/format'
import { shuffle } from '@/lib/text'

const TOPICS: QTopic[] = ['واژگان', 'معنی و مفهوم', 'آرایه‌های ادبی', 'دستور زبان', 'املا و نگارش', 'دانش ادبی', 'درک مطلب']
const SIZES = [10, 20, 30]

export default function ExamBuilder() {
  const nav = useNavigate()
  const myGrade = useSettings((s) => s.grade) ?? 7
  const addXp = useProgress((s) => s.addXp)
  const all = useMemo(() => allReadyMeta(), [])
  const gradeLessons = all.filter((m) => m.grade === myGrade)

  const [picked, setPicked] = useState<string[]>(gradeLessons.slice(0, 3).map((m) => m.id))
  const [topics, setTopics] = useState<QTopic[]>([])
  const [size, setSize] = useState(20)
  const [phase, setPhase] = useState<'setup' | 'running' | 'result'>('setup')
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [i, setI] = useState(0)
  const [left, setLeft] = useState(0)
  const [busy, setBusy] = useState(false)

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  async function start() {
    setBusy(true)
    const loaded = (await Promise.all(picked.map((id) => loadLesson(id)))).filter(Boolean) as Lesson[]
    let pool: Question[] = loaded.flatMap((l) => [...l.practice, ...l.exam.questions])
    if (topics.length) pool = pool.filter((q) => topics.includes(q.topic))
    const chosen = shuffle(pool, Date.now() % 9973).slice(0, size)
    setQuestions(chosen)
    setLeft(chosen.length * 60)
    setAnswers({})
    setI(0)
    setBusy(false)
    setPhase(chosen.length ? 'running' : 'setup')
  }

  // زمان‌سنج
  useEffect(() => {
    if (phase !== 'running') return
    const t = setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          clearInterval(t)
          setPhase('result')
          return 0
        }
        return v - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [phase])

  const totalPoints = questions.reduce((s, q) => s + (q.points ?? 1), 0)
  const got = questions.reduce((s, q) => s + scoreOf(q, answers[q.id] ?? emptyAnswer(q)) * (q.points ?? 1), 0)

  /* ---------- تنظیم ---------- */
  if (phase === 'setup') {
    return (
      <div className="px-4 pt-6">
        <header className="mb-5 flex items-center gap-3">
          <button onClick={() => nav(-1)} className="press grid size-10 place-items-center rounded-2xl border border-line bg-surface">
            <ArrowRight size={18} />
          </button>
          <div>
            <h1 className="text-lg font-extrabold">آزمون‌ساز</h1>
            <p className="text-[11px] text-ink3">آزمون دلخواه از چند درس بساز — مثل نوبت اول و دوم</p>
          </div>
        </header>

        {gradeLessons.length === 0 ? (
          <Empty title="هنوز درسی برای این پایه آماده نیست"
            hint="از کتابخانه پایهٔ دیگری را انتخاب کن." />
        ) : (
          <>
            <p className="mb-2 text-[13px] font-extrabold">درس‌ها ({gradeName(myGrade)})</p>
            <div className="mb-5 space-y-2">
              {gradeLessons.map((m) => (
                <button
                  key={m.id}
                  onClick={() => toggle(m.id)}
                  className={cx(
                    'press flex w-full items-center gap-3 rounded-2xl border p-3 text-right',
                    picked.includes(m.id) ? 'border-accent bg-accentsoft' : 'border-line bg-surface',
                  )}
                >
                  <span className={cx(
                    'grid size-6 shrink-0 place-items-center rounded-lg text-[11px] font-extrabold',
                    picked.includes(m.id) ? 'bg-accent text-white' : 'bg-surface2 text-ink3',
                  )}>
                    {picked.includes(m.id) ? '✓' : fa(m.number)}
                  </span>
                  <span className="flex-1 truncate text-[13px] font-bold">{m.title}</span>
                </button>
              ))}
            </div>

            <p className="mb-2 text-[13px] font-extrabold">مبحث‌ها <span className="font-normal text-ink3">(خالی = همه)</span></p>
            <div className="mb-5 flex flex-wrap gap-2">
              {TOPICS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTopics((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))}
                  className={cx(
                    'press rounded-full border px-3 py-1.5 text-[12px] font-bold',
                    topics.includes(t) ? 'border-transparent bg-accent text-white' : 'border-line bg-surface text-ink2',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            <p className="mb-2 text-[13px] font-extrabold">تعداد سؤال</p>
            <div className="mb-6 grid grid-cols-3 gap-2">
              {SIZES.map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={cx(
                    'press rounded-2xl border py-3 text-sm font-extrabold',
                    size === s ? 'border-accent bg-accentsoft text-accent' : 'border-line bg-surface text-ink2',
                  )}
                >
                  {fa(s)}
                </button>
              ))}
            </div>

            <Button
              size="lg" full disabled={picked.length === 0 || busy}
              icon={<Shuffle size={18} />} onClick={start}
            >
              {busy ? 'در حال ساخت…' : 'ساخت آزمون'}
            </Button>
          </>
        )}
      </div>
    )
  }

  /* ---------- کارنامه ---------- */
  if (phase === 'result') {
    const pct = totalPoints ? Math.round((got / totalPoints) * 100) : 0
    return (
      <div className="px-4 pt-6">
        <Card className="text-center">
          <Ring value={pct} size={120} stroke={10}>
            <div>
              <p className="text-2xl font-extrabold">{fa(Math.round(pct / 5 * 10) / 10)}</p>
              <p className="text-[10px] text-ink3">از ۲۰</p>
            </div>
          </Ring>
          <p className="mt-3 text-[14px] font-extrabold">
            {fa(Math.round(got * 10) / 10)} از {fa(totalPoints)} نمره
          </p>
        </Card>

        <p className="mt-5 mb-3 text-[13px] font-extrabold">پاسخ‌نامهٔ تشریحی</p>
        <div className="space-y-3">
          {questions.map((q, idx) => (
            <QuestionView key={q.id} q={q} index={idx}
              answer={answers[q.id] ?? emptyAnswer(q)} revealed onChange={() => {}} />
          ))}
        </div>

        <Button variant="outline" full className="mt-5" onClick={() => setPhase('setup')}>
          آزمون جدید
        </Button>
      </div>
    )
  }

  /* ---------- در حال آزمون ---------- */
  const q = questions[i]
  return (
    <div className="px-4 pt-6">
      <Card className="py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[12px] font-bold">
            <Timer size={14} /> سؤال {fa(i + 1)} از {fa(questions.length)}
          </span>
          <span className={cx('flex items-center gap-1 rounded-xl px-2.5 py-1 text-[12px] font-extrabold',
            left < 60 ? 'bg-rose-500/15 text-rose-500' : 'bg-surface2 text-ink2')}>
            <Clock size={13} /> {mmss(left)}
          </span>
        </div>
        <Progress value={(i / questions.length) * 100} />
      </Card>

      <div className="mt-4">
        <QuestionView
          q={q} index={i} answer={answers[q.id] ?? emptyAnswer(q)} revealed={false}
          onChange={(a) => setAnswers((m) => ({ ...m, [q.id]: a }))}
        />
      </div>

      <div className="mt-4 flex gap-2">
        <Button variant="outline" disabled={i === 0} onClick={() => setI((v) => v - 1)}>قبلی</Button>
        {i < questions.length - 1 ? (
          <Button full onClick={() => setI((v) => v + 1)}>بعدی</Button>
        ) : (
          <Button full icon={<Send size={16} />} onClick={() => { setPhase('result'); addXp(25) }}>
            تحویل آزمون
          </Button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 pb-6">
        {questions.map((x, idx) => (
          <button
            key={x.id} onClick={() => setI(idx)}
            className={cx('size-8 rounded-xl text-[11px] font-extrabold',
              idx === i && 'ring-2 ring-accent',
              answers[x.id] ? 'bg-accentsoft text-accent' : 'bg-surface2 text-ink3')}
          >
            {fa(idx + 1)}
          </button>
        ))}
      </div>
      <Chip className="mb-4">مبحث‌ها: {topics.length ? topics.join('، ') : 'همه'}</Chip>
    </div>
  )
}
