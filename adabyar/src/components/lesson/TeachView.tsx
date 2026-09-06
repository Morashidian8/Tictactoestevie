import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BookMarked, ChevronDown, Eye, EyeOff, Feather, GraduationCap, Layers,
  Lightbulb, ListChecks, Pause, Play, Sparkles, Type, User,
} from 'lucide-react'
import type { Lesson, TextBlock } from '@/content/types'
import { Button, Card, Chip, SectionTitle, cx } from '@/components/ui'
import { useSettings } from '@/store/settings'
import { useProgress } from '@/store/progress'
import { useSrs } from '@/store/srs'
import { fa } from '@/lib/format'
import { speak, stopSpeaking, ttsAvailable } from '@/lib/tts'

export default function TeachView({ lesson }: { lesson: Lesson }) {
  const { readerScale, nastaliq, autoMeaning } = useSettings()
  const { markRead, addXp } = useProgress()
  const addCards = useSrs((s) => s.addMany)
  const containerRef = useRef<HTMLDivElement>(null)
  const rewarded = useRef(false)

  // ثبت درصد مطالعه بر پایهٔ اسکرول
  useEffect(() => {
    const onScroll = () => {
      const el = containerRef.current
      if (!el) return
      const total = el.scrollHeight - window.innerHeight
      const pct = total <= 0 ? 100 : Math.min(100, Math.round(((window.scrollY - el.offsetTop) / total) * 100))
      if (pct > 5) markRead(lesson.id, pct)
      if (pct >= 85 && !rewarded.current) {
        rewarded.current = true
        addXp(20)
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [lesson.id, markRead, addXp])

  // ساخت فلش‌کارت از واژه‌نامه و آرایه‌ها
  const buildCards = () => {
    addCards([
      ...lesson.teach.glossary.map((g, i) => ({
        id: `${lesson.id}-w${i}`, lessonId: lesson.id,
        front: g.word, back: g.meaning, kind: 'واژه' as const,
      })),
      ...lesson.teach.devices.map((d, i) => ({
        id: `${lesson.id}-d${i}`, lessonId: lesson.id,
        front: d.example, back: `${d.name} — ${d.explain}`, kind: 'آرایه' as const,
      })),
    ])
    addXp(5)
  }

  return (
    <div
      ref={containerRef}
      className={cx('space-y-6', nastaliq && 'font-nastaliq-on')}
      style={{ ['--reader-scale' as string]: readerScale }}
    >
      {/* درآمد */}
      <Card className="grade-ring relative overflow-hidden">
        <span className="grade-grad absolute inset-x-0 top-0 h-1" />
        <div className="mb-2 flex items-center gap-2">
          <Feather size={16} className="text-accent" />
          <p className="text-[13px] font-extrabold">درآمد</p>
          <Chip className="ms-auto">{fa(lesson.minutes)} دقیقه</Chip>
        </div>
        <p className="reader-text text-ink2">{lesson.teach.intro}</p>
      </Card>

      {/* هدف‌ها */}
      {lesson.teach.goals.length > 0 && (
        <Card>
          <div className="mb-2.5 flex items-center gap-2">
            <ListChecks size={16} className="text-accent" />
            <p className="text-[13px] font-extrabold">در پایان این درس می‌توانی…</p>
          </div>
          <ul className="space-y-2">
            {lesson.teach.goals.map((g, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-7 text-ink2">
                <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" />
                {g}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* زندگی‌نامه */}
      {lesson.teach.author && <AuthorCard author={lesson.teach.author} />}

      {/* متن درس */}
      <div>
        <SectionTitle>متن درس همراه با معنی</SectionTitle>
        <div className="space-y-4">
          {lesson.teach.body.map((b, i) => <Block key={i} block={b} autoMeaning={autoMeaning} />)}
        </div>
      </div>

      {/* واژه‌نامه */}
      {lesson.teach.glossary.length > 0 && (
        <Accordion icon={<BookMarked size={16} />} title="واژه‌نامه" count={lesson.teach.glossary.length} defaultOpen>
          <div className="divide-y divide-line">
            {lesson.teach.glossary.map((g, i) => (
              <div key={i} className="flex gap-3 py-2.5">
                <span className="min-w-24 shrink-0 text-[13px] font-extrabold">{g.word}</span>
                <span className="text-[13px] leading-7 text-ink2">
                  {g.meaning}
                  {g.extra && <span className="mt-0.5 block text-[11px] text-ink3">{g.extra}</span>}
                </span>
              </div>
            ))}
          </div>
        </Accordion>
      )}

      {/* آرایه‌ها */}
      {lesson.teach.devices.length > 0 && (
        <Accordion icon={<Sparkles size={16} />} title="آرایه‌های ادبی" count={lesson.teach.devices.length}>
          <div className="space-y-3">
            {lesson.teach.devices.map((d, i) => (
              <div key={i} className="rounded-2xl bg-surface2 p-3">
                <Chip tone="gold">{d.name}</Chip>
                <p className="reader-verse mt-2 font-semibold">«{d.example}»</p>
                <p className="mt-1.5 text-[12.5px] leading-7 text-ink2">{d.explain}</p>
              </div>
            ))}
          </div>
        </Accordion>
      )}

      {/* دستور زبان */}
      {lesson.teach.grammar.length > 0 && (
        <Accordion icon={<Type size={16} />} title="دانش زبانی (دستور)" count={lesson.teach.grammar.length}>
          <div className="space-y-3">
            {lesson.teach.grammar.map((p, i) => (
              <div key={i} className="rounded-2xl border border-line p-3">
                <p className="text-[13px] font-extrabold">{p.title}</p>
                <p className="mt-1.5 text-[13px] leading-7 text-ink2">{p.body}</p>
                {p.examples && (
                  <ul className="mt-2 space-y-1">
                    {p.examples.map((e, j) => (
                      <li key={j} className="rounded-lg bg-surface2 px-2.5 py-1.5 text-[12px] leading-6">{e}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Accordion>
      )}

      {/* دانش ادبی */}
      {lesson.teach.literary && lesson.teach.literary.length > 0 && (
        <Accordion icon={<GraduationCap size={16} />} title="دانش ادبی" count={lesson.teach.literary.length}>
          <div className="space-y-3">
            {lesson.teach.literary.map((p, i) => (
              <div key={i} className="rounded-2xl border border-line p-3">
                <p className="text-[13px] font-extrabold">{p.title}</p>
                <p className="mt-1.5 text-[13px] leading-7 text-ink2">{p.body}</p>
                {p.examples && (
                  <ul className="mt-2 space-y-1">
                    {p.examples.map((e, j) => (
                      <li key={j} className="rounded-lg bg-surface2 px-2.5 py-1.5 text-[12px] leading-6">{e}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Accordion>
      )}

      {/* خلاصهٔ شب امتحان */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <div className="mb-2.5 flex items-center gap-2">
          <Lightbulb size={16} className="text-gold" />
          <p className="text-[13px] font-extrabold text-gold">خلاصهٔ شب امتحان</p>
        </div>
        <ul className="space-y-2">
          {lesson.teach.summary.map((s, i) => (
            <li key={i} className="flex gap-2 text-[13px] leading-7">
              <span className="font-extrabold text-gold">{fa(i + 1)}.</span>
              <span className="text-ink2">{s}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Button variant="soft" full icon={<Layers size={17} />} onClick={buildCards}>
        افزودن واژه‌ها و آرایه‌های این درس به جعبهٔ مرور
      </Button>
    </div>
  )
}

/* ---------------- بلوک‌های متن ---------------- */
function Block({ block, autoMeaning }: { block: TextBlock; autoMeaning: boolean }) {
  if (block.kind === 'heading') {
    return (
      <p className="pt-2 text-center text-[15px] font-extrabold text-accent">{block.text}</p>
    )
  }

  if (block.kind === 'note') {
    return (
      <Card className="border-dashed">
        <p className="text-[12px] font-extrabold text-ink3">{block.title}</p>
        <p className="mt-1.5 reader-text text-ink2">{block.text}</p>
      </Card>
    )
  }

  if (block.kind === 'verse') {
    return (
      <div className="space-y-3">
        {block.verses.map((v) => (
          <VerseCard key={v.n} n={v.n} a={v.a} b={v.b} meaning={v.meaning} note={v.note} autoMeaning={autoMeaning} />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {block.paragraphs.map((p) => (
        <ProseCard key={p.n} n={p.n} text={p.text} meaning={p.meaning} note={p.note} autoMeaning={autoMeaning} />
      ))}
    </div>
  )
}

function VerseCard({ n, a, b, meaning, note, autoMeaning }: {
  n: number; a: string; b: string; meaning: string; note?: string; autoMeaning: boolean
}) {
  const [open, setOpen] = useState(autoMeaning)
  const [playing, setPlaying] = useState(false)
  useEffect(() => setOpen(autoMeaning), [autoMeaning])

  const toggleSpeak = () => {
    if (playing) { stopSpeaking(); setPlaying(false); return }
    setPlaying(true)
    speak(`${a}. ${b}`, () => setPlaying(false))
  }

  return (
    <Card className="relative overflow-hidden">
      <span className="grade-grad absolute inset-y-0 start-0 w-1 opacity-70" />
      <div className="flex items-start gap-3 ps-1.5">
        <span className="mt-1 grid size-6 shrink-0 place-items-center rounded-lg bg-surface2 text-[10px] font-extrabold text-ink3">
          {fa(n)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="reader-verse grid gap-x-4 gap-y-1 sm:grid-cols-2">
            <p className="font-semibold">{a}</p>
            <p className="font-semibold sm:text-left">{b}</p>
          </div>

          <div className="mt-2.5 flex items-center gap-2">
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-1 rounded-lg bg-surface2 px-2 py-1 text-[11px] font-bold text-ink2"
            >
              {open ? <EyeOff size={12} /> : <Eye size={12} />}
              {open ? 'پنهان‌کردن معنی' : 'نمایش معنی'}
            </button>
            {ttsAvailable() && (
              <button
                onClick={toggleSpeak}
                className="flex items-center gap-1 rounded-lg bg-surface2 px-2 py-1 text-[11px] font-bold text-ink2"
              >
                {playing ? <Pause size={12} /> : <Play size={12} />} خوانش
              </button>
            )}
          </div>

          {open && (
            <motion.div
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              className="mt-2.5 rounded-2xl bg-accentsoft/60 p-3"
            >
              <p className="reader-text text-ink">{meaning}</p>
              {note && (
                <p className="mt-2 border-t border-line pt-2 text-[12px] leading-7 text-ink2">
                  <span className="font-extrabold text-accent">نکته: </span>{note}
                </p>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </Card>
  )
}

function ProseCard({ n, text, meaning, note, autoMeaning }: {
  n: number; text: string; meaning: string; note?: string; autoMeaning: boolean
}) {
  const [open, setOpen] = useState(autoMeaning)
  useEffect(() => setOpen(autoMeaning), [autoMeaning])

  return (
    <Card className="relative overflow-hidden">
      <span className="grade-grad absolute inset-y-0 start-0 w-1 opacity-70" />
      <div className="flex items-start gap-3 ps-1.5">
        <span className="mt-1 grid size-6 shrink-0 place-items-center rounded-lg bg-surface2 text-[10px] font-extrabold text-ink3">
          {fa(n)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="reader-text font-semibold">{text}</p>
          <button
            onClick={() => setOpen((v) => !v)}
            className="mt-2.5 flex items-center gap-1 rounded-lg bg-surface2 px-2 py-1 text-[11px] font-bold text-ink2"
          >
            {open ? <EyeOff size={12} /> : <Eye size={12} />}
            {open ? 'پنهان‌کردن معنی' : 'نمایش معنی'}
          </button>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              className="mt-2.5 rounded-2xl bg-accentsoft/60 p-3"
            >
              <p className="reader-text text-ink">{meaning}</p>
              {note && (
                <p className="mt-2 border-t border-line pt-2 text-[12px] leading-7 text-ink2">
                  <span className="font-extrabold text-accent">نکته: </span>{note}
                </p>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </Card>
  )
}

function AuthorCard({ author }: { author: NonNullable<Lesson['teach']['author']> }) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accentsoft text-accent">
          <User size={19} />
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-extrabold">{author.name}</p>
          {(author.fullName || author.years) && (
            <p className="mt-0.5 text-[11px] text-ink3">
              {[author.fullName, author.years].filter(Boolean).join(' • ')}
            </p>
          )}
          <p className="mt-2 text-[13px] leading-7 text-ink2">{author.bio}</p>
          {author.works && author.works.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {author.works.map((w) => <Chip key={w} tone="accent">{w}</Chip>)}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function Accordion({ icon, title, count, children, defaultOpen }: {
  icon: React.ReactNode; title: string; count?: number
  children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 p-4 text-right"
      >
        <span className="text-accent">{icon}</span>
        <span className="flex-1 text-[13.5px] font-extrabold">{title}</span>
        {count !== undefined && <Chip>{fa(count)}</Chip>}
        <ChevronDown size={17} className={cx('text-ink3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
          className="border-t border-line px-4 pb-4 pt-3"
        >
          {children}
        </motion.div>
      )}
    </div>
  )
}
