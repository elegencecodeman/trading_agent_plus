"""yfinance-backed data bridge — fills the gaps TradingAgents cannot produce.

TradingAgents is a research + decision agent: it emits text reports and a
final 5-tier rating, but owns no positions and has no portfolio / risk /
numeric-confidence concept. The ``control-center`` dashboard expects those, so
this module builds them from *real* market data (yfinance) on top of a clearly
marked **DEMO paper portfolio** model:

  * prices / indicators / volatility / drawdown  → real, from yfinance
  * positions, portfolio curve, exposure, P&L    → synthetic paper model,
    anchored to the analyzed ticker's real price and the agent's rating
  * confidence                                   → deterministic rating→0-1 map

Nothing here invests real money and nothing pretends to. If yfinance is
unreachable or the ticker has no data, every builder returns ``available: false``
so the frontend falls back to its own mock — the bridge never fabricates a price.

Run standalone to inspect what it produces (no LLM required):

    python -m server.market AAPL
    python -m server.market BTC-USD --json
"""

from __future__ import annotations

import hashlib
import math
import sys
import time
from datetime import datetime, timezone
from typing import Any

import pandas as pd
import yfinance as yf
from stockstats import wrap as stockstats_wrap
from yfinance.exceptions import YFRateLimitError

# --- rating (from agents.utils.rating) → numeric confidence (0-1) -----------
RATING_CONFIDENCE: dict[str, float] = {
    "Buy": 0.85,
    "Overweight": 0.72,
    "Hold": 0.55,
    "Underweight": 0.42,
    "Sell": 0.30,
}

# Paper-portfolio sector peers, used when the analyzed ticker has a known
# cohort. Anything else falls back to two liquid proxies.
_PEERS: dict[str, list[str]] = {
    "NVDA": ["AMD", "AVGO"],
    "AMD": ["NVDA", "MU"],
    "AAPL": ["MSFT", "GOOGL"],
    "MSFT": ["AAPL", "GOOGL"],
    "GOOGL": ["MSFT", "META"],
    "TSLA": ["RIVN", "NIO"],
    "META": ["GOOGL", "MSFT"],
    "BTC-USD": ["ETH-USD", "SOL-USD"],
    "ETH-USD": ["BTC-USD", "SOL-USD"],
    "SOL-USD": ["ETH-USD", "BNB-USD"],
    "EURUSD=X": ["GBPUSD=X", "USDJPY=X"],
    "GBPUSD=X": ["EURUSD=X", "AUDUSD=X"],
    "USDJPY=X": ["EURUSD=X", "GBPUSD=X"],
}
_FALLBACK_PEERS = ["AAPL", "MSFT"]

_BENCHMARK = {
    "stock": "^GSPC",          # S&P 500
    "crypto": "BTC-USD",
}

PAPER_BASE_NOTIONAL = 250_000.0  # demo paper book size, USD

# yfinance period → frontend range label (keeps the response's ``range`` honest).
_PERIOD_TO_RANGE = {"1d": "1D", "5d": "1W", "1mo": "1M", "3mo": "3M", "6mo": "6M"}


def _seeded(ticker: str, salt: int = 0) -> float:
    """Deterministic [0,1) per ticker so paper values are stable across runs."""
    h = hashlib.sha256(f"{ticker}:{salt}".encode()).digest()
    return int.from_bytes(h[:4], "little") / 0xFFFFFFFF


def _fmt_date(dt: pd.Timestamp) -> str:
    return dt.strftime("%m-%d")


def _flatten_cols(df: pd.DataFrame) -> pd.DataFrame:
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    return df


def _retry_history(ticker: str, period: str = "6mo", tries: int = 3) -> pd.DataFrame:
    """Fetch OHLCV with rate-limit backoff (same policy as the dataflows layer)."""
    last_err: Exception | None = None
    for attempt in range(tries):
        try:
            df = yf.Ticker(ticker).history(period=period, auto_adjust=True)
            if df.empty:
                raise ValueError(f"no rows for {ticker}")
            df = _flatten_cols(df)
            df.index = df.index.tz_localize(None) if df.index.tz is not None else df.index
            return df
        except YFRateLimitError as exc:
            last_err = exc
            time.sleep(2 ** attempt)  # noqa: S101  (backoff)
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            break
    raise last_err or ValueError(f"failed to fetch {ticker}")


