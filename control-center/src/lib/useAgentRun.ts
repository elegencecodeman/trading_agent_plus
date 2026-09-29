/**
 * Live run bridge — drives the Overview from the TradingAgents FastAPI backend.
 *
 * The backend exposes:
 *   GET  /dashboard/{ticker}?range=  → real yfinance dashboard (idle baseline)
 *   POST /run {ticker, ...}          → {run_id, events_url}
 *   GET  /run/{id}/events            (Server-Sent Events)
 *
 * The idle baseline is *real* market data (price-anchored paper portfolio)
 * fetched from ``/dashboard/{ticker}`` — there is no mock fallback. Running the
 * agent then streams the LLM pipeline over SSE and, on completion, overwrites
 * the dashboard with the agent's actual rating. When the backend or yfinance is
 * unreachable we surface an error + retry instead of fabricating numbers.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { API_BASE, fetchDashboard } from './api'
import { useI18n } from './i18n'
import type {
  ActivityEntry,
  AgentState,
  AgentStatus,
  DashboardData,
  DashboardResponse,
  MarketId,
  PipelineStage,
  RunConfig,
  Side,
  TimeRangeId,
} from '../types'

const MAX_LOG = 80

/** Market selector → default ticker used to pre-fill the ticker input. */
export const DEFAULT_TICKER: Record<MarketId, string> = {
  us: 'NVDA',
  crypto: 'BTC-USD',
  forex: 'EURUSD=X',
}

/** Yahoo convention: crypto pairs end with ``-USD``; FX uses the stock pipeline. */
export function detectAssetType(ticker: string): string {
  return ticker.trim().toUpperCase().endsWith('-USD') ? 'crypto' : 'stock'
}

export type RunPhase = 'idle' | 'running' | 'paused' | 'stopped' | 'completed'

type TFunc = (key: string, vars?: Record<string, string | number>) => string

/* ------------------------------------------------------------------ *
 * SSE payload shapes — mirror server/runner.py + server/market.py.
 * ------------------------------------------------------------------ */
interface SSEMeta {
  state?: string
  task?: string
  market?: string
  ticker?: string
  tradeDate?: string
}

interface SSEStage {
  stages: PipelineStage[]
}

interface SSEActivity {
  id: string
  time: string
  type: ActivityEntry['type']
  agent: string
  message: string
  durationMs: number
  status: ActivityEntry['status']
}

interface SSEReport {
  kind: string
  label: string
  text: string
}

interface SSEDecision {
  symbol: string
  side: Side
  rating: string
  confidence: number | null
  strategy: string
  note: string
  status: string
}

export interface LiveRun {
  phase: RunPhase
  connected: boolean
  /** True once real market data has loaded (vs. loading / error). */
  live: boolean
  /** True while the idle dashboard is being fetched from the backend. */
  loading: boolean
  error: string | null
  warning: string | null
  data: DashboardData
  start: (config: RunConfig) => void
  pause: () => void
  stop: () => void
  reset: (ticker: string, range: TimeRangeId) => void
}

function toAgentState(s?: string): AgentState {
  switch (s) {
    case 'Executing':
      return 'Executing'
    case 'Waiting':
      return 'Waiting'
    case 'Paused':
      return 'Paused'
    case 'Error':
      return 'Error'
    default:
      return 'Analyzing'
  }
}

function parseJson<T>(ev: Event): T {
  return JSON.parse((ev as MessageEvent).data) as T
}

