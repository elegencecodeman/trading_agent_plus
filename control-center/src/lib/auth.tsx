/**
 * Auth context: who is signed in, and how to sign in / out.
 *
 * The token itself lives in ``lib/api.ts`` (module-level, localStorage-backed)
 * so non-React callers like ``EventSource`` can reach it. This provider owns
 * the *user* and the login-dialog state.
 *
 * Guest access is first-class: ``user === null`` is a normal state, not an
 * error. Components that need an account (running the agent, viewing history)
 * call ``requireAuth()``, which opens the login dialog and returns false —
 * that keeps the "you must sign in" decision in one place instead of scattered
 * ``if (!user)`` branches.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as api from './api'
import { ApiError, setAuthToken } from './api'
import type { AuthUser } from '../types'

interface AuthContextValue {
  user: AuthUser | null
  /** True while a stored token is being validated on first paint. */
  initializing: boolean
  /** Login dialog visibility — driven globally, opened via ``requireAuth``. */
  loginOpen: boolean
  openLogin: () => void
  closeLogin: () => void
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string, displayName?: string) => Promise<void>
  logout: () => void
  /** Returns true when signed in; otherwise opens the dialog and returns false. */
  requireAuth: () => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [initializing, setInitializing] = useState(true)
  const [loginOpen, setLoginOpen] = useState(false)

  // Validate any stored token once, so a returning user is already signed in
  // (and a stale/expired token is discarded rather than causing 401s later).
  useEffect(() => {
    let cancelled = false
    if (!api.getAuthToken()) {
      setInitializing(false)
      return
    }
    api
      .fetchMe()
      .then((me) => {
        if (!cancelled) setUser(me)
      })
      .catch(() => {
        if (!cancelled) setAuthToken(null)
      })
      .finally(() => {
        if (!cancelled) setInitializing(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // A 401 on any authenticated call means the session died (expired or
  // revoked token, e.g. after a server-side secret change). Recover the same
  // way a failed startup validation does: drop the token and ask for sign-in.
  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      setAuthToken(null)
      setUser(null)
      setLoginOpen(true)
    })
    return () => api.setUnauthorizedHandler(null)
  }, [])

  const adopt = useCallback((res: { access_token: string; user: AuthUser }) => {
    setAuthToken(res.access_token)
    setUser(res.user)
    setLoginOpen(false)
  }, [])

  const login = useCallback(
    async (username: string, password: string) => {
      adopt(await api.login(username, password))
    },
    [adopt],
  )

  const register = useCallback(
    async (username: string, password: string, displayName?: string) => {
      adopt(await api.register(username, password, displayName))
    },
    [adopt],
  )

  const logout = useCallback(() => {
    setAuthToken(null)
    setUser(null)
  }, [])

  const requireAuth = useCallback(() => {
    if (user) return true
    setLoginOpen(true)
    return false
  }, [user])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      initializing,
      loginOpen,
      openLogin: () => setLoginOpen(true),
      closeLogin: () => setLoginOpen(false),
      login,
      register,
      logout,
      requireAuth,
    }),
    [user, initializing, loginOpen, login, register, logout, requireAuth],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}

/** Turn an unknown thrown value into a message worth showing a user. */
export function authErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return fallback
}
