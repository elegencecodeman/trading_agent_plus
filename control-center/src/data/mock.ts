import type {
  ActivityEntry,
  AgentMonitorData,
  AgentState,
  DashboardData,
  IndicatorReading,
  LogStatus,
  LogType,
  MarketFeature,
  MarketId,
  Metric,
  PerformancePoint,
  PipelineStage,
  Position,
  RiskCheckItem,
  RiskLevel,
  RiskSnapshot,
  Side,
  Signal,
  SignalStatus,
  TimeRangeId,
} from '../types'
import {
  formatCurrency,
  formatPrice,
  formatSignedCurrency,
  formatSignedPercent,
} from '../lib/format'

/* ------------------------------------------------------------------ *
 * Seeded PRNG — deterministic per (market, range) so data is stable
 * across re-renders but visibly different between selections.
 * ------------------------------------------------------------------ */
function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ------------------------------------------------------------------ *
 * Market configs
 * ------------------------------------------------------------------ */
interface SymbolSpec {
  symbol: string
  name: string
  price: number
}

interface MarketConfig {
  id: MarketId
  label: string
  assetClass: string
  basePortfolio: number
  baseBenchmark: number
  driftPortfolio: number
  driftBenchmark: number
  volPortfolio: number
  volBenchmark: number
  dailyPnl: number
  dailyPnlVsYesterday: number
  confidence: number
  symbols: SymbolSpec[]
  strategies: string[]
}

const MARKETS: Record<MarketId, MarketConfig> = {
  us: {
    id: 'us',
    label: 'US Equities',
    assetClass: 'Equities',
    basePortfolio: 1_284_530,
    baseBenchmark: 1_000_000,
    driftPortfolio: 0.0011,
    driftBenchmark: 0.0007,
    volPortfolio: 0.004,
    volBenchmark: 0.0026,
    dailyPnl: 18_420,
    dailyPnlVsYesterday: 6_210,
    confidence: 78,
    symbols: [
      { symbol: 'NVDA', name: 'NVIDIA Corp.', price: 128.44 },
      { symbol: 'AAPL', name: 'Apple Inc.', price: 191.02 },
      { symbol: 'MSFT', name: 'Microsoft Corp.', price: 415.76 },
      { symbol: 'TSLA', name: 'Tesla Inc.', price: 231.95 },
      { symbol: 'AMD', name: 'Advanced Micro Devices', price: 149.12 },
      { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 166.9 },
    ],
    strategies: ['Momentum Breakout', 'Mean Reversion', 'Trend Following', 'Sector Rotation'],
  },
  crypto: {
    id: 'crypto',
    label: 'Crypto',
    assetClass: 'Digital Assets',
    basePortfolio: 486_220,
    baseBenchmark: 400_000,
    driftPortfolio: 0.0016,
    driftBenchmark: 0.001,
    volPortfolio: 0.012,
    volBenchmark: 0.009,
    dailyPnl: 12_380,
    dailyPnlVsYesterday: -3_410,
    confidence: 64,
    symbols: [
      { symbol: 'BTC', name: 'Bitcoin', price: 67240 },
      { symbol: 'ETH', name: 'Ethereum', price: 3185.6 },
      { symbol: 'SOL', name: 'Solana', price: 154.2 },
      { symbol: 'LINK', name: 'Chainlink', price: 13.84 },
      { symbol: 'ARB', name: 'Arbitrum', price: 0.82 },
    ],
    strategies: ['Momentum Breakout', 'Volatility Regime', 'Trend Following', 'Funding Carry'],
  },
  forex: {
    id: 'forex',
    label: 'Forex',
    assetClass: 'FX',
    basePortfolio: 312_880,
    baseBenchmark: 300_000,
    driftPortfolio: 0.0003,
    driftBenchmark: 0.0002,
    volPortfolio: 0.0016,
    volBenchmark: 0.0012,
    dailyPnl: 4_120,
    dailyPnlVsYesterday: 890,
    confidence: 71,
    symbols: [
      { symbol: 'EURUSD', name: 'Euro / US Dollar', price: 1.0842 },
      { symbol: 'USDJPY', name: 'US Dollar / Yen', price: 151.32 },
      { symbol: 'GBPUSD', name: 'Pound / US Dollar', price: 1.2689 },
      { symbol: 'AUDUSD', name: 'Aussie / US Dollar', price: 0.6551 },
    ],
    strategies: ['Carry Trade', 'Mean Reversion', 'Trend Following', 'Correlation Pairs'],
  },
}

