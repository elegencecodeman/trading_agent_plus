import { useEffect, useRef, useState } from 'react'
import {
  Bell,
  Check,
  ChevronDown,
  Clock,
  Menu,
  Moon,
  Sun,
} from 'lucide-react'
import { cn } from '../lib/cn'
import { useI18n } from '../lib/i18n'
import { DemoModeBadge } from './DemoModeBadge'

type Theme = 'dark' | 'light'

interface TopBarProps {
  onOpenMobileNav: () => void
  updatedAt: string
  theme: Theme
  onToggleTheme: () => void
}

const WORKSPACE_KEYS = ['topbar.wsAlpha', 'topbar.wsMulti', 'topbar.wsVol']

const NOTIFICATIONS = [
  { id: 'n1', titleKey: 'topbar.notif1', time: '09:31:26', unread: true },
  { id: 'n2', titleKey: 'topbar.notif2', time: '09:30:04', unread: true },
  { id: 'n3', titleKey: 'topbar.notif3', time: '08:45:11', unread: false },
]

function Logo() {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-faint ring-1 ring-inset ring-accent/30">
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
        <path
          d="M4 17 L9 12 L13 15 L20 6"
          fill="none"
          stroke="#6EA8FE"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="20" cy="6" r="1.8" fill="#47D7E8" />
      </svg>
    </span>
  )
}

export function TopBar({ onOpenMobileNav, updatedAt, theme, onToggleTheme }: TopBarProps) {
  const { t, locale, setLocale } = useI18n()
  const [workspaceKey, setWorkspaceKey] = useState(WORKSPACE_KEYS[0])
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [read, setRead] = useState(false)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (workspaceRef.current && !workspaceRef.current.contains(e.target as Node)) setWorkspaceOpen(false)
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setWorkspaceOpen(false)
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const hasUnread = !read

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-app-nav px-4 lg:px-6">
      {/* Left cluster */}
      <button
        type="button"
        onClick={onOpenMobileNav}
        aria-label={t('topbar.openNavigation')}
        className="rounded-md p-1.5 text-ink-secondary transition-colors hover:bg-white/5 hover:text-ink lg:hidden"
      >
        <Menu className="h-5 w-5" size={20} />
      </button>

      <div className="flex items-center gap-2.5">
        <Logo />
        <div className="hidden sm:block">
          <p className="text-sm font-semibold leading-tight text-ink">{t('topbar.tradingAgent')}</p>
          <p className="text-[11px] leading-tight text-ink-muted">{t('topbar.controlCenter')}</p>
        </div>
      </div>

      {/* Workspace selector */}
      <div ref={workspaceRef} className="relative ml-1 hidden md:block">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={workspaceOpen}
          onClick={() => setWorkspaceOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface/60 px-2.5 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:border-ink-secondary/40 hover:text-ink"
        >
          {t(workspaceKey)}
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', workspaceOpen && 'rotate-180')} size={14} />
        </button>
        {workspaceOpen && (
          <ul
            role="listbox"
            aria-label={t('topbar.workspace')}
            className="absolute left-0 z-30 mt-2 w-52 animate-fade-in overflow-hidden rounded-lg border border-line bg-surface-2 p-1 shadow-card"
          >
            {WORKSPACE_KEYS.map((key) => (
              <li key={key} role="option" aria-selected={key === workspaceKey}>
                <button
                  type="button"
                  onClick={() => {
                    setWorkspaceKey(key)
                    setWorkspaceOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs font-medium transition-colors',
                    key === workspaceKey ? 'bg-accent-faint text-ink' : 'text-ink-secondary hover:bg-white/5 hover:text-ink',
                  )}
                >
                  {t(key)}
                  {key === workspaceKey && <Check className="h-3.5 w-3.5 text-accent" size={14} />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Right cluster */}
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <DemoModeBadge className="hidden sm:inline-flex" />

        {/* Market status */}
        <span className="hidden items-center gap-1.5 rounded-full border border-positive/25 bg-positive/10 px-2.5 py-1 text-[11px] font-medium text-positive xl:inline-flex">
          <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-positive" />
          {t('topbar.marketOpen')}
        </span>

        {/* Updated time */}
        <span className="hidden items-center gap-1.5 text-[11px] font-medium text-ink-muted lg:inline-flex">
          <Clock className="h-3.5 w-3.5" size={14} />
          <span className="tabular">{t('topbar.updated', { time: updatedAt })}</span>
        </span>

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            type="button"
            aria-label={t('topbar.notifications')}
            aria-haspopup="menu"
            aria-expanded={notifOpen}
            onClick={() => {
              setNotifOpen((v) => !v)
              setRead(true)
            }}
            className="relative rounded-lg p-2 text-ink-secondary transition-colors hover:bg-white/5 hover:text-ink"
          >
            <Bell className="h-[18px] w-[18px]" size={18} />
            {hasUnread && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-negative ring-2 ring-app-nav" />
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 z-30 mt-2 w-72 animate-fade-in overflow-hidden rounded-lg border border-line bg-surface-2 shadow-card">
              <div className="border-b border-line px-3 py-2 text-xs font-semibold text-ink">{t('topbar.notifications')}</div>
              <ul>
                {NOTIFICATIONS.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-white/5"
                    >
                      <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', n.unread ? 'bg-accent' : 'bg-line')} />
                      <span className="flex-1">
                        <span className="block text-xs font-medium text-ink">{t(n.titleKey)}</span>
                        <span className="block text-[11px] tabular text-ink-muted">{n.time}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Language toggle */}
        <div
          role="group"
          aria-label={t('topbar.language')}
          className="flex items-center rounded-lg border border-line bg-surface/60 p-0.5"
        >
          <button
            type="button"
            onClick={() => setLocale('zh')}
            aria-pressed={locale === 'zh'}
            className={cn(
              'rounded-md px-2 py-1 text-[11px] font-semibold leading-4 transition-colors',
              locale === 'zh' ? 'bg-accent-faint text-accent' : 'text-ink-secondary hover:text-ink',
            )}
          >
            中
          </button>
          <button
            type="button"
            onClick={() => setLocale('en')}
            aria-pressed={locale === 'en'}
            className={cn(
              'rounded-md px-2 py-1 text-[11px] font-semibold leading-4 transition-colors',
              locale === 'en' ? 'bg-accent-faint text-accent' : 'text-ink-secondary hover:text-ink',
            )}
          >
            EN
          </button>
        </div>

        {/* Theme toggle */}
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? t('topbar.switchToLight') : t('topbar.switchToDark')}
          className="rounded-lg p-2 text-ink-secondary transition-colors hover:bg-white/5 hover:text-ink"
        >
          {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" size={18} /> : <Moon className="h-[18px] w-[18px]" size={18} />}
        </button>

        {/* Avatar */}
        <button
          type="button"
          aria-label={t('topbar.accountMenu')}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-accent/70 to-ai/70 text-xs font-bold text-app ring-2 ring-line transition-transform hover:scale-105"
        >
          AR
        </button>
      </div>
    </header>
  )
}
