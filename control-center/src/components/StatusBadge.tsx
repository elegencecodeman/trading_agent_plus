import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react'
import { cn } from '../lib/cn'
import type { Side, SignalStatus, RiskLevel, LogStatus } from '../types'

export type BadgeTone = 'positive' | 'negative' | 'warning' | 'neutral' | 'ai' | 'cyan' | 'accent'

const TONE_CLASS: Record<BadgeTone, string> = {
  positive: 'bg-positive/10 text-positive ring-positive/25',
  negative: 'bg-negative/10 text-negative ring-negative/25',
  warning: 'bg-warning/10 text-warning ring-warning/30',
  neutral: 'bg-white/5 text-ink-secondary ring-line',
  ai: 'bg-ai/15 text-ai ring-ai/30',
  cyan: 'bg-cyan/10 text-cyan ring-cyan/25',
  accent: 'bg-accent/10 text-accent ring-accent/25',
}

interface StatusBadgeProps {
  tone: BadgeTone
  label: string
  icon?: LucideIcon
  dot?: boolean
  className?: string
}

export function StatusBadge({ tone, label, icon: Icon, dot = false, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 ring-1 ring-inset',
        TONE_CLASS[tone],
        className,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dotClass(tone))} />}
      {Icon && <Icon className="h-3 w-3" size={12} />}
      <span className="tabular">{label}</span>
    </span>
  )
}

function dotClass(tone: BadgeTone): string {
  switch (tone) {
    case 'positive':
      return 'bg-positive'
    case 'negative':
      return 'bg-negative'
    case 'warning':
      return 'bg-warning'
    case 'ai':
      return 'bg-ai'
    case 'cyan':
      return 'bg-cyan'
    case 'accent':
      return 'bg-accent'
    default:
      return 'bg-ink-secondary'
  }
}

/* ---- semantic → tone/icon helpers (so color is never the only signal) ---- */

export function sideTone(side: Side): BadgeTone {
  return side === 'BUY' ? 'positive' : side === 'SELL' ? 'negative' : 'neutral'
}

// UNRATED gets a dash: no direction yet reads as "no call", not "flat".
const SIDE_ICONS: Record<Side, LucideIcon> = {
  BUY: ArrowUpRight,
  SELL: ArrowDownRight,
  HOLD: ArrowRight,
  UNRATED: Minus,
}

/** The icon *component* for a side — for APIs like ``StatusBadge`` that take one. */
export function sideIcon(side: Side): LucideIcon {
  return SIDE_ICONS[side] ?? ArrowRight
}

export function SideIcon({ side, className }: { side: Side; className?: string }) {
  const Icon = sideIcon(side)
  return <Icon className={className ?? 'h-3 w-3'} size={12} />
}

export function signalStatusTone(status: SignalStatus): BadgeTone {
  switch (status) {
    case 'executed':
      return 'positive'
    case 'pending':
      return 'warning'
    case 'rejected':
      return 'negative'
    case 'monitoring':
      return 'cyan'
  }
}

export function riskTone(level: RiskLevel): BadgeTone {
  return level === 'normal' ? 'positive' : level === 'warning' ? 'warning' : 'negative'
}

export function logTone(status: LogStatus): BadgeTone {
  switch (status) {
    case 'success':
      return 'positive'
    case 'info':
      return 'ai'
    case 'warning':
      return 'warning'
    case 'error':
      return 'negative'
  }
}
