import { ShieldCheck } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { useRun } from '../lib/run'
import { EmptyState } from './EmptyState'
import { ErrorState } from './ErrorState'
import { PageHeader } from './PageHeader'
import { Skeleton } from './LoadingSkeleton'
import { RiskSnapshotCard } from './RiskSnapshotCard'
import { RiskCheckRow } from './AgentMonitorDrawer'

export function RiskView() {
  const { t } = useI18n()
  const { run, config, range } = useRun()
  const { data, loading, error } = run
  const riskChecks = data.monitor.riskChecks

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 lg:px-6">
      <PageHeader title={t('risk.title')} subtitle={t('risk.subtitle')} />

      {error ? (
        <div className="mt-6 rounded-xl border border-line bg-surface">
          <ErrorState description={error} onRetry={() => run.reset(config.ticker, range)} />
        </div>
      ) : loading ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-line bg-surface p-5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-4 h-32 w-full" />
          </div>
          <div className="rounded-xl border border-line bg-surface p-5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-4 h-24 w-full" />
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <RiskSnapshotCard risk={data.risk} />

          <div className="rounded-xl border border-line bg-surface p-5">
            <h2 className="text-sm font-semibold text-ink">{t('monitor.riskChecks')}</h2>
            {riskChecks.length === 0 ? (
              <EmptyState
                icon={ShieldCheck}
                title={t('risk.noChecks')}
                description={t('risk.noChecksDesc')}
              />
            ) : (
              <ul className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                {riskChecks.map((r) => (
                  <RiskCheckRow key={r.label} check={r} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
