import { useI18n } from '../lib/i18n'
import { useRun } from '../lib/run'
import { MarketSelector } from './MarketSelector'
import { TickerPicker } from './TickerPicker'
import { TimeRangeSelector } from './TimeRangeSelector'

interface PageHeaderProps {
  title: string
  subtitle: string
}

/**
 * Shared page header for the drill-down views (Signals / Portfolio / Risk /
 * Agent Monitor). Every page gets the same instrument + range selector bar so
 * the user can switch ticker from anywhere and the data stays in sync globally.
 */
export function PageHeader({ title, subtitle }: PageHeaderProps) {
  const { t } = useI18n()
  const { config, setConfig, market, setMarket, range, setRange } = useRun()

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-sm text-ink-secondary">{subtitle}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <TimeRangeSelector value={range} onChange={setRange} />
        <MarketSelector value={market} onChange={setMarket} />
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
            {t('config.ticker')}
          </span>
          <TickerPicker
            market={market}
            value={config.ticker}
            onChange={(ticker) => setConfig({ ticker })}
          />
        </div>
      </div>
    </div>
  )
}
