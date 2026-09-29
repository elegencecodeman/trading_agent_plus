import { useEffect, useMemo, useRef, useState } from 'react'
import { Brain, Radio, ReceiptText, ShieldAlert, Terminal, type LucideIcon } from 'lucide-react'
import { cn } from '../lib/cn'
import { formatDuration } from '../lib/format'
import { useI18n } from '../lib/i18n'
import type { ActivityEntry, LogStatus, LogType } from '../types'
import { EmptyState } from './EmptyState'
import type { BadgeTone } from './StatusBadge'

type Filter = 'all' | LogType

const FILTERS: { key: Filter; labelKey: string }[] = [
  { key: 'all', labelKey: 'activity.all' },
  { key: 'reasoning', labelKey: 'logType.reasoning' },
  { key: 'signal', labelKey: 'logType.signal' },
  { key: 'order', labelKey: 'logType.order' },
  { key: 'risk', labelKey: 'logType.risk' },
]

const TYPE_META: Record<LogType, { labelKey: string; icon: LucideIcon; tone: BadgeTone }> = {
  reasoning: { labelKey: 'logType.reasoning', icon: Brain, tone: 'ai' },
  signal: { labelKey: 'logType.signal', icon: Radio, tone: 'cyan' },
  order: { labelKey: 'logType.order', icon: ReceiptText, tone: 'accent' },
  risk: { labelKey: 'logType.risk', icon: ShieldAlert, tone: 'warning' },
}

const AGENT_KEY: Record<string, string> = {
  analyst: 'activity.agentAnalyst',
  signal: 'activity.agentSignal',
  executor: 'activity.agentExecutor',
  risk: 'activity.agentRisk',
}

const STATUS_DOT: Record<LogStatus, string> = {
  success: 'bg-positive',
  info: 'bg-accent',
  warning: 'bg-warning',
  error: 'bg-negative',
}

interface ActivityLogProps {
  entries: ActivityEntry[]
  running: boolean
  symbols?: string[]
  /** Real backend stream: skip the synthetic "live" feed and only show `entries`. */
  streaming?: boolean
}

const LIVE_TEMPLATE_KEYS = [
  'activity.liveReeval',
  'activity.liveRegime',
  'activity.liveSizing',
  'activity.liveRisk',
  'activity.liveScan',
  'activity.liveOrder',
]

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function syntheticTime(offsetSec: number): string {
  const total = 9 * 3600 + 31 * 60 + 26 + offsetSec
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

export function ActivityLog({ entries, running, symbols = [], streaming = false }: ActivityLogProps) {
  const { t } = useI18n()
  const [filter, setFilter] = useState<Filter>('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const [live, setLive] = useState<ActivityEntry[]>([])
  const tickRef = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Live feed — appends a synthetic entry while the agent is running.
  // Disabled when a real backend stream is feeding `entries`.
  useEffect(() => {
    if (!running || streaming) return
    const id = setInterval(() => {
      const i = tickRef.current
      tickRef.current += 1
      const type = (['reasoning', 'signal', 'risk', 'order'] as LogType[])[i % 4]
      const sym = symbols[i % Math.max(1, symbols.length)] ?? 'NVDA'
      const templateKey = LIVE_TEMPLATE_KEYS[i % LIVE_TEMPLATE_KEYS.length]
      const status: LogStatus = type === 'risk' ? (i % 3 === 0 ? 'warning' : 'success') : 'info'
      setLive((prev) => [
        ...prev,
        {
          id: `live-${i}-${Date.now()}`,
          time: syntheticTime(i * 3),
          type,
          agent: type === 'risk' ? 'risk' : type === 'order' ? 'executor' : type === 'signal' ? 'signal' : 'analyst',
          message: t(templateKey, { sym }),
          durationMs: 30 + ((i * 137) % 900),
          status,
        },
      ])
    }, 3000)
    return () => clearInterval(id)
  }, [running, symbols, streaming, t])

  const filtered = useMemo(() => {
    const all = [...live, ...entries]
    return filter === 'all' ? all : all.filter((e) => e.type === filter)
  }, [live, entries, filter])

  // Auto-scroll to newest on new entries (synthetic or streamed).
  useEffect(() => {
    if (!autoScroll || filtered.length === 0) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [filtered, autoScroll])

  return (
    <div className="flex flex-col rounded-xl border border-line bg-surface">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-ink-muted" size={16} />
          <h2 className="text-sm font-semibold text-ink">{t('activity.recentActivity')}</h2>
          {running && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-positive/10 px-2 py-0.5 text-[10px] font-semibold text-positive">
              <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-positive" />
              {t('activity.live')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Filter segmented */}
          <div role="tablist" aria-label={t('activity.logFilter')} className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface/60 p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                role="tab"
                aria-selected={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  'rounded-md px-2 py-1 text-[11px] font-medium transition-colors duration-200',
                  filter === f.key ? 'bg-accent-faint text-accent' : 'text-ink-secondary hover:text-ink',
                )}
              >
                {t(f.labelKey)}
              </button>
            ))}
          </div>

          {/* Auto-scroll toggle */}
          <button
            type="button"
            role="switch"
            aria-checked={autoScroll}
            onClick={() => setAutoScroll((v) => !v)}
            className="flex items-center gap-2 text-[11px] font-medium text-ink-secondary"
          >
            {t('activity.autoScroll')}
            <span
              className={cn(
                'relative h-4 w-7 rounded-full transition-colors duration-200',
                autoScroll ? 'bg-accent' : 'bg-line',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-3 w-3 rounded-full bg-ink transition-transform duration-200',
                  autoScroll ? 'translate-x-3.5' : 'translate-x-0.5',
                )}
              />
            </span>
          </button>
        </div>
      </div>

      {/* Log list (terminal style, readable) */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Terminal}
          title={t('activity.noActivity')}
          description={t('activity.noActivityDesc')}
        />
      ) : (
        <div ref={scrollRef} className="max-h-72 overflow-y-auto px-5 py-1 font-mono text-[12px]">
          {filtered.map((e) => {
            const meta = TYPE_META[e.type]
            const Icon = meta.icon
            return (
              <div key={e.id} className="log-row flex items-center gap-3 border-b border-line/40 py-2">
                <span className="shrink-0 text-[11px] text-ink-muted tabular">{e.time}</span>
                <span className={cn('inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold', toneChip(meta.tone))}>
                  <Icon className="h-3 w-3" size={12} />
                  {t(meta.labelKey)}
                </span>
                <span className="shrink-0 text-[11px] text-ink-muted">{AGENT_KEY[e.agent] ? t(AGENT_KEY[e.agent]) : e.agent}</span>
                <span className="min-w-0 flex-1 truncate font-sans text-[12px] text-ink-secondary">{e.message}</span>
                <span className="shrink-0 text-[11px] text-ink-muted tabular">{formatDuration(e.durationMs)}</span>
                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT[e.status])} title={e.status} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function toneChip(tone: BadgeTone): string {
  switch (tone) {
    case 'ai':
      return 'bg-ai/15 text-ai'
    case 'cyan':
      return 'bg-cyan/10 text-cyan'
    case 'accent':
      return 'bg-accent/10 text-accent'
    case 'warning':
      return 'bg-warning/10 text-warning'
    default:
      return 'bg-white/5 text-ink-secondary'
  }
}
