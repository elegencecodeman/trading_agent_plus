/**
 * Thin HTTP client for the TradingAgents FastAPI bridge.
 *
 * All backend state (options / quotes / runs) is reachable through these
 * helpers so components never hand-roll ``fetch`` against the API_BASE.
 */

import type { DashboardResponse, OptionsResponse, Quote } from '../types'

export const API_BASE = 'http://localhost:8000'

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

/** Provider / model / language catalog for the config pickers. */
export function fetchOptions(): Promise<OptionsResponse> {
  return getJson<OptionsResponse>('/options')
}

/** Live price + indicator preview for a ticker (real yfinance data). */
export function fetchQuote(ticker: string): Promise<Quote> {
  return getJson<Quote>(`/quote/${encodeURIComponent(ticker)}`)
}

/** Full real-market dashboard (price-anchored paper portfolio), no LLM. */
export function fetchDashboard(ticker: string, range: string): Promise<DashboardResponse> {
  return getJson<DashboardResponse>(
    `/dashboard/${encodeURIComponent(ticker)}?range=${encodeURIComponent(range)}`,
  )
}
