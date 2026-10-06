import { useEffect, useMemo, useState } from 'react'
import { AppShell } from './components/AppShell'
import { AgentMonitorView } from './components/AgentMonitorView'
import { ComingSoonView } from './components/ComingSoonView'
import { HistoryView } from './components/HistoryView'
import { LoginDialog } from './components/LoginDialog'
import { Overview } from './components/Overview'
import { PortfolioView } from './components/PortfolioView'
import { RiskView } from './components/RiskView'
import { SignalsView } from './components/SignalsView'
import { NAV_ITEMS, type NavId } from './components/Sidebar'
import { useI18n } from './lib/i18n'
import { RunProvider } from './lib/run'

type Theme = 'dark' | 'light'

export default function App() {
  const { t } = useI18n()
  const [active, setActive] = useState<NavId>('overview')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const activeMeta = useMemo(() => NAV_ITEMS.find((n) => n.id === active), [active])

  return (
    <RunProvider>
      <AppShell
        active={active}
        onNavigate={setActive}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        mobileNavOpen={mobileNavOpen}
        onOpenMobileNav={() => setMobileNavOpen(true)}
        onCloseMobileNav={() => setMobileNavOpen(false)}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        updatedAt="19 Aug 2026 · 09:31 ET"
      >
        {active === 'overview' ? (
          <Overview onNavigate={setActive} />
        ) : active === 'history' ? (
          <HistoryView />
        ) : active === 'agent' ? (
          <AgentMonitorView />
        ) : active === 'signals' ? (
          <SignalsView />
        ) : active === 'portfolio' ? (
          <PortfolioView />
        ) : active === 'risk' ? (
          <RiskView />
        ) : (
          <ComingSoonView
            icon={activeMeta?.icon ?? NAV_ITEMS[0].icon}
            title={t(activeMeta?.labelKey ?? 'nav.overview')}
          />
        )}

        {/* Rendered at the shell level so any view can raise it via useAuth(). */}
        <LoginDialog />
      </AppShell>
    </RunProvider>
  )
}
