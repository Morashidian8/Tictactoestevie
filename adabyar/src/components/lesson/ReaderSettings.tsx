import { AnimatePresence, motion } from 'framer-motion'
import { Minus, Moon, Plus, Sun, Type } from 'lucide-react'
import { useSettings } from '@/store/settings'
import { cx } from '@/components/ui'
import { fa } from '@/lib/format'

export default function ReaderSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { readerScale, nastaliq, autoMeaning, theme, set } = useSettings()

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-2xl rounded-t-3xl border-t border-line bg-surface p-5 pb-8 safe-b"
          >
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-line" />
            <p className="mb-4 text-sm font-extrabold">تنظیمات مطالعه</p>

            {/* اندازهٔ متن */}
            <div className="mb-4 flex items-center justify-between rounded-2xl border border-line p-3">
              <span className="flex items-center gap-2 text-[13px] font-bold"><Type size={16} /> اندازهٔ متن</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => set({ readerScale: Math.max(0.85, +(readerScale - 0.1).toFixed(2)) })}
                  className="press grid size-8 place-items-center rounded-xl bg-surface2"
                ><Minus size={15} /></button>
                <span className="w-12 text-center text-[12px] font-bold">{fa(Math.round(readerScale * 100))}٪</span>
                <button
                  onClick={() => set({ readerScale: Math.min(1.6, +(readerScale + 0.1).toFixed(2)) })}
                  className="press grid size-8 place-items-center rounded-xl bg-surface2"
                ><Plus size={15} /></button>
              </div>
            </div>

            <Toggle
              label="خط نستعلیق برای شعرها"
              hint="زیباتر، اما کمی کندتر خوانده می‌شود"
              value={nastaliq}
              onChange={(v) => set({ nastaliq: v })}
            />
            <Toggle
              label="نمایش خودکار معنی"
              hint="معنی هر بیت زیر آن نشان داده شود"
              value={autoMeaning}
              onChange={(v) => set({ autoMeaning: v })}
            />

            <div className="mt-4 grid grid-cols-3 gap-2">
              {([['light', 'روشن', Sun], ['dark', 'تیره', Moon], ['system', 'سیستم', Type]] as const).map(
                ([k, label, Icon]) => (
                  <button
                    key={k}
                    onClick={() => set({ theme: k })}
                    className={cx(
                      'press flex flex-col items-center gap-1.5 rounded-2xl border py-3 text-[12px] font-bold',
                      theme === k ? 'border-accent bg-accentsoft text-accent' : 'border-line text-ink2',
                    )}
                  >
                    <Icon size={16} /> {label}
                  </button>
                ),
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function Toggle({ label, hint, value, onChange }: {
  label: string; hint?: string; value: boolean; onChange: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="mb-3 flex w-full items-center justify-between gap-3 rounded-2xl border border-line p-3 text-right"
    >
      <span>
        <span className="block text-[13px] font-bold">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] text-ink3">{hint}</span>}
      </span>
      <span className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors', value ? 'bg-accent' : 'bg-line')}>
        <motion.span
          layout
          className="absolute top-0.5 size-5 rounded-full bg-white shadow"
          animate={{ right: value ? 2 : 22 }}
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        />
      </span>
    </button>
  )
}
