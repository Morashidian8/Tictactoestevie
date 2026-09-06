import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { BookOpen, Home, Layers, TrendingUp, User } from 'lucide-react'
import { cx } from './ui'
import { useSrs, dueCards } from '@/store/srs'
import { fa } from '@/lib/format'

const TABS = [
  { to: '/', icon: Home, label: 'خانه' },
  { to: '/library', icon: BookOpen, label: 'کتابخانه' },
  { to: '/review', icon: Layers, label: 'مرور' },
  { to: '/progress', icon: TrendingUp, label: 'پیشرفت' },
  { to: '/profile', icon: User, label: 'من' },
]

/** مسیرهایی که نوار پایین را پنهان می‌کنند (مطالعه و آزمون تمام‌صفحه) */
function hidesNav(path: string): boolean {
  return /^\/lesson\//.test(path) || path === '/premium'
}

export default function Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const due = useSrs((s) => dueCards(s.cards).length)
  const bare = hidesNav(pathname)

  return (
    <div className="aurora relative min-h-dvh">
      <main className={cx('relative z-10 mx-auto w-full max-w-2xl', bare ? 'pb-6' : 'pb-28')}>
        {children}
      </main>

      {!bare && (
        <nav className="fixed inset-x-0 bottom-0 z-40 safe-b">
          <div className="mx-auto max-w-2xl px-3 pb-3">
            <div className="glass flex items-center justify-around rounded-3xl border border-line p-1.5 shadow-2xl shadow-black/10">
              {TABS.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    cx(
                      'press relative flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 text-[10px] font-bold transition-colors',
                      isActive ? 'text-accent' : 'text-ink3',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span className="absolute inset-0 -z-10 rounded-2xl bg-accentsoft" />
                      )}
                      <span className="relative">
                        <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
                        {to === '/review' && due > 0 && (
                          <span className="absolute -end-2 -top-1.5 grid min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                            {fa(due > 99 ? '۹۹+' : due)}
                          </span>
                        )}
                      </span>
                      {label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        </nav>
      )}
    </div>
  )
}
