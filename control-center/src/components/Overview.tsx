import { useMemo, useState } from 'react'
import { Pause, Play, RefreshCw, Square } from 'lucide-react'
import { cn } from '../lib/cn'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { useRun } from '../lib/run'
import type { NavId } from './Sidebar'
import type { AgentState, AgentStatus } from '../types'
import { ActivityLog } from './ActivityLog'
import { AgentMonitorDrawer } from './AgentMonitorDrawer'
import { AgentStatusCard } from './AgentStatusCard'
import { ErrorState } from './ErrorState'
import { LanguageSelector } from './LanguageSelector'
import { LiveSignalsCard } from './LiveSignalsCard'
import { ChartSkeleton, MetricCardSkeleton, Skeleton } from './LoadingSkeleton'
import { MarketSelector } from './MarketSelector'
import { MetricCard } from './MetricCard'
import { ModelSelector } from './ModelSelector'
import { PortfolioPerformanceChart } from './PortfolioPerformanceChart'
import { PositionsTable } from './PositionsTable'
import { RiskSnapshotCard } from './RiskSnapshotCard'
import { TickerPicker } from './TickerPicker'
import { TimeRangeSelector } from './TimeRangeSelector'

interface OverviewProps {
  onNavigate: (id: NavId) => void
}

export function Overview({ onNavigate }: OverviewProps) {
  const { t } = useI18n()
  const { user, requireAuth } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const {
    run,
    config,
    setConfig,
    market,
    setMarket,
    range,
    setRange,
    options,
  } = useRun()
  const { phase, connected, live, loading, error, warning, data, start, pause, stop, reset } = run

  const running = phase === 'running'
  const showError = error !== null

  const agent: AgentStatus = useMemo(() => {
    const base = data.agent
    if (running) return base
    if (phase === 'paused') return { ...base, state: 'Paused' as AgentState, task: t('overview.pausedByOperator') }
    if (phase === 'stopped') return { ...base, state: 'Paused' as AgentState, task: t('overview.stoppedByOperator') }
    if (phase === 'completed') return { ...base, state: 'Waiting' as AgentState, task: t('overview.analysisComplete') }
    return base // idle — demo baseline
  }, [data.agent, phase, running, t])

  const symbols = useMemo(() => data.positions.map((p) => p.symbol), [data.positions])

  const retry = () => {
    reset(config.ticker, range)
  }

  // Guests browse real market data freely; only the LLM run needs an account
  // (results are persisted per user). requireAuth() opens the dialog for us.
  const handleRun = () => {
    if (requireAuth()) start(config)
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 lg:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight text-ink">{t('overview.title')}</h1>
          </div>
          <p className="mt-1 text-sm text-ink-secondary">{t('overview.subtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <TimeRangeSelector value={range} onChange={setRange} />
          <MarketSelector value={market} onChange={setMarket} />

          <button
            type="button"
            onClick={() => reset(config.ticker, range)}
            disabled={loading}
            title={t('overview.refreshData')}
            aria-label={t('overview.refreshData')}
            className="inline-flex items-center justify-center rounded-lg border border-line bg-surface px-2.5 py-2 text-ink-secondary transition-colors hover:border-ink-secondary/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} size={14} />
          </button>

          {live && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-positive/30 bg-positive/10 px-2.5 py-1 text-[11px] font-semibold text-positive">
              <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-positive" />
              {t('overview.liveReal', { ticker: config.ticker })}
            </span>
          )}

          {live && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/60 px-2.5 py-1 text-[11px] font-medium text-ink-muted">
              {t('overview.paperSim')}
            </span>
          )}

          <span className="mx-1 hidden h-6 w-px bg-line sm:block" />

          {running ? (
            <button
              type="button"
              onClick={pause}
              className="inline-flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/15 px-3.5 py-2 text-xs font-semibold text-warning transition-colors hover:bg-warning/25"
            >
              <Pause className="h-3.5 w-3.5" size={14} />
              {t('overview.pause')}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleRun}
              title={user ? undefined : t('auth.requiresLogin')}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-app transition-colors hover:bg-accent/90"
            >
              <Play className="h-3.5 w-3.5" size={14} />
              {t('overview.runAgent')}
            </button>
          )}

          <button
            type="button"
            onClick={stop}
            disabled={phase === 'stopped'}
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-ink-secondary transition-colors hover:border-ink-secondary/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Square className="h-3.5 w-3.5" size={14} />
            {t('overview.stop')}
          </button>
        </div>
      </div>

      {/* Run configuration — ticker / model / language */}
      <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-2 rounded-xl border border-line bg-surface/40 px-3 py-2.5">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{t('config.ticker')}</span>
          <TickerPicker
            market={market}
            value={config.ticker}
            onChange={(ticker) => setConfig({ ticker })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{t('config.model')}</span>
          {options ? (
            <ModelSelector
              providers={options.providers}
              provider={config.provider}
              deepModel={config.deepModel}
              quickModel={config.quickModel}
              onChange={(patch) => setConfig(patch)}
            />
          ) : (
            <span className="py-1.5 text-xs text-ink-muted">{t('config.loadingModels')}</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{t('config.language')}</span>
          <LanguageSelector
            languages={options?.languages ?? ['English', 'Chinese']}
            value={config.language}
            onChange={(language) => setConfig({ language })}
          />
        </div>
      </div>

      {/* Body */}
      <div className="mt-6">
        {warning && (
          <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 text-xs text-warning">
            {warning}
          </div>
        )}
        {showError ? (
          <div className="rounded-xl border border-line bg-surface">
            <ErrorState
              title={t('overview.errorLoadReal')}
              description={error ?? t('overview.unknownError')}
              onRetry={retry}
            />
          </div>
        ) : loading ? (
          <OverviewSkeleton />
        ) : (
          <div className="space-y-4">
            {/* Row 1 — metrics */}
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('overview.keyMetrics')}>
              {data.metrics.map((m) => (
                <MetricCard key={m.id} metric={m} />
              ))}
            </section>

            {/* Row 2 — performance + agent status (7:5) */}
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <PortfolioPerformanceChart data={data.performance} range={range} />
              </div>
              <div className="lg:col-span-5">
                <AgentStatusCard
                  agent={agent}
                  running={running}
                  rated={data.rated}
                  onViewReasoning={() => setDrawerOpen(true)}
                  onOpenMonitor={() => onNavigate('agent')}
                />
              </div>
            </section>

            {/* Row 3 — signals / positions / risk */}
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <LiveSignalsCard signals={data.signals} onViewAll={() => onNavigate('signals')} />
              <PositionsTable positions={data.positions} onViewPortfolio={() => onNavigate('portfolio')} />
              <RiskSnapshotCard risk={data.risk} onOpenRisk={() => onNavigate('risk')} />
            </section>

            {/* Row 4 — activity log */}
            <section aria-label={t('overview.recentActivity')}>
              <ActivityLog entries={data.activity} running={running} symbols={symbols} streaming={connected} />
            </section>
          </div>
        )}
      </div>

      <AgentMonitorDrawer data={data.monitor} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  )
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <MetricCardSkeleton key={i} />
        ))}
      </section>
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <ChartSkeleton />
        </div>
        <div className="rounded-xl border border-line bg-surface p-5 lg:col-span-5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-4 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-3/4" />
          <Skeleton className="mt-6 h-16 w-full" />
          <Skeleton className="mt-4 h-9 w-full" />
        </div>
      </section>
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-line bg-surface p-5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-4 h-20 w-full" />
          </div>
        ))}
      </section>
    </div>
  )
}
