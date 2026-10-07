# Financial Project — AI 多智能体交易分析控制台

一个把 **TradingAgents 多智能体金融分析框架** 包装成 Web 应用的全栈项目：后端跑 AI 智能体流水线，前端实时可视化它的每一步思考过程。

> ⚠️ 本项目为**演示 / 研究用途**，不构成任何投资建议。

---

## 一、项目是什么

输入一个股票代码（如 `NVDA`），点「Run Agent」，12 个 AI 智能体会模拟一家基金公司的决策流程，产出一份**买卖评级 + 完整推理报告**，并把整个过程实时推到前端界面上。

**决策流水线**（4 个阶段）：

```
分头调研 → 多空辩论 → 交易员定方案 → 三方风控辩论 → 组合经理拍板
   4人        2人          1人           3人            1人
```

产出：`Buy / Overweight / Hold / Underweight / Sell` 五档评级 + 四份研究报告 + 逐节点执行日志。

---

## 二、技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| **AI 编排** | LangGraph | 把 12 个智能体连成一张带循环/分支的图 |
| **LLM 接入** | LangChain | 统一封装 OpenAI / Anthropic / Google / Bedrock 等 |
| **后端服务** | FastAPI + Uvicorn | 4 个 REST 接口 + SSE 流式推送 |
| **行情数据** | yfinance / Alpaca | Yahoo Finance 真实行情（免费）；Alpaca 模拟盘可选 |
| **前端** | React 18 + TypeScript + Vite | 深色控制台界面 |
| **图表 / UI** | Recharts + Tailwind + lucide-react | |
| **并发** | `threading` + `queue.Queue` | AI 跑后台线程，事件经队列推给前端 |
| **账号 / 历史** | SQLAlchemy + SQLite（可换 MySQL） | 注册登录、每次分析结果按用户落库 |
| **缓存 / 限流** | Redis（可选） | 行情缓存、按账号限流、Token 吊销 |

**关键点**：账号体系和 Redis 都是**可选的**——不装 SQLite 数据库也能跑行情接口，不装 Redis 也能跑全流程（服务只打一条 warning，缓存/限流/吊销全部降级放行）。Nginx 依然没有引入，开箱即跑。

---

## 三、目录结构

```
Financial_project/
├── TradingAgents-main/       # Python 后端
│   ├── tradingagents/        #   AI 引擎本体（12 个智能体 + 取数层 + 图编排）
│   ├── server/               #   FastAPI 适配层（薄封装，不含 AI 逻辑）
│   │   ├── main.py           #     路由 / SSE 端点
│   │   ├── auth.py           #     bcrypt 口令 + JWT 签发校验
│   │   ├── db.py             #     数据库连接（读 DATABASE_URL）
│   │   ├── models.py         #     User / AnalysisRun 两张表
│   │   ├── store.py          #     历史记录读写
│   │   └── market.py         #     yfinance / Alpaca 行情
│   ├── data/                 #   SQLite 库文件默认落在这里
│   ├── main.py               #   命令行（CLI）入口
│   ├── .env.example          #   环境变量模板
│   └── requirements.txt      #   内容是 "."，即安装本包
│
└── control-center/           # React 前端
    ├── src/
    │   ├── lib/useAgentRun.ts   # SSE 事件处理核心
    │   ├── lib/auth.tsx         # 登录态 Context
    │   ├── components/          # 界面组件
    │   └── types/               # 类型定义
    └── package.json
```

---

## 四、如何启动

### 环境要求

- **Python ≥ 3.10**
- **Node.js ≥ 18**

### 1️⃣ 启动后端（终端 A）

```bash
cd Financial_project/TradingAgents-main

# 安装依赖
pip install -e .                        # 安装 tradingagents 本体
pip install -r server/requirements.txt  # 安装 API 服务依赖（fastapi/uvicorn/yfinance 等）

# 配置密钥（见下方「环境变量」）
copy .env.example .env                  # Windows
# cp .env.example .env                  # macOS / Linux
# 然后编辑 .env，至少填入一个 LLM 的 API Key

# 启动服务
python -m uvicorn server.main:app --reload --port 8000
```

验证：浏览器打开 <http://localhost:8000/health>，返回 `{"status":"ok"}` 即成功。

### 2️⃣ 启动前端（终端 B）

