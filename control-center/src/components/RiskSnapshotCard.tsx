import { ShieldCheck, ShieldAlert } from 'lucide-react'
import { cn } from '../lib/cn'
import { useI18n } from '../lib/i18n'
import type { RiskLevel, RiskSnapshot } from '../types'
import { riskTone, StatusBadge } from './StatusBadge'

interface RiskSnapshotCardProps {
  risk: RiskSnapshot
  onOpenRisk?: () => void
}

interface Bar {
  labelKey: string
  value: number
  limit: number
  warn: number
  crit: number
}

function level(value: number, warn: number, crit: number): RiskLevel {
  if (value >= crit) return 'critical'
  if (value >= warn) return 'warning'
  return 'normal'
}

const LEVEL_BAR: Record<RiskLevel, string> = {
  normal: 'bg-positive',
  warning: 'bg-warning',
  critical: 'bg-negative',
}

export function RiskSnapshotCard({ risk, onOpenRisk }: RiskSnapshotCardProps) {
  const { t } = useI18n()
  const bars: Bar[] = [
    { labelKey: 'risk.totalExposure', value: risk.totalExposure, limit: 65, warn: 50, crit: 65 },
    { labelKey: 'risk.maxDrawdown', value: risk.maxDrawdown, limit: 8, warn: 5, crit: 8 },
    { labelKey: 'risk.volatility', value: risk.volatility, limit: 25, warn: 20, crit: 25 },
    { labelKey: 'risk.concentration', value: risk.concentration, limit: 45, warn: 30, crit: 45 },
  ]

  const triggersLevel: RiskLevel = risk.stopLossTriggers === 0 ? 'normal' : risk.stopLossTriggers >= 3 ? 'critical' : 'warning'

  return (
    <div className="flex h-full flex-col rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">{t('risk.riskSnapshot')}</h2>
        <StatusBadge tone={riskTone(risk.level)} label={t(`riskLevel.${risk.level}`)} icon={risk.level === 'normal' ? ShieldCheck : ShieldAlert} />
      </div>

      <div className="mt-4 space-y-4">
        {bars.map((bar) => {
          const lvl = level(bar.value, bar.warn, bar.crit)
          const pct = Math.min(100, (bar.value / bar.limit) * 100)
          return (
            <div key={bar.labelKey}>
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-medium text-ink-secondary">{t(bar.labelKey)}</span>
                <span className="font-mono text-xs font-semibold text-ink tabular">
                  {bar.value}%
                  <span className="ml-1 font-sans text-[10px] font-normal text-ink-muted">/ {bar.limit}%</span>
                </span>
              </div>
              <div className="relative mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                <div
                  className={cn('h-full rounded-full transition-[width] duration-300 ease-ui', LEVEL_BAR[lvl])}
                  style={{ width: `${pct}%` }}
                />
                <div
                  className="absolute inset-y-0 w-px bg-ink/30"
                  style={{ left: `${Math.min(100, (bar.warn / bar.limit) * 100)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-line pt-3">
        <div className="flex items-center gap-2">
          {triggersLevel === 'normal' ? (
            <ShieldCheck className="h-4 w-4 text-positive" size={16} />
          ) : (
            <ShieldAlert className="h-4 w-4 text-warning" size={16} />
          )}
          <span className="text-[11px] font-medium text-ink-secondary">{t('risk.stopLossTriggers')}</span>
        </div>
        <span
          className={cn(
            'font-mono text-sm font-semibold tabular',
            triggersLevel === 'normal' ? 'text-positive' : triggersLevel === 'warning' ? 'text-warning' : 'text-negative',
          )}
        >
          {risk.stopLossTriggers}
        </span>
      </div>

      {onOpenRisk && (
        <button
          type="button"
          onClick={onOpenRisk}
          className="mt-3 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs font-semibold text-ink transition-colors hover:border-ink-secondary/40 hover:bg-surface"
        >
          {t('risk.openRiskCenter')}
        </button>
      )}
    </div>
  )
}
