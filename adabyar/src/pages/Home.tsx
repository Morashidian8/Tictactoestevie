import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, BookOpen, Flame, Layers, Search, Sparkles, Timer, Trophy, Zap,
} from 'lucide-react'
import { Button, Card, Chip, Progress, Ring, SectionTitle } from '@/components/ui'
import { useSettings } from '@/store/settings'
import { levelOf, levelTitle, useProgress } from '@/store/progress'
import { dueCards, useSrs } from '@/store/srs'
import { lessonsOf, readyCount } from '@/content/registry'
import { gradeInfo } from '@/content/curriculum'
import { dayKey, fa, gradeName, jalaliToday } from '@/lib/format'
import LessonRow from '@/components/LessonRow'

export default function Home() {
  const nav = useNavigate()
  const { grade, nickname, dailyGoal } = useSettings()
  const g = grade ?? 7
  const { xp, streak, lessons, minutesByDay } = useProgress()
  const due = useSrs((s) => dueCards(s.cards).length)

  const { level, into, need } = levelOf(xp)
  const info = gradeInfo(g)
  const list = lessonsOf(g)
  const ready = readyCount(g)

  const todayMinutes = minutesByDay[dayKey()] ?? 0
  const goalPct = Math.min(100, (todayMinutes / dailyGoal) * 100)

  // درسی که آخرین بار باز شده — «ادامه بده»
  const continueId = Object.entries(lessons)
    .sort((a, b) => b[1].lastSeen - a[1].lastSeen)[0]?.[0]
  const continueMeta = list.find((l) => l.id === continueId)
  const nextMeta = list.find((l) => l.ready && (lessons[l.id]?.read ?? 0) < 100)

  const done = list.filter((l) => l.ready && (lessons[l.id]?.exam ?? 0) >= 60).length

  return (
    <div className={`grade-${g} px-4 pt-6`}>
      {/* سربرگ */}
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] text-ink3">{jalaliToday()}</p>
          <h1 className="mt-1 text-xl font-extrabold">
            {nickname ? `سلام ${nickname}!` : 'سلام!'}
          </h1>
          <p className="mt-1 text-[12px] text-ink2">
            پایهٔ <span className="font-bold">{gradeName(g)}</span> — {info.tagline}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/search" className="press grid size-10 place-items-center rounded-2xl border border-line bg-surface">
            <Search size={18} />
          </Link>
          <div className="flex items-center gap-1 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3 py-2">
            <Flame size={16} className="text-gold" />
            <span className="text-sm font-extrabold text-gold">{fa(streak)}</span>
          </div>
        </div>
      </header>

      {/* کارت وضعیت */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="grade-ring relative overflow-hidden">
          <span className="grade-grad absolute inset-x-0 top-0 h-1" />
          <div className="flex items-center gap-4">
            <Ring value={goalPct} size={64}>
              <div className="text-center">
                <p className="text-[13px] font-extrabold leading-none">{fa(todayMinutes)}</p>
                <p className="text-[8px] text-ink3">از {fa(dailyGoal)}</p>
              </div>
            </Ring>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Chip tone="accent"><Zap size={11} /> سطح {fa(level)}</Chip>
                <span className="truncate text-[11px] text-ink3">{levelTitle(level)}</span>
              </div>
              <Progress value={(into / need) * 100} className="mt-2.5" tone="grade" />
              <p className="mt-1.5 text-[11px] text-ink3">
                {fa(need - into)} امتیاز تا سطح بعد — مجموع {fa(xp)}
              </p>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* ادامهٔ مطالعه */}
      {(continueMeta ?? nextMeta) && (
        <div className="mt-5">
          <SectionTitle>ادامه بده</SectionTitle>
          <LessonRow meta={(continueMeta ?? nextMeta)!} highlight />
        </div>
      )}

      {/* دسترسی سریع */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <QuickCard
          to="/review" icon={<Layers size={18} />} title="مرور فلش‌کارت"
          sub={due ? `${fa(due)} کارت آمادهٔ مرور` : 'همه‌چیز مرور شده'}
          badge={due > 0}
        />
        <QuickCard
          to="/exam-builder" icon={<Timer size={18} />} title="آزمون‌ساز"
          sub="آزمون دلخواه از چند درس"
        />
        <QuickCard
          to={`/grade/${g}`} icon={<BookOpen size={18} />} title="درس‌های من"
          sub={`${fa(ready)} از ${fa(list.length)} درس آماده`}
        />
        <QuickCard
          to="/progress" icon={<Trophy size={18} />} title="کارنامه"
          sub={`${fa(done)} درس تثبیت‌شده`}
        />
      </div>

      {/* درس‌های پایه */}
      <div className="mt-7">
        <SectionTitle
          extra={
            <Link to={`/grade/${g}`} className="flex items-center gap-1 text-[12px] font-bold text-accent">
              همه <ArrowLeft size={14} />
            </Link>
          }
        >
          درس‌های {gradeName(g)}
        </SectionTitle>
        <div className="space-y-2.5">
          {list.filter((l) => l.ready).slice(0, 4).map((m) => (
            <LessonRow key={m.id} meta={m} />
          ))}
        </div>
      </div>

      {/* نکتهٔ روز */}
      <div className="mt-7">
        <SectionTitle>نکتهٔ امروز</SectionTitle>
        <Card className="border-dashed">
          <div className="flex gap-3">
            <Sparkles size={18} className="mt-0.5 shrink-0 text-gold" />
            <div>
              <p className="text-[13px] font-bold">{TIP_OF_DAY.title}</p>
              <p className="mt-1.5 text-[13px] leading-7 text-ink2">{TIP_OF_DAY.body}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <Button variant="outline" full onClick={() => nav('/library')}>
          دیدن همهٔ پایه‌ها
        </Button>
      </div>
    </div>
  )
}

