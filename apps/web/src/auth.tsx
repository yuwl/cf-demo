import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ApiError, api, getToken, setToken } from './api'
import type { PublicUser } from './types'

interface AuthContextValue {
  user: PublicUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  setUser: (user: PublicUser) => void
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const result = await api.me()
      setUser(result.user)
    } catch (error) {
      // 令牌失效就清掉，避免每次刷新都拿着废 token 反复请求
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setToken(null)
      }
      setUser(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await refresh()
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [refresh])

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.login({ email, password })
    setToken(result.token)
    setUser(result.user)
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, logout, setUser, refresh }),
    [user, loading, login, logout, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth 必须在 AuthProvider 内部使用')
  }
  return context
}
