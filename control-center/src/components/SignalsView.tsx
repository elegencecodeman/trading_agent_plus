import { Radio } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { useRun } from '../lib/run'
import { formatPrice } from '../lib/format'
import { EmptyState } from './EmptyState'
import { ErrorState } from './ErrorState'
import { PageHeader } from './PageHeader'
import { Skeleton } from './LoadingSkeleton'
import { SideIcon, signalStatusTone, sideTone, StatusBadge } from './StatusBadge'

const COLUMNS = ['symbol', 'strategy', 'price', 'confidence', 'time', 'status', 'note'] as const

export function SignalsView() {
  const { t } = useI18n()
  const { run, config, range } = useRun()
  const { data, loading, error } = run

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 lg:px-6">
      <PageHeader title={t('signals.title')} subtitle={t('signals.subtitle')} />

      {error ? (
        <div className="mt-6 rounded-xl border border-line bg-surface">
          <ErrorState description={error} onRetry={() => run.reset(config.ticker, range)} />
        </div>
      ) : loading ? (
        <div className="mt-6 rounded-xl border border-line bg-surface p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-4 h-40 w-full" />
          <Skeleton className="mt-3 h-40 w-full" />
        </div>
      ) : data.signals.length === 0 ? (
        <div className="mt-6 rounded-xl border border-line bg-surface">
          <EmptyState
            icon={Radio}
            title={t('signals.noSignals')}
            description={t('signals.noSignalsDesc')}
          />
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-line bg-surface p-5">
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  {COLUMNS.map((col) => (
                    <th
                      key={col}
                      className="whitespace-nowrap pb-2 pr-4 text-[10px] font-semibold uppercase tracking-wide text-ink-muted"
                    >
                      {t(`signals.col.${col}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.signals.map((s) => (
                  <tr key={s.id} className="border-b border-line/50 transition-colors hover:bg-white/[0.02]">
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                            s.side === 'BUY'
                              ? 'border-positive/25 bg-positive/10 text-positive'
                              : s.side === 'SELL'
                                ? 'border-negative/25 bg-negative/10 text-negative'
                                : 'border-line bg-white/5 text-ink-secondary'
                          }`}
                        >
                          <SideIcon side={s.side} className="h-3.5 w-3.5" />
                        </span>
                        <span className="font-mono text-xs font-semibold text-ink">{s.symbol}</span>
                        <StatusBadge tone={sideTone(s.side)} label={t(`side.${s.side}`)} />
                      </div>
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-4 text-xs text-ink-secondary">{s.strategy}</td>
                    <td className="whitespace-nowrap py-2.5 pr-4 font-mono text-xs text-ink tabular">
                      {formatPrice(s.price)}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-4 font-mono text-xs text-ink tabular">
                      {s.side === 'UNRATED' ? '—' : `${Math.round(s.confidence * 100)}%`}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-4 font-mono text-xs text-ink-muted tabular">{s.time}</td>
                    <td className="whitespace-nowrap py-2.5 pr-4">
                      <StatusBadge tone={signalStatusTone(s.status)} label={t(`signalStatus.${s.status}`)} />
                    </td>
                    <td className="max-w-[260px] truncate py-2.5 pr-4 text-xs text-ink-muted">{s.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
