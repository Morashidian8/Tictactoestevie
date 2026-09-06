import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowRight, BookOpenCheck, Check, Crown, Infinity as InfIcon, Layers, ShieldCheck, Timer,
} from 'lucide-react'
import { Button, Card, Chip, cx } from '@/components/ui'
import { useEntitlement } from '@/store/entitlement'
import { fa } from '@/lib/format'

const PLANS = [
  { id: 'month', title: 'یک‌ماهه', price: '۴۹٬۰۰۰', per: 'تومان / ماه', note: '' },
  { id: 'term', title: 'یک‌ترمه (۶ ماه)', price: '۱۹۹٬۰۰۰', per: 'تومان', note: 'محبوب‌ترین — ۳۲٪ تخفیف', best: true },
  { id: 'year', title: 'یک‌ساله', price: '۳۲۹٬۰۰۰', per: 'تومان', note: '۴۵٪ تخفیف' },
]

const FEATURES = [
  { icon: BookOpenCheck, t: 'همهٔ درس‌های شش پایه', d: 'تدریس کامل، معنی بیت‌به‌بیت، آرایه و دستور' },
  { icon: Timer, t: 'آزمون نامحدود', d: 'آزمون هر درس + آزمون‌ساز دلخواه و آزمون نوبت' },
  { icon: Layers, t: 'جعبهٔ مرور نامحدود', d: 'فلش‌کارت با زمان‌بندی هوشمند لایتنر' },
  { icon: InfIcon, t: 'کاملاً آفلاین', d: 'یک‌بار نصب، همیشه در دسترس — بدون اینترنت' },
  { icon: ShieldCheck, t: 'بدون تبلیغات', d: 'هیچ حواس‌پرتی؛ فقط درس' },
]

export default function Paywall() {
  const nav = useNavigate()
  const ent = useEntitlement()
  const [plan, setPlan] = useState('term')
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const redeem = () => {
    const r = ent.activate(code)
    setMsg({ ok: r.ok, text: r.message })
    if (r.ok) setTimeout(() => nav(-1), 1200)
  }

  if (ent.isPremium()) {
    return (
      <div className="px-4 pt-6">
        <Card className="border-amber-500/35 bg-amber-500/5 text-center">
          <Crown size={30} className="mx-auto text-gold" />
          <p className="mt-3 text-[16px] font-extrabold">اشتراک ویژه فعال است</p>
          <p className="mt-1.5 text-[12px] text-ink3">
            {ent.expiresAt
              ? `تا ${new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'long' }).format(ent.expiresAt)}`
              : 'مادام‌العمر'}
          </p>
          <Button className="mt-5" full onClick={() => nav('/')}>بازگشت به درس‌ها</Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-dvh px-4 pt-6 pb-10">
      <button onClick={() => nav(-1)} className="press mb-5 grid size-10 place-items-center rounded-2xl border border-line bg-surface">
        <ArrowRight size={18} />
      </button>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-3xl bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-xl shadow-amber-500/25 floaty">
          <Crown size={28} />
        </div>
        <h1 className="mt-4 text-2xl font-extrabold">ادب‌یار ویژه</h1>
        <p className="mx-auto mt-2 max-w-xs text-[13px] leading-7 text-ink2">
          کل ادبیات فارسی متوسطه در جیبت — بدون کتاب، بدون کلاس، بدون اینترنت.
        </p>
      </motion.div>

      {/* ویژگی‌ها */}
      <div className="mt-7 space-y-2.5">
        {FEATURES.map(({ icon: Icon, t, d }, i) => (
          <motion.div key={t} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="flex items-start gap-3 py-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-gold">
                <Icon size={17} />
              </div>
              <div>
                <p className="text-[13px] font-bold">{t}</p>
                <p className="mt-0.5 text-[11px] leading-6 text-ink3">{d}</p>
              </div>
              <Check size={16} className="ms-auto mt-1 shrink-0 text-emerald-500" />
            </Card>
          </motion.div>
        ))}
      </div>

      {/* طرح‌ها */}
      <p className="mt-7 mb-3 text-[13px] font-extrabold">طرح اشتراک را انتخاب کن</p>
      <div className="space-y-2.5">
        {PLANS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPlan(p.id)}
            className={cx(
              'press relative flex w-full items-center gap-3 rounded-2xl border p-4 text-right',
              plan === p.id ? 'border-accent bg-accentsoft' : 'border-line bg-surface',
            )}
          >
            <span className={cx('grid size-5 shrink-0 place-items-center rounded-full border-2',
              plan === p.id ? 'border-accent bg-accent text-white' : 'border-line')}>
              {plan === p.id && <Check size={12} />}
            </span>
            <span className="flex-1">
              <span className="block text-[14px] font-extrabold">{p.title}</span>
              {p.note && <span className="mt-0.5 block text-[11px] text-gold">{p.note}</span>}
            </span>
            <span className="text-left">
              <span className="block text-[15px] font-extrabold">{p.price}</span>
              <span className="block text-[10px] text-ink3">{p.per}</span>
            </span>
            {p.best && <Chip tone="gold" className="absolute -top-2 start-4">پیشنهاد ما</Chip>}
          </button>
        ))}
      </div>

      <Button size="lg" full className="mt-5" disabled>
        خرید اشتراک (به‌زودی)
      </Button>
      <p className="mt-2 text-center text-[11px] leading-6 text-ink3">
        درگاه پرداخت در نسخهٔ منتشرشده روی کافه‌بازار / مایکت فعال می‌شود.
      </p>

      {/* کد فعال‌سازی */}
      <Card className="mt-6">
        <p className="text-[13px] font-extrabold">کد فعال‌سازی داری؟</p>
        <div className="mt-3 flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ADAB-XXXX-XXXX"
            className="h-11 flex-1 rounded-2xl border border-line bg-surface px-3.5 text-[13px] outline-none focus:border-accent"
            dir="ltr"
          />
          <Button onClick={redeem} disabled={code.trim().length < 4}>فعال‌سازی</Button>
        </div>
        {msg && (
          <p className={cx('mt-2.5 text-[12px] font-bold', msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500')}>
            {msg.text}
          </p>
        )}
        <p className="mt-3 text-[11px] leading-6 text-ink3">
          کد آزمایشی برای مرور محتوا: <span dir="ltr" className="font-bold">ADAB-1404-DEMO</span> ({fa(7)} روز)
        </p>
      </Card>

      <p className="mt-6 text-center text-[11px] leading-6 text-ink3">
        درس‌های ستایش و دو درس نخست هر پایه همیشه رایگان‌اند.
      </p>
    </div>
  )
}
