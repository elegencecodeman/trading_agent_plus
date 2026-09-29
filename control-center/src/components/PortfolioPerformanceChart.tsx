import {
  Area,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TooltipProps } from 'recharts'
import { useI18n } from '../lib/i18n'
import { chartColors, withAlpha } from '../lib/theme'
import { formatCurrency, formatCompact, formatSignedPercent } from '../lib/format'
import type { PerformancePoint, TimeRangeId } from '../types'

interface PortfolioPerformanceChartProps {
  data: PerformancePoint[]
  range: TimeRangeId
}

function summary(data: PerformancePoint[]) {
  const first = data[0]
  const last = data[data.length - 1]
  const pct = (key: 'portfolio' | 'benchmark') =>
    ((last[key] - first[key]) / first[key]) * 100
  return { first, last, pct }
}

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  const { t } = useI18n()
  if (!active || !payload || payload.length === 0) return null
  const portfolio = payload.find((p) => p.dataKey === 'portfolio')?.value
  const benchmark = payload.find((p) => p.dataKey === 'benchmark')?.value
  return (
    <div className="rounded-lg border border-line bg-surface-2/95 px-3 py-2.5 shadow-card backdrop-blur-sm">
      <p className="mb-2 text-[11px] font-medium text-ink-muted tabular">{label}</p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5 text-[11px] text-ink-secondary">
            <span className="h-2 w-2 rounded-full" style={{ background: chartColors.portfolio }} />
            {t('chart.portfolio')}
          </span>
          <span className="text-xs font-semibold text-ink tabular">
            {portfolio != null ? formatCurrency(portfolio) : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5 text-[11px] text-ink-secondary">
            <span className="h-2 w-2 rounded-full" style={{ background: chartColors.benchmark }} />
            {t('chart.benchmark')}
          </span>
          <span className="text-xs font-semibold text-ink tabular">
            {benchmark != null ? formatCurrency(benchmark) : '—'}
          </span>
        </div>
      </div>
    </div>
  )
}

export function PortfolioPerformanceChart({ data, range }: PortfolioPerformanceChartProps) {
  const { t } = useI18n()
  const s = summary(data)
  const portfolioPct = s.pct('portfolio')
  const benchmarkPct = s.pct('benchmark')

  return (
    <div className="flex h-full flex-col rounded-xl border border-line bg-surface p-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">{t('chart.portfolioPerformance')}</h2>
          <p className="mt-0.5 text-xs text-ink-muted">{t('chart.netVsBenchmark', { range })}</p>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[11px] text-ink-secondary">
            <span className="h-2 w-2 rounded-full" style={{ background: chartColors.portfolio }} />
            {t('chart.portfolio')}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-ink-secondary">
            <span className="h-2 w-2 rounded-sm" style={{ background: chartColors.benchmark }} />
            {t('chart.benchmark')}
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="mt-4 h-64 min-h-0 flex-1 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartColors.portfolio} stopOpacity={0.16} />
                <stop offset="100%" stopColor={chartColors.portfolio} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={chartColors.grid} strokeOpacity={0.5} vertical={false} />
            <XAxis
              dataKey="label"
              minTickGap={28}
              tick={{ fontSize: 10, fill: chartColors.axis }}
              tickLine={false}
              axisLine={{ stroke: chartColors.grid }}
            />
            <YAxis
              width={52}
              tick={{ fontSize: 10, fill: chartColors.axis }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatCompact(v, true)}
              domain={['auto', 'auto']}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ stroke: withAlpha(chartColors.axis, 0.4), strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="portfolio"
              stroke={chartColors.portfolio}
              strokeWidth={2}
              fill="url(#portfolioFill)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: chartColors.portfolio }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="benchmark"
              stroke={chartColors.benchmark}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: chartColors.benchmark }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Interval summary (text tokens — never series color alone) */}
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3">
        <div>
          <p className="text-[11px] text-ink-muted">{t('chart.portfolio')} · {range}</p>
          <p className="mt-0.5 text-sm font-semibold text-ink tabular">{formatCurrency(s.last.portfolio)}</p>
          <p
            className={`text-xs font-medium tabular ${
              portfolioPct >= 0 ? 'text-positive' : 'text-negative'
            }`}
          >
            {portfolioPct >= 0 ? '▲' : '▼'} {formatSignedPercent(portfolioPct)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-ink-muted">{t('chart.benchmark')} · {range}</p>
          <p className="mt-0.5 text-sm font-semibold text-ink tabular">{formatCurrency(s.last.benchmark)}</p>
          <p
            className={`text-xs font-medium tabular ${
              benchmarkPct >= 0 ? 'text-positive' : 'text-negative'
            }`}
          >
            {benchmarkPct >= 0 ? '▲' : '▼'} {formatSignedPercent(benchmarkPct)}
          </p>
        </div>
      </div>
    </div>
  )
}
