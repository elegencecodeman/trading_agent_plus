import { ArrowRight } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { formatPrice } from '../lib/format'
import type { Signal } from '../types'
import { EmptyState } from './EmptyState'
import {
  SideIcon,
  signalStatusTone,
  sideTone,
  StatusBadge,
} from './StatusBadge'

interface LiveSignalsCardProps {
  signals: Signal[]
  onViewAll?: () => void
}

export function LiveSignalsCard({ signals, onViewAll }: LiveSignalsCardProps) {
  const { t } = useI18n()
  return (
    <div className="flex h-full flex-col rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">{t('signals.liveSignals')}</h2>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-accent transition-colors hover:text-ink"
          >
            {t('signals.viewAll')}
            <ArrowRight className="h-3 w-3" size={12} />
          </button>
        )}
      </div>

      {signals.length === 0 ? (
        <EmptyState
          icon={ArrowRight}
          title={t('signals.noSignals')}
          description={t('signals.noSignalsDesc')}
        />
      ) : (
        <ul className="mt-3 flex-1 divide-y divide-line/60">
          {signals.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                    s.side === 'BUY'
                      ? 'border-positive/25 bg-positive/10 text-positive'
                      : s.side === 'SELL'
                        ? 'border-negative/25 bg-negative/10 text-negative'
                        : 'border-line bg-white/5 text-ink-secondary'
                  }`}
                >
                  <SideIcon side={s.side} className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-ink">{s.symbol}</span>
                    <StatusBadge tone={sideTone(s.side)} label={t(`side.${s.side}`)} />
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                    {s.strategy} · {s.time}
                  </p>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <p className="font-mono text-sm font-semibold text-ink tabular">{formatPrice(s.price)}</p>
                <div className="mt-0.5 flex items-center justify-end gap-1.5">
                  <span className="text-[11px] text-ink-muted tabular">
                    {s.side === 'UNRATED' ? '—' : `${Math.round(s.confidence * 100)}%`}
                  </span>
                  <StatusBadge tone={signalStatusTone(s.status)} label={t(`signalStatus.${s.status}`)} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
