import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../lib/cn'
import { useI18n } from '../lib/i18n'

export interface SelectOption {
  label: string
  value: string
  disabled?: boolean
}

interface SelectProps {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  ariaLabel?: string
  disabled?: boolean
  hint?: string
}

/** Compact dropdown used by the config pickers (model / language). */
export function Select({ value, options, onChange, ariaLabel, disabled, hint }: SelectProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

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

  const current = options.find((o) => o.value === value)

  return (
    <div ref={rootRef} className="relative" title={hint}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface/60 px-2.5 py-1.5 text-xs font-medium text-ink transition-colors',
          disabled
            ? 'cursor-not-allowed opacity-45'
            : 'hover:border-ink-secondary/40 hover:bg-surface',
        )}
      >
        <span className="max-w-40 truncate">{current?.label ?? value ?? t('select.placeholder')}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-ink-secondary transition-transform duration-200', open && 'rotate-180')} size={14} />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 z-30 mt-2 max-h-72 w-max min-w-44 overflow-auto rounded-lg border border-line bg-surface-2 p-1 shadow-card"
        >
          {options.map((o) => {
            const selected = o.value === value
            return (
              <li key={o.value} role="option" aria-selected={selected}>
                <button
                  type="button"
                  disabled={o.disabled}
                  onClick={() => {
                    onChange(o.value)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors',
                    o.disabled ? 'cursor-not-allowed opacity-45' : '',
                    selected ? 'bg-accent-faint text-ink' : 'text-ink-secondary hover:bg-white/5 hover:text-ink',
                  )}
                >
                  <span>{o.label}</span>
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