function today(): string {
  const now = new Date()
  const mo = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${mo}-${d}`
}

function applyMeta(d: DashboardData, m: SSEMeta): DashboardData {
  const marketLabel = m.market === 'crypto' ? 'Crypto' : m.market === 'forex' ? 'Forex' : 'US Equities'
  const agent: AgentStatus = {
    ...d.agent,
    state: toAgentState(m.state),
    task: m.task || d.agent.task,
    market: marketLabel,
    timeframe: m.tradeDate || d.agent.timeframe,
  }
  return { ...d, agent, monitor: { ...d.monitor, state: agent.state, task: agent.task } }
}

function applyDashboard(d: DashboardData, dash: DashboardResponse): DashboardData {
  const confidence = dash.metrics?.find((m) => m.id === 'agent-confidence')?.rawValue ?? d.agent.confidence
  const indicators = dash.indicators ?? d.monitor.indicators
  const candidates = (dash.signals ?? d.monitor.candidates).filter((s) => s.side !== 'HOLD').slice(0, 3)
  return {
    ...d,
    metrics: dash.metrics ?? d.metrics,
    performance: dash.performance ?? d.performance,
    positions: dash.positions ?? d.positions,
    risk: dash.risk ?? d.risk,
    signals: dash.signals ?? d.signals,
    agent: { ...d.agent, confidence },
    monitor: { ...d.monitor, indicators, candidates },
  }
}

const IDLE_STAGES: PipelineStage[] = [
  { id: 'observe', label: 'Observe', status: 'pending', startedAt: '—', durationMs: 0, summary: '' },
  { id: 'analyze', label: 'Analyze', status: 'pending', startedAt: '—', durationMs: 0, summary: '' },
  { id: 'decide', label: 'Decide', status: 'pending', startedAt: '—', durationMs: 0, summary: '' },
  { id: 'risk', label: 'Risk Check', status: 'pending', startedAt: '—', durationMs: 0, summary: '' },
  { id: 'execute', label: 'Execute', status: 'pending', startedAt: '—', durationMs: 0, summary: '' },
]

/** Neutral empty dashboard (all real fields unset) — the loading / error base. */
function idleDashboard(ticker: string, range: TimeRangeId, t: TFunc): DashboardData {
  const market = detectAssetType(ticker) === 'crypto' ? 'Crypto' : 'US Equities'
  return {
    metrics: [],
    performance: [],
    agent: {
      state: 'Waiting',
      task: t('agent.idleTask', { ticker }),
      market,
      timeframe: range,
      lastDecisionAt: '—',
      confidence: 0,
    },
    signals: [],
    positions: [],
    risk: { totalExposure: 0, maxDrawdown: 0, volatility: 0, concentration: 0, stopLossTriggers: 0, level: 'normal' },
    activity: [],
    monitor: {
      state: 'Waiting',
      task: '',
      decisionSummary: t('agent.idleDecision'),
      whyNoTrade: t('agent.idleWhyNoTrade'),
      stages: IDLE_STAGES,
      features: [],
      strategies: [],
      indicators: [],
      candidates: [],
      riskChecks: [],
    },
  }
}

export function useAgentRun(): LiveRun {
  const { t } = useI18n()
  const [data, setData] = useState<DashboardData>(() => idleDashboard(DEFAULT_TICKER.us, '1D', t))
  const [phase, setPhase] = useState<RunPhase>('idle')
  const [connected, setConnected] = useState(false)
  const [live, setLive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const failedRef = useRef(false)

  useEffect(() => () => { esRef.current?.close() }, [])

  const start = useCallback((config: RunConfig) => {
    esRef.current?.close()
    esRef.current = null
    failedRef.current = false
    setPhase('running')
    setConnected(false)
    setLive(false)
    setError(null)
    setWarning(null)

    fetch(`${API_BASE}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker: config.ticker,
        trade_date: today(),
        asset_type: detectAssetType(config.ticker),
        provider: config.provider || undefined,
        deep_think_llm: config.deepModel || undefined,
        quick_think_llm: config.quickModel || undefined,
        output_language: config.language || undefined,
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = (await res.json()) as { run_id: string; events_url: string }
        const es = new EventSource(API_BASE + body.events_url)
        esRef.current = es

        es.onopen = () => setConnected(true)

        // Note: the backend emits pipeline failures as `event: error` too, and
        // the browser funnels those through `onerror`. A server error carries
        // a MessageEvent with `.data`; a transport drop carries a plain Event.
        es.onerror = (ev) => {
          if (esRef.current !== es) return // closed intentionally
          const raw = (ev as MessageEvent).data
          if (typeof raw === 'string' && raw) {
            failedRef.current = true
            try {
              setError((JSON.parse(raw) as { message?: string }).message ?? t('error.runFailed'))
            } catch {
              setError(raw)
            }
          } else {
            setError(t('error.streamDisconnected'))
          }
          setConnected(false)
          setPhase('stopped')
        }

        es.addEventListener('meta', (ev) => {
          setLive(true)
          setData((d) => applyMeta(d, parseJson<SSEMeta>(ev)))
        })
        es.addEventListener('stage', (ev) => {
          const { stages } = parseJson<SSEStage>(ev)
          setData((d) => ({ ...d, monitor: { ...d.monitor, stages } }))
        })
        es.addEventListener('activity', (ev) => {
          const a = parseJson<SSEActivity>(ev)
          setData((d) => ({ ...d, activity: [...d.activity, a].slice(-MAX_LOG) }))
        })
        es.addEventListener('report', (ev) => {
          const r = parseJson<SSEReport>(ev)
          if (r.kind === 'plan') setData((d) => ({ ...d, monitor: { ...d.monitor, decisionSummary: r.text } }))
        })
        es.addEventListener('decision', (ev) => {
          const dec = parseJson<SSEDecision>(ev)
          setData((d) => ({ ...d, monitor: { ...d.monitor, decisionSummary: dec.note || d.monitor.decisionSummary } }))
        })
        es.addEventListener('dashboard', (ev) => {
          const dash = parseJson<DashboardResponse>(ev)
          if (dash.available) {
            setLive(true)
            setData((d) => applyDashboard(d, dash))
            setWarning(null)
          } else {
            setWarning(t('error.backendUnavailable', { detail: dash.error ?? 'unknown' }))
          }
        })
        es.addEventListener('done', () => {
          if (failedRef.current) return
          es.close()
          esRef.current = null
          setConnected(false)
          setPhase('completed')
        })
      })
      .catch((err: unknown) => {
        setError(t('error.connectBackend', { base: API_BASE, detail: err instanceof Error ? err.message : String(err) }))
        setPhase('stopped')
      })
  }, [t])

  const pause = useCallback(() => {
    esRef.current?.close()
    esRef.current = null
    setConnected(false)
    setPhase('paused')
  }, [])

  const stop = useCallback(() => {
    esRef.current?.close()
    esRef.current = null
    setConnected(false)
    setPhase('stopped')
  }, [])

  const reset = useCallback((ticker: string, range: TimeRangeId) => {
    esRef.current?.close()
    esRef.current = null
    failedRef.current = false
    setData(idleDashboard(ticker, range, t))
    setPhase('idle')
    setConnected(false)
    setLive(false)
    setError(null)
    setWarning(null)
    setLoading(true)

    fetchDashboard(ticker, range)
      .then((dash) => {
        if (!dash.available) {
          setLive(false)
          setLoading(false)
          setError(dash.error ? t('error.fetchMarket', { detail: dash.error }) : t('error.fetchMarketShort'))
          return
        }
        setLive(true)
        setLoading(false)
        setData((d) => applyDashboard(d, dash))
      })
      .catch((err: unknown) => {
        setLive(false)
        setLoading(false)
        setError(t('error.connectBackend', { base: API_BASE, detail: err instanceof Error ? err.message : String(err) }))
      })
  }, [t])

  return { phase, connected, live, loading, error, warning, data, start, pause, stop, reset }
}
