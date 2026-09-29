import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export type Locale = 'en' | 'zh'

type DictNode = string | { [key: string]: DictNode }
type Dict = { [key: string]: DictNode }

const en: Dict = {
  common: {
    retry: 'Retry',
    backToOverview: 'Back to Overview',
  },
  nav: {
    overview: 'Overview',
    agent: 'Agent Monitor',
    signals: 'Market Signals',
    portfolio: 'Portfolio',
    orders: 'Orders',
    backtest: 'Backtest',
    risk: 'Risk Center',
    settings: 'Settings',
    navigation: 'Navigation',
    collapse: 'Collapse',
    expandSidebar: 'Expand sidebar',
    collapseSidebar: 'Collapse sidebar',
    closeNavigation: 'Close navigation',
    primary: 'Primary',
  },
  topbar: {
    tradingAgent: 'Trading Agent',
    controlCenter: 'Control Center',
    marketOpen: 'Market Open',
    updated: 'Updated {time}',
    notifications: 'Notifications',
    openNavigation: 'Open navigation',
    workspace: 'Workspace',
    accountMenu: 'Account menu',
    switchToLight: 'Switch to light theme',
    switchToDark: 'Switch to dark theme',
    language: 'Language',
    wsAlpha: 'Alpha Fund · Paper',
    wsMulti: 'Multi-Strategy · Live',
    wsVol: 'Vol Arb · Research',
    notif1: 'NVDA momentum signal executed',
    notif2: 'Risk exposure at 58% of limit',
    notif3: 'Daily P&L report ready',
  },
  overview: {
    title: 'Trading Overview',
    subtitle: 'Monitor agent decisions, portfolio exposure and market signals',
    pause: 'Pause',
    runAgent: 'Run Agent',
    stop: 'Stop',
    refreshData: 'Refresh market data',
    liveReal: 'LIVE · {ticker} · Live quotes',
    paperSim: 'Paper trading · simulated portfolio/positions',
    keyMetrics: 'Key metrics',
    recentActivity: 'Recent agent activity',
    pausedByOperator: 'Paused by operator — stream halted',
    stoppedByOperator: 'Stopped by operator — session halted',
    analysisComplete: 'Analysis complete — results below',
    errorLoadReal: 'Unable to load live market data',
    unknownError: 'Unknown error',
  },
  config: {
    ticker: 'Ticker',
    model: 'Model',
    language: 'Language',
    loadingModels: 'Loading models…',
    timeRange: 'Time range',
  },
  metric: {
    portfolioValue: 'Portfolio Value',
    todayPnl: "Today's P&L",
    agentConfidence: 'Agent Confidence',
    riskUtilization: 'Risk Utilization',
    vsRange: 'vs {range}',
    vsYesterday: 'vs yesterday',
    session: 'session',
    limit: 'limit {pct}%',
    utilization: 'Utilization',
    ofLimit: '{value}% / {limit}% limit',
    confidenceAria: 'Confidence {value}%',
  },
  agentState: {
    Analyzing: 'Analyzing',
    Waiting: 'Waiting',
    Executing: 'Executing',
    Paused: 'Paused',
    Error: 'Error',
  },
  agent: {
    status: 'Agent Status',
    lastDecision: 'Last decision',
    confidence: 'Confidence',
    analyzing: 'Analyzing {market} on the {timeframe} timeframe.',
    viewReasoning: 'View Reasoning',
    openMonitor: 'Open Agent Monitor',
    idleTask: 'Showing real market data for {ticker} — run the agent for a rating',
    idleDecision: 'No analysis yet — run the agent to generate a rating and investment plan.',
    idleWhyNoTrade: 'The agent has not run for this ticker yet.',
  },
  market: {
    us: 'US Equities',
    crypto: 'Crypto',
    forex: 'Forex',
    ariaLabel: 'Market',
  },
  signalStatus: {
    executed: 'Executed',
    pending: 'Pending',
    rejected: 'Rejected',
    monitoring: 'Watching',
  },
  side: {
    BUY: 'Buy',
    SELL: 'Sell',
    HOLD: 'Hold',
    long: 'Long',
    short: 'Short',
  },
  riskLevel: {
    normal: 'Normal',
    warning: 'Warning',
    critical: 'Critical',
  },
  stage: {
    observe: 'Observe',
    analyze: 'Analyze',
    decide: 'Decide',
    risk: 'Risk Check',
    execute: 'Execute',
  },
  logType: {
    reasoning: 'Reasoning',
    signal: 'Signal',
    order: 'Order',
    risk: 'Risk',
  },
  signals: {
    liveSignals: 'Live Signals',
    viewAll: 'View all',
    noSignals: 'No signals yet',
    noSignalsDesc: 'The agent has not emitted any signals in this cycle. Try a different market or time range.',
  },
  positions: {
    currentPositions: 'Current Positions',
    viewPortfolio: 'View Portfolio',
    noPositions: 'No open positions',
    noPositionsDesc: 'The portfolio is flat. The agent is holding cash while it scans for setups.',
    symbol: 'Symbol',
    side: 'Side',
    qty: 'Qty',
    avgCost: 'Avg Cost',
    last: 'Last',
    unrealizedPnl: 'Unrealized P&L',
    weight: 'Weight',
  },
  risk: {
    riskSnapshot: 'Risk Snapshot',
    totalExposure: 'Total Exposure',
    maxDrawdown: 'Max Drawdown',
    volatility: 'Volatility',
    concentration: 'Concentration',
    stopLossTriggers: 'Stop-loss triggers',
    openRiskCenter: 'Open Risk Center',
  },
  chart: {
    portfolioPerformance: 'Portfolio Performance',
    netVsBenchmark: 'Net value vs. benchmark · {range}',
    portfolio: 'Portfolio',
    benchmark: 'Benchmark',
  },
  activity: {
    recentActivity: 'Recent Agent Activity',
    live: 'Live',
    noActivity: 'No matching activity',
    noActivityDesc: 'No events of this type yet. Switch filters or wait for the agent to emit new entries.',
    autoScroll: 'Auto-scroll',
    logFilter: 'Log filter',
    all: 'All',
    agentAnalyst: 'analyst',
    agentSignal: 'signal',
    agentExecutor: 'executor',
    agentRisk: 'risk',
    liveReeval: 'Re-evaluating momentum score for {sym}',
    liveRegime: 'Regime filter: risk-on, no reversal signal',
    liveSizing: 'Position sizing recomputed for {sym}',
    liveRisk: 'Risk check passed: exposure within limit',
    liveScan: 'Scanning for new breakout candidates',
    liveOrder: 'Order proposal queued for {sym} (paper)',
  },
  featureTag: {
    bullish: 'Bullish',
    bearish: 'Bearish',
    neutral: 'Neutral',
  },
  monitor: {
    agentMonitor: 'Agent Monitor',
    close: 'Close agent monitor',
    decisionSummary: 'Decision Summary',
    whyNoTrade: 'Why no additional trade',
    evidence: 'Evidence',
    indicators: 'Indicators',
    strategies: 'Strategies',
    candidateSignals: 'Candidate Signals',
    riskChecks: 'Risk Checks',
    pass: 'Pass',
    warn: 'Warn',
    fail: 'Fail',
    pipeline: 'Pipeline',
    conf: '{pct}% conf',
  },
  demo: {
    demoMode: 'Demo Mode',
    tooltip: 'All prices, positions, P&L and agent activity are simulated. Not financial advice.',
  },
  error: {
    defaultTitle: 'Unable to load data',
    defaultDesc: 'The dashboard hit an error while fetching data. This is a demo; retry to reload the simulated feed.',
    runFailed: 'Analysis pipeline failed',
    streamDisconnected: 'Live stream disconnected — backend closed the connection.',
    connectBackend: 'Unable to reach backend ({base}): {detail}',
    fetchMarket: 'Unable to fetch real market data ({detail})',
    fetchMarketShort: 'Unable to fetch real market data',
    backendUnavailable: 'Backend market data unavailable ({detail}) — cards keep their current values.',
  },
  placeholder: {
    description:
      'This view is a scaffold for the backend integration. The Overview page ships fully wired with simulated data.',
  },
  model: {
    needsSetup: 'Needs setup',
    noKey: 'Missing API key',
    current: '{name} (current)',
    providerAria: 'LLM provider',
    deepAria: 'Deep (thinking) model',
    quickAria: 'Quick (fast) model',
  },
  select: {
    placeholder: 'Select…',
  },
  ticker: {
    placeholder: 'Ticker (e.g. AAPL)',
    ariaLabel: 'Ticker',
    useQuote: 'Use “{q}”',
    toggleSuggestions: 'Toggle ticker suggestions',
    suggestions: 'Ticker suggestions',
  },
}

