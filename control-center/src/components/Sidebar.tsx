import {
  Activity,
  Briefcase,
  History,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  ReceiptText,
  Settings,
  ShieldAlert,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../lib/cn'
import { useI18n } from '../lib/i18n'

export type NavId =
  | 'overview'
  | 'agent'
  | 'signals'
  | 'portfolio'
  | 'orders'
  | 'backtest'
  | 'risk'
  | 'settings'

interface NavItem {
  id: NavId
  labelKey: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'overview', labelKey: 'nav.overview', icon: LayoutDashboard },
  { id: 'agent', labelKey: 'nav.agent', icon: Activity },
  { id: 'signals', labelKey: 'nav.signals', icon: Radio },
  { id: 'portfolio', labelKey: 'nav.portfolio', icon: Briefcase },
  { id: 'orders', labelKey: 'nav.orders', icon: ReceiptText },
  { id: 'backtest', labelKey: 'nav.backtest', icon: History },
  { id: 'risk', labelKey: 'nav.risk', icon: ShieldAlert },
  { id: 'settings', labelKey: 'nav.settings', icon: Settings },
]

interface SidebarProps {
  active: NavId
  onNavigate: (id: NavId) => void
  collapsed: boolean
  onToggleCollapse: () => void
  onClose?: () => void
}

export function Sidebar({ active, onNavigate, collapsed, onToggleCollapse, onClose }: SidebarProps) {
  const { t } = useI18n()

  return (
    <div className="flex h-full flex-col">
      {onClose && (
        <div className="flex items-center justify-between px-4 py-3 lg:hidden">
          <span className="text-sm font-semibold text-ink">{t('nav.navigation')}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('nav.closeNavigation')}
            className="rounded-md p-1.5 text-ink-secondary transition-colors hover:bg-white/5 hover:text-ink"
          >
            <X className="h-5 w-5" size={20} />
          </button>
        </div>
      )}

      <nav aria-label={t('nav.primary')} className="flex-1 overflow-y-auto px-3 py-3">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = item.id === active
            const Icon = item.icon
            const label = t(item.labelKey)
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  title={collapsed ? label : undefined}
                  className={cn(
                    'group relative flex w-full items-center gap-3 rounded-md py-2 text-sm font-medium transition-colors duration-200',
                    collapsed ? 'justify-center px-0' : 'px-3',
                    isActive
                      ? 'bg-accent-faint/70 text-ink'
                      : 'text-ink-secondary hover:bg-white/5 hover:text-ink',
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
                  )}
                  <Icon
                    className={cn(
                      'h-[18px] w-[18px] shrink-0 transition-colors',
                      isActive ? 'text-accent' : 'text-ink-muted group-hover:text-ink-secondary',
                    )}
                    size={18}
                  />
                  {!collapsed && <span className="truncate">{label}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {!onClose && (
        <div className="border-t border-line px-3 py-3">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            className="flex w-full items-center gap-3 rounded-md py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-white/5 hover:text-ink"
          >
            {collapsed ? (
              <PanelLeftOpen className="mx-auto h-[18px] w-[18px]" size={18} />
            ) : (
              <>
                <PanelLeftClose className="h-[18px] w-[18px]" size={18} />
                <span>{t('nav.collapse')}</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