/* ------------------------------------------------------------------ *
 * Range meta — point count + time label per index
 * ------------------------------------------------------------------ */
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['May', 'Jun', 'Jul', 'Aug']

interface RangeMeta {
  count: number
  labelAt: (i: number) => string
}

const RANGE_META: Record<TimeRangeId, RangeMeta> = {
  '1D': {
    count: 32,
    labelAt: (i) => {
      const totalMin = 9 * 60 + 30 + i * 15
      const h = Math.floor(totalMin / 60)
      const m = totalMin % 60
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    },
  },
  '1W': {
    count: 35,
    labelAt: (i) => `${DAYS[i % 5]} ${String(9 + (i % 7)).padStart(2, '0')}:00`,
  },
  '1M': {
    count: 22,
    labelAt: (i) => `${MONTHS[Math.floor(i / 6) % 4]} ${String((i % 6) * 4 + 1).padStart(2, '0')}`,
  },
  '3M': {
    count: 64,
    labelAt: (i) => `${MONTHS[Math.floor(i / 16) % 4]} ${String((i % 16) + 1).padStart(2, '0')}`,
  },
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function downsample(arr: number[], n: number): number[] {
  if (arr.length <= n) return arr
  const out: number[] = []
  const step = (arr.length - 1) / (n - 1)
  for (let i = 0; i < n; i++) out.push(arr[Math.round(i * step)])
  return out
}

/* ------------------------------------------------------------------ *
 * Performance series
 * ------------------------------------------------------------------ */
function generatePerformance(market: MarketConfig, range: TimeRangeId, rng: () => number): PerformancePoint[] {
  const meta = RANGE_META[range]
  const points: PerformancePoint[] = []
  let p = market.basePortfolio
  let b = market.baseBenchmark
  const driftP = market.driftPortfolio
  const driftB = market.driftBenchmark
  const volP = market.volPortfolio
  const volB = market.volBenchmark

  for (let i = 0; i < meta.count; i++) {
    // gentle sine wave gives the curves an organic shape
    const wave = Math.sin(i / 5) * volP * 0.5
    const newsP = rng() < 0.08 ? (rng() - 0.5) * volP * 5 : 0
    const newsB = rng() < 0.08 ? (rng() - 0.5) * volB * 5 : 0
    p = p * (1 + driftP + wave + (rng() - 0.5) * 2 * volP + newsP)
    b = b * (1 + driftB + (rng() - 0.5) * 2 * volB + newsB)
    points.push({
      label: meta.labelAt(i),
      timestamp: i,
      portfolio: round2(p),
      benchmark: round2(b),
    })
  }
  return points
}

/* ------------------------------------------------------------------ *
 * Metrics
 * ------------------------------------------------------------------ */
function generateMetrics(market: MarketConfig, range: TimeRangeId, perf: PerformancePoint[], rng: () => number): Metric[] {
  const first = perf[0].portfolio
  const last = perf[perf.length - 1].portfolio
  const rangeChangePct = ((last - first) / first) * 100
  const pnlPositive = market.dailyPnl >= 0
  const pnlSeries = Array.from({ length: 20 }, (_, i) => {
    const t = i / 19
    return market.dailyPnl * (0.4 + t * 1.2 + (rng() - 0.5) * 0.6)
  })

  const riskUtil = market.id === 'crypto' ? 58 : market.id === 'us' ? 42 : 27
  const riskLimit = 65
  const riskLevel: RiskLevel = riskUtil >= riskLimit ? 'critical' : riskUtil >= 50 ? 'warning' : 'normal'

  const perfValues = perf.map((p) => p.portfolio)

  return [
    {
      id: 'portfolio-value',
      label: 'Portfolio Value',
      value: formatCurrency(last),
      rawValue: last,
      delta: formatSignedPercent(rangeChangePct),
      deltaDirection: rangeChangePct >= 0 ? 'up' : 'down',
      deltaLabel: `vs ${range}`,
      trend: downsample(perfValues, 20),
      kind: 'accent',
    },
    {
      id: 'today-pnl',
      label: "Today's P&L",
      value: formatSignedCurrency(market.dailyPnl),
      rawValue: market.dailyPnl,
      delta: `${market.dailyPnlVsYesterday >= 0 ? '+' : ''}${formatCurrency(market.dailyPnlVsYesterday)}`,
      deltaDirection: market.dailyPnlVsYesterday >= 0 ? 'up' : 'down',
      deltaLabel: 'vs yesterday',
      trend: pnlSeries,
      kind: pnlPositive ? 'positive' : 'negative',
    },
    {
      id: 'agent-confidence',
      label: 'Agent Confidence',
      value: `${market.confidence}%`,
      rawValue: market.confidence,
      delta: market.id === 'us' ? '+4.2 pts' : market.id === 'crypto' ? '-3.1 pts' : '+1.8 pts',
      deltaDirection: market.id === 'crypto' ? 'down' : 'up',
      deltaLabel: 'session',
      trend: [62, 66, 64, 70, 72, 69, 74, 76, 73, 78, market.confidence],
      kind: 'ai',
    },
    {
      id: 'risk-utilization',
      label: 'Risk Utilization',
      value: `${riskUtil}%`,
      rawValue: riskUtil,
      delta: `limit ${riskLimit}%`,
      deltaDirection: 'flat',
      deltaLabel: riskLevel === 'normal' ? 'Normal' : riskLevel === 'warning' ? 'Warning' : 'Critical',
      trend: [31, 34, 33, 38, 36, 40, 39, 41, riskUtil],
      kind: riskLevel === 'normal' ? 'positive' : riskLevel === 'warning' ? 'warning' : 'negative',
    },
  ]
}

/* ------------------------------------------------------------------ *
 * Positions
 * ------------------------------------------------------------------ */
interface PositionSpec {
  symbol: string
  name: string
  side: Side
  qty: number
  avgCost: number
  weight: number
}

const POSITION_SPECS: Record<MarketId, PositionSpec[]> = {
  us: [
    { symbol: 'NVDA', name: 'NVIDIA Corp.', side: 'BUY', qty: 420, avgCost: 112.3, weight: 18.4 },
    { symbol: 'AAPL', name: 'Apple Inc.', side: 'BUY', qty: 610, avgCost: 182.1, weight: 12.1 },
    { symbol: 'MSFT', name: 'Microsoft Corp.', side: 'BUY', qty: 330, avgCost: 398.2, weight: 10.8 },
    { symbol: 'TSLA', name: 'Tesla Inc.', side: 'SELL', qty: 260, avgCost: 244.8, weight: 8.6 },
    { symbol: 'AMD', name: 'Advanced Micro Devices', side: 'BUY', qty: 540, avgCost: 158.6, weight: 6.9 },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', side: 'BUY', qty: 280, avgCost: 141.5, weight: 5.2 },
  ],
  crypto: [
    { symbol: 'BTC', name: 'Bitcoin', side: 'BUY', qty: 3.2, avgCost: 61200, weight: 38.4 },
    { symbol: 'ETH', name: 'Ethereum', side: 'BUY', qty: 48, avgCost: 2890, weight: 24.1 },
    { symbol: 'SOL', name: 'Solana', side: 'BUY', qty: 820, avgCost: 168.4, weight: 16.8 },
    { symbol: 'LINK', name: 'Chainlink', side: 'SELL', qty: 5200, avgCost: 14.9, weight: 7.6 },
    { symbol: 'ARB', name: 'Arbitrum', side: 'BUY', qty: 61000, avgCost: 0.94, weight: 5.1 },
  ],
  forex: [
    { symbol: 'EURUSD', name: 'Euro / US Dollar', side: 'BUY', qty: 240000, avgCost: 1.0712, weight: 22.5 },
    { symbol: 'USDJPY', name: 'US Dollar / Yen', side: 'SELL', qty: 180000, avgCost: 149.6, weight: 18.2 },
    { symbol: 'GBPUSD', name: 'Pound / US Dollar', side: 'BUY', qty: 150000, avgCost: 1.2541, weight: 14.6 },
    { symbol: 'AUDUSD', name: 'Aussie / US Dollar', side: 'BUY', qty: 120000, avgCost: 0.6488, weight: 9.4 },
  ],
}

function generatePositions(market: MarketConfig): Position[] {
  return POSITION_SPECS[market.id].map((spec, i) => {
    const lastPrice = market.symbols.find((s) => s.symbol === spec.symbol)?.price ?? spec.avgCost
    const pnl = spec.side === 'BUY' ? (lastPrice - spec.avgCost) * spec.qty : (spec.avgCost - lastPrice) * spec.qty
    const pnlPct = spec.side === 'BUY' ? ((lastPrice - spec.avgCost) / spec.avgCost) * 100 : ((spec.avgCost - lastPrice) / spec.avgCost) * 100
    return {
      id: `pos-${i}`,
      symbol: spec.symbol,
      name: spec.name,
      side: spec.side,
      quantity: spec.qty,
      avgCost: spec.avgCost,
      lastPrice,
      unrealizedPnl: round2(pnl),
      unrealizedPnlPct: round2(pnlPct),
      weight: spec.weight,
    }
  })
}

/* ------------------------------------------------------------------ *
 * Signals
 * ------------------------------------------------------------------ */
interface SignalSpec {
  symbol: string
  side: Side
  confidence: number
  strategy: string
  status: SignalStatus
  note: string
}

const SIGNAL_SPECS: Record<MarketId, SignalSpec[]> = {
  us: [
    { symbol: 'NVDA', side: 'BUY', confidence: 0.91, strategy: 'Momentum Breakout', status: 'executed', note: '20d high breakout on rising volume' },
    { symbol: 'TSLA', side: 'SELL', confidence: 0.68, strategy: 'Mean Reversion', status: 'pending', note: 'RSI overbought; waiting for confirmation' },
    { symbol: 'AMD', side: 'HOLD', confidence: 0.42, strategy: 'Trend Following', status: 'monitoring', note: 'Downtrend intact, no entry' },
    { symbol: 'GOOGL', side: 'BUY', confidence: 0.78, strategy: 'Sector Rotation', status: 'pending', note: 'Relative strength vs. comm services' },
  ],
  crypto: [
    { symbol: 'BTC', side: 'BUY', confidence: 0.83, strategy: 'Momentum Breakout', status: 'executed', note: 'Reclaimed 66K support zone' },
    { symbol: 'SOL', side: 'HOLD', confidence: 0.55, strategy: 'Volatility Regime', status: 'monitoring', note: 'High realized vol, sizing reduced' },
    { symbol: 'LINK', side: 'SELL', confidence: 0.61, strategy: 'Trend Following', status: 'rejected', note: 'Slippage above tolerance' },
    { symbol: 'ETH', side: 'BUY', confidence: 0.72, strategy: 'Funding Carry', status: 'pending', note: 'Funding flipped positive' },
  ],
  forex: [
    { symbol: 'USDJPY', side: 'SELL', confidence: 0.74, strategy: 'Carry Trade', status: 'executed', note: 'Yield differential narrowing' },
    { symbol: 'EURUSD', side: 'BUY', confidence: 0.66, strategy: 'Mean Reversion', status: 'pending', note: 'Pullback to 20d mean' },
    { symbol: 'GBPUSD', side: 'HOLD', confidence: 0.47, strategy: 'Correlation Pairs', status: 'monitoring', note: 'Rangebound; no edge' },
    { symbol: 'AUDUSD', side: 'BUY', confidence: 0.58, strategy: 'Trend Following', status: 'rejected', note: 'AUD correlation to commodities fading' },
  ],
}

function generateSignals(market: MarketConfig): Signal[] {
  return SIGNAL_SPECS[market.id].map((spec, i) => {
    const price = market.symbols.find((s) => s.symbol === spec.symbol)?.price ?? 0
    return {
      id: `sig-${i}`,
      symbol: spec.symbol,
      side: spec.side,
      price,
      confidence: spec.confidence,
      strategy: spec.strategy,
      time: `09:${String(31 + i * 6).padStart(2, '0')}:0${i % 4}`,
      status: spec.status,
      note: spec.note,
    }
  })
}

/* ------------------------------------------------------------------ *
 * Risk snapshot
 * ------------------------------------------------------------------ */
function generateRisk(market: MarketConfig): RiskSnapshot {
  if (market.id === 'crypto') {
    return { totalExposure: 74, maxDrawdown: 9.4, volatility: 31.2, concentration: 38.4, stopLossTriggers: 1, level: 'warning' }
  }
  if (market.id === 'us') {
    return { totalExposure: 58, maxDrawdown: 4.1, volatility: 16.8, concentration: 18.4, stopLossTriggers: 0, level: 'normal' }
  }
  return { totalExposure: 49, maxDrawdown: 2.3, volatility: 9.6, concentration: 22.5, stopLossTriggers: 0, level: 'normal' }
}

/* ------------------------------------------------------------------ *
 * Activity log
 * ------------------------------------------------------------------ */
interface ActivitySpec {
  type: LogType
  agent: string
  message: (market: MarketConfig) => string
  durationMs: number
  status: LogStatus
}

function timeLabel(range: TimeRangeId, idx: number): string {
  if (range === '1D') {
    const totalSec = 9 * 3600 + 31 * 60 + idx * 11
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  const day = DAYS[idx % 5]
  const h = 9 + Math.floor(idx / 5) % 8
  return `${day} ${String(h).padStart(2, '0')}:31`
}

const ACTIVITY_SPECS: ActivitySpec[] = [
  { type: 'reasoning', agent: 'analyst', message: () => 'Agent completed market regime analysis', durationMs: 840, status: 'success' },
  { type: 'signal', agent: 'signal', message: (m) => `New momentum signal detected for ${m.symbols[0].symbol}`, durationMs: 120, status: 'info' },
  { type: 'risk', agent: 'risk', message: () => 'Risk check passed: exposure within limit', durationMs: 45, status: 'success' },
  { type: 'order', agent: 'executor', message: () => 'Order proposal generated for review', durationMs: 210, status: 'info' },
  { type: 'reasoning', agent: 'analyst', message: (m) => `Evaluating mean-reversion setup on ${m.symbols[3].symbol}`, durationMs: 640, status: 'info' },
  { type: 'risk', agent: 'risk', message: (m) => `Sector concentration ${m.id === 'us' ? '41%' : '38%'} approaching cap`, durationMs: 60, status: 'warning' },
  { type: 'signal', agent: 'signal', message: (m) => `Sell signal generated for ${m.symbols[4].symbol} (stop)`, durationMs: 90, status: 'info' },
  { type: 'order', agent: 'executor', message: (m) => `Executed BUY ${m.symbols[0].symbol} @ ${formatPrice(m.symbols[0].price)} (paper)`, durationMs: 380, status: 'success' },
  { type: 'reasoning', agent: 'analyst', message: () => 'Regime model: risk-on, breadth expanding', durationMs: 510, status: 'success' },
  { type: 'risk', agent: 'risk', message: () => 'Stop-loss sweep: 1 trigger within buffer', durationMs: 34, status: 'warning' },
  { type: 'signal', agent: 'signal', message: (m) => `Hold signal maintained for ${m.symbols[1].symbol}`, durationMs: 70, status: 'info' },
  { type: 'reasoning', agent: 'analyst', message: () => 'Volatility regime stable; no position change', durationMs: 460, status: 'success' },
]

function generateActivity(market: MarketConfig, range: TimeRangeId): ActivityEntry[] {
  return ACTIVITY_SPECS.map((spec, i) => ({
    id: `log-${i}`,
    time: timeLabel(range, i),
    type: spec.type,
    agent: spec.agent,
    message: spec.message(market),
    durationMs: spec.durationMs,
    status: spec.status,
  }))
}

/* ------------------------------------------------------------------ *
 * Agent monitor (drawer) data
 * ------------------------------------------------------------------ */
function generateMonitor(market: MarketConfig): AgentMonitorData {
  const stages: PipelineStage[] = [
    { id: 'observe', label: 'Observe', status: 'done', startedAt: '09:30:58', durationMs: 3200, summary: `Scanned ${market.id === 'forex' ? 24 : market.id === 'crypto' ? 60 : 128} ${market.assetClass} instruments` },
    { id: 'analyze', label: 'Analyze', status: 'done', startedAt: '09:31:02', durationMs: 6100, summary: 'Regime = risk-on · momentum + breadth confirm' },
    { id: 'decide', label: 'Decide', status: 'active', startedAt: '09:31:08', durationMs: 2400, summary: `Long candidates: ${market.symbols[0].symbol} (0.91)` },
    { id: 'risk', label: 'Risk Check', status: 'pending', startedAt: '—', durationMs: 0, summary: 'Awaiting exposure & concentration check' },
    { id: 'execute', label: 'Execute', status: 'pending', startedAt: '—', durationMs: 0, summary: 'Paper-fill orders on approval' },
  ]

  const features: MarketFeature[] = [
    { label: 'Market regime', value: market.id === 'crypto' ? 'Risk-on' : 'Risk-on', tag: 'bullish' },
    { label: 'Trend strength', value: 'Strong', tag: 'bullish' },
    { label: 'Breadth', value: 'Expanding', tag: 'bullish' },
    { label: 'Volatility', value: market.id === 'crypto' ? 'Elevated' : 'Normal', tag: market.id === 'crypto' ? 'bearish' : 'neutral' },
    { label: 'Liquidity', value: 'Adequate', tag: 'neutral' },
  ]

  const indicators: IndicatorReading[] = [
    { name: 'RSI (14)', value: '62.4', direction: 'up' },
    { name: 'MACD', value: 'Bullish cross', direction: 'up' },
    { name: '20d Momentum', value: '+4.8%', direction: 'up' },
    { name: 'ATR (14)', value: market.id === 'crypto' ? '3.1%' : '1.6%', direction: 'flat' },
    { name: 'VWAP', value: 'Above', direction: 'up' },
  ]

  const candidates: Signal[] = generateSignals(market).filter((s) => s.side !== 'HOLD').slice(0, 3)

  const riskChecks: RiskCheckItem[] = [
    { label: 'Total exposure', result: 'pass', detail: '58% of 65% limit' },
    { label: 'Sector concentration', result: market.id === 'us' ? 'warn' : 'pass', detail: market.id === 'us' ? '41% vs 45% cap' : '38% vs 45% cap' },
    { label: 'Max drawdown', result: 'pass', detail: '4.1% vs 8% limit' },
    { label: 'Volatility', result: market.id === 'crypto' ? 'warn' : 'pass', detail: market.id === 'crypto' ? '31.2% vs 25% target' : '16.8% vs 25% target' },
  ]

  return {
    state: 'Analyzing',
    task: `Scanning ${market.assetClass.toLowerCase()} momentum signals`,
    decisionSummary: `Agent favors adding a ${market.symbols[0].symbol} momentum long at ${formatPrice(market.symbols[0].price)} (confidence 0.91), sized to 1.2% risk, while holding a 12% cash buffer.`,
    whyNoTrade: `No additional orders fired this cycle — the ${market.symbols[3].symbol} mean-reversion setup failed the volatility filter, and remaining candidates sit below the 0.65 confidence threshold.`,
    stages,
    features,
    strategies: market.strategies,
    indicators,
    candidates,
    riskChecks,
  }
}

/* ------------------------------------------------------------------ *
 * Agent status (state machine driven by Run/Pause)
 * ------------------------------------------------------------------ */
export function getAgentStatus(state: AgentState, market: MarketConfig): AgentStatusView {
  switch (state) {
    case 'Analyzing':
      return { state, task: `Scanning ${market.assetClass.toLowerCase()} momentum signals`, lastDecisionAt: '09:31:08', confidence: market.confidence }
    case 'Executing':
      return { state, task: `Filling ${market.symbols[0].symbol} paper order`, lastDecisionAt: '09:31:26', confidence: market.confidence }
    case 'Waiting':
      return { state, task: 'Awaiting next market event', lastDecisionAt: '09:31:08', confidence: market.confidence }
    case 'Paused':
      return { state, task: 'Paused by operator — no orders will fire', lastDecisionAt: '09:31:08', confidence: market.confidence }
    case 'Error':
      return { state, task: 'Risk service unreachable — retrying', lastDecisionAt: '—', confidence: market.confidence }
  }
}

export interface AgentStatusView {
  state: AgentState
  task: string
  lastDecisionAt: string
  confidence: number
}

/* ------------------------------------------------------------------ *
 * Combined dashboard
 * ------------------------------------------------------------------ */
export function getDashboard(marketId: MarketId, range: TimeRangeId): DashboardData {
  const market = MARKETS[marketId]
  const rng = mulberry32(hashSeed(`${marketId}-${range}`))
  const perf = generatePerformance(market, range, rng)
  const agent = getAgentStatus('Analyzing', market)

  return {
    metrics: generateMetrics(market, range, perf, rng),
    performance: perf,
    agent: { state: agent.state, task: agent.task, market: market.label, timeframe: range, lastDecisionAt: agent.lastDecisionAt, confidence: agent.confidence },
    signals: generateSignals(market),
    positions: generatePositions(market),
    risk: generateRisk(market),
    activity: generateActivity(market, range),
    monitor: generateMonitor(market),
  }
}

export const MARKET_IDS: MarketId[] = ['us', 'crypto', 'forex']
export const TIME_RANGES: TimeRangeId[] = ['1D', '1W', '1M', '3M']
export const MARKET_LABEL: Record<MarketId, string> = {
  us: 'US Equities',
  crypto: 'Crypto',
  forex: 'Forex',
}

/** Popular ticker suggestions for the config picker, per market. */
export function getPopularSymbols(market: MarketId): { symbol: string; name: string }[] {
  return MARKETS[market].symbols.map((s) => ({ symbol: s.symbol, name: s.name }))
}
