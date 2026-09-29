/**
 * Chart-facing color constants.
 * Portfolio #60A5FA (light blue) + Benchmark #8B5CF6 (gray-purple) were validated
 * for the dark card surface (#121923): CVD ΔE 12.5 / normal-vision ΔE 17.5,
 * both clear of the dataviz floors. The benchmark also carries a dashed stroke
 * as a non-color secondary encoding.
 */
export const chartColors = {
  portfolio: '#60A5FA',
  benchmark: '#8B5CF6',
  grid: '#263241',
  axis: '#5E6B7A',
  surface: '#121923',
  positive: '#35C98A',
  negative: '#F06A7A',
  warning: '#F2B84B',
  ai: '#A78BFA',
  cyan: '#47D7E8',
} as const

/** hex + alpha → rgba() string, for the subtle area-fill washes. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
