import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, Search } from 'lucide-react'
import { Card, Progress, SectionTitle } from '@/components/ui'
import { GRADES } from '@/content/curriculum'
import { lessonsOf, readyCount } from '@/content/registry'
import { useProgress } from '@/store/progress'
import { useSettings } from '@/store/settings'
import { fa } from '@/lib/format'

export default function Library() {
  const lessons = useProgress((s) => s.lessons)
  const myGrade = useSettings((s) => s.grade)

  return (
    <div className="px-4 pt-6">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold">کتابخانه</h1>
          <p className="mt-1 text-[12px] text-ink3">شش پایه، صدها درس، همه آفلاین</p>
        </div>
        <Link to="/search" className="press grid size-10 place-items-center rounded-2xl border border-line bg-surface">
          <Search size={18} />
        </Link>
      </header>

      <SectionTitle>پایه‌ها</SectionTitle>
      <div className="space-y-3">
        {GRADES.map((g, i) => {
          const list = lessonsOf(g.id)
          const ready = readyCount(g.id)
          const studied = list.filter((l) => (lessons[l.id]?.read ?? 0) > 0).length
          const pct = ready ? (studied / ready) * 100 : 0
          return (
            <motion.div
              key={g.id}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link to={`/grade/${g.id}`} className={`block grade-${g.id}`}>
                <Card className="press relative overflow-hidden">
                  <span className="grade-grad absolute inset-y-0 start-0 w-1.5" />
                  <div className="flex items-center gap-3 ps-2">
                    <div className="grade-grad grid size-12 shrink-0 place-items-center rounded-2xl text-white">
                      <span className="text-base font-extrabold">{fa(g.id)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[15px] font-extrabold">{g.title}</p>
                        {myGrade === g.id && (
                          <span className="rounded-full bg-accentsoft px-2 py-0.5 text-[10px] font-bold text-accent">
                            پایهٔ من
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-ink3">{g.tagline}</p>
                      <Progress value={pct} className="mt-2 h-1.5" tone="grade" />
                      <p className="mt-1.5 text-[10px] text-ink3">
                        {fa(ready)} درس آماده از {fa(list.length)} درس کتاب
                      </p>
                    </div>
                    <ChevronLeft size={18} className="shrink-0 text-ink3" />
                  </div>
                </Card>
              </Link>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
