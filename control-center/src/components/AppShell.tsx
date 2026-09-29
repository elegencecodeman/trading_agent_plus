import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Sidebar, type NavId } from './Sidebar'
import { TopBar } from './TopBar'

type Theme = 'dark' | 'light'

interface AppShellProps {
  active: NavId
  onNavigate: (id: NavId) => void
  collapsed: boolean
  onToggleCollapse: () => void
  mobileNavOpen: boolean
  onOpenMobileNav: () => void
  onCloseMobileNav: () => void
  theme: Theme
  onToggleTheme: () => void
  updatedAt: string
  children: ReactNode
}

export function AppShell({
  active,
  onNavigate,
  collapsed,
  onToggleCollapse,
  mobileNavOpen,
  onOpenMobileNav,
  onCloseMobileNav,
  theme,
  onToggleTheme,
  updatedAt,
  children,
}: AppShellProps) {
  return (
    <div className="flex h-full overflow-hidden bg-app">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden shrink-0 border-r border-line bg-app-nav transition-[width] duration-200 ease-ui lg:block',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <Sidebar
          active={active}
          onNavigate={onNavigate}
          collapsed={collapsed}
          onToggleCollapse={onToggleCollapse}
        />
      </aside>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-black/60" onClick={onCloseMobileNav} aria-hidden />
          <div className="absolute inset-y-0 left-0 w-60 animate-slide-in-left border-r border-line bg-app-nav shadow-drawer">
            <Sidebar
              active={active}
              onNavigate={(id) => {
                onNavigate(id)
                onCloseMobileNav()
              }}
              collapsed={false}
              onToggleCollapse={onToggleCollapse}
              onClose={onCloseMobileNav}
            />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          onOpenMobileNav={onOpenMobileNav}
          updatedAt={updatedAt}
          theme={theme}
          onToggleTheme={onToggleTheme}
        />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
