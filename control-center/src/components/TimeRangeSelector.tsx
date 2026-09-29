import { cn } from '../lib/cn'
import { useI18n } from '../lib/i18n'
import type { TimeRangeId } from '../types'
import { TIME_RANGES } from '../data/mock'

interface TimeRangeSelectorProps {
  value: TimeRangeId
  onChange: (range: TimeRangeId) => void
}

export function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  const { t } = useI18n()
  return (
    <div
      role="tablist"
      aria-label={t('config.timeRange')}
      className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface/60 p-0.5"
    >
      {TIME_RANGES.map((range) => {
        const active = range === value
        return (
          <button
            key={range}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(range)}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-200 focus-visible:outline-none',
              active
                ? 'bg-accent-faint text-accent shadow-sm'
                : 'text-ink-secondary hover:text-ink',
            )}
          >
            {range}
          </button>
        )
      })}
    </div>
  )
}