def _stockstats_indicators(df: pd.DataFrame) -> dict[str, float]:
    """RSI / MACD / ATR via the same stockstats wrapper the dataflows use.

    ``stk[name]`` *computes* the derived column on first access; reading it off
    ``stk.iloc[-1]`` before that returns nothing, so the whole column must be
    touched first (then ``iloc[-1]`` is safe).
    """
    stk = stockstats_wrap(df)
    out: dict[str, float] = {}
    for name in ("rsi", "macd", "macds", "macdh", "atr"):
        try:
            col = stk[name]
            val = col.iloc[-1]
            out[name] = float(val) if pd.notna(val) else math.nan
        except (KeyError, IndexError, TypeError):
            out[name] = math.nan
    return out


def _annualized_vol(df: pd.DataFrame) -> float:
    rets = df["Close"].pct_change().dropna()
    return float(rets.std() * math.sqrt(252) * 100) if len(rets) > 1 else 0.0


def _max_drawdown(df: pd.DataFrame) -> float:
    cum = df["Close"].cummax()
    dd = (df["Close"] - cum) / cum
    return float(dd.min() * 100) if len(df) else 0.0


def _downsample(values: list[float], n: int = 60) -> list[float]:
    if len(values) <= n:
        return values
    step = (len(values) - 1) / (n - 1)
    return [values[round(i * step)] for i in range(n)]


def _resample_to(values: list[float], n: int) -> list[float]:
    """Resample ``values`` to exactly ``n`` points (linear interpolation)."""
    if n <= 0:
        return []
    if n == 1:
        return [values[-1]]
    if len(values) == n:
        return list(values)
    if len(values) > n:
        return _downsample(values, n)
    span = len(values) - 1
    out: list[float] = []
    for i in range(n):
        t = i * span / (n - 1)
        lo = int(t)
        hi = min(lo + 1, span)
        frac = t - lo
        out.append(values[lo] * (1 - frac) + values[hi] * frac)
    return out


def _is_forex(ticker: str) -> bool:
    """Yahoo FX pairs end with ``=X`` (e.g. ``EURUSD=X``); they stay synthetic."""
    return (ticker or "").strip().upper().endswith("=X")


# yfinance period → Alpaca portfolio-history (period, timeframe).
_ALPACA_HISTORY: dict[str, tuple[str, str]] = {
    "1d": ("1D", "5Min"),
    "5d": ("1W", "1H"),
    "1mo": ("1M", "1D"),
    "3mo": ("3M", "1D"),
    "6mo": ("6M", "1D"),
}


