import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Brain,
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDot,
  Eye,
  Gauge,
  ListChecks,
  Minus,
  ShieldCheck,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../lib/cn'
import { useI18n } from '../lib/i18n'
import { formatDuration, formatPrice } from '../lib/format'
import type { AgentMonitorData, PipelineStage, RiskCheckItem, Signal } from '../types'
import { SideIcon } from './StatusBadge'

interface AgentMonitorDrawerProps {
  data: AgentMonitorData
  open: boolean
  onClose: () => void
}

export function AgentMonitorDrawer({ data, open, onClose }: AgentMonitorDrawerProps) {
  const { t } = useI18n()
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['summary']))

  // Focus management + keyboard
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])',
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prev?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  const toggleSection = (id: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 animate-fade-in bg-black/60" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-monitor-title"
        className="absolute inset-y-0 right-0 flex w-full max-w-md animate-slide-in-right flex-col border-l border-line bg-app shadow-drawer"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Brain className="h-5 w-5 text-ai" size={20} />
            <div>
              <h2 id="agent-monitor-title" className="text-sm font-semibold text-ink">
                {t('monitor.agentMonitor')}
              </h2>
              <p className="text-[11px] text-ink-muted">{data.task}</p>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('monitor.close')}
            className="rounded-lg p-1.5 text-ink-secondary transition-colors hover:bg-white/5 hover:text-ink"
          >
            <X className="h-5 w-5" size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <StagePipeline stages={data.stages} />

          <div className="mt-5 space-y-2">
            <Section
              id="summary"
              title={t('monitor.decisionSummary')}
              icon={Sparkles}
              open={openSections.has('summary')}
              onToggle={() => toggleSection('summary')}
            >
              <p className="text-xs leading-5 text-ink-secondary">{data.decisionSummary}</p>
              <div className="mt-3 rounded-lg border border-line bg-surface/60 p-3">
                <p className="text-[11px] font-semibold text-ink">{t('monitor.whyNoTrade')}</p>
                <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{data.whyNoTrade}</p>
              </div>
            </Section>

            <Section
              id="evidence"
              title={t('monitor.evidence')}
              icon={Eye}
              open={openSections.has('evidence')}
              onToggle={() => toggleSection('evidence')}
            >
              <div className="grid grid-cols-2 gap-2">
                {data.features.map((f) => (
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
                {data.indicators.map((ind) => (
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
              open={openSections.has('strategies')}
              onToggle={() => toggleSection('strategies')}
            >
              <div className="flex flex-wrap gap-1.5">
                {data.strategies.map((s) => (
                  <span key={s} className="rounded-full border border-ai/25 bg-ai/10 px-2.5 py-1 text-[11px] font-medium text-ai">
                    {s}
                  </span>
                ))}
              </div>
            </Section>

            <Section
              id="candidates"
              title={t('monitor.candidateSignals')}
              icon={ListChecks}
              open={openSections.has('candidates')}
              onToggle={() => toggleSection('candidates')}
            >
              <ul className="space-y-1.5">
                {data.candidates.map((c) => (
                  <CandidateRow key={c.id} signal={c} />
                ))}
              </ul>
            </Section>

            <Section
              id="risk"
              title={t('monitor.riskChecks')}
              icon={ShieldCheck}
              open={openSections.has('risk')}
              onToggle={() => toggleSection('risk')}
            >
              <ul className="space-y-1.5">
                {data.riskChecks.map((r) => (
                  <RiskCheckRow key={r.label} check={r} />
                ))}
              </ul>
            </Section>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

const STAGE_KEY: Record<string, string> = {
  observe: 'stage.observe',
  analyze: 'stage.analyze',
  decide: 'stage.decide',
  risk: 'stage.risk',
  execute: 'stage.execute',
}

export function StagePipeline({ stages }: { stages: PipelineStage[] }) {
  const { t } = useI18n()
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{t('monitor.pipeline')}</p>
      <ol className="mt-3 space-y-0">
        {stages.map((stage, i) => {
          const active = stage.status === 'active'
          const done = stage.status === 'done'
          const pending = stage.status === 'pending'
          const skipped = stage.status === 'skipped'
          const isLast = i === stages.length - 1
          return (
            <li key={stage.id} className="relative flex gap-3 pb-4 last:pb-0">
              {/* connector line */}
              {!isLast && <span className="absolute left-[11px] top-6 h-full w-px bg-line" />}
              <span className="relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center">
                {done ? (
                  <CheckCircle2 className="h-5 w-5 text-positive" size={20} />
                ) : active ? (
                  <CircleDot className="h-5 w-5 animate-pulse text-ai" size={20} />
                ) : skipped ? (
                  <Minus className="h-5 w-5 text-ink-muted" size={20} />
                ) : (
                  <Circle className="h-5 w-5 text-ink-muted/50" size={20} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      'text-xs font-semibold',
                      done ? 'text-ink' : active ? 'text-ai' : pending ? 'text-ink-secondary' : 'text-ink-muted',
                    )}
                  >
                    {STAGE_KEY[stage.id] ? t(STAGE_KEY[stage.id]) : stage.label}
                  </span>
                  <span className="flex items-center gap-2 text-[10px] text-ink-muted tabular">
                    {stage.startedAt}
                    {stage.durationMs > 0 && <span className="text-ink-secondary">{formatDuration(stage.durationMs)}</span>}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] leading-4 text-ink-muted">{stage.summary}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export function Section({
  id,
  title,
  icon: Icon,
  open,
  onToggle,
  children,
}: {
  id: string
  title: string
  icon: LucideIcon
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`section-${id}`}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-ink">
          <Icon className="h-4 w-4 text-ink-secondary" size={16} />
          {title}
        </span>
        <ChevronDown className={cn('h-4 w-4 text-ink-muted transition-transform duration-200', open && 'rotate-180')} size={16} />
      </button>
      {open && <div id={`section-${id}`} className="border-t border-line/60 px-4 py-3">{children}</div>}
    </div>
  )
}

export function FeatureTag({ tag }: { tag: 'bullish' | 'bearish' | 'neutral' }) {
  const { t } = useI18n()
  const map = {
    bullish: 'text-positive',
    bearish: 'text-negative',
    neutral: 'text-ink-muted',
  } as const
  return <span className={cn('text-[10px] font-semibold', map[tag])}>{t(`featureTag.${tag}`)}</span>
}

export function Direction({ dir }: { dir: 'up' | 'down' | 'flat' }) {
  if (dir === 'up') return <span className="text-positive">▲</span>
  if (dir === 'down') return <span className="text-negative">▼</span>
  return <span className="text-ink-muted">—</span>
}

export function CandidateRow({ signal }: { signal: Signal }) {
  const { t } = useI18n()
  return (
    <li className="flex items-center justify-between rounded-lg border border-line bg-surface-2/60 px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className={cn('flex h-6 w-6 items-center justify-center rounded', signal.side === 'BUY' ? 'text-positive' : 'text-negative')}>
          <SideIcon side={signal.side} className="h-4 w-4" />
        </span>
        <span className="font-mono text-xs font-semibold text-ink">{signal.symbol}</span>
      </div>
      <div className="text-right">
        <p className="font-mono text-xs text-ink tabular">{formatPrice(signal.price)}</p>
        <p className="text-[10px] text-ink-muted tabular">{t('monitor.conf', { pct: Math.round(signal.confidence * 100) })}</p>
      </div>
    </li>
  )
}

export function RiskCheckRow({ check }: { check: RiskCheckItem }) {
  const { t } = useI18n()
  const map = {
    pass: { text: 'text-positive', labelKey: 'monitor.pass' },
    warn: { text: 'text-warning', labelKey: 'monitor.warn' },
    fail: { text: 'text-negative', labelKey: 'monitor.fail' },
  } as const
  const m = map[check.result]
  return (
    <li className="flex items-center justify-between rounded-lg border border-line bg-surface-2/60 px-2.5 py-2">
      <span className="text-xs text-ink-secondary">{check.label}</span>
      <span className="flex items-center gap-2">
        <span className="text-[10px] text-ink-muted tabular">{check.detail}</span>
        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', m.text, 'bg-white/5')}>{t(m.labelKey)}</span>
      </span>
    </li>
  )
}
