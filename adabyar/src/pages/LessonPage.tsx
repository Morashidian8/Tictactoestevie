import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowRight, Bookmark, BookOpen, HelpCircle, PencilLine, Settings2, Timer,
} from 'lucide-react'
import { Skeleton, cx } from '@/components/ui'
import TeachView from '@/components/lesson/TeachView'
import PracticeView from '@/components/lesson/PracticeView'
import ExamView from '@/components/lesson/ExamView'
import HelpView from '@/components/lesson/HelpView'
import ReaderSettings from '@/components/lesson/ReaderSettings'
import type { Lesson } from '@/content/types'
import { loadLesson, metaOf } from '@/content/registry'
import { useProgress } from '@/store/progress'
import { isFreeLesson, useEntitlement } from '@/store/entitlement'
import { fa, faOrdinal } from '@/lib/format'

const TABS = [
  { key: 'teach', label: 'تدریس', icon: BookOpen },
  { key: 'practice', label: 'تمرین', icon: PencilLine },
  { key: 'exam', label: 'آزمون', icon: Timer },
  { key: 'help', label: 'رفع اشکال', icon: HelpCircle },
] as const

export default function LessonPage() {
  const { id = '', tab = 'teach' } = useParams()
  const nav = useNavigate()
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const meta = metaOf(id)
  const premium = useEntitlement((s) => s.isPremium())
  const { bookmarks, toggleBookmark, addMinutes } = useProgress()
  const enteredAt = useRef(Date.now())

  useEffect(() => {
    let alive = true
    loadLesson(id).then((l) => { if (alive) setLesson(l) })
    return () => { alive = false }
  }, [id])

  // زمان مطالعه را هنگام خروج ثبت می‌کنیم
  useEffect(() => {
    const start = enteredAt.current
    return () => {
      const mins = Math.round((Date.now() - start) / 60000)
      if (mins >= 1) addMinutes(Math.min(mins, 120))
    }
  }, [addMinutes])

  useEffect(() => {
    if (meta && !premium && !isFreeLesson(meta.number)) nav('/premium', { replace: true })
  }, [meta, premium, nav])

  if (!meta) {
    return <div className="p-6 text-center text-sm text-ink3">این درس پیدا نشد.</div>
  }

  const g = meta.grade
  const marked = bookmarks.includes(id)

  return (
    <div className={`grade-${g} min-h-dvh`}>
      {/* سربرگ چسبان */}
      <header className="glass sticky top-0 z-30 border-b border-line safe-t">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <button onClick={() => nav(-1)} className="press grid size-9 place-items-center rounded-xl border border-line bg-surface">
            <ArrowRight size={17} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-extrabold">{meta.title}</p>
            <p className="truncate text-[10px] text-ink3">
              {meta.number === 0 ? meta.unit : `درس ${faOrdinal(meta.number)} — پایهٔ ${fa(g)}`}
              {meta.by ? ` • ${meta.by}` : ''}
            </p>
          </div>
          <button
            onClick={() => toggleBookmark(id)}
            className={cx('press grid size-9 place-items-center rounded-xl border', marked ? 'border-gold bg-amber-500/10 text-gold' : 'border-line bg-surface')}
          >
            <Bookmark size={16} fill={marked ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="press grid size-9 place-items-center rounded-xl border border-line bg-surface"
          >
            <Settings2 size={16} />
          </button>
        </div>

        {/* تب‌ها */}
        <div className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2">
          {TABS.map(({ key, label, icon: Icon }) => {
            const active = tab === key
            return (
              <Link
                key={key}
                to={`/lesson/${id}/${key}`}
                replace
                className={cx(
                  'press relative flex shrink-0 items-center gap-1.5 rounded-2xl px-3.5 py-2 text-[12.5px] font-bold',
                  active ? 'text-white' : 'text-ink2',
                )}
              >
                {active && (
                  <motion.span layoutId="tabbg" className="grade-grad absolute inset-0 -z-10 rounded-2xl" />
                )}
                <Icon size={15} />
                {label}
              </Link>
            )
          })}
        </div>
      </header>

      <div className="px-4 py-5">
        {!lesson ? (
          <div className="space-y-3">
            <Skeleton className="h-24" /><Skeleton className="h-40" /><Skeleton className="h-24" />
          </div>
        ) : (
          <>
            {tab === 'teach' && <TeachView lesson={lesson} />}
            {tab === 'practice' && <PracticeView lesson={lesson} />}
            {tab === 'exam' && <ExamView lesson={lesson} />}
            {tab === 'help' && <HelpView lesson={lesson} />}
          </>
        )}
      </div>

      <ReaderSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
