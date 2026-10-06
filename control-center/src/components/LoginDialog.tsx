/**
 * Centered login / register modal.
 *
 * Opened from anywhere via ``useAuth().requireAuth()`` or ``openLogin()``, so it
 * renders unconditionally and decides for itself whether to show. Mirrors the
 * overlay/escape/focus conventions of ``AgentMonitorDrawer`` but as a centered
 * card rather than a right-hand panel.
 */

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Loader2, Lock, LogIn, User as UserIcon, X } from 'lucide-react'
import { authErrorMessage, useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { cn } from '../lib/cn'

type Mode = 'login' | 'register'

const MIN_PASSWORD = 8

export function LoginDialog() {
  const { t } = useI18n()
  const { loginOpen, closeLogin, login, register } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const firstFieldRef = useRef<HTMLInputElement>(null)

  // Reset the form each time the dialog opens so a failed attempt never
  // pre-fills the next one.
  useEffect(() => {
    if (!loginOpen) return
    setError(null)
    setBusy(false)
    setPassword('')
    const id = window.setTimeout(() => firstFieldRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [loginOpen, mode])

  // Escape to dismiss, and keep Tab inside the dialog while it is open.
  useEffect(() => {
    if (!loginOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLogin()
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [loginOpen, closeLogin])

  if (!loginOpen) return null

  const isRegister = mode === 'register'
  const canSubmit =
    username.trim().length >= 3 && (isRegister ? password.length >= MIN_PASSWORD : password.length > 0)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit || busy) return
    setBusy(true)
    setError(null)
    try {
      if (isRegister) await register(username.trim(), password, displayName.trim() || undefined)
      else await login(username.trim(), password)
      setUsername('')
      setDisplayName('')
    } catch (err) {
      setError(authErrorMessage(err, t('auth.failed')))
    } finally {
      setBusy(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-line bg-surface/60 px-3 py-2 text-xs text-ink placeholder:text-ink-muted outline-none transition-colors focus:border-accent/50'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t('common.close')}
        className="absolute inset-0 cursor-default bg-black/60"
        onClick={closeLogin}
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={isRegister ? t('auth.registerTitle') : t('auth.loginTitle')}
        className="relative w-full max-w-sm animate-fade-in rounded-xl border border-line bg-app p-6 shadow-card"
      >
        <button
          type="button"
          onClick={closeLogin}
          aria-label={t('common.close')}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-white/5 hover:text-ink"
        >
          <X size={14} />
        </button>

        <div className="mb-5">
          <h2 className="text-sm font-semibold text-ink">
            {isRegister ? t('auth.registerTitle') : t('auth.loginTitle')}
          </h2>
          <p className="mt-1 text-xs text-ink-muted">
            {isRegister ? t('auth.registerSubtitle') : t('auth.loginSubtitle')}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
              {t('auth.username')}
            </span>
            <div className="relative">
              <UserIcon size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                ref={firstFieldRef}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder={t('auth.usernamePlaceholder')}
                className={cn(inputClass, 'pl-8')}
              />
            </div>
          </label>

          {isRegister && (
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                {t('auth.displayName')}
              </span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="nickname"
                placeholder={t('auth.displayNamePlaceholder')}
                className={inputClass}
              />
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
              {t('auth.password')}
            </span>
            <div className="relative">
              <Lock size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                placeholder={isRegister ? t('auth.passwordHint') : '••••••••'}
                className={cn(inputClass, 'pl-8')}
              />
            </div>
          </label>

          {error && (
            <p className="rounded-lg bg-negative/10 px-3 py-2 text-[11px] text-negative ring-1 ring-inset ring-negative/25">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit || busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-app transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <LogIn size={13} />}
            {isRegister ? t('auth.registerAction') : t('auth.loginAction')}
          </button>
        </form>

        <p className="mt-4 text-center text-[11px] text-ink-muted">
          {isRegister ? t('auth.haveAccount') : t('auth.noAccount')}{' '}
          <button
            type="button"
            onClick={() => setMode(isRegister ? 'login' : 'register')}
            className="font-semibold text-accent transition-colors hover:text-accent/80"
          >
            {isRegister ? t('auth.loginAction') : t('auth.registerAction')}
          </button>
        </p>
      </div>
    </div>
  )
}
