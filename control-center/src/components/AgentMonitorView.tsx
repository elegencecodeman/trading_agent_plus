import { useState } from 'react'
import { Eye, Gauge, ListChecks, ShieldCheck, Sparkles } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { useRun } from '../lib/run'
import { ErrorState } from './ErrorState'
import { PageHeader } from './PageHeader'
import { Skeleton } from './LoadingSkeleton'
import {
  CandidateRow,
  Direction,
  FeatureTag,
  RiskCheckRow,
  Section,
  StagePipeline,
} from './AgentMonitorDrawer'

const ALL_SECTIONS = ['summary', 'evidence', 'strategies', 'candidates', 'risk']

export function AgentMonitorView() {
  const { t } = useI18n()
  const { run, config, range } = useRun()
  const { data, loading, error } = run
  const monitor = data.monitor
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(ALL_SECTIONS))

  const toggleSection = (id: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const has = (id: string) => openSections.has(id)

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 lg:px-6">
      <PageHeader title={t('nav.agent')} subtitle={t('agent.subtitle')} />

      {error ? (
        <div className="mt-6 rounded-xl border border-line bg-surface">
          <ErrorState description={error} onRetry={() => run.reset(config.ticker, range)} />
        </div>
      ) : loading ? (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Skeleton className="h-64 w-full" />
          </div>
          <div className="space-y-4 lg:col-span-5">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7">
            <StagePipeline stages={monitor.stages} />

            <Section
              id="summary"
              title={t('monitor.decisionSummary')}
              icon={Sparkles}
              open={has('summary')}
              onToggle={() => toggleSection('summary')}
            >
              <p className="text-xs leading-5 text-ink-secondary">{monitor.decisionSummary}</p>
              <div className="mt-3 rounded-lg border border-line bg-surface/60 p-3">
                <p className="text-[11px] font-semibold text-ink">{t('monitor.whyNoTrade')}</p>
                <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{monitor.whyNoTrade}</p>
              </div>
            </Section>
          </div>

          <div className="space-y-4 lg:col-span-5">
            <Section
              id="evidence"
              title={t('monitor.evidence')}
              icon={Eye}
              open={has('evidence')}
              onToggle={() => toggleSection('evidence')}
            >
              <div className="grid grid-cols-2 gap-2">
                {monitor.features.map((f) => (
                  <div key={f.label} className="rounded-lg border border-line bg-surface/60 px-2.5 py-2">
                    <p className="text-[10px] text-ink-muted">{f.label}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-ink">
                      {f.value}
                      {f.tag && <FeatureTag tag={f.tag} />}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] font-semibold text-ink">{t('monitor.indicators')}</p>
              <ul className="mt-1.5 space-y-1">
                {monitor.indicators.map((ind) => (
                  <li key={ind.name} className="flex items-center justify-between text-xs">
                    <span className="text-ink-secondary">{ind.name}</span>
                    <span className="flex items-center gap-1.5 font-mono text-ink tabular">
                      {ind.value}
                      <Direction dir={ind.direction} />
                    </span>
                  </li>
                ))}
              </ul>
            </Section>

            <Section
              id="strategies"
              title={t('monitor.strategies')}
              icon={Gauge}
              open={has('strategies')}
              onToggle={() => toggleSection('strategies')}
            >
              <div className="flex flex-wrap gap-1.5">
                {monitor.strategies.map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-ai/25 bg-ai/10 px-2.5 py-1 text-[11px] font-medium text-ai"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </Section>

            <Section
              id="candidates"
              title={t('monitor.candidateSignals')}
              icon={ListChecks}
              open={has('candidates')}
              onToggle={() => toggleSection('candidates')}
            >
              <ul className="space-y-1.5">
                {monitor.candidates.map((c) => (
                  <CandidateRow key={c.id} signal={c} />
                ))}
              </ul>
            </Section>

            <Section
              id="risk"
              title={t('monitor.riskChecks')}
              icon={ShieldCheck}
              open={has('risk')}
              onToggle={() => toggleSection('risk')}
            >
              <ul className="space-y-1.5">
                {monitor.riskChecks.map((r) => (
                  <RiskCheckRow key={r.label} check={r} />
                ))}
              </ul>
            </Section>
          </div>
        </div>
      )}
    </div>
  )
}