```bash
cd Financial_project/control-center

npm install
npm run dev
```

### 3️⃣ 打开界面

访问 <http://localhost:5173>。**首次使用先注册一个账号**（右上角头像 → Sign in →
Create account），然后输股票代码（如 `NVDA`），点击 **Run Agent**。

> 游客可以不登录查看行情（价格、K 线、指标），但跑分析需要登录 ——
> 因为每次分析结果都会按用户存进数据库。

> 前端默认直连 `http://localhost:8000`（见 `src/lib/api.ts` 的 `API_BASE`），两个服务都要保持运行。

---

## 五、环境变量（`.env`）

后端启动前必须在 `TradingAgents-main/.env` 中配置**至少一个** LLM 密钥，否则 AI 跑不起来（行情数据仍可正常查看）。

**必填其一**：

```bash
OPENAI_API_KEY=sk-...
# 或 ANTHROPIC_API_KEY / GOOGLE_API_KEY / DEEPSEEK_API_KEY / DASHSCOPE_API_KEY ...
```

**常用可选**：

| 变量 | 作用 |
|---|---|
| `TRADINGAGENTS_LLM_PROVIDER` | 指定厂商，如 `openai` / `anthropic` / `google` |
| `TRADINGAGENTS_DEEP_THINK_LLM` | 深度模型（研究经理、组合经理用） |
| `TRADINGAGENTS_QUICK_THINK_LLM` | 快速模型（分析师、风控用） |
| `TRADINGAGENTS_OUTPUT_LANGUAGE` | 输出语言，如 `中文` / `English` |
| `TRADINGAGENTS_MAX_DEBATE_ROUNDS` | 多空辩论轮数（默认 1，调大更慢更费钱） |
| `ALPACA_API_KEY` / `ALPACA_SECRET_KEY` | Alpaca 模拟盘（只读），读取真实持仓；留空则用合成纸面模型 |
| `FRED_API_KEY` | 美联储宏观数据（免费申请） |
| `DATABASE_URL` | 数据库地址；不填则用 `data/agent_console.sqlite3` |
| `JWT_SECRET` | 登录 token 签名密钥，**生产必须自己生成** |
| `JWT_EXPIRE_MINUTES` | 登录有效期（分钟），默认 10080 即 7 天 |
| `REDIS_URL` | Redis 地址，默认 `redis://127.0.0.1:6379/0`；写 `none` 可彻底关掉 |
| `QUOTE_CACHE_SECONDS` / `DASHBOARD_CACHE_SECONDS` | 行情缓存秒数，默认 30 / 60 |
| `RUN_RATE_LIMIT` / `RUN_RATE_WINDOW_SECONDS` | 每个账号的跑分析配额，默认 10 次 / 3600 秒 |

> 所有 `TRADINGAGENTS_*` 变量都会覆盖 `tradingagents/default_config.py` 中的同名配置，无需改代码。

### 数据库：默认 SQLite，可一行切 MySQL

不配置 `DATABASE_URL` 时用 SQLite，**零安装、开箱即用**，表在启动时自动创建。
要换成 MySQL，只改这一行环境变量，代码不用动：

```bash
pip install PyMySQL cryptography
```

```bash
# TradingAgents-main/.env
DATABASE_URL=mysql+pymysql://user:pass@127.0.0.1:3306/tradingagents?charset=utf8mb4
```

> 表结构刻意用了 SQLAlchemy 的通用 `JSON` 类型（而非 PostgreSQL 专属的 JSONB），
> 所以 SQLite / MySQL / PostgreSQL 都能直接建表，dashboard 快照整块存进去。

### Redis：可选的加速层

**不装也能跑。** 起一个（Docker 一条命令）：

```bash
docker run -d --name tradingagents-redis --restart unless-stopped \
  -p 127.0.0.1:6379:6379 redis:7-alpine
```

它承担三件事，全部定义在 [TradingAgents-main/server/cache.py](TradingAgents-main/server/cache.py)：

