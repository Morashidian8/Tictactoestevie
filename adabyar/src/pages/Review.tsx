import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Layers, RotateCcw, Sparkles, X } from 'lucide-react'
import { Button, Card, Chip, Empty, Progress, cx } from '@/components/ui'
import { BOX_INTERVALS, dueCards, useSrs } from '@/store/srs'
import { useProgress } from '@/store/progress'
import { metaOf } from '@/content/registry'
import { fa } from '@/lib/format'

export default function Review() {
  const { cards, answer } = useSrs()
  const addXp = useProgress((s) => s.addXp)
  const due = useMemo(() => dueCards(cards), [cards])
  const [i, setI] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [session, setSession] = useState({ ok: 0, bad: 0 })

  const total = Object.keys(cards).length
  const card = due[i]

  const respond = (ok: boolean) => {
    if (!card) return
    answer(card.id, ok)
    addXp(ok ? 6 : 2)
    setSession((s) => ({ ok: s.ok + (ok ? 1 : 0), bad: s.bad + (ok ? 0 : 1) }))
    setFlipped(false)
    setI((v) => v + 1)
  }

  if (total === 0) {
    return (
      <div className="px-4 pt-6">
        <Header total={0} due={0} />
        <Empty
          icon={<Layers size={26} />}
          title="جعبهٔ مرورت خالی است"
          hint="در پایان بخش «تدریس» هر درس، دکمهٔ «افزودن به جعبهٔ مرور» را بزن تا واژه‌ها و آرایه‌ها اینجا بیایند."
        />
      </div>
    )
  }

  if (!card) {
    return (
      <div className="px-4 pt-6">
        <Header total={total} due={0} />
        <Card className="mt-4 border-emerald-500/30 bg-emerald-500/5 text-center">
          <Sparkles size={26} className="mx-auto text-emerald-500" />
          <p className="mt-2 text-[15px] font-extrabold">مرور امروز تمام شد!</p>
          {session.ok + session.bad > 0 && (
            <p className="mt-1.5 text-[12px] text-ink3">
              {fa(session.ok)} درست • {fa(session.bad)} نیاز به تکرار
            </p>
          )}
          <p className="mt-3 text-[12px] leading-7 text-ink2">
            کارت‌ها بر پایهٔ جعبهٔ لایتنر زمان‌بندی شده‌اند؛ فردا دوباره سر بزن.
          </p>
        </Card>
        <BoxStats />
      </div>
    )
  }

  const meta = metaOf(card.lessonId)

  return (
    <div className="px-4 pt-6">
      <Header total={total} due={due.length} />
      <Progress value={(i / due.length) * 100} className="mt-4" />

      <motion.div
        key={card.id}
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="mt-5"
      >
        <button
          onClick={() => setFlipped((v) => !v)}
          className="card grid min-h-64 w-full place-items-center p-7 text-center"
        >
          <div>
            <Chip tone="accent">{card.kind}</Chip>
            <p className={cx('mt-4 leading-9', flipped ? 'text-[15px] text-ink2' : 'text-xl font-extrabold')}>
              {card.front}
            </p>
            {flipped && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <div className="my-4 h-px bg-line" />
                <p className="text-[15px] leading-8 font-bold">{card.back}</p>
              </motion.div>
            )}
            {!flipped && <p className="mt-6 text-[11px] text-ink3">برای دیدن پاسخ ضربه بزن</p>}
            {meta && <p className="mt-4 text-[10px] text-ink3">{meta.title} — پایهٔ {fa(meta.grade)}</p>}
          </div>
        </button>
      </motion.div>

      {flipped ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button variant="outline" size="lg" icon={<X size={18} />} onClick={() => respond(false)}>
            بلد نبودم
          </Button>
          <Button size="lg" icon={<Check size={18} />} onClick={() => respond(true)}>
            بلد بودم
          </Button>
        </div>
      ) : (
        <Button full size="lg" className="mt-4" onClick={() => setFlipped(true)}>
          نمایش پاسخ
        </Button>
      )}

      <p className="mt-4 text-center text-[11px] text-ink3">
        خانهٔ فعلی: {fa(card.box + 1)} از {fa(BOX_INTERVALS.length)} — مرور بعدی پس از {fa(BOX_INTERVALS[Math.min(card.box + 1, BOX_INTERVALS.length - 1)])} روز
      </p>
    </div>
  )
}

function Header({ total, due }: { total: number; due: number }) {
  return (
    <header className="flex items-end justify-between">
      <div>
        <h1 className="text-xl font-extrabold">مرور فاصله‌دار</h1>
        <p className="mt-1 text-[12px] text-ink3">جعبهٔ لایتنر — آنچه امروز باید تکرار کنی</p>
      </div>
      <div className="text-left">
        <p className="text-lg font-extrabold text-accent">{fa(due)}</p>
        <p className="text-[10px] text-ink3">از {fa(total)} کارت</p>
      </div>
    </header>
  )
}

function BoxStats() {
  const cards = useSrs((s) => s.cards)
  const reset = useSrs((s) => s.reset)
  const counts = BOX_INTERVALS.map((_, b) => Object.values(cards).filter((c) => c.box === b).length)
  const max = Math.max(1, ...counts)

  return (
    <Card className="mt-4">
      <p className="mb-3 text-[13px] font-extrabold">وضعیت جعبه‌ها</p>
      <div className="flex items-end gap-2">
        {counts.map((c, b) => (
          <div key={b} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="text-[11px] font-bold text-ink2">{fa(c)}</span>
            <div className="w-full overflow-hidden rounded-t-lg bg-surface2" style={{ height: 72 }}>
              <div
                className="grade-grad mt-auto h-full origin-bottom rounded-t-lg bg-accent"
                style={{ height: `${(c / max) * 100}%`, marginTop: `${100 - (c / max) * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-ink3">خانهٔ {fa(b + 1)}</span>
          </div>
        ))}
      </div>
      <Button variant="ghost" size="sm" className="mt-3" icon={<RotateCcw size={13} />} onClick={reset}>
        پاک‌کردن همهٔ کارت‌ها
      </Button>
    </Card>
  )
}
