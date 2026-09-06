import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Award, Flame, Target, TrendingUp, Trophy } from 'lucide-react'
import { Card, Chip, Empty, Progress, Ring, SectionTitle } from '@/components/ui'
import { levelOf, levelTitle, useProgress } from '@/store/progress'
import { useSettings } from '@/store/settings'
import { metaOf } from '@/content/registry'
import { fa, dayKey, timeAgo } from '@/lib/format'
import type { QTopic } from '@/content/types'

const BADGES: Record<string, { icon: string; label: string }> = {
  'آزمون بی‌نقص': { icon: '💯', label: 'آزمون بی‌نقص' },
  'قبولی در آزمون درس': { icon: '🎓', label: 'اولین قبولی' },
  'هفت روز پیاپی': { icon: '🔥', label: 'هفت روز پیاپی' },
  'صد کارت مرور': { icon: '🃏', label: 'صد کارت مرور' },
}

export default function ProgressPage() {
  const { xp, streak, results, minutesByDay, lessons, badges } = useProgress()
  const dailyGoal = useSettings((s) => s.dailyGoal)
  const { level, into, need } = levelOf(xp)

  // نمودار هفت روز اخیر
  const week = useMemo(() => {
    const out: { key: string; label: string; minutes: number }[] = []
    const names = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']
    for (let d = 6; d >= 0; d--) {
      const date = new Date(Date.now() - d * 864e5)
      const key = dayKey(date)
      out.push({
        key,
        label: names[(date.getDay() + 1) % 7],
        minutes: minutesByDay[key] ?? 0,
      })
    }
    return out
  }, [minutesByDay])
  const maxMin = Math.max(dailyGoal, ...week.map((w) => w.minutes))

  // نقاط ضعف
  const weak = useMemo(() => {
    const tally: Record<string, number> = {}
    for (const r of results) for (const t of r.weakTopics) tally[t] = (tally[t] ?? 0) + 1
    return Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 5) as [QTopic, number][]
  }, [results])

  const mastered = Object.values(lessons).filter((l) => l.exam >= 80).length
  const started = Object.keys(lessons).length
  const avg = results.length
    ? Math.round(results.reduce((s, r) => s + (r.total ? (r.score / r.total) * 100 : 0), 0) / results.length)
    : 0

  return (
    <div className="px-4 pt-6">
      <h1 className="text-xl font-extrabold">پیشرفت من</h1>
      <p className="mt-1 text-[12px] text-ink3">هرچه بیشتر تمرین کنی، اینجا پررنگ‌تر می‌شود</p>

      {/* کارت سطح */}
      <Card className="mt-4">
        <div className="flex items-center gap-4">
          <Ring value={(into / need) * 100} size={72} stroke={7}>
            <div className="text-center">
              <p className="text-base font-extrabold leading-none">{fa(level)}</p>
              <p className="text-[8px] text-ink3">سطح</p>
            </div>
          </Ring>
          <div className="flex-1">
            <p className="text-[15px] font-extrabold">{levelTitle(level)}</p>
            <p className="mt-1 text-[12px] text-ink3">{fa(xp)} امتیاز کل</p>
            <Progress value={(into / need) * 100} className="mt-2" />
          </div>
        </div>
      </Card>

      {/* آمار کلی */}
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Stat icon={<Flame size={16} />} value={fa(streak)} label="روز پیاپی" />
        <Stat icon={<Trophy size={16} />} value={fa(mastered)} label="درس تثبیت‌شده" />
        <Stat icon={<TrendingUp size={16} />} value={`${fa(avg)}٪`} label="میانگین آزمون" />
      </div>

      {/* نمودار هفته */}
      <div className="mt-6">
        <SectionTitle extra={<Chip><Target size={11} /> هدف {fa(dailyGoal)} دقیقه</Chip>}>
          هفت روز اخیر
        </SectionTitle>
        <Card>
          <div className="flex h-32 items-end gap-2">
            {week.map((d) => {
              const h = (d.minutes / maxMin) * 100
              const hit = d.minutes >= dailyGoal
              return (
                <div key={d.key} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className="text-[9px] font-bold text-ink3">{d.minutes ? fa(d.minutes) : ''}</span>
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className={`w-full rounded-t-lg ${hit ? 'bg-emerald-500' : 'bg-accent/60'}`}
                      style={{ height: `${Math.max(3, h)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-ink3">{d.label}</span>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* نقاط ضعف */}
      <div className="mt-6">
        <SectionTitle>نقاط ضعف تو</SectionTitle>
        {weak.length === 0 ? (
          <Card className="text-center text-[12px] leading-7 text-ink3">
            هنوز آزمونی نداده‌ای. بعد از چند آزمون، اینجا دقیقاً می‌گوییم کدام مبحث را باید بیشتر کار کنی.
          </Card>
        ) : (
          <Card>
            <div className="space-y-3">
              {weak.map(([topic, count]) => (
                <div key={topic}>
                  <div className="mb-1.5 flex items-center justify-between text-[12px]">
                    <span className="font-bold">{topic}</span>
                    <span className="text-ink3">{fa(count)} بار اشتباه</span>
                  </div>
                  <Progress value={(count / weak[0][1]) * 100} tone="gold" className="h-1.5" />
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* نشان‌ها */}
      <div className="mt-6">
        <SectionTitle>نشان‌ها</SectionTitle>
        <div className="grid grid-cols-4 gap-2.5">
          {Object.entries(BADGES).map(([key, b]) => {
            const owned = badges.includes(key)
            return (
              <Card key={key} className={`p-3 text-center ${owned ? '' : 'opacity-35 grayscale'}`}>
                <p className="text-2xl">{b.icon}</p>
                <p className="mt-1 text-[9px] leading-4 font-bold">{b.label}</p>
              </Card>
            )
          })}
        </div>
      </div>

      {/* تاریخچهٔ آزمون */}
      <div className="mt-6">
        <SectionTitle>آخرین آزمون‌ها</SectionTitle>
        {results.length === 0 ? (
          <Empty icon={<Award size={24} />} title="هنوز آزمونی نداده‌ای"
            hint="از صفحهٔ هر درس، تب «آزمون» را باز کن." />
        ) : (
          <div className="space-y-2.5">
            {results.slice(0, 8).map((r, i) => {
              const meta = metaOf(r.lessonId)
              const pct = r.total ? Math.round((r.score / r.total) * 100) : 0
              return (
                <Link key={i} to={`/lesson/${r.lessonId}/exam`}>
                  <Card className="press flex items-center gap-3">
                    <div className={`grid size-11 shrink-0 place-items-center rounded-2xl text-[12px] font-extrabold ${
                      pct >= 80 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : pct >= 50 ? 'bg-amber-500/15 text-gold'
                          : 'bg-rose-500/15 text-rose-500'}`}>
                      {fa(pct)}٪
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold">{meta?.title ?? r.lessonId}</p>
                      <p className="mt-0.5 text-[11px] text-ink3">
                        {timeAgo(r.at)} • {fa(Math.round(r.seconds / 60))} دقیقه
                      </p>
                    </div>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>
      <p className="mt-6 text-center text-[11px] text-ink3">
        {fa(started)} درس را شروع کرده‌ای.
      </p>
    </div>
  )
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <Card className="p-3 text-center">
      <div className="mx-auto grid size-8 place-items-center rounded-xl bg-accentsoft text-accent">{icon}</div>
      <p className="mt-2 text-base font-extrabold">{value}</p>
      <p className="text-[10px] text-ink3">{label}</p>
    </Card>
  )
}
