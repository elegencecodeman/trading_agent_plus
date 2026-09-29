import { useId } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '../lib/cn'
import { useI18n } from '../lib/i18n'
import type { Metric } from '../types'
import { withAlpha } from '../lib/theme'

const METRIC_LABEL_KEY: Record<string, string> = {
  'portfolio-value': 'metric.portfolioValue',
  'today-pnl': 'metric.todayPnl',
  'agent-confidence': 'metric.agentConfidence',
  'risk-utilization': 'metric.riskUtilization',
}

type TFunc = (key: string, vars?: Record<string, string | number>) => string

function localizeDeltaLabel(label: string | undefined, isMeter: boolean, t: TFunc): string {
  if (!label) return ''
  if (isMeter) {
    const riskKey: Record<string, string> = {
      Normal: 'riskLevel.normal',
      Warning: 'riskLevel.warning',
      Critical: 'riskLevel.critical',
    }
    return riskKey[label] ? t(riskKey[label]) : label
  }
  if (label === 'vs yesterday') return t('metric.vsYesterday')
  if (label === 'session') return t('metric.session')
  if (label.startsWith('vs ')) return t('metric.vsRange', { range: label.slice(3) })
  return label
}

const KIND_COLOR: Record<Metric['kind'], string> = {
  accent: '#6EA8FE',
  positive: '#35C98A',
  negative: '#F06A7A',
  warning: '#F2B84B',
  ai: '#A78BFA',
}

const KIND_SHADOW: Record<Metric['kind'], string> = {
  accent: 'hover:shadow-lift-accent hover:border-accent/40',
  positive: 'hover:shadow-lift-positive hover:border-positive/40',
  negative: 'hover:shadow-lift-negative hover:border-negative/40',
  warning: 'hover:shadow-lift hover:border-warning/40',
  ai: 'hover:shadow-lift-accent hover:border-ai/40',
}

interface MetricCardProps {
  metric: Metric
}

export function MetricCard({ metric }: MetricCardProps) {
  const { t } = useI18n()
  const isGauge = metric.id === 'agent-confidence'
  const isMeter = metric.id === 'risk-utilization'
  const color = KIND_COLOR[metric.kind]
  const label = METRIC_LABEL_KEY[metric.id] ? t(METRIC_LABEL_KEY[metric.id]) : metric.label
  const deltaLabel = localizeDeltaLabel(metric.deltaLabel, isMeter, t)

  return (
    <div
      className={cn(
        'group flex flex-col justify-between rounded-xl border border-line bg-surface p-5 transition-all duration-200 ease-ui hover:-translate-y-0.5',
        KIND_SHADOW[metric.kind],
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-ink-secondary">{label}</p>
        {isMeter && <MeterStatusLabel kind={metric.kind} label={deltaLabel} />}
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[26px] font-semibold leading-none tracking-tight text-ink tabular">
            {metric.value}
          </p>
          {metric.delta && !isMeter && (
            <div className="mt-2 flex items-center gap-1.5">
              <DeltaArrow direction={metric.deltaDirection} kind={metric.kind} />
              <span
                className={cn(
                  'text-xs font-semibold tabular',
                  deltaColor(metric.deltaDirection, metric.kind),
                )}
              >
                {metric.delta}
              </span>
              {deltaLabel && <span className="truncate text-[11px] text-ink-muted">{deltaLabel}</span>}
            </div>
          )}
        </div>

        {isGauge && <Gauge value={metric.rawValue} color={color} />}
      </div>

      <div className="mt-4">
        {isMeter ? (
          <Meter value={metric.rawValue} limit={65} color={color} />
        ) : isGauge ? null : (
          <Sparkline data={metric.trend} color={color} />
        )}
      </div>
    </div>
  )
}

function DeltaArrow({ direction, kind }: { direction: Metric['deltaDirection']; kind: Metric['kind'] }) {
  if (direction === 'up') return <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-positive" size={14} />
  if (direction === 'down') return <ArrowDownRight className="h-3.5 w-3.5 shrink-0 text-negative" size={14} />
  return <Minus className={cn('h-3.5 w-3.5 shrink-0', kind === 'warning' ? 'text-warning' : 'text-ink-muted')} size={14} />
}

function deltaColor(direction: Metric['deltaDirection'], kind: Metric['kind']): string {
  if (direction === 'up') return 'text-positive'
  if (direction === 'down') return 'text-negative'
  return kind === 'warning' ? 'text-warning' : 'text-ink-secondary'
}

function MeterStatusLabel({ kind, label }: { kind: Metric['kind']; label: string }) {
  const cls =
    kind === 'positive'
      ? 'border-positive/25 bg-positive/10 text-positive'
      : kind === 'warning'
        ? 'border-warning/30 bg-warning/10 text-warning'
        : 'border-negative/30 bg-negative/10 text-negative'
  return (
    <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', cls)}>
      {label}
    </span>
  )
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const id = useId()
  const w = 200
  const h = 40
  const pad = 2
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2)
    const y = h - pad - ((v - min) / range) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const area = `${pad},${h} ${pts.join(' ')} ${w - pad},${h}`

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${id})`} />
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Gauge({ value, color }: { value: number; color: string }) {
  const { t } = useI18n()
  // 180° semi-circular gauge
  const radius = 26
  const circumference = Math.PI * radius
  const pct = Math.min(100, Math.max(0, value))
  const filled = (pct / 100) * circumference

  return (
    <div className="relative shrink-0" role="img" aria-label={t('metric.confidenceAria', { value })}>
      <svg viewBox="0 0 64 36" className="h-9 w-16">
        <path
          d="M 6 32 A 26 26 0 0 1 58 32"
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path
          d="M 6 32 A 26 26 0 0 1 58 32"
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
        />
      </svg>
      <span className="absolute inset-x-0 -bottom-1 text-center text-[10px] font-semibold text-ink-secondary tabular">
        {Math.round(value)}
      </span>
    </div>
  )
}

function Meter({ value, limit, color }: { value: number; limit: number; color: string }) {
  const { t } = useI18n()
  const pct = Math.min(100, (value / limit) * 100)
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] tabular text-ink-muted">
        <span>{t('metric.utilization')}</span>
        <span>{t('metric.ofLimit', { value, limit })}</span>
      </div>
      <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-ui"
          style={{ width: `${pct}%`, background: withAlpha(color, 0.85) }}
        />
        {/* limit tick */}
        <div className="absolute inset-y-0 w-px bg-ink/50" style={{ right: 0 }} />
      </div>
    </div>
  )
}
