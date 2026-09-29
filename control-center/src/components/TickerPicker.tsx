import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '../lib/cn'
import { useI18n } from '../lib/i18n'
import { getPopularSymbols } from '../data/mock'
import { fetchQuote } from '../lib/api'
import type { MarketId, Quote } from '../types'

interface TickerPickerProps {
  market: MarketId
  value: string
  onChange: (ticker: string) => void
}

/**
 * Searchable ticker input with a live yfinance quote preview. The user can pick
 * a popular symbol or type any Yahoo ticker (e.g. "AAPL", "BTC-USD", "EURUSD=X").
 */
export function TickerPicker({ market, value, onChange }: TickerPickerProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const [quote, setQuote] = useState<Quote | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep the local query in sync when the market change resets the ticker.
  useEffect(() => setQuery(value), [value])

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Debounced live quote (real yfinance data). Silent on failure.
  useEffect(() => {
    const ticker = value.trim()
    if (!ticker) {
      setQuote(null)
      return
    }
    let cancelled = false
    const t = setTimeout(() => {
      fetchQuote(ticker)
        .then((q) => {
          if (!cancelled && q.available) setQuote(q)
          else if (!cancelled) setQuote(null)
        })
        .catch(() => {
          if (!cancelled) setQuote(null)
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [value])

  const popular = getPopularSymbols(market)
  const q = query.trim().toUpperCase()
  const suggestions = q
    ? popular.filter((s) => s.symbol.toUpperCase().includes(q) || s.name.toUpperCase().includes(q))
    : popular

  const commit = (ticker: string) => {
    const t = ticker.trim().toUpperCase()
    if (!t) return
    onChange(t)
    setQuery(t)
    setOpen(false)
    inputRef.current?.blur()
  }

  const changePct = quote?.changePct

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface/60 px-2.5 py-1.5 focus-within:border-accent/50">
        <Search className="h-3.5 w-3.5 shrink-0 text-ink-muted" size={14} />
        <input
          ref={inputRef}
          value={query}
          spellCheck={false}
          placeholder={t('ticker.placeholder')}
          aria-label={t('ticker.ariaLabel')}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(query)
          }}
          className="w-32 bg-transparent text-xs font-medium text-ink outline-none placeholder:text-ink-muted"
        />
        <button
          type="button"
          aria-label={t('ticker.toggleSuggestions')}
          onClick={() => setOpen((v) => !v)}
          className="text-ink-muted hover:text-ink"
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', open && 'rotate-180')} size={14} />
        </button>
      </div>

      {/* Live quote preview (real yfinance) */}
      {quote?.available && (
        <div className="mt-1 flex items-center gap-1.5 text-[11px] tabular">
          <span className="text-ink-secondary">{quote.ticker}</span>
          <span className="font-semibold text-ink">${quote.price?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          {changePct !== undefined && (
            <span className={cn('font-medium', changePct >= 0 ? 'text-positive' : 'text-negative')}>
              {changePct >= 0 ? '+' : ''}
              {changePct.toFixed(2)}%
            </span>
          )}
        </div>
      )}

      {open && (
        <ul
          role="listbox"
          aria-label={t('ticker.suggestions')}
          className="absolute left-0 z-30 mt-1 w-60 animate-fade-in overflow-hidden rounded-lg border border-line bg-surface-2 p-1 shadow-card"
        >
          {suggestions.map((s) => {
            const selected = s.symbol === value
            return (
              <li key={s.symbol} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => commit(s.symbol)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors',
                    selected ? 'bg-accent-faint text-ink' : 'text-ink-secondary hover:bg-white/5 hover:text-ink',
                  )}
                >
                  <span>
                    <span className="font-semibold text-ink">{s.symbol}</span>
                    <span className="ml-2 text-ink-muted">{s.name}</span>
                  </span>
                  {selected && <Check className="h-3.5 w-3.5 text-accent" size={14} />}
                </button>
              </li>
            )
          })}
          {q && !suggestions.some((s) => s.symbol === q) && (
            <li role="option">
              <button
                type="button"
                onClick={() => commit(q)}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-ink-secondary transition-colors hover:bg-white/5 hover:text-ink"
              >
                <span>{t('ticker.useQuote', { q })}</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
