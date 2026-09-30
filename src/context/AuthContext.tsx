import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { fetchCurrentUser, logoutRequest } from '../lib/auth'
import { setAuthErrorCallback } from '../lib/errorHandler'
import type { AuthUser } from '../types/entities'

type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  isAdmin: boolean
  isSuperAdmin: boolean
  isBanned: boolean
  refreshAuth: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  isAdmin: false,
  isSuperAdmin: false,
  isBanned: false,
  refreshAuth: async () => {},
  logout: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const initializedRef = useRef(false)

  const refreshAuth = useCallback(async () => {
    try {
      const next = await fetchCurrentUser()
      setUser(next)
    } catch {
      setUser(null)
    } finally {
      initializedRef.current = true
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // 首屏优先渲染，登录态延迟一拍再取
    const timer = window.setTimeout(() => {
      void refreshAuth()
    }, 50)
    return () => window.clearTimeout(timer)
  }, [refreshAuth])

  const logout = useCallback(async () => {
    try {
      await logoutRequest()
    } finally {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    setAuthErrorCallback(() => {
      void refreshAuth()
    })
    return () => setAuthErrorCallback(null)
  }, [refreshAuth])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAdmin: user?.role === 'admin' || user?.role === 'super_admin',
      isSuperAdmin: user?.role === 'super_admin',
      isBanned: user?.status === 'banned',
      refreshAuth,
      logout,
    }),
    [user, loading, refreshAuth, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
