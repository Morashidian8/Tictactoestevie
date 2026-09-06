import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Search, X } from 'lucide-react'
import { Card, Chip, Empty } from '@/components/ui'
import { ALL_META } from '@/content/curriculum'
import { isReady } from '@/content/registry'
import { searchScore } from '@/lib/text'
import { fa, faOrdinal, gradeName } from '@/lib/format'

const RECENT_KEY = 'adabyar.recentSearch'

export default function SearchPage() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [recent, setRecent] = useState<string[]>([])

  useEffect(() => {
    try { setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')) } catch { /* ignore */ }
  }, [])

  const results = useMemo(() => {
    if (q.trim().length < 2) return []
    return ALL_META
      .map((m) => ({
        m,
        score:
          searchScore(m.title, q) * 3 +
          searchScore(m.subtitle ?? '', q) +
          searchScore(m.by ?? '', q) * 2 +
          searchScore(m.unit, q),
      }))
      .filter((x) => x.score > 10)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map((x) => ({ ...x.m, ready: isReady(x.m.id) }))
  }, [q])

  const remember = (term: string) => {
    const next = [term, ...recent.filter((r) => r !== term)].slice(0, 8)
    setRecent(next)
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }

  return (
    <div className="px-4 pt-6">
      <div className="mb-4 flex items-center gap-2">
        <button onClick={() => nav(-1)} className="press grid size-10 place-items-center rounded-2xl border border-line bg-surface">
          <ArrowRight size={18} />
        </button>
        <div className="relative flex-1">
          <Search size={16} className="absolute end-4 top-1/2 -translate-y-1/2 text-ink3" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="نام درس، شاعر یا موضوع…"
            className="h-12 w-full rounded-2xl border border-line bg-surface pe-11 ps-4 text-[13px] outline-none focus:border-accent"
          />
          {q && (
            <button onClick={() => setQ('')} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink3">
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {q.trim().length < 2 ? (
        <>
          {recent.length > 0 && (
            <>
              <p className="mb-2 text-[12px] font-bold text-ink3">جست‌وجوهای اخیر</p>
              <div className="mb-6 flex flex-wrap gap-2">
                {recent.map((r) => (
                  <button key={r} onClick={() => setQ(r)} className="press rounded-full border border-line bg-surface px-3 py-1.5 text-[12px]">
                    {r}
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="mb-2 text-[12px] font-bold text-ink3">پیشنهاد جست‌وجو</p>
          <div className="flex flex-wrap gap-2">
            {['حافظ', 'سعدی', 'مولوی', 'فردوسی', 'شاهنامه', 'پروین اعتصامی', 'ادبیات پایداری', 'درس آزاد'].map((s) => (
              <button key={s} onClick={() => setQ(s)} className="press rounded-full bg-accentsoft px-3 py-1.5 text-[12px] font-bold text-accent">
                {s}
              </button>
            ))}
          </div>
        </>
      ) : results.length === 0 ? (
        <Empty title="چیزی پیدا نشد" hint="نام درس، شاعر یا فصل را امتحان کن." />
      ) : (
        <div className="space-y-2.5">
          <p className="text-[12px] text-ink3">{fa(results.length)} نتیجه</p>
          {results.map((m) => (
            <Link
              key={m.id}
              to={m.ready ? `/lesson/${m.id}` : `/grade/${m.grade}`}
              onClick={() => remember(q.trim())}
              className={`block grade-${m.grade}`}
            >
              <Card className="press flex items-center gap-3">
                <div className="grade-grad grid size-10 shrink-0 place-items-center rounded-2xl text-[12px] font-extrabold text-white">
                  {fa(m.grade)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-bold">{m.title}</p>
                  <p className="mt-0.5 truncate text-[11px] text-ink3">
                    {gradeName(m.grade)} • {m.number === 0 ? m.unit : `درس ${faOrdinal(m.number)}`}
                    {m.by ? ` • ${m.by}` : ''}
                  </p>
                </div>
                {!m.ready && <Chip className="shrink-0">به‌زودی</Chip>}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
