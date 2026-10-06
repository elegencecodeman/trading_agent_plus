import { useI18n } from '../lib/i18n'
import { useRun } from '../lib/run'
import { ErrorState } from './ErrorState'
import { PageHeader } from './PageHeader'
import { ChartSkeleton } from './LoadingSkeleton'
import { PortfolioPerformanceChart } from './PortfolioPerformanceChart'
import { PositionsTable } from './PositionsTable'

export function PortfolioView() {
  const { t } = useI18n()
  const { run, config, range } = useRun()
  const { data, loading, error } = run

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 lg:px-6">
      <PageHeader title={t('portfolio.title')} subtitle={t('portfolio.subtitle')} />

      {error ? (
        <div className="mt-6 rounded-xl border border-line bg-surface">
          <ErrorState description={error} onRetry={() => run.reset(config.ticker, range)} />
        </div>
      ) : loading ? (
        <div className="mt-6 space-y-4">
          <ChartSkeleton />
          <div className="rounded-xl border border-line bg-surface p-5">
            <div className="h-40" />
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <PortfolioPerformanceChart data={data.performance} range={range} />
          <PositionsTable positions={data.positions} />
        </div>
      )}
    </div>
  )
}
