import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, Filter } from 'lucide-react'
import { Card, Empty, Progress, cx } from '@/components/ui'
import LessonRow from '@/components/LessonRow'
import { lessonsOf } from '@/content/registry'
import { gradeInfo, unitsOf } from '@/content/curriculum'
import { useProgress } from '@/store/progress'
import { fa, gradeName } from '@/lib/format'

export default function GradePage() {
  const { grade } = useParams()
  const g = Number(grade)
  const info = gradeInfo(g)
  const all = useMemo(() => lessonsOf(g), [g])
  const units = useMemo(() => unitsOf(g), [g])
  const [unit, setUnit] = useState<string | null>(null)
  const [onlyReady, setOnlyReady] = useState(false)
  const lessons = useProgress((s) => s.lessons)

  const shown = all.filter((l) => (!unit || l.unit === unit) && (!onlyReady || l.ready))
  const readyAll = all.filter((l) => l.ready)
  const studied = readyAll.filter((l) => (lessons[l.id]?.read ?? 0) > 0).length

  return (
    <div className={`grade-${g} px-4 pt-6`}>
      <header className="mb-4 flex items-center gap-3">
        <Link to="/library" className="press grid size-10 place-items-center rounded-2xl border border-line bg-surface">
          <ArrowRight size={18} />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-extrabold">{info.title}</h1>
          <p className="text-[11px] text-ink3">{info.tagline}</p>
        </div>
      </header>

      <Card className="grade-ring relative overflow-hidden">
        <span className="grade-grad absolute inset-x-0 top-0 h-1" />
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-ink2">پیشرفت پایهٔ {gradeName(g)}</span>
          <span className="font-extrabold">
            {fa(studied)} / {fa(readyAll.length)}
          </span>
        </div>
        <Progress value={readyAll.length ? (studied / readyAll.length) * 100 : 0} className="mt-2" tone="grade" />
      </Card>

      {/* فیلتر فصل‌ها */}
      <div className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1">
        <FilterChip active={!unit} onClick={() => setUnit(null)}>همه</FilterChip>
        {units.map((u) => (
          <FilterChip key={u} active={unit === u} onClick={() => setUnit(u)}>{u}</FilterChip>
        ))}
      </div>

      <button
        onClick={() => setOnlyReady((v) => !v)}
        className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-ink3"
      >
        <Filter size={13} />
        {onlyReady ? 'نمایش همهٔ درس‌ها' : 'فقط درس‌های آماده'}
      </button>

      <div className="mt-4 space-y-2.5">
        {shown.length === 0 ? (
          <Empty title="درسی در این فصل نیست" hint="فیلتر دیگری را امتحان کن." />
        ) : (
          shown.map((m) => <LessonRow key={m.id} meta={m} />)
        )}
      </div>

      <p className="mt-6 text-center text-[11px] leading-6 text-ink3">
        درس‌های نشان‌دار «به‌زودی» در حال آماده‌سازی‌اند و در به‌روزرسانی‌های بعدی اضافه می‌شوند.
      </p>
    </div>
  )
}

function FilterChip({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'press shrink-0 rounded-full border px-3.5 py-2 text-[12px] font-bold whitespace-nowrap',
        active ? 'border-transparent bg-accent text-white' : 'border-line bg-surface text-ink2',
      )}
    >
      {children}
    </button>
  )
}
