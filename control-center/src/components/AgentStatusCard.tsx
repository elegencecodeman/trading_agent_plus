import { Brain, ExternalLink } from 'lucide-react'
import { cn } from '../lib/cn'
import { useI18n } from '../lib/i18n'
import type { AgentState, AgentStatus } from '../types'

interface AgentStatusCardProps {
  agent: AgentStatus
  running: boolean
  onViewReasoning: () => void
  onOpenMonitor: () => void
}

const STATE_META: Record<AgentState, { color: string; text: string }> = {
  Analyzing: { color: '#A78BFA', text: 'text-ai' },
  Waiting: { color: '#47D7E8', text: 'text-cyan' },
  Executing: { color: '#35C98A', text: 'text-positive' },
  Paused: { color: '#F2B84B', text: 'text-warning' },
  Error: { color: '#F06A7A', text: 'text-negative' },
}

const MARKET_KEY: Record<string, string> = {
  'US Equities': 'market.us',
  Crypto: 'market.crypto',
  Forex: 'market.forex',
}

export function AgentStatusCard({ agent, running, onViewReasoning, onOpenMonitor }: AgentStatusCardProps) {
  const { t } = useI18n()
  const meta = STATE_META[agent.state]
  const isPaused = agent.state === 'Paused'
  const marketName = MARKET_KEY[agent.market] ? t(MARKET_KEY[agent.market]) : agent.market

  return (
    <div className="flex h-full flex-col rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">{t('agent.status')}</h2>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
            agent.state === 'Error'
              ? 'border-negative/30 bg-negative/10 text-negative'
              : isPaused
                ? 'border-warning/30 bg-warning/10 text-warning'
                : 'border-ai/30 bg-ai/10 text-ai',
          )}
        >
          <span
            className={cn('h-2 w-2 rounded-full', running && !isPaused && agent.state !== 'Error' && 'animate-breathe')}
            style={{ background: meta.color }}
          />
          {t(`agentState.${agent.state}`)}
        </span>
      </div>

      <p className="mt-4 text-[13px] font-medium leading-snug text-ink">{agent.task}</p>
      <p className="mt-1 text-xs leading-5 text-ink-secondary">
        {t('agent.analyzing', { market: marketName, timeframe: agent.timeframe })}
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <dt className="text-[11px] text-ink-muted">{t('agent.lastDecision')}</dt>
          <dd className="mt-0.5 text-xs font-medium text-ink tabular">{agent.lastDecisionAt}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-ink-muted">{t('agent.confidence')}</dt>
          <dd className="mt-0.5 flex items-center gap-2">
            <span className={cn('text-xs font-semibold tabular', meta.text)}>{agent.confidence}%</span>
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/5">
              <span
                className="block h-full rounded-full transition-[width] duration-300 ease-ui"
                style={{ width: `${agent.confidence}%`, background: meta.color }}
              />
            </span>
          </dd>
        </div>
      </dl>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onViewReasoning}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-app transition-colors hover:bg-accent/90"
        >
          <Brain className="h-4 w-4" size={16} />
          {t('agent.viewReasoning')}
        </button>
        <button
          type="button"
          onClick={onOpenMonitor}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs font-semibold text-ink transition-colors hover:border-ink-secondary/40 hover:bg-surface"
        >
          <ExternalLink className="h-4 w-4" size={16} />
          {t('agent.openMonitor')}
        </button>
      </div>
    </div>
  )
}
