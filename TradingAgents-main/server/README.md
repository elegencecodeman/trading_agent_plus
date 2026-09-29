# TradingAgents → Web 桥接服务

把 `TradingAgentsGraph.propagate` 包成一个 FastAPI 服务，用 **SSE** 流式输出
LangGraph 各节点的执行过程，事件结构对齐 `control-center` 前端的数据模型。

## 快速开始

```bash
cd TradingAgents-main
pip install -r server/requirements.txt          # fastapi / uvicorn / pydantic
# 确保根目录 .env 已配置 LLM provider + API key（TRADINGAGENTS_* 环境变量）
python -m uvicorn server.main:app --reload --port 8000
```

前端通过浏览器 `EventSource` 消费（无需 SDK）：

```js
const res = await fetch('http://localhost:8000/run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ticker: 'NVDA', trade_date: '2024-05-10', asset_type: 'stock' }),
})
const { run_id, events_url } = await res.json()

const es = new EventSource('http://localhost:8000' + events_url)
es.addEventListener('stage',    e => onStage(JSON.parse(e.data)))
es.addEventListener('activity', e => onActivity(JSON.parse(e.data)))
es.addEventListener('report',   e => onReport(JSON.parse(e.data)))
es.addEventListener('decision', e => onDecision(JSON.parse(e.data)))
es.addEventListener('error',    e => onError(JSON.parse(e.data)))
es.addEventListener('done',     () => es.close())
```

## 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 存活探针 |
| POST | `/run` | 启动一次分析，入参 `{ticker, trade_date, asset_type}`，返回 `{run_id, events_url}` |
| GET | `/run/{run_id}/events` | SSE 流（`text/event-stream`） |

## SSE 事件契约（→ 前端组件映射）

| 事件 | payload 字段 | 前端组件 |
|---|---|---|
| `meta` | `state`, `task`, `ticker`, `tradeDate` | `AgentStatusCard` 状态/任务 |
| `stage` | `stages: [{id,label,status,summary,startedAt,durationMs}]` | `AgentMonitorDrawer` 流水线 |
| `activity` | `{id,time,type,agent,message,durationMs,status}` | `ActivityLog` 实时日志 |
| `report` | `{kind,label,text}`（market/sentiment/news/fundamentals/plan） | 抽屉「Evidence / Decision Summary」 |
| `decision` | `{symbol,side,rating,confidence,strategy,note,status}` | `LiveSignalsCard` 一行信号 |
| `dashboard` | `{available, metrics[], performance[], positions[], risk, signals[], indicators[]}` | Overview 指标卡/净值曲线/持仓表/风控快照/信号/指标 —— **yfinance 补丁产出**（见下） |
| `error` | `{message}` | 错误态 |
| `done` | `{}` | 结束哨兵 |

## dashboard 事件（yfinance 补丁）

`decision` 之后由 `server/market.py` 发出：用**真实行情**补齐 TradingAgents
不产出的数值型卡片，纸面组合模型明确标注 demo：

| 字段 | 来源 |
|---|---|
| `metrics[]` | 组合市值（真实价格 × 纸面权重）、当日盈亏、置信度（评级→映射）、风险占用 |
| `performance[]` | 基准（SPY/对应指数）+ 评级倾斜的纸面净值曲线（真实历史） |
| `positions[]` | 3 只纸面持仓（主标的 + 2 只同业），真实现价 + 计算的浮动盈亏/权重 |
| `risk` | 真实历史算出的波动率/最大回撤；暴露度/集中度/止损由置信度推导 |
| `signals[]` | 主信号（真实价 + 评级置信度）+ 2 只同业监控信号 |
| `indicators[]` | stockstats 计算 RSI / MACD / ATR（真实） |

网络或 ticker 无数据时 `available: false`，前端保留自身 mock，**绝不伪造价格**。
独立验证（无需 LLM）：`python -m server.market AAPL`。

## Alpaca 模拟盘（只读）覆盖

美股 + 加密两个市场的 **持仓 / 组合市值 / 当日盈亏 / 风险暴露度** 可由
`server/alpaca.py` 从 **Alpaca 模拟盘（paper）账户** 读取真实数据（只读，不下单）：

- 在 Alpaca 后台 **Paper Trading** 环境生成 API Key，填入根目录 `.env`：
  `ALPACA_API_KEY` / `ALPACA_SECRET_KEY`（见 `.env.example`）。
