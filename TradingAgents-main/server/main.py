"""FastAPI bridge for TradingAgents.

Endpoints
---------
GET  /health              → liveness probe
POST /run                 → start an analysis; returns ``{run_id, events_url}``
GET  /run/{run_id}/events → Server-Sent Events stream for that run

Run from the repo root (so the ``tradingagents`` package and the root ``.env``
are both importable):

    python -m uvicorn server.main:app --reload --port 8000

The frontend consumes the SSE stream with a browser ``EventSource``; the event
names and payload shapes are defined in ``runner.py`` and documented in
``server/README.md``.
"""

from __future__ import annotations

import json
import threading
import uuid
from pathlib import Path
from queue import Empty, Queue
from typing import Any

from dotenv import load_dotenv

# MUST run before any ``tradingagents`` import: ``default_config.DEFAULT_CONFIG``
# applies TRADINGAGENTS_* env overrides at module-import time, so the repo-root
# .env has to be in os.environ first.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import StreamingResponse  # noqa: E402

from server import options  # noqa: E402
from server.runner import StreamingRunner  # noqa: E402
from server.schemas import RunRequest, RunResponse  # noqa: E402
from tradingagents.dataflows.config import set_config  # noqa: E402
from tradingagents.default_config import DEFAULT_CONFIG  # noqa: E402
from tradingagents.graph.trading_graph import TradingAgentsGraph  # noqa: E402

app = FastAPI(title="TradingAgents API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # dev only; tighten in production
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

_graphs: dict[str, TradingAgentsGraph] = {}
_graph_lock = threading.Lock()

# Config keys that materially change the graph's LLM wiring / language. The
# cache signature is built from these so switching model or language rebuilds
# the graph, while identical selections reuse the (expensive) compiled graph.
_SIGNATURE_KEYS = ("llm_provider", "deep_think_llm", "quick_think_llm", "output_language")


def get_graph(**overrides: str | None) -> tuple[TradingAgentsGraph, dict[str, Any]]:
    """Resolve an effective config and return a graph cached by its signature.

    Keyword args mirror the optional ``RunRequest`` fields; ``None``/empty values
    fall back to ``DEFAULT_CONFIG``. Returns ``(graph, config)`` — the caller
    re-applies ``config`` via ``set_config`` right before a run so the agents'
    language instruction matches the graph being executed (the dataflow config
    is process-global, so a cached graph alone is not enough when two graphs
    with different ``output_language`` coexist).
    """
    cfg = DEFAULT_CONFIG.copy()
    for key, val in overrides.items():
        if val is not None and val != "":
            cfg[key] = val
    sig = "|".join(f"{k}={cfg.get(k)}" for k in _SIGNATURE_KEYS)
    with _graph_lock:
        graph = _graphs.get(sig)
        if graph is None:
            graph = TradingAgentsGraph(debug=False, config=cfg)
            _graphs[sig] = graph
    return graph, cfg


# run_id → {"queue": Queue[(event, payload)], "status": str}
RUNS: dict[str, dict[str, Any]] = {}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/options")
def get_options() -> dict[str, Any]:
    """Provider / model / language catalog for the frontend config pickers."""
    return options.build_options()


@app.get("/quote/{ticker}")
def quote(ticker: str) -> dict[str, Any]:
    """Live price + key indicators preview (real yfinance data, no LLM)."""
    asset_type = options.detect_asset_type(ticker)
    try:
        from server import market  # local import: pandas+yfinance are heavy
        return market.MarketBridge(ticker, asset_type).snapshot()
    except Exception as exc:  # noqa: BLE001 — network/ticker failures degrade gracefully
        return {"available": False, "ticker": ticker, "error": f"{type(exc).__name__}: {exc}"}


# Frontend range selector → yfinance history period (auto interval per period).
_RANGE_TO_PERIOD = {"1D": "1d", "1W": "5d", "1M": "1mo", "3M": "3mo"}


@app.get("/dashboard/{ticker}")
def dashboard(ticker: str, range: str = "3M") -> dict[str, Any]:
    """Full real-market dashboard (price-anchored paper portfolio), no LLM.

    Used by the frontend as the idle baseline so the UI shows real yfinance data
    immediately. This is deliberately built with ``rating=None``: no agent has
    run yet, so the payload is flagged ``rated: false`` and the UI renders an
    explicit "not rated" state rather than a placeholder Hold. The agent run
    later overwrites it with its actual rating.
    """
    asset_type = options.detect_asset_type(ticker)
    period = _RANGE_TO_PERIOD.get(range, "6mo")
    try:
        from server import market  # local import: pandas+yfinance are heavy
        return market.build_dashboard(
            ticker,
            None,  # unrated — the agent has not analysed this ticker yet
            "",
            asset_type,
            period=period,
        )
    except Exception as exc:  # noqa: BLE001 — network/ticker failures degrade gracefully
        return {"available": False, "ticker": ticker, "error": f"{type(exc).__name__}: {exc}"}


@app.post("/run", response_model=RunResponse)
def start_run(req: RunRequest) -> RunResponse:
    run_id = uuid.uuid4().hex[:12]
    q: Queue[tuple[str, dict[str, Any]]] = Queue()
    RUNS[run_id] = {"queue": q, "status": "running"}

    graph, cfg = get_graph(
        llm_provider=req.provider,
        deep_think_llm=req.deep_think_llm,
        quick_think_llm=req.quick_think_llm,
        output_language=req.output_language,
    )

    def _work() -> None:
        try:
            set_config(cfg)  # keep the global dataflow config in sync with `graph`
            runner = StreamingRunner(graph)
            decision = runner.run(
                req.ticker, req.trade_date, req.asset_type,
                emit=lambda e, p: q.put((e, p)),
            )
            # After the agent decides, backfill the numeric dashboard cards from
            # real market data. Lazy import keeps server boot fast and lets the
            # bridge start even if yfinance/network is unavailable.
            #
            # MUST be queued before "done": the SSE reader (and the frontend's
            # 'done' handler) closes the stream the moment it sees "done", so
            # anything queued after it is dropped. The runner deliberately does
            # not emit "done" itself — this function owns the end-of-stream
            # sentinel so trailing events stay reachable.
            try:
                from server import market  # local import: pandas+yfinance are heavy
                dash = market.build_dashboard(
                    req.ticker,
                    decision.get("rating", "Hold"),
                    decision.get("note", ""),
                    req.asset_type,
                )
                q.put(("dashboard", dash))
            except Exception as exc:  # noqa: BLE001
                q.put(("dashboard", {"available": False, "error": f"{type(exc).__name__}: {exc}"}))
            q.put(("done", {}))
        except Exception as exc:  # noqa: BLE001 — surface any pipeline failure to the client
            q.put(("error", {"message": f"{type(exc).__name__}: {exc}"}))
            q.put(("done", {}))
        finally:
            RUNS[run_id]["status"] = "done"

    threading.Thread(target=_work, name=f"run-{run_id}", daemon=True).start()
    return RunResponse(run_id=run_id, events_url=f"/run/{run_id}/events")


@app.get("/run/{run_id}/events")
def stream_events(run_id: str) -> StreamingResponse:
    run = RUNS.get(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="run not found")
    q: Queue[tuple[str, dict[str, Any]]] = run["queue"]

    def gen():
        while True:
            try:
                event, payload = q.get(timeout=15)
            except Empty:
                yield ": keep-alive\n\n"  # SSE comment heartbeat
                continue
            data = json.dumps(payload, ensure_ascii=False)
            yield f"event: {event}\ndata: {data}\n\n"
            if event in ("done", "error"):
                break

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # disable proxy buffering
        },
    )
