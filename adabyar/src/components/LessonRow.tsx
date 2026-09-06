import { Link } from 'react-router-dom'
import { CheckCircle2, ChevronLeft, Clock, Lock, Star } from 'lucide-react'
import type { LessonMeta } from '@/content/types'
import { Card, Chip, Progress, cx } from './ui'
import { useProgress } from '@/store/progress'
import { isFreeLesson, useEntitlement } from '@/store/entitlement'
import { fa, faOrdinal } from '@/lib/format'

export default function LessonRow({ meta, highlight }: { meta: LessonMeta; highlight?: boolean }) {
  const p = useProgress((s) => s.lessons[meta.id])
  const premium = useEntitlement((s) => s.isPremium())
  const locked = !premium && !isFreeLesson(meta.number)

  const pct = Math.round(((p?.read ?? 0) + (p?.practice ?? 0) + (p?.exam ?? 0)) / 3)
  const mastered = (p?.exam ?? 0) >= 80

  const inner = (
    <Card
      className={cx(
        'press relative flex items-center gap-3 overflow-hidden',
        highlight && 'grade-ring',
        !meta.ready && 'opacity-60',
      )}
    >
      {highlight && <span className="grade-grad absolute inset-y-0 start-0 w-1" />}

      <div
        className={cx(
          'grid size-11 shrink-0 place-items-center rounded-2xl text-sm font-extrabold',
          mastered ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'grade-grad text-white',
        )}
      >
        {mastered ? <CheckCircle2 size={20} /> : meta.number === 0 ? <Star size={17} fill="currentColor" /> : fa(meta.number)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[14px] font-bold">{meta.title}</p>
          {locked && <Lock size={12} className="shrink-0 text-ink3" />}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-ink3">
          {meta.number === 0 ? meta.unit : `درس ${faOrdinal(meta.number)}`}
          {meta.by ? ` — ${meta.by}` : meta.subtitle ? ` — ${meta.subtitle}` : ''}
        </p>
        {meta.ready && pct > 0 && <Progress value={pct} className="mt-2 h-1" tone="grade" />}
      </div>

      {meta.ready ? (
        <ChevronLeft size={18} className="shrink-0 text-ink3" />
      ) : (
        <Chip className="shrink-0"><Clock size={11} /> به‌زودی</Chip>
      )}
    </Card>
  )

  if (!meta.ready) return <div className={`grade-${meta.grade}`}>{inner}</div>
  return (
    <Link to={locked ? '/premium' : `/lesson/${meta.id}`} className={`block grade-${meta.grade}`}>
      {inner}
    </Link>
  )
}
