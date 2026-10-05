# MEMORY — Financial_project

## 用户环境
- 位于**中国香港**（影响数据源选择：Yahoo 易 429，国内节点源更快）。
- Windows + Anaconda Python（`D:\Anaconda\python.exe`），后端与 CLI 用同一个解释器。
- 装过代理工具（注册表曾残留 `127.0.0.1:18081`，npm 曾配 `7890`），已于 2026-10-05 全部清除。

## 项目构成
- `TradingAgents-main/` Python 后端：`tradingagents/`（AI 引擎）+ `server/`（FastAPI 薄适配层）。
- `control-center/` React18 + TS + Vite 前端，端口 5173；后端 8000；前端直连（无 vite proxy，`API_BASE` 写死）。

## 启动
- 后端：`cd TradingAgents-main` → `python -m uvicorn server.main:app --reload --port 8000`。
- 前端：`cd control-center` → `npm run dev`。
- `TradingAgents-main/requirements.txt` 内容就是一个 `.`，等价于 `pip install -e .`；还需 `pip install -r server/requirements.txt`。
- Python ≥ 3.10；`.env` 必填至少一个 LLM key。

## 关键约束
- **必须单 worker**：`RUNS` 与 `Queue` 在进程内存，多 worker 会导致 SSE 404；且 `--reload` 会忽略 `--workers`。注意 `WEB_CONCURRENCY` 环境变量会覆盖 workers 数。
- **Yahoo Finance 会 429 限流**（2026-10-05 确认）：导致 `/dashboard`、`/quote` 返回 `available:false`。跑一次 AI 分析会因 dataflows 大量调用 yfinance 而触发。排查时用 `curl -w "%{http_code}" https://query1.finance.yahoo.com/v8/finance/chart/NVDA` 判断（200 正常 / 429 限流），**不要高频重试**，会重置冷却。

## 数据源依赖与替代（2026-10-05 调研）
项目对 Yahoo 是两层依赖：
1. `server/market.py` —— 只要 **OHLCV K线**（RSI/MACD/ATR/波动率/回撤由 stockstats 本地算）。替换成本最低。
2. `tradingagents/dataflows/y_finance.py` —— 还要 `.info`、季报三表、`.insider_transactions`；`yfinance_news.py` 要新闻。替换成本高。

替代方案：
- **akshare**：免费无 key、国内/香港快，`stock_us_daily(symbol=..., adjust="qfq")` 可取美股日线。适合替换第 1 层。**美股财报三表覆盖不确定**（其三表接口主要是 A 股源），不建议用于 AI 层。
- **Finnhub**：免费 60 次/分，覆盖 OHLCV + 财报三表 + 内部人交易 + 新闻，是唯一能覆盖"内部人交易"的免费源。适合替换第 2 层。
- **Alpaca**：项目已内置 `server/alpaca.py`，美股 + 加密行情，但无财报。
- 其他：Alpha Vantage（25/天，太少）、Twelve Data（8/min）、Polygon（5/min）、Binance（加密免费无限流）。
- 宏观数据项目已支持 FRED，不依赖 Yahoo。
