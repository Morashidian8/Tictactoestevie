import { useState } from 'react'
import { motion } from 'framer-motion'
import { BookOpenCheck, ChevronLeft, Feather, GraduationCap, Sparkles, Target } from 'lucide-react'
import { Button, Card, cx } from '@/components/ui'
import { GRADES } from '@/content/curriculum'
import { useSettings } from '@/store/settings'
import type { GradeId } from '@/content/types'
import { fa, gradeName } from '@/lib/format'

const GOALS = [10, 20, 30, 45]

export default function Onboarding() {
  const [step, setStep] = useState(0)
  const set = useSettings((s) => s.set)
  const [grade, setGrade] = useState<GradeId | null>(null)
  const [nickname, setNickname] = useState('')
  const [goal, setGoal] = useState(20)

  const finish = () => set({ grade, nickname: nickname.trim(), dailyGoal: goal, onboarded: true })

  return (
    <div className="aurora relative min-h-dvh">
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col px-5 py-10">
        {/* نشان */}
        <motion.div
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex items-center gap-3"
        >
          <div className="grid size-12 place-items-center rounded-2xl bg-accent text-white shadow-lg shadow-accent/30">
            <Feather size={22} />
          </div>
          <div>
            <p className="font-display text-2xl leading-none">ادب‌یار</p>
            <p className="mt-1 text-[11px] text-ink3">همراهِ ادبیاتِ فارسی، از هفتم تا دوازدهم</p>
          </div>
        </motion.div>

        {step === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-1 flex-col">
            <h1 className="text-2xl leading-10 font-extrabold">
              دیگر به کتاب<br />نیازی نداری.
            </h1>
            <p className="mt-3 text-sm leading-8 text-ink2">
              معنی واژه‌به‌واژه، شرح بیت‌ها، آرایه‌ها، دستور زبان، تمرین، آزمون
              و رفع اشکال — همه در یک جا و بدون اینترنت.
            </p>

            <div className="mt-7 space-y-3">
              {[
                { icon: BookOpenCheck, t: 'تدریس کامل هر درس', d: 'متن، معنی روان، واژه‌نامه، آرایه و دستور' },
                { icon: Target, t: 'تمرین و آزمون هوشمند', d: 'با کارنامه و شناسایی نقاط ضعف' },
                { icon: Sparkles, t: 'رفع اشکال و مرور فاصله‌دار', d: 'جعبهٔ لایتنر، اشتباهات رایج، ترفندها' },
              ].map(({ icon: Icon, t, d }, i) => (
                <motion.div
                  key={t}
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.08 * i }}
                >
                  <Card className="flex items-start gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accentsoft text-accent">
                      <Icon size={19} />
                    </div>
                    <div>
                      <p className="text-sm font-bold">{t}</p>
                      <p className="mt-0.5 text-xs leading-6 text-ink3">{d}</p>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>

            <div className="mt-auto pt-8">
              <Button size="lg" full onClick={() => setStep(1)} icon={<ChevronLeft size={18} />}>
                شروع کنیم
              </Button>
            </div>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-1 flex-col">
            <h2 className="flex items-center gap-2 text-xl font-extrabold">
              <GraduationCap size={22} className="text-accent" /> در کدام پایه‌ای؟
            </h2>
            <p className="mt-2 text-[13px] text-ink3">هر وقت خواستی می‌توانی پایه را عوض کنی.</p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              {GRADES.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setGrade(g.id)}
                  className={cx(
                    `grade-${g.id} press card relative overflow-hidden p-4 text-right`,
                    grade === g.id && 'grade-ring',
                  )}
                >
                  <span className="grade-grad absolute inset-x-0 top-0 h-1" />
                  <p className="grade-text text-lg font-extrabold">{gradeName(g.id)}</p>
                  <p className="mt-1 text-[11px] leading-5 text-ink3">{g.tagline}</p>
                </button>
              ))}
            </div>

            <div className="mt-auto pt-8">
              <Button size="lg" full disabled={!grade} onClick={() => setStep(2)}>
                ادامه
              </Button>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-1 flex-col">
            <h2 className="text-xl font-extrabold">آخرین قدم</h2>
            <p className="mt-2 text-[13px] text-ink3">اسمت را بنویس تا شخصی‌ترش کنیم.</p>

            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="مثلاً: زهرا"
              maxLength={20}
              className="mt-5 h-13 w-full rounded-2xl border border-line bg-surface px-4 text-sm outline-none focus:border-accent"
            />

            <p className="mt-7 text-sm font-bold">هدف مطالعهٔ روزانه</p>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {GOALS.map((m) => (
                <button
                  key={m}
                  onClick={() => setGoal(m)}
                  className={cx(
                    'press rounded-2xl border py-3 text-sm font-bold',
                    goal === m ? 'border-accent bg-accentsoft text-accent' : 'border-line bg-surface text-ink2',
                  )}
                >
                  {fa(m)} دقیقه
                </button>
              ))}
            </div>

            <div className="mt-auto space-y-2 pt-8">
              <Button size="lg" full onClick={finish}>ورود به ادب‌یار</Button>
              <Button variant="ghost" full onClick={() => setStep(1)}>بازگشت</Button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