function QuickCard({ to, icon, title, sub, badge }: {
  to: string; icon: React.ReactNode; title: string; sub: string; badge?: boolean
}) {
  return (
    <Link to={to}>
      <Card className="press relative h-full">
        {badge && <span className="absolute end-3 top-3 size-2 animate-pulse rounded-full bg-rose-500" />}
        <div className="grid size-9 place-items-center rounded-xl bg-accentsoft text-accent">{icon}</div>
        <p className="mt-2.5 text-[13px] font-bold">{title}</p>
        <p className="mt-0.5 text-[11px] leading-5 text-ink3">{sub}</p>
      </Card>
    </Link>
  )
}

/* نکته‌ها روزانه می‌چرخند */
const TIPS = [
  { title: 'تشبیه را چطور پیدا کنیم؟', body: 'دنبال چهار رکن بگرد: مشبّه، مشبّهٌ‌به، ادات (مانند، چون، همچو) و وجه‌شبه. اگر ادات و وجه‌شبه حذف شده باشند، تشبیه «بلیغ» است.' },
  { title: 'فرق استعاره با تشبیه', body: 'در استعاره یکی از دو طرف تشبیه حذف می‌شود. «سرو خرامان» یعنی معشوق؛ مشبّه (معشوق) نیامده، پس استعاره است.' },
  { title: 'کنایه یعنی چه؟', body: 'جمله‌ای که معنی ظاهری دارد ولی مقصود، معنی پنهان آن است: «دست و پا کردن» یعنی فراهم‌آوردن.' },
  { title: 'مراعات نظیر', body: 'آوردن واژه‌هایی از یک خانواده: ابر و باد و مه و خورشید و فلک. به آن «تناسب» هم می‌گویند.' },
  { title: 'جناس در یک نگاه', body: 'دو واژه که در نوشتار یا تلفظ همانندند اما معنایشان فرق دارد: «شانه» (وسیلهٔ آرایش) و «شانه» (کتف).' },
  { title: 'نهاد را گم نکن', body: 'برای یافتن نهاد از فعل بپرس «چه کسی؟ چه چیزی؟». نهاد همیشه با فعل مطابقت دارد.' },
  { title: 'شب امتحان', body: 'اول «خلاصهٔ درس»، بعد «آرایه‌ها»، آخر «واژه‌نامه». سه‌بار مرور کوتاه بهتر از یک‌بار مرور طولانی است.' },
]
const TIP_OF_DAY = TIPS[new Date().getDate() % TIPS.length]
