/** Shared domain types for the Trading Agent Control Center (demo). */

export type MarketId = 'us' | 'crypto' | 'forex'
export type TimeRangeId = '1D' | '1W' | '1M' | '3M'
export type AgentState = 'Analyzing' | 'Waiting' | 'Executing' | 'Paused' | 'Error'
export type Side = 'BUY' | 'SELL' | 'HOLD'
export type SignalStatus = 'executed' | 'pending' | 'rejected' | 'monitoring'
export type LogType = 'reasoning' | 'signal' | 'order' | 'risk'
export type LogStatus = 'success' | 'info' | 'warning' | 'error'
export type RiskLevel = 'normal' | 'warning' | 'critical'
export type StageId = 'observe' | 'analyze' | 'decide' | 'risk' | 'execute'
export type StageStatus = 'done' | 'active' | 'pending' | 'skipped'

export interface Metric {
  id: string
  label: string
  value: string
  rawValue: number
  /** Signed display string, e.g. "+1.24%" */
  delta?: string
  deltaDirection: 'up' | 'down' | 'flat'
  deltaLabel?: string
  trend: number[]
  /** Tint applied to the card's accent / gauge. */
  kind: 'accent' | 'positive' | 'negative' | 'warning' | 'ai'
}

export interface PerformancePoint {
  label: string
  timestamp: number
  portfolio: number
  benchmark: number
}

export interface AgentStatus {
  state: AgentState
  task: string
  market: string
  timeframe: string
  lastDecisionAt: string
  confidence: number
}

export interface Signal {
  id: string
  symbol: string
  side: Side
  price: number
  confidence: number
  strategy: string
  time: string
  status: SignalStatus
  note: string
}

export interface Position {
  id: string
  symbol: string
  name: string
  side: Side
  quantity: number
  avgCost: number
  lastPrice: number
  unrealizedPnl: number
  unrealizedPnlPct: number
  weight: number
}

export interface RiskSnapshot {
  totalExposure: number
  maxDrawdown: number
  volatility: number
  concentration: number
  stopLossTriggers: number
  level: RiskLevel
}

export interface ActivityEntry {
  id: string
  time: string
  type: LogType
  agent: string
  message: string
  durationMs: number
  status: LogStatus
}

export interface PipelineStage {
  id: StageId
  label: string
  status: StageStatus
  startedAt: string
  durationMs: number
  summary: string
}

export interface MarketFeature {
  label: string
  value: string
  tag?: 'bullish' | 'bearish' | 'neutral'
}

export interface IndicatorReading {
  name: string
  value: string
  direction: 'up' | 'down' | 'flat'
}

export interface RiskCheckItem {
  label: string
  result: 'pass' | 'warn' | 'fail'
  detail: string
}

export interface AgentMonitorData {
  state: AgentState
  task: string
  decisionSummary: string
  whyNoTrade: string
  stages: PipelineStage[]
  features: MarketFeature[]
  strategies: string[]
  indicators: IndicatorReading[]
  candidates: Signal[]
  riskChecks: RiskCheckItem[]
}

export interface DashboardData {
  metrics: Metric[]
  performance: PerformancePoint[]
  agent: AgentStatus
  signals: Signal[]
  positions: Position[]
  risk: RiskSnapshot
  activity: ActivityEntry[]
  monitor: AgentMonitorData
}

/**
 * Full real-market dashboard payload (``GET /dashboard/{ticker}`` and the SSE
 * ``dashboard`` event share this shape). ``available: false`` means the bridge
 * could not fetch yfinance data for the ticker.
 */
export interface DashboardResponse {
  available: boolean
  range?: string
  metrics?: Metric[]
  performance?: PerformancePoint[]
  positions?: Position[]
  risk?: RiskSnapshot
  signals?: Signal[]
  indicators?: IndicatorReading[]
  error?: string
}

/* ------------------------------------------------------------------ *
 * Run configuration — provider / model / language / ticker pickers,
 * mirrored from the backend ``GET /options`` payload.
 * ------------------------------------------------------------------ */
export interface ModelOption {
  label: string
  value: string
}

export interface ProviderOption {
  id: string
  label: string
  hasKey: boolean
  needsSetup: boolean
  models: {
    quick: ModelOption[]
    deep: ModelOption[]
  }
}

export interface OptionsResponse {
  providers: ProviderOption[]
  languages: string[]
  current: {
    provider: string
    deepThinkLlm: string
    quickThinkLlm: string
    outputLanguage: string
  }
}

export interface Quote {
  available: boolean
  ticker: string
  price?: number
  changePct?: number
  rsi?: number | null
  macd?: number
  atr?: number
  volatility?: number
  maxDrawdown?: number
  error?: string
}

export interface RunConfig {
  ticker: string
  provider: string
  deepModel: string
  quickModel: string
  language: string
}
