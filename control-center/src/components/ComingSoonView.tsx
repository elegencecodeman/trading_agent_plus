import { Hammer, type LucideIcon } from 'lucide-react'
import { useI18n } from '../lib/i18n'

interface ComingSoonViewProps {
  icon: LucideIcon
  title: string
}

/**
 * Unified "planned" placeholder for menu items whose backend feature does not
 * exist yet (Orders / Backtest / Settings). Replaces the old generic EmptyState
 * so the console reads as "roadmapped" rather than "broken".
 */
export function ComingSoonView({ icon: Icon, title }: ComingSoonViewProps) {
  const { t } = useI18n()
  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 lg:px-6">
      <div className="rounded-xl border border-line bg-surface">
        <div className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface-2 text-ink-muted">
            <Icon className="h-6 w-6" size={24} />
          </div>
          <div className="space-y-1.5">
            <p className="text-base font-semibold text-ink">{title}</p>
            <p className="mx-auto max-w-md text-sm leading-6 text-ink-secondary">
              {t('comingsoon.description')}
            </p>
          </div>
          <span className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
            <Hammer className="h-3.5 w-3.5" size={14} />
            {t('comingsoon.badge')}
          </span>
        </div>
      </div>
    </div>
  )
}
