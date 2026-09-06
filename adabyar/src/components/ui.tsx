import { motion } from 'framer-motion'
import type { ReactNode, ButtonHTMLAttributes } from 'react'
import { fa } from '@/lib/format'

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/* ---------------- دکمه ---------------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'solid' | 'soft' | 'ghost' | 'outline' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  full?: boolean
  icon?: ReactNode
}

export function Button({
  variant = 'solid', size = 'md', full, icon, className, children, ...rest
}: BtnProps) {
  const sizes = {
    sm: 'h-9 px-3 text-[13px] rounded-xl gap-1.5',
    md: 'h-11 px-4 text-sm rounded-2xl gap-2',
    lg: 'h-14 px-6 text-base rounded-2xl gap-2.5',
  }[size]
  const variants = {
    solid: 'bg-accent text-white shadow-lg shadow-accent/25 hover:brightness-110',
    soft: 'bg-accentsoft text-accent hover:brightness-105',
    ghost: 'text-ink2 hover:bg-surface2',
    outline: 'border border-line text-ink hover:bg-surface2',
    danger: 'bg-rose-500 text-white hover:brightness-110',
  }[variant]
  return (
    <button
      className={cx(
        'press inline-flex items-center justify-center font-semibold select-none',
        'disabled:opacity-45 disabled:pointer-events-none',
        sizes, variants, full && 'w-full', className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}

/* ---------------- کارت ---------------- */
export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & Record<string, unknown>) {
  return (
    <div className={cx('card p-4', className)} {...rest}>
      {children}
    </div>
  )
}

/* ---------------- برچسب ---------------- */
export function Chip({ children, tone = 'default', className }: {
  children: ReactNode
  tone?: 'default' | 'accent' | 'gold' | 'green' | 'rose'
  className?: string
}) {
  const tones = {
    default: 'bg-surface2 text-ink2 border-line',
    accent: 'bg-accentsoft text-accent border-transparent',
    gold: 'bg-amber-500/12 text-gold border-amber-500/25',
    green: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
    rose: 'bg-rose-500/12 text-rose-600 dark:text-rose-400 border-rose-500/25',
  }[tone]
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold', tones, className)}>
      {children}
    </span>
  )
}

/* ---------------- نوار پیشرفت ---------------- */
export function Progress({ value, className, tone = 'accent' }: {
  value: number
  className?: string
  tone?: 'accent' | 'grade' | 'gold'
}) {
  const bar = {
    accent: 'bg-accent',
    grade: 'grade-grad',
    gold: 'bg-gradient-to-l from-amber-400 to-amber-600',
  }[tone]
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full bg-surface2', className)}>
      <motion.div
        className={cx('h-full rounded-full', bar)}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      />
    </div>
  )
}

/* ---------------- حلقهٔ پیشرفت ---------------- */
export function Ring({ value, size = 56, stroke = 6, children }: {
  value: number
  size?: number
  stroke?: number
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
          className="stroke-line" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
          strokeLinecap="round" className="stroke-accent"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (c * Math.min(100, value)) / 100 }}
          transition={{ type: 'spring', stiffness: 90, damping: 18 }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-[11px] font-bold">
        {children ?? `${fa(Math.round(value))}٪`}
      </div>
    </div>
  )
}

/* ---------------- حالت خالی ---------------- */
export function Empty({ icon, title, hint, action }: {
  icon?: ReactNode
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      {icon && <div className="grid size-16 place-items-center rounded-3xl bg-surface2 text-ink3">{icon}</div>}
      <p className="text-base font-bold">{title}</p>
      {hint && <p className="max-w-xs text-[13px] leading-7 text-ink3">{hint}</p>}
      {action}
    </div>
  )
}

/* ---------------- عنوان بخش ---------------- */
export function SectionTitle({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-[15px] font-extrabold">
        <span className="h-4 w-1 rounded-full bg-accent" />
        {children}
      </h2>
      {extra}
    </div>
  )
}

/* ---------------- اسکلت بارگذاری ---------------- */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('relative overflow-hidden rounded-2xl bg-surface2 shimmer', className)} />
}
