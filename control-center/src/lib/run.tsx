/**
 * Global run state — lifts `useAgentRun` plus the run configuration (ticker /
 * provider / model / language) and market/range selection out of the Overview
 * component so every page (Overview, Signals, Portfolio, Risk, Agent Monitor)
 * shares the *same* live data and the same instrument selection.
 *
 * Before this refactor the live run lived inside <Overview>, so switching to
 * another sidebar item unmounted the data and re-fetched everything. Now one
 * <RunProvider> owns the run and children just read via `useRun()`.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { fetchOptions } from './api'
import { DEFAULT_TICKER, useAgentRun, type LiveRun } from './useAgentRun'
import type { MarketId, OptionsResponse, RunConfig, TimeRangeId } from '../types'

const STORAGE_KEY = 'trading-agent-run-config'

const DEFAULT_CONFIG: RunConfig = {
  ticker: 'NVDA',
  provider: 'deepseek',
  deepModel: 'deepseek-v4-pro',
  quickModel: 'deepseek-v4-flash',
  language: 'Chinese',
}

function loadRunConfig(): RunConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<RunConfig>) }
  } catch {
    /* ignore malformed persisted config */
  }
  return DEFAULT_CONFIG
}

interface RunContextValue {
  run: LiveRun
  config: RunConfig
  setConfig: (patch: Partial<RunConfig>) => void
  market: MarketId
  /** Switching market also resets the ticker to that market's default. */
  setMarket: (market: MarketId) => void
  range: TimeRangeId
  setRange: (range: TimeRangeId) => void
  options: OptionsResponse | null
}

const RunContext = createContext<RunContextValue | null>(null)

export function RunProvider({ children }: { children: ReactNode }) {
  const run = useAgentRun()
  const [market, setMarketState] = useState<MarketId>('us')
  const [range, setRange] = useState<TimeRangeId>('1D')
  const [config, setConfigState] = useState<RunConfig>(loadRunConfig)
  const [options, setOptions] = useState<OptionsResponse | null>(null)

  // Fetch real market data whenever the ticker or range changes.
  useEffect(() => {
    run.reset(config.ticker, range)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.ticker, range])

  // Load provider/model/language catalog once (backend may be down → keep defaults).
  useEffect(() => {
    let cancelled = false
    fetchOptions()
      .then((o) => {
        if (!cancelled) setOptions(o)
      })
      .catch(() => {
        /* keep defaults */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Persist run config across reloads.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    } catch {
      /* ignore quota/security errors */
    }
  }, [config])

  const setConfig = useCallback((patch: Partial<RunConfig>) => {
    setConfigState((c) => ({ ...c, ...patch }))
  }, [])

  const setMarket = useCallback((m: MarketId) => {
    setMarketState(m)
    setConfigState((c) => ({ ...c, ticker: DEFAULT_TICKER[m] }))
  }, [])

  const value = useMemo(
    () => ({ run, config, setConfig, market, setMarket, range, setRange, options }),
    [run, config, setConfig, market, setMarket, range, options],
  )

  return <RunContext.Provider value={value}>{children}</RunContext.Provider>
}

export function useRun(): RunContextValue {
  const ctx = useContext(RunContext)
  if (!ctx) throw new Error('useRun must be used within a RunProvider')
  return ctx
}
