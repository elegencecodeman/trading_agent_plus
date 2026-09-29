import { useMemo, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpRight } from 'lucide-react'
import { cn } from '../lib/cn'
import { useI18n } from '../lib/i18n'
import { formatCurrency, formatPrice, formatQuantity } from '../lib/format'
import type { Position } from '../types'
import { EmptyState } from './EmptyState'
import { SideIcon } from './StatusBadge'

interface PositionsTableProps {
  positions: Position[]
  onViewPortfolio?: () => void
}

type SortKey = 'symbol' | 'quantity' | 'lastPrice' | 'unrealizedPnl' | 'weight'
type SortDir = 'asc' | 'desc'

const COLUMNS: { key: SortKey | null; labelKey: string; align: 'left' | 'right' }[] = [
  { key: 'symbol', labelKey: 'positions.symbol', align: 'left' },
  { key: null, labelKey: 'positions.side', align: 'left' },
  { key: 'quantity', labelKey: 'positions.qty', align: 'right' },
  { key: null, labelKey: 'positions.avgCost', align: 'right' },
  { key: 'lastPrice', labelKey: 'positions.last', align: 'right' },
  { key: 'unrealizedPnl', labelKey: 'positions.unrealizedPnl', align: 'right' },
  { key: 'weight', labelKey: 'positions.weight', align: 'right' },
]

export function PositionsTable({ positions, onViewPortfolio }: PositionsTableProps) {
  const { t } = useI18n()
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'unrealizedPnl', dir: 'desc' })

  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...positions].sort((a, b) => {
      const av = a[sort.key]
      const bv = b[sort.key]
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir
      return ((av as number) - (bv as number)) * dir
    })
  }, [positions, sort])

  const toggleSort = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }))
  }

  return (
    <div className="flex h-full flex-col rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">{t('positions.currentPositions')}</h2>
        {onViewPortfolio && (
          <button
            type="button"
            onClick={onViewPortfolio}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-accent transition-colors hover:text-ink"
          >
            {t('positions.viewPortfolio')}
            <ArrowUpRight className="h-3 w-3" size={12} />
          </button>
        )}
      </div>

      {positions.length === 0 ? (
        <EmptyState
          icon={ArrowRight}
          title={t('positions.noPositions')}
          description={t('positions.noPositionsDesc')}
        />
      ) : (
        <div className="mt-3 -mx-5 flex-1 overflow-x-auto px-5">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                {COLUMNS.map((col) => (
                  <th
                    key={col.labelKey}
                    className={cn(
                      'whitespace-nowrap py-2 pr-3 text-[11px] font-medium text-ink-muted',
                      col.align === 'right' ? 'text-right' : 'text-left',
                    )}
                  >
                    {col.key ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key!)}
                        className={cn(
                          'inline-flex items-center gap-1 transition-colors hover:text-ink',
                          sort.key === col.key && 'text-ink',
                        )}
                      >
                        {t(col.labelKey)}
                        <SortIndicator active={sort.key === col.key} dir={sort.dir} />
                      </button>
                    ) : (
                      t(col.labelKey)
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.id} className="border-b border-line/50 transition-colors hover:bg-white/[0.02]">
                  <td className="py-2.5 pr-3">
                    <p className="font-mono text-[13px] font-semibold text-ink">{p.symbol}</p>
                    <p className="mt-0.5 max-w-[140px] truncate text-[11px] text-ink-muted">{p.name}</p>
                  </td>
                  <td className="py-2.5 pr-3">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 text-[11px] font-semibold',
                        p.side === 'BUY' ? 'text-positive' : 'text-negative',
                      )}
                    >
                      <SideIcon side={p.side} className="h-3 w-3" />
                      {p.side === 'BUY' ? t('side.long') : t('side.short')}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono text-xs text-ink tabular">
                    {formatQuantity(p.quantity)}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono text-xs text-ink-secondary tabular">
                    {formatPrice(p.avgCost)}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono text-xs text-ink tabular">
                    {formatPrice(p.lastPrice)}
                  </td>
                  <td
                    className={cn(
                      'py-2.5 pr-3 text-right font-mono text-xs font-semibold tabular',
                      p.unrealizedPnl >= 0 ? 'text-positive' : 'text-negative',
                    )}
                  >
                    {p.unrealizedPnl >= 0 ? '+' : '−'}
                    {formatCurrency(Math.abs(p.unrealizedPnl))}
                    <span className="ml-1 text-[10px] opacity-70">
                      {p.unrealizedPnlPct >= 0 ? '+' : '−'}
                      {Math.abs(p.unrealizedPnlPct).toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center justify-end gap-2">
                      <span className="w-10 text-right font-mono text-xs text-ink tabular">
                        {p.weight.toFixed(1)}%
                      </span>
                      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-white/5">
                        <span
                          className="block h-full rounded-full bg-accent/70"
                          style={{ width: `${Math.min(100, p.weight * 2)}%` }}
                        />
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUp className="h-2.5 w-2.5 text-ink-muted/40" size={10} />
  return dir === 'asc' ? <ArrowUp className="h-2.5 w-2.5 text-accent" size={10} /> : <ArrowDown className="h-2.5 w-2.5 text-accent" size={10} />
}
