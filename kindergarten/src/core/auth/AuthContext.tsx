import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AccessScope, DataAccess } from '../data/types.ts'
import { createDataAccess } from '../data/index.ts'
import { createPassthroughQueue, type WriteQueue } from '../sync/index.ts'
import type { AccountOption, AuthAdapter, Session } from './types.ts'

type AuthState = {
  session: Session | null
  loading: boolean
  requestCode: (phone: string) => Promise<void>
  verifyCode: (phone: string, code: string) => Promise<AccountOption[]>
  selectAccount: (accountId: string) => Promise<void>
  signOut: () => Promise<void>
  /**
   * لایه دسترسی به داده، ساخته‌شده با دامنه حساب فعال.
   *
   * وقتی حسابی فعال نیست، null است. هیچ صفحه‌ای نمی‌تواند بدون حساب فعال
   * به داده برسد، و هیچ صفحه‌ای هم center_id را دست نمی‌زند.
   */
  data: DataAccess | null
  queue: WriteQueue
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({
  adapter,
  children,
}: {
  adapter: AuthAdapter
  children: ReactNode
}) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const queue = useMemo(() => createPassthroughQueue(), [])

  useEffect(() => {
    let cancelled = false
    adapter
      .restore()
      .then((restored) => {
        if (!cancelled) setSession(restored)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [adapter])

  const requestCode = useCallback((phone: string) => adapter.requestCode(phone), [adapter])

  const verifyCode = useCallback(
    async (phone: string, code: string) => {
      const accounts = await adapter.verifyCode(phone, code)
      setSession(await adapter.restore())
      return accounts
    },
    [adapter],
  )

  const selectAccount = useCallback(
    async (accountId: string) => {
      await adapter.selectAccount(accountId)
      setSession(await adapter.restore())
    },
    [adapter],
  )

  const signOut = useCallback(async () => {
    await adapter.signOut()
    setSession(null)
  }, [adapter])

  const data = useMemo(() => {
    if (!session?.active) return null
    const scope: AccessScope = {
      accountId: session.active.id,
      centerId: session.active.centerId,
      role: session.active.role,
      classIds: session.active.classIds,
    }
    return createDataAccess(scope)
  }, [session])

  const value = useMemo(
    () => ({ session, loading, requestCode, verifyCode, selectAccount, signOut, data, queue }),
    [session, loading, requestCode, verifyCode, selectAccount, signOut, data, queue],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth باید داخل AuthProvider استفاده شود')
  return value
}

/** لایه داده حساب فعال. اگر حسابی فعال نباشد، خطا می‌دهد. */
export function useData(): DataAccess {
  const { data } = useAuth()
  if (!data) throw new Error('حساب فعالی وجود ندارد')
  return data
}