| 用途 | 键 | 说明 |
| --- | --- | --- |
| 行情缓存 | `ta:quote:*` / `ta:dashboard:*` | `/quote` 30 秒、`/dashboard` 60 秒。前端反复轮询同一个 ticker 时不再重复打 Yahoo（Yahoo 有速率限制），**只缓存成功结果**——失败不会被钉住整个 TTL |
| 按账号限流 | `ta:rl:run:{user_id}:{窗口序号}` | 每个账号每小时最多 10 次 `/run`，超出返回 429 + `Retry-After`。每次分析都在烧 LLM 额度，不能让人循环刷 |
| Token 吊销 | `ta:revoked:{jti}` | `POST /auth/logout` 把该 token 的 `jti` 拉黑到它自然过期为止，被盗的 token 立刻失效而不是等到 7 天后 |

**全部 fail-open**：Redis 连不上时缓存当 miss、限流放行、吊销名单视为空，服务照常跑，只在启动时打一条 warning。代价是 Redis 挂掉期间被吊销的 token 会重新可用——对一个只做「提前作废」的名单来说可以接受。连不上后会进熔断退避（15 秒起翻倍，上限 120 秒），不会让每个请求都去等一次连接超时。

> 想彻底关掉：`REDIS_URL=none`。`/health` 会返回 `{"status":"ok","redis":{...}}`，
> `status` 始终是 `ok`——Redis 是加速器不是依赖，它挂了服务并没有挂。

## 六、数据是怎么流的

```
点 Run Agent
   ↓  POST /run  →  立刻返回 {run_id, events_url}（取餐号）
   ↓  后台线程跑 AI（几分钟）
   ↓  每完成一个节点 → emit 事件 → 塞进 Queue
   ↓  GET /run/{id}/events  ←  SSE 长连接，逐条推给浏览器
   ↓  前端 setData → React 重渲染
界面实时滚动：阶段进度 / 活动日志 / 研究报告 / 最终评级
   ↓  跑完 → 整份结果（评级 + 决策理由 + dashboard 快照）写入数据库
刷新页面 / 隔天再来：左侧「Analysis History」可以看到并回看每一次结果
```

**6 类 SSE 事件**：`meta`、`stage`、`activity`、`report`、`decision`、`dashboard`。

另外，打开页面时会先调 `GET /dashboard/{ticker}` 拉一份**真实行情**做基线（价格/曲线/RSI/波动率来自 yfinance），AI 跑完后再用真实评级覆盖。如果你登录了且之前分析过这个标的，页面会再自动把**最后一次保存的评级**叠回去 —— 所以刷新之后评级不会丢。

### 哪些数据是真的

| 数据 | 真实性 |
|---|---|
| 价格、净值曲线、RSI / MACD / ATR、波动率、最大回撤 | ✅ 真实（yfinance） |
| 研究报告、投资计划、评级 | ✅ 真实（AI 产出） |
| 持仓权重、组合市值、风险暴露度 | ⚠️ 演示推导（纸面模型，代码已标注） |

网络异常时后端返回 `available: false`，**绝不伪造价格**。

---

## 七、常用命令

```bash
# 后端
python -m uvicorn server.main:app --reload --port 8000   # 启动 API（热重载）
python -m server.market AAPL                             # 独立查看行情产出（不跑 LLM）
python main.py                                           # 命令行模式跑分析

# 前端
npm run dev          # 开发服务器（5173）
npm run build        # 生产构建
npm run typecheck    # 类型检查
```

---

## 八、常见问题

| 现象 | 原因 / 解决 |
|---|---|
| 前端提示连不上后端 | 后端未启动，或不是 8000 端口 |
| 行情能看，点 Run 就报错 | `.env` 没配 LLM 密钥 |
| 分析很慢（几分钟） | 正常。可调小 `TRADINGAGENTS_MAX_DEBATE_ROUNDS`、换更快的模型 |
| 界面显示「未评级」 | 正常。尚未运行 Agent，评级要等 AI 跑完才有 |
| 首次启动报 import 错误 | 确认在 `TradingAgents-main/` 目录下执行，且 `pip install -e .` 已成功 |
| 点了 Run Agent 弹出登录框 | 正常。跑分析需要登录，结果会存进你自己的历史记录 |
| 刷新后评级没了 | 未登录时正常（游客不存历史）。登录后会自动恢复上一次结果 |
| 看别人的历史记录 | 不支持，`/analyses` 按用户强制隔离，非本人返回 404 |
| 换 MySQL 后启动报驱动错误 | 忘了 `pip install PyMySQL cryptography` |
| 重启后登录失效 | `JWT_SECRET` 变了（没配时会用开发默认值）。配好固定密钥即可 |
