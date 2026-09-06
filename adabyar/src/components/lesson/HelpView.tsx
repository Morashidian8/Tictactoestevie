import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ChevronDown, CircleHelp, Lightbulb, MessageCircleQuestion, Search, TriangleAlert, X,
} from 'lucide-react'
import type { Lesson } from '@/content/types'
import { Card, Chip, Empty, cx } from '@/components/ui'
import { normalizeFa } from '@/lib/text'
import { fa } from '@/lib/format'

export default function HelpView({ lesson }: { lesson: Lesson }) {
  const [query, setQuery] = useState('')
  const help = lesson.help

  const n = normalizeFa(query)
  const faq = n ? help.faq.filter((f) => normalizeFa(f.q + ' ' + f.a).includes(n)) : help.faq

  const empty = help.faq.length === 0 && help.mistakes.length === 0 && help.tips.length === 0
  if (empty) return <Empty title="محتوای رفع اشکال هنوز آماده نیست" hint="به‌زودی اضافه می‌شود." />

  return (
    <div className="space-y-5">
      {/* جست‌وجو در سؤال‌ها */}
      <div className="relative">
        <Search size={16} className="absolute end-4 top-1/2 -translate-y-1/2 text-ink3" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="سؤالت را جست‌وجو کن…"
          className="h-12 w-full rounded-2xl border border-line bg-surface pe-11 ps-4 text-[13px] outline-none focus:border-accent"
        />
        {query && (
          <button onClick={() => setQuery('')} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink3">
            <X size={15} />
          </button>
        )}
      </div>

      {/* سؤال‌های پرتکرار */}
      {help.faq.length > 0 && (
        <section>
          <p className="mb-2.5 flex items-center gap-2 text-[13px] font-extrabold">
            <MessageCircleQuestion size={16} className="text-accent" />
            سؤال‌هایی که همه می‌پرسند
            <Chip className="ms-auto">{fa(faq.length)}</Chip>
          </p>
          {faq.length === 0 ? (
            <Card className="text-center text-[12px] text-ink3">
              چیزی پیدا نشد. عبارت دیگری را امتحان کن.
            </Card>
          ) : (
            <div className="space-y-2.5">
              {faq.map((f, i) => <Faq key={i} q={f.q} a={f.a} />)}
            </div>
          )}
        </section>
      )}

      {/* اشتباهات رایج */}
      {help.mistakes.length > 0 && (
        <section>
          <p className="mb-2.5 flex items-center gap-2 text-[13px] font-extrabold">
            <TriangleAlert size={16} className="text-rose-500" />
            اشتباه‌های رایج
          </p>
          <div className="space-y-2.5">
            {help.mistakes.map((m, i) => (
              <Card key={i}>
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-rose-500/15 text-[11px] font-extrabold text-rose-500">✗</span>
                  <p className="text-[13px] leading-7 text-ink2 line-through decoration-rose-500/50">{m.wrong}</p>
                </div>
                <div className="mt-2 flex items-start gap-2.5">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-emerald-500/15 text-[11px] font-extrabold text-emerald-500">✓</span>
                  <p className="text-[13px] font-semibold leading-7">{m.right}</p>
                </div>
                <p className="mt-2.5 border-t border-line pt-2.5 text-[12px] leading-7 text-ink3">{m.why}</p>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* ترفندها */}
      {help.tips.length > 0 && (
        <section>
          <p className="mb-2.5 flex items-center gap-2 text-[13px] font-extrabold">
            <Lightbulb size={16} className="text-gold" />
            ترفندهای به‌خاطرسپاری
          </p>
          <div className="space-y-2.5">
            {help.tips.map((t, i) => (
              <Card key={i} className="border-amber-500/25 bg-amber-500/5">
                <p className="text-[13px] leading-7">{t}</p>
              </Card>
            ))}
          </div>
        </section>
      )}

      <Card className="border-dashed text-center">
        <CircleHelp size={20} className="mx-auto text-ink3" />
        <p className="mt-2 text-[12.5px] leading-7 text-ink2">
          هنوز جوابت را پیدا نکردی؟ سؤالت را در بخش «من ← پشتیبانی» بفرست تا
          به فهرست رفع اشکال همین درس اضافه شود.
        </p>
      </Card>
    </div>
  )
}

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-2.5 p-3.5 text-right">
        <span className="mt-0.5 shrink-0 text-accent">؟</span>
        <span className="flex-1 text-[13px] font-bold leading-7">{q}</span>
        <ChevronDown size={16} className={cx('mt-1 shrink-0 text-ink3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <motion.p
          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
          className="border-t border-line px-3.5 py-3 text-[13px] leading-8 text-ink2"
        >
          {a}
        </motion.p>
      )}
    </div>
  )
}