- 配置了 key 且 ticker 非外汇（不含 `=X` 后缀）时，`market.py` 用 Alpaca 账户覆盖合成模型：
  `positions` ← `/v2/positions`、`equity` ← `/v2/account`、净值曲线 ← `/v2/portfolio/history`；
  价格/指标/波动率/最大回撤仍来自 yfinance。
- **降级**：key 缺失、网络失败、外汇 ticker、或账户无历史时，自动回退到原有合成纸面模型，
  应用不依赖 Alpaca 可达。
- 持仓需在 Alpaca 网页手动下模拟单产生（只读模式不会自动下单）。

节点 → stage 映射（`runner.py` 的 `NODE_META`）：

| TradingAgents 节点 | 前端 stage |
|---|---|
| Market Analyst | `observe` |
| Sentiment / News / Fundamentals Analyst、Bull/Bear Researcher、Research Manager | `analyze` |
| Trader | `decide` |
| Aggressive / Conservative / Neutral Analyst | `risk` |
| Portfolio Manager（写 `final_trade_decision`） | `execute` |

## 数据缺口与 yfinance 补丁覆盖情况

`TradingAgents` 本质是**研究 + 决策**智能体：它产出研究报告文本和最终评级
（Buy/Overweight/Hold/Underweight/Sell），**不是**组合/风控监控系统。下表列出
前端 Overview 需要、但 TradingAgents 不产出的数据，以及补丁的处理方式：

| 前端模块 | 需要的字段 | 状态 | 补丁来源 |
|---|---|---|---|
| `MetricCard`（资产总值 / 当日盈亏 / 置信度% / 风险占用%） | `portfolio value`, `today pnl`, `confidence`, `risk utilization %` | ✅ 已补 | 真实价格 × 纸面权重；置信度=评级→映射；暴露度由置信度推导 |
| `PortfolioPerformanceChart` | `portfolio` / `benchmark` 时间序列 | ✅ 已补 | 真实历史（yfinance）+ 评级倾斜的纸面净值 |
| `PositionsTable` | 持仓列表（symbol/数量/成本/现价/浮动盈亏/权重） | ✅ 已补 | 3 只纸面持仓（主标的 + 2 只同业），真实现价、计算的盈亏 |
| `RiskSnapshotCard` | `totalExposure/maxDrawdown/volatility/concentration/stopLossTriggers` | ✅ 已补 | 真实历史算波动率/最大回撤；暴露/集中度/止损由置信度推导 |
| `LiveSignalsCard` | 每个信号的 `confidence`（0–1）、`price` | ✅ 已补 | `price`=真实现价；`confidence`=评级→0–1 映射 |
| `AgentMonitorDrawer` | `features/indicators/strategies/candidates/riskChecks` | ⚠️ 部分 | `indicators`（RSI/MACD/ATR）为 stockstats 真实计算；`features/candidates/riskChecks` 仍无对应数据 |

⚠️ **诚实边界**：上表「已补」的大部分是**纸面组合模型**（`server/market.py` 内
明确标注 DEMO），其中只有 **价格、历史曲线、指标、波动率、最大回撤** 是真实
yfinance 数据；**持仓权重、组合市值、暴露度、置信度数值**是演示模型推导。
网络不可用或 ticker 无数据时 `dashboard.available=false`，前端保留 mock，
**绝不伪造价格**。运行 `python -m server.market AAPL` 可独立查看产出。

**后端真实产出（无需补丁）**：`stages`（流水线）、`activity`（逐节点日志）、
`report`（四份研究报告 + 投资计划文本）、`decision`（最终评级 → side）、
`meta`（状态机）。

### 仍是硬缺口的（需后续单独做）

- **`features` / `candidates` / `riskChecks`**（抽屉的「特征/候选信号/风控检查项」）：
  TradingAgents 无对应结构化字段，若前端需要，得给各 analyst 加 structured-output
  （复用 `agents/schemas.py` 机制）把指标/候选从文本抽成字段。
- **`stopLossTriggers`**：补丁用置信度推导（0–2），非真实风控系统计数。

## 局限

- **无 checkpoint 续跑**：流式路径用 `stream_mode="updates"` 直接跑图，
  未接入 `propagate` 里的 `SqliteSaver` 断点续跑；崩溃需重跑。
- **单例图、固定分析师**：图按默认 `selected_analysts`（market/social/news/
  fundamentals）编译一次，暂不支持按请求换分析师（需按请求重编译图）。
- **内存态 run 表**：`RUNS` 存在进程内存，重启即失；多 worker 需换成 Redis
  pub/sub。
