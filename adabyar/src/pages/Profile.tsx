import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpen, ChevronLeft, Crown, Download, GraduationCap, LifeBuoy,
  Moon, RotateCcw, Share2, Sun, Trash2, Type, User,
} from 'lucide-react'
import { Button, Card, Chip, SectionTitle, cx } from '@/components/ui'
import { GRADES } from '@/content/curriculum'
import { useSettings } from '@/store/settings'
import { levelOf, levelTitle, useProgress } from '@/store/progress'
import { useSrs } from '@/store/srs'
import { useEntitlement } from '@/store/entitlement'
import { fa, gradeName } from '@/lib/format'
import type { GradeId } from '@/content/types'

export default function Profile() {
  const { grade, nickname, dailyGoal, theme, readerScale, nastaliq, set } = useSettings()
  const progress = useProgress()
  const srs = useSrs()
  const ent = useEntitlement()
  const premium = ent.isPremium()
  const { level } = levelOf(progress.xp)
  const [confirmReset, setConfirmReset] = useState(false)

  const exportData = () => {
    const blob = new Blob(
      [JSON.stringify({
        settings: { grade, nickname, dailyGoal, theme, readerScale, nastaliq },
        progress: { xp: progress.xp, streak: progress.streak, lessons: progress.lessons, results: progress.results, badges: progress.badges },
        srs: srs.cards,
        exportedAt: new Date().toISOString(),
      }, null, 2)],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `adabyar-backup-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="px-4 pt-6">
      {/* کارت کاربر */}
      <Card className={`grade-${grade ?? 7} grade-ring relative overflow-hidden`}>
        <span className="grade-grad absolute inset-x-0 top-0 h-1" />
        <div className="flex items-center gap-3.5">
          <div className="grade-grad grid size-14 place-items-center rounded-3xl text-white">
            <User size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-extrabold">{nickname || 'دانش‌آموز ادب‌یار'}</p>
            <p className="mt-0.5 text-[11px] text-ink3">
              سطح {fa(level)} • {levelTitle(level)} • {fa(progress.xp)} امتیاز
            </p>
          </div>
          {premium ? <Chip tone="gold"><Crown size={11} /> ویژه</Chip> : <Chip>رایگان</Chip>}
        </div>
      </Card>

      {/* اشتراک */}
      {!premium && (
        <Link to="/premium" className="mt-3 block">
          <Card className="press border-amber-500/35 bg-gradient-to-l from-amber-500/12 to-transparent">
            <div className="flex items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-amber-500/20 text-gold">
                <Crown size={19} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-extrabold">ادب‌یار ویژه</p>
                <p className="mt-0.5 text-[11px] leading-5 text-ink3">
                  دسترسی به همهٔ درس‌های شش پایه، آزمون‌ساز نامحدود و آزمون‌های نوبت
                </p>
              </div>
              <ChevronLeft size={17} className="shrink-0 text-ink3" />
            </div>
          </Card>
        </Link>
      )}

      {/* پایه */}
      <div className="mt-6">
        <SectionTitle>پایهٔ تحصیلی</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          {GRADES.map((g) => (
            <button
              key={g.id}
              onClick={() => set({ grade: g.id as GradeId })}
              className={cx(
                'press rounded-2xl border py-3 text-[13px] font-extrabold',
                grade === g.id ? 'border-accent bg-accentsoft text-accent' : 'border-line bg-surface text-ink2',
              )}
            >
              {gradeName(g.id)}
            </button>
          ))}
        </div>
      </div>

      {/* تنظیمات */}
      <div className="mt-6">
        <SectionTitle>تنظیمات</SectionTitle>
        <Card className="divide-y divide-line p-0">
          <Row icon={<User size={17} />} label="نام نمایشی">
            <input
              value={nickname}
              onChange={(e) => set({ nickname: e.target.value })}
              placeholder="نام تو"
              maxLength={20}
              className="w-28 rounded-xl border border-line bg-surface2 px-2.5 py-1.5 text-[12px] outline-none focus:border-accent"
            />
          </Row>
          <Row icon={<GraduationCap size={17} />} label="هدف روزانه">
            <div className="flex items-center gap-1.5">
              {[10, 20, 30, 45].map((m) => (
                <button
                  key={m}
                  onClick={() => set({ dailyGoal: m })}
                  className={cx('rounded-lg px-2 py-1 text-[11px] font-bold',
                    dailyGoal === m ? 'bg-accent text-white' : 'bg-surface2 text-ink3')}
                >
                  {fa(m)}
                </button>
              ))}
            </div>
          </Row>
          <Row icon={theme === 'dark' ? <Moon size={17} /> : <Sun size={17} />} label="ظاهر">
            <div className="flex items-center gap-1.5">
              {(['light', 'dark', 'system'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => set({ theme: k })}
                  className={cx('rounded-lg px-2 py-1 text-[11px] font-bold',
                    theme === k ? 'bg-accent text-white' : 'bg-surface2 text-ink3')}
                >
                  {k === 'light' ? 'روشن' : k === 'dark' ? 'تیره' : 'سیستم'}
                </button>
              ))}
            </div>
          </Row>
          <Row icon={<Type size={17} />} label="خط نستعلیق برای شعر">
            <Switch value={nastaliq} onChange={(v) => set({ nastaliq: v })} />
          </Row>
        </Card>
      </div>

      {/* داده‌ها */}
      <div className="mt-6">
        <SectionTitle>داده‌های من</SectionTitle>
        <div className="space-y-2.5">
          <Button variant="outline" full icon={<Download size={16} />} onClick={exportData}>
            گرفتن نسخهٔ پشتیبان
          </Button>
          <Button
            variant="outline" full icon={<Share2 size={16} />}
            onClick={() => navigator.share?.({ title: 'ادب‌یار', text: 'اپ ادبیات فارسی هفتم تا دوازدهم' }).catch(() => {})}
          >
            معرفی به دوستان
          </Button>
          {!confirmReset ? (
            <Button variant="ghost" full icon={<RotateCcw size={16} />} onClick={() => setConfirmReset(true)}>
              پاک‌کردن پیشرفت
            </Button>
          ) : (
            <Card className="border-rose-500/35 bg-rose-500/5">
              <p className="text-[13px] font-bold">مطمئنی؟</p>
              <p className="mt-1 text-[12px] leading-6 text-ink3">
                امتیازها، کارنامه‌ها و کارت‌های مرور پاک می‌شوند و برگشت‌پذیر نیست.
              </p>
              <div className="mt-3 flex gap-2">
                <Button variant="danger" size="sm" icon={<Trash2 size={14} />}
                  onClick={() => { progress.reset(); srs.reset(); setConfirmReset(false) }}>
                  بله، پاک کن
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>انصراف</Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* دربارهٔ اپ */}
      <div className="mt-6">
        <SectionTitle>دربارهٔ ادب‌یار</SectionTitle>
        <Card className="space-y-2.5">
          <p className="flex items-center gap-2 text-[13px]">
            <BookOpen size={15} className="text-accent" /> نسخهٔ ۰٫۱٫۰ — کاملاً آفلاین
          </p>
          <p className="flex items-center gap-2 text-[13px]">
            <LifeBuoy size={15} className="text-accent" /> پشتیبانی و ارسال اشکال از راه منوی درس
          </p>
          <p className="text-[11px] leading-6 text-ink3">
            محتوای درس‌ها بر پایهٔ کتاب‌های درسی فارسی پایهٔ هفتم تا دوازدهم آماده شده است.
          </p>
        </Card>
      </div>
    </div>
  )
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 p-3.5">
      <span className="text-ink3">{icon}</span>
      <span className="flex-1 text-[13px] font-bold">{label}</span>
      {children}
    </div>
  )
}

function Switch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors', value ? 'bg-accent' : 'bg-line')}
    >
      <span className={cx('absolute top-0.5 size-5 rounded-full bg-white shadow transition-all', value ? 'right-0.5' : 'right-[22px]')} />
    </button>
  )
}
