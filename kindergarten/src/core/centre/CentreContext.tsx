import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useData } from '../auth/index.ts'
import type { Centre } from '../data/index.ts'

/**
 * هویت مهدِ حسابِ باز — نام و نشانی که در سرصفحهٔ هر سه پنل می‌نشیند.
 *
 * ── چرا یک زمینه (context) و نه یک خواندن در هر صفحه ────────────
 *
 * نام و نشان مهد در سرصفحه‌اند، یعنی در **هر** صفحه. اگر هر صفحه
 * خودش می‌خواندش، باز کردن پنل مدیر چهار بار همان یک سطر را می‌گرفت
 * و سرصفحه هنگام جابه‌جایی بین صفحه‌ها یک لحظه بی‌نشان می‌شد.
 *
 * یک‌بار خوانده می‌شود، و فقط وقتی مدیر عوضش کرد دوباره.
 *
 * ── چرا نامِ آخرین مهد در حافظهٔ مرورگر می‌ماند ──────────────────
 *
 * صفحهٔ ورود پیش از احراز هویت است و هیچ حسابی ندارد، پس نمی‌تواند
 * بپرسد «کدام مهد». ولی برای خانواده‌ای که هر روز همین یک مهد را باز
 * می‌کند، همان صفحهٔ اول باید مهدِ خودش باشد. نام و نشان — نه چیزی
 * بیشتر — تا ورودِ بعدی می‌ماند.
 */
const LAST_CENTRE_KEY = 'kg.centre'

export type LastCentre = { name: string; logoUrl: string | null }

export function readLastCentre(): LastCentre | null {
  try {
    const raw = localStorage.getItem(LAST_CENTRE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LastCentre>
    if (typeof parsed.name !== 'string' || !parsed.name) return null
    return { name: parsed.name, logoUrl: parsed.logoUrl ?? null }
  } catch {
    return null
  }
}

function rememberCentre(centre: Centre): void {
  try {
    localStorage.setItem(
      LAST_CENTRE_KEY,
      JSON.stringify({ name: centre.name, logoUrl: centre.logoUrl } satisfies LastCentre),
    )
  } catch {
    // حالت ناشناس یا سهمیهٔ پر. صفحهٔ ورود بی‌نشان می‌ماند، و بس.
  }
}

type CentreState = {
  /** تا نیامده null است — سرصفحه همان لحظه شخصیتِ نقش را نشان می‌دهد. */
  centre: Centre | null
  /** پس از تغییرِ مدیر. سرصفحه بی نوسازی صفحه به‌روز می‌شود. */
  setCentre: (next: Centre) => void
}

const CentreContext = createContext<CentreState | null>(null)

export function CentreProvider({ children }: { children: ReactNode }) {
  const data = useData()
  const [centre, setStored] = useState<Centre | null>(null)

  const setCentre = useCallback((next: Centre) => {
    setStored(next)
    rememberCentre(next)
  }, [])

  useEffect(() => {
    let cancelled = false
    data
      .getMyCentre()
      .then((row) => {
        if (cancelled) return
        setStored(row)
        rememberCentre(row)
      })
      /*
       * نبودنِ نام مهد، پنل را نمی‌بندد.
       *
       * سرصفحه بی آن هم کار می‌کند — شخصیتِ نقش سرِ جایش است — و
       * بستن پنل به خاطر یک تزئین، بدترین معاملهٔ ممکن است.
       */
      .catch(() => {
        if (!cancelled) setStored(null)
      })
    return () => {
      cancelled = true
    }
  }, [data])

  const value = useMemo(() => ({ centre, setCentre }), [centre, setCentre])
  return <CentreContext.Provider value={value}>{children}</CentreContext.Provider>
}

export function useCentre(): CentreState {
  const found = useContext(CentreContext)
  if (!found) throw new Error('CentreProvider بالای این درخت نیست')
  return found
}