def _load_alpaca(ticker: str, period: str) -> dict[str, Any] | None:
    """Read the Alpaca paper account and map it onto the dashboard's shape.

    Returns ``None`` when Alpaca is unconfigured, when the ticker is a forex pair
    (kept synthetic), or when the read fails — the caller then falls back to the
    synthetic paper model, so the app never depends on Alpaca being reachable.
    """
    if _is_forex(ticker):
        return None
    try:
        from server import alpaca  # local import: keeps server boot fast

        if not alpaca.is_configured():
            return None
        client = alpaca.get_client()
        acct = client.get_account()
        raw_positions = client.get_positions()
    except Exception:  # noqa: BLE001 — unconfigured / network / auth all degrade
        return None

    # One Alpaca account holds both asset classes; the dashboard market selector
    # shows a single class, so filter to the ticker's class (us vs crypto).
    target_class = "crypto" if (ticker or "").strip().upper().endswith("-USD") else "us_equity"
    positions: list[dict[str, Any]] = []
    total_mv = 0.0
    for raw in raw_positions:
        if raw.get("asset_class") and raw.get("asset_class") != target_class:
            continue
        try:
            qty = float(raw.get("qty") or 0.0)
            mv = float(raw.get("market_value") or 0.0)
            if qty == 0 and mv == 0:
                continue
            positions.append(
                {
                    "id": f"alpaca-{raw.get('symbol')}",
                    "symbol": raw.get("symbol"),
                    "name": raw.get("symbol"),
                    "side": "BUY" if raw.get("side") == "long" else "SELL",
                    "quantity": qty,
                    "avgCost": round(float(raw.get("avg_entry_price") or 0.0), 4),
                    "lastPrice": round(float(raw.get("current_price") or 0.0), 4),
                    "unrealizedPnl": round(float(raw.get("unrealized_pl") or 0.0), 2),
                    "unrealizedPnlPct": round(float(raw.get("unrealized_plpc") or 0.0) * 100, 2),
                    "marketValue": mv,
                }
            )
            total_mv += mv
        except (TypeError, ValueError):
            continue  # skip malformed rows rather than dropping the whole account

    equity = acct["equity"]
    total_mv = round(total_mv, 2)
    for p in positions:
        p["weight"] = round(p["marketValue"] / total_mv * 100, 1) if total_mv > 0 else 0.0

    # Equity history for the portfolio curve (chronological); empty → synthetic curve.
    equity_series: list[float] = []
    try:
        ph_period, ph_tf = _ALPACA_HISTORY.get(period, ("1M", "1D"))
        hist = client.get_portfolio_history(period=ph_period, timeframe=ph_tf)
        equity_series = [float(x) for x in (hist.get("equity") or [])]
    except Exception:  # noqa: BLE001 — history is optional; curve falls back
        equity_series = []
    if not equity_series and equity > 0:
        # Fresh account with no recorded history: render a flat line at the real
        # account value instead of the synthetic $250k curve (avoids a mismatch
        # between the equity metric card and the performance chart).
        equity_series = [equity]

    return {
        "positions": positions,
        "equity": equity,
        "exposure": round(total_mv / equity * 100, 1) if equity > 0 else 0.0,
        "concentration": round(max((p["weight"] for p in positions), default=0.0), 1),
        "today_pnl": round(equity - acct["last_equity"], 2),
        "equity_series": equity_series,
    }


