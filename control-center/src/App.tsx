import { useEffect, useMemo, useState } from 'react'
import { Construction, type LucideIcon } from 'lucide-react'
import { AppShell } from './components/AppShell'
import { EmptyState } from './components/EmptyState'
import { Overview } from './components/Overview'
import { NAV_ITEMS, type NavId } from './components/Sidebar'
import { useI18n } from './lib/i18n'

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
        <Overview />
      ) : (
        <PlaceholderView
          key={active}
          title={t(activeMeta?.labelKey ?? 'nav.overview')}
          icon={activeMeta?.icon ?? Construction}
          onBackToOverview={() => setActive('overview')}
        />
      )}
    </AppShell>
  )
}

function PlaceholderView({
  title,
  icon,
  onBackToOverview,
}: {
  title: string
  icon: LucideIcon
  onBackToOverview: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 lg:px-6">
      <div className="rounded-xl border border-line bg-surface">
        <EmptyState
          icon={icon}
          title={title}
          description={t('placeholder.description')}
          actionLabel={t('common.backToOverview')}
          onAction={onBackToOverview}
        />
      </div>
    </div>
  )
}
