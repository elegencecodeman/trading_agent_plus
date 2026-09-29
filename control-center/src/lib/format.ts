/** Number & time formatting helpers. All monetary values are DEMO data. */

const usd0 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})
const usd2 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const num0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const num2 = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatCurrency(value: number, opts: { cents?: boolean } = {}): string {
  return (opts.cents ? usd2 : usd0).format(value)
}

/** Compact large numbers — 1,284 / 12.9K / $4.2M */
export function formatCompact(value: number, currency = false): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  let out: string
  if (abs >= 1_000_000) out = `${(abs / 1_000_000).toFixed(2)}M`
  else if (abs >= 1_000) out = `${(abs / 1_000).toFixed(1)}K`
  else out = abs.toFixed(0)
  return `${sign}${currency ? '$' : ''}${out}`
}

export function formatPercent(value: number, digits = 2, signed = false): string {
  const sign = signed && value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}

export function formatSignedPercent(value: number, digits = 2): string {
  return formatPercent(value, digits, true)
}

export function formatPrice(value: number): string {
  return num2.format(value)
}

export function formatNumber(value: number, decimals = 0): string {
  return decimals === 0 ? num0.format(value) : num2.format(value)
}

const qty = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

/** Quantity — shows decimals only when the value is fractional (e.g. 3.2 BTC). */
export function formatQuantity(value: number): string {
  return qty.format(value)
}

/** Milliseconds → "1.2s" / "380ms" */
export function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms)}ms`
}

export function formatSignedCurrency(value: number): string {
  const sign = value >= 0 ? '+' : '-'
  return `${sign}${formatCurrency(Math.abs(value))}`
}

export function formatTimestamp(t: number): string {
  const d = new Date(t)
  return d.toLocaleTimeString('en-US', { hour12: false })
}
