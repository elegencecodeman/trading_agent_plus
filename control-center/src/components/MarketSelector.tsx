import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../lib/cn'
import { useI18n } from '../lib/i18n'
import type { MarketId } from '../types'
import { MARKET_IDS } from '../data/mock'

interface MarketSelectorProps {
  value: MarketId
  onChange: (market: MarketId) => void
}

export function MarketSelector({ value, onChange }: MarketSelectorProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface/60 px-3 py-1.5 text-xs font-medium text-ink transition-colors duration-200 hover:border-ink-secondary/40 hover:bg-surface"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
        {t(`market.${value}`)}
        <ChevronDown className={cn('h-3.5 w-3.5 text-ink-secondary transition-transform duration-200', open && 'rotate-180')} size={14} />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t('market.ariaLabel')}
          className="absolute right-0 z-30 mt-2 w-44 animate-fade-in overflow-hidden rounded-lg border border-line bg-surface-2 p-1 shadow-card"
        >
          {MARKET_IDS.map((id) => {
            const selected = id === value
            return (
              <li key={id} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(id)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium transition-colors duration-150',
                    selected ? 'bg-accent-faint text-ink' : 'text-ink-secondary hover:bg-white/5 hover:text-ink',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
                    {t(`market.${id}`)}
                  </span>
                  {selected && <Check className="h-3.5 w-3.5 text-accent" size={14} />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