# --------------------------------------------------------------------------- #
# Public builders — each returns a dict shaped for the frontend's SSE payload.
# --------------------------------------------------------------------------- #
class MarketBridge:
    """Pulls real market data and derives the dashboard's numeric cards."""

    def __init__(self, ticker: str, asset_type: str = "stock"):
        self.ticker = ticker
        self.asset_type = asset_type

    def snapshot(self) -> dict[str, Any]:
        """Live price + key indicators for the analyzed ticker (real data)."""
        df = _retry_history(self.ticker, period="3mo")
        last = df["Close"].iloc[-1]
        prev = df["Close"].iloc[-2] if len(df) > 1 else last
        ind = _stockstats_indicators(df)
        rsi = ind.get("rsi", math.nan)
        return {
            "available": True,
            "ticker": self.ticker,
            "price": round(float(last), 2),
            "changePct": round((last / prev - 1) * 100, 2),
            "rsi": round(rsi, 1) if not math.isnan(rsi) else None,
            "macd": round(ind.get("macd", 0.0), 3),
            "atr": round(ind.get("atr", 0.0), 2),
            "volatility": round(_annualized_vol(df), 2),
            "maxDrawdown": round(_max_drawdown(df), 2),
        }

    def dashboard(self, rating: str, decision_text: str, period: str = "6mo") -> dict[str, Any]:
        """Full frontend dashboard payload: metrics / curve / positions / risk / signals.

        ``period`` drives every history fetch (ticker / peers / benchmark) so the
        range selector maps cleanly onto yfinance periods (``1d``→intraday,
        ``5d``→hourly, ``1mo``/``3mo``/``6mo``→daily).
        """
        try:
            hist = _retry_history(self.ticker, period=period)
            peers = _PEERS.get(self.ticker.upper()) or _FALLBACK_PEERS
            tickers = [self.ticker, *peers]
            closes = {t: _retry_history(t, period=period)["Close"] for t in tickers}
            bench = _retry_history(_BENCHMARK.get(self.asset_type, "^GSPC"), period=period)["Close"]

            confidence = RATING_CONFIDENCE.get(rating, 0.55)

            # --- portfolio source: Alpaca paper account when available --------
            # US equities + crypto read their real paper positions / equity / P&L
            # from Alpaca (read-only). Forex (``=X``) and any Alpaca failure fall
            # back to the synthetic paper model below, so the app never depends
            # on Alpaca being reachable.
            alpaca = _load_alpaca(self.ticker, period)

            if alpaca is not None:
                positions = alpaca["positions"]
                portfolio_value = alpaca["equity"]
                weights = [p["weight"] for p in positions]
                exposure = alpaca["exposure"]
                concentration = alpaca["concentration"]
                stop_loss = 0  # read-only: no stop-loss state on the account
                today_pnl = alpaca["today_pnl"]
            else:
                positions = self._paper_positions(tickers, closes, confidence)
                portfolio_value = sum(p["marketValue"] for p in positions)
                weights = [p["weight"] for p in positions]
                exposure = self._exposure_for(confidence)
                concentration = round(max(weights), 1) if weights else 0.0
                stop_loss = self._stop_loss_triggers(confidence)
                today_pnl = round(
                    portfolio_value * (closes[self.ticker].iloc[-1] / closes[self.ticker].iloc[-2] - 1), 0
                ) if len(closes[self.ticker]) > 1 else 0.0

            # --- performance curve: benchmark normalized + portfolio line ------
            # Real paper-account equity when available, otherwise rating-tilted book.
            if alpaca is not None and alpaca["equity_series"]:
                perf = self._performance_from_equity(bench, alpaca["equity_series"])
            else:
                perf = self._performance_curve(bench, confidence)

            # --- risk ----------------------------------------------------------
            risk = {
                "totalExposure": exposure,
                "maxDrawdown": round(_max_drawdown(hist), 2),
                "volatility": round(_annualized_vol(hist), 2),
                "concentration": concentration,
                "stopLossTriggers": stop_loss,
                "level": "warning" if exposure >= 50 else "normal",
            }

            # --- metrics (4 MetricCards) ---------------------------------------
            metrics = [
                {
                    "id": "portfolio-value",
                    "label": "Portfolio Value",
                    "value": f"${portfolio_value:,.0f}",
                    "rawValue": portfolio_value,
                    "delta": f"{'+' if perf['pct'] >= 0 else ''}{perf['pct']:.2f}%",
                    "deltaDirection": "up" if perf["pct"] >= 0 else "down",
                    "deltaLabel": "vs 6M",
                    "trend": perf["portfolio"],
                    "kind": "accent",
                },
                {
                    "id": "today-pnl",
                    "label": "Today's P&L",
                    "value": f"{'+' if today_pnl >= 0 else ''}${abs(today_pnl):,.0f}",
                    "rawValue": today_pnl,
                    "delta": f"{'+' if today_pnl >= 0 else ''}${abs(today_pnl):,.0f}",
                    "deltaDirection": "up" if today_pnl >= 0 else "down",
                    "deltaLabel": "paper",
                    "trend": [round(portfolio_value * (0.999 + 0.002 * math.sin(i / 3)), 0) for i in range(20)],
                    "kind": "positive" if today_pnl >= 0 else "negative",
                },
                {
                    "id": "agent-confidence",
                    "label": "Agent Confidence",
                    "value": f"{round(confidence * 100)}%",
                    "rawValue": round(confidence * 100),
                    "delta": rating,
                    "deltaDirection": "flat",
                    "deltaLabel": "final rating",
                    "trend": [0.4, 0.46, 0.5, 0.55, 0.6, confidence][-10:],
                    "kind": "ai",
                },
                {
                    "id": "risk-utilization",
                    "label": "Risk Utilization",
                    "value": f"{exposure}%",
                    "rawValue": exposure,
                    "delta": "limit 65%",
                    "deltaDirection": "flat",
                    "deltaLabel": "warning" if exposure >= 50 else "normal",
                    "trend": [30, 34, 38, 42, 46, exposure],
                    "kind": "warning" if exposure >= 50 else "positive",
                },
            ]

            # --- signals (main rating + peer monitoring) -----------------------
            signals = self._signals(tickers, closes, rating, confidence, decision_text)

            # --- drawer evidence: structured indicators ------------------------
            ind = _stockstats_indicators(hist)
            indicators = [
                {"name": "RSI (14)", "value": self._round(ind.get("rsi")), "direction": "up" if ind.get("rsi", 50) >= 50 else "down"},
                {"name": "MACD", "value": self._round(ind.get("macd"), 3), "direction": "up" if ind.get("macd", 0) >= 0 else "down"},
                {"name": "ATR (14)", "value": self._round(ind.get("atr")), "direction": "flat"},
                {"name": "Volatility", "value": f"{risk['volatility']:.1f}%", "direction": "flat"},
                {"name": "Max Drawdown", "value": f"{risk['maxDrawdown']:.1f}%", "direction": "down"},
            ]

            return {
                "available": True,
                "range": _PERIOD_TO_RANGE.get(period, "6M"),
                "metrics": metrics,
                "performance": perf["points"],
                "positions": positions,
                "risk": risk,
                "signals": signals,
                "indicators": indicators,
            }
        except Exception as exc:  # noqa: BLE001 — network/ticker failures degrade gracefully
            return {"available": False, "error": f"{type(exc).__name__}: {exc}"}

    # ------------------------------------------------------------------ helpers
    def _paper_positions(self, tickers, closes, confidence: float) -> list[dict]:
        weights = [0.5, 0.3, 0.2]
        out = []
        for i, t in enumerate(tickers):
            s = closes[t]
            last = float(s.iloc[-1])
            if last <= 0:
                continue
            cost_bias = (confidence - 0.55) * 0.10 + (_seeded(t, i) - 0.5) * 0.06
            avg_cost = last / (1 + cost_bias)
            qty = round(PAPER_BASE_NOTIONAL * weights[i] / last, 4)
            side = "BUY" if _seeded(t, 99 + i) > 0.35 else "SELL"
            pnl = (last - avg_cost) * qty if side == "BUY" else (avg_cost - last) * qty
            pnl_pct = (pnl / (avg_cost * qty)) * 100
            out.append(
                {
                    "id": f"paper-{i}",
                    "symbol": t,
                    "name": t,
                    "side": side,
                    "quantity": qty,
                    "avgCost": round(avg_cost, 4),
                    "lastPrice": round(last, 4),
                    "unrealizedPnl": round(pnl, 0),
                    "unrealizedPnlPct": round(pnl_pct, 2),
                    "weight": round(weights[i] * 100, 1),
                    "marketValue": round(qty * last, 0),
                }
            )
        return out

    def _performance_curve(self, bench: pd.Series, confidence: float) -> dict:
        bench = bench.dropna()
        base_b = 1_000_000.0
        base_p = PAPER_BASE_NOTIONAL
        alpha = (confidence - 0.5) * 0.9  # rating tilt drives out/under-performance
        points = []
        vals_p: list[float] = []
        last = len(bench)
        n = min(last, 60)
        step = max(1, last // n) if last else 1
        for idx in range(0, last, step):
            b = float(bench.iloc[idx])
            b_norm = base_b * b / float(bench.iloc[0])
            trend = idx / max(1, last - 1)
            p_norm = base_p * b / float(bench.iloc[0]) * (1 + alpha * trend + 0.05 * math.sin(idx / 6))
            vals_p.append(p_norm)
            points.append(
                {
                    "label": _fmt_date(bench.index[idx]) if hasattr(bench.index[idx], "strftime") else str(idx),
                    "timestamp": idx,
                    "portfolio": round(p_norm, 2),
                    "benchmark": round(b_norm, 2),
                }
            )
        return {"points": points, "portfolio": _downsample(vals_p, 20), "pct": (points[-1]["portfolio"] / points[0]["portfolio"] - 1) * 100 if len(points) > 1 else 0.0}

    @staticmethod
    def _performance_from_equity(bench: pd.Series, equity_series: list[float]) -> dict:
        """Portfolio line = real paper-account equity history; benchmark = real index.

        The equity series is resampled onto the benchmark's x-axis (same point
        count / labels) so both lines share the chart's single time axis. The
        terminal portfolio value is the account's real current equity.
        """
        bench = bench.dropna()
        if not equity_series or len(bench) == 0:
            return {"points": [], "portfolio": [], "pct": 0.0}
        last = len(bench)
        n = min(last, 60)
        step = max(1, last // n) if last else 1
        idxs = list(range(0, last, step))
        eq = _resample_to(list(equity_series), len(idxs))
        points = []
        vals_p: list[float] = []
        for k, idx in enumerate(idxs):
            b = float(bench.iloc[idx])
            b_norm = 1_000_000.0 * b / float(bench.iloc[0])
            p = float(eq[k])
            vals_p.append(p)
            points.append(
                {
                    "label": _fmt_date(bench.index[idx]) if hasattr(bench.index[idx], "strftime") else str(idx),
                    "timestamp": idx,
                    "portfolio": round(p, 2),
                    "benchmark": round(b_norm, 2),
                }
            )
        return {"points": points, "portfolio": _downsample(vals_p, 20), "pct": (points[-1]["portfolio"] / points[0]["portfolio"] - 1) * 100 if len(points) > 1 else 0.0}

    @staticmethod
    def _exposure_for(confidence: float) -> int:
        # Risk-on when confident, risk-off when not — mirrors a sizing rule.
        table = [(0.85, 68), (0.7, 60), (0.5, 46), (0.35, 34), (0.0, 28)]
        for c, e in table:
            if confidence >= c:
                return e
        return 28

    @staticmethod
    def _stop_loss_triggers(confidence: float) -> int:
        return 0 if confidence >= 0.7 else (1 if confidence >= 0.5 else 2)

    def _signals(self, tickers, closes, rating: str, confidence: float, decision_text: str) -> list[dict]:
        main = {
            "id": "sig-main",
            "symbol": self.ticker,
            "side": "BUY" if rating in ("Buy", "Overweight") else "SELL" if rating in ("Sell", "Underweight") else "HOLD",
            "price": round(float(closes[self.ticker].iloc[-1]), 2),
            "confidence": round(confidence, 2),
            "strategy": "multi-agent research",
            "time": datetime.now(timezone.utc).astimezone().strftime("%H:%M"),
            "status": "executed" if rating in ("Buy", "Sell") else "monitoring",
            "note": decision_text,
        }
        peers = []
        for i, t in enumerate(tickers[1:]):
            s = closes[t]
            peers.append(
                {
                    "id": f"sig-peer-{i}",
                    "symbol": t,
                    "side": "HOLD",
                    "price": round(float(s.iloc[-1]), 2),
                    "confidence": round(0.45 + _seeded(t, i) * 0.15, 2),
                    "strategy": "peer monitor",
                    "time": datetime.now(timezone.utc).astimezone().strftime("%H:%M"),
                    "status": "monitoring",
                    "note": "Correlated instrument tracked alongside the analyzed name.",
                }
            )
        return [main, *peers]

    @staticmethod
    def _round(v, nd: int = 2):
        return round(float(v), nd) if v is not None and not (isinstance(v, float) and math.isnan(v)) else None


def build_dashboard(
    ticker: str,
    rating: str,
    decision_text: str,
    asset_type: str = "stock",
    period: str = "6mo",
) -> dict[str, Any]:
    """Thin entry used by the FastAPI bridge (lazy import keeps server boot fast)."""
    return MarketBridge(ticker, asset_type).dashboard(rating, decision_text, period=period)


# --------------------------------------------------------------------------- #
# Standalone CLI — inspect the derived dashboard without running the LLM.
# --------------------------------------------------------------------------- #
if __name__ == "__main__":
    import json

    ticker = sys.argv[1] if len(sys.argv) > 1 else "AAPL"
    rating = sys.argv[2] if len(sys.argv) > 2 else "Buy"
    asset = "crypto" if ticker in ("BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD") else "stock"
    payload = build_dashboard(ticker, rating, f"Demo decision for {ticker}: {rating}.", asset)
    if len(sys.argv) > 2 and sys.argv[2] == "--json":
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(json.dumps(payload, ensure_ascii=False, indent=2)[:2000])