const zh: Dict = {
  common: {
    retry: '重试',
    backToOverview: '返回总览',
  },
  nav: {
    overview: '总览',
    agent: '智能体监控',
    signals: '市场信号',
    portfolio: '投资组合',
    orders: '订单',
    backtest: '回测',
    risk: '风险中心',
    settings: '设置',
    navigation: '导航',
    collapse: '收起',
    expandSidebar: '展开侧边栏',
    collapseSidebar: '收起侧边栏',
    closeNavigation: '关闭导航',
    primary: '主菜单',
  },
  topbar: {
    tradingAgent: '交易智能体',
    controlCenter: '控制中心',
    marketOpen: '市场开盘',
    updated: '更新于 {time}',
    notifications: '通知',
    openNavigation: '打开导航',
    workspace: '工作区',
    accountMenu: '账户菜单',
    switchToLight: '切换到浅色主题',
    switchToDark: '切换到深色主题',
    language: '语言',
    wsAlpha: '阿尔法基金 · 模拟',
    wsMulti: '多策略 · 实盘',
    wsVol: '波动率套利 · 研究',
    notif1: 'NVDA 动量信号已执行',
    notif2: '风险敞口达限额的 58%',
    notif3: '每日盈亏报告已就绪',
  },
  overview: {
    title: '交易总览',
    subtitle: '监控智能体决策、组合敞口与市场信号',
    pause: '暂停',
    runAgent: '运行智能体',
    stop: '停止',
    refreshData: '刷新行情数据',
    liveReal: 'LIVE · {ticker} · 真实行情',
    paperSim: '模拟盘 · 组合/持仓为模拟数据',
    keyMetrics: '关键指标',
    recentActivity: '近期智能体活动',
    pausedByOperator: '已由操作员暂停 — 数据流已停止',
    stoppedByOperator: '已由操作员停止 — 会话已终止',
    analysisComplete: '分析完成 — 结果见下方',
    errorLoadReal: '无法加载真实行情',
    unknownError: '未知错误',
  },
  config: {
    ticker: '股票代码',
    model: '模型',
    language: '语言',
    loadingModels: '加载模型中…',
    timeRange: '时间范围',
  },
  metric: {
    portfolioValue: '组合价值',
    todayPnl: '今日盈亏',
    agentConfidence: '智能体信心',
    riskUtilization: '风险占用',
    vsRange: '相对{range}',
    vsYesterday: '较昨日',
    session: '本会话',
    limit: '上限{pct}%',
    utilization: '占用率',
    ofLimit: '{value}% / 上限 {limit}%',
    confidenceAria: '信心 {value}%',
  },
  agentState: {
    Analyzing: '分析中',
    Waiting: '等待中',
    Executing: '执行中',
    Paused: '已暂停',
    Error: '错误',
  },
  agent: {
    status: '智能体状态',
    lastDecision: '最近决策',
    confidence: '信心',
    analyzing: '正在 {timeframe} 周期分析 {market}。',
    viewReasoning: '查看推理',
    openMonitor: '打开智能体监控',
    idleTask: '展示 {ticker} 的真实行情 — 运行智能体获取评级',
    idleDecision: '尚未分析 — 运行智能体以生成评级与投资计划。',
    idleWhyNoTrade: '智能体尚未对此标的运行。',
  },
  market: {
    us: '美股',
    crypto: '加密货币',
    forex: '外汇',
    ariaLabel: '市场',
  },
  signalStatus: {
    executed: '已执行',
    pending: '待执行',
    rejected: '已拒绝',
    monitoring: '观察中',
  },
  side: {
    BUY: '买入',
    SELL: '卖出',
    HOLD: '持有',
    long: '做多',
    short: '做空',
  },
  riskLevel: {
    normal: '正常',
    warning: '警告',
    critical: '严重',
  },
  stage: {
    observe: '观察',
    analyze: '分析',
    decide: '决策',
    risk: '风控检查',
    execute: '执行',
  },
  logType: {
    reasoning: '推理',
    signal: '信号',
    order: '订单',
    risk: '风险',
  },
  signals: {
    liveSignals: '实时信号',
    viewAll: '查看全部',
    noSignals: '暂无信号',
    noSignalsDesc: '本周期智能体尚未发出任何信号。请尝试其他市场或时间范围。',
  },
  positions: {
    currentPositions: '当前持仓',
    viewPortfolio: '查看组合',
    noPositions: '暂无持仓',
    noPositionsDesc: '组合为空仓，智能体在寻找交易机会期间持有现金。',
    symbol: '代码',
    side: '方向',
    qty: '数量',
    avgCost: '平均成本',
    last: '最新价',
    unrealizedPnl: '未实现盈亏',
    weight: '权重',
  },
  risk: {
    riskSnapshot: '风险快照',
    totalExposure: '总敞口',
    maxDrawdown: '最大回撤',
    volatility: '波动率',
    concentration: '集中度',
    stopLossTriggers: '止损触发次数',
    openRiskCenter: '打开风险中心',
  },
  chart: {
    portfolioPerformance: '组合表现',
    netVsBenchmark: '净值对比基准 · {range}',
    portfolio: '组合',
    benchmark: '基准',
  },
  activity: {
    recentActivity: '近期智能体活动',
    live: '实时',
    noActivity: '无匹配活动',
    noActivityDesc: '暂无此类型事件。切换筛选条件或等待智能体产生新条目。',
    autoScroll: '自动滚动',
    logFilter: '日志筛选',
    all: '全部',
    agentAnalyst: '分析师',
    agentSignal: '信号',
    agentExecutor: '执行',
    agentRisk: '风控',
    liveReeval: '重新评估 {sym} 的动量得分',
    liveRegime: '市场状态过滤：风险偏好，无反转信号',
    liveSizing: '已重新计算 {sym} 的仓位规模',
    liveRisk: '风控检查通过：敞口在限额内',
    liveScan: '扫描新的突破候选标的',
    liveOrder: '已为 {sym} 排队订单提案（模拟）',
  },
  monitor: {
    agentMonitor: '智能体监控',
    close: '关闭智能体监控',
    decisionSummary: '决策摘要',
    whyNoTrade: '为何未产生额外交易',
    evidence: '证据',
    indicators: '指标',
    strategies: '策略',
    candidateSignals: '候选信号',
    riskChecks: '风控检查',
    pass: '通过',
    warn: '警告',
    fail: '失败',
    pipeline: '流水线',
    conf: '{pct}% 信心',
  },
  featureTag: {
    bullish: '看涨',
    bearish: '看跌',
    neutral: '中性',
  },
  demo: {
    demoMode: '演示模式',
    tooltip: '所有价格、持仓、盈亏与智能体活动均为模拟数据，不构成投资建议。',
  },
  error: {
    defaultTitle: '无法加载数据',
    defaultDesc: '仪表盘在获取数据时出错。这是演示环境；请重试以重新加载模拟数据流。',
    runFailed: '分析流程出错',
    streamDisconnected: '实时流连接中断 — 后端已断开。',
    connectBackend: '无法连接后端 ({base})：{detail}',
    fetchMarket: '无法获取真实行情（{detail}）',
    fetchMarketShort: '无法获取真实行情',
    backendUnavailable: '后端行情不可用（{detail}）— 数值卡片保持当前值。',
  },
  placeholder: {
    description: '此视图是后端集成的脚手架。总览页已用模拟数据完整接通。',
  },
  model: {
    needsSetup: '需额外配置',
    noKey: '缺 API key',
    current: '{name}（当前）',
    providerAria: 'LLM 提供方',
    deepAria: '深度（思考）模型',
    quickAria: '快速模型',
  },
  select: {
    placeholder: '请选择…',
  },
  ticker: {
    placeholder: '代码（例如 AAPL）',
    ariaLabel: '股票代码',
    useQuote: '使用“{q}”',
    toggleSuggestions: '切换代码建议',
    suggestions: '代码建议',
  },
}

const dictionaries: Record<Locale, Dict> = { en, zh }

const STORAGE_KEY = 'trading-agent-ui-locale'

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

function resolve(dict: Dict, key: string): string | undefined {
  const node = key.split('.').reduce<DictNode | undefined>((acc, k) => {
    if (acc === undefined || typeof acc === 'string') return undefined
    return acc[k]
  }, dict as DictNode)
  return typeof node === 'string' ? node : undefined
}

function initialLocale(): Locale {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'zh' || raw === 'en') return raw
  } catch {
    /* ignore storage errors */
  }
  return 'en'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore quota/security errors */
    }
  }, [])

  const t = useCallback<I18nContextValue['t']>(
    (key, vars) => {
      const template = resolve(dictionaries[locale], key) ?? resolve(dictionaries.en, key) ?? key
      if (!vars) return template
      return template.replace(/\{(\w+)\}/g, (_, name: string) =>
        vars[name] !== undefined ? String(vars[name]) : `{${name}}`,
      )
    },
    [locale],
  )

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider')
  return ctx
}
