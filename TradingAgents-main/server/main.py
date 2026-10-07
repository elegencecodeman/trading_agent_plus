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
import logging
import threading
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from queue import Empty, Queue
from typing import Any

from dotenv import load_dotenv

# MUST run before any ``tradingagents`` import: ``default_config.DEFAULT_CONFIG``
# applies TRADINGAGENTS_* env overrides at module-import time, so the repo-root
# .env has to be in os.environ first.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from fastapi import Depends, FastAPI, HTTPException, Response, status  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import StreamingResponse  # noqa: E402
from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from server import auth, cache, db, options, store  # noqa: E402
from server.models import AnalysisRun, User, utcnow  # noqa: E402
from server.runner import StreamingRunner  # noqa: E402
from server.schemas import (  # noqa: E402
    AnalysisDetail,
    AnalysisListResponse,
    AnalysisSummary,
    LoginRequest,
    RegisterRequest,
    RunRequest,
    RunResponse,
    TokenResponse,
    UserOut,
)
from tradingagents.dataflows.config import set_config  # noqa: E402
from tradingagents.default_config import DEFAULT_CONFIG  # noqa: E402
from tradingagents.graph.trading_graph import TradingAgentsGraph  # noqa: E402

logger = logging.getLogger("server.main")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Create tables on boot. Neither a DB nor a Redis failure may stop the
    server — market data endpoints keep working without persistence, and every
    Redis-backed feature (cache, rate limit, revocation) fails open."""
    try:
        db.init_db()
        logger.info("persistence ready: %s", db.database_url())
    except Exception:  # noqa: BLE001 — degrade, never refuse to boot
        logger.exception("could not initialise the database; persistence disabled")

    redis_state = cache.status()
    if not redis_state.get("enabled"):
        logger.info("redis disabled; cache / rate limits / revocation are off")
    elif redis_state.get("reachable"):
        logger.info("redis ready: %s", redis_state.get("url"))
    else:
        logger.warning(
            "redis configured but unreachable at %s; starting without "
            "cache/rate-limits/token-revocation",
            redis_state.get("url"),
        )
    yield


app = FastAPI(title="TradingAgents API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # dev only; tighten in production
    allow_credentials=False,  # Bearer tokens are sent in a header, not a cookie
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
def health() -> dict[str, Any]:
    """Liveness plus the optional-dependency state. ``status`` stays "ok" even
    when Redis is down — that endpoint answers "is the API serving", and Redis
    is an accelerator, not a dependency."""
    return {"status": "ok", "redis": cache.status()}


@app.get("/options")
def get_options() -> dict[str, Any]:
    """Provider / model / language catalog for the frontend config pickers."""
    return options.build_options()


@app.get("/quote/{ticker}")
def quote(ticker: str) -> dict[str, Any]:
    """Live price + key indicators preview (real yfinance data, no LLM).

    Cached for ``QUOTE_CACHE_SECONDS`` — this is polled while the user types a
    ticker and every poll would otherwise be a Yahoo round trip (and a step
    closer to their rate limit; see ``market._retry_history``).
    """
    cache_key = f"quote:{ticker.upper()}"
    cached = cache.cache_get(cache_key)
    if cached is not None:
        return cached

    asset_type = options.detect_asset_type(ticker)
    try:
        from server import market  # local import: pandas+yfinance are heavy
        payload = market.MarketBridge(ticker, asset_type).snapshot()
    except Exception as exc:  # noqa: BLE001 — network/ticker failures degrade gracefully
        return {"available": False, "ticker": ticker, "error": f"{type(exc).__name__}: {exc}"}

    # Only successful payloads are cached: storing a transient Yahoo failure
    # would pin that error on the ticker for the whole TTL.
    if payload.get("available"):
        cache.cache_set(cache_key, payload, cache.ttl_quote_seconds())
    return payload


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

    # The unrated baseline is a pure function of (ticker, asset_type, period),
    # so it caches cleanly. The *rated* dashboard an agent produces comes from
    # the run itself and from /analyses/latest — never from here.
    cache_key = f"dashboard:{asset_type}:{ticker.upper()}:{period}"
    cached = cache.cache_get(cache_key)
    if cached is not None:
        return cached

    try:
        from server import market  # local import: pandas+yfinance are heavy
        payload = market.build_dashboard(
            ticker,
            None,  # unrated — the agent has not analysed this ticker yet
            "",
            asset_type,
            period=period,
        )
    except Exception as exc:  # noqa: BLE001 — network/ticker failures degrade gracefully
        return {"available": False, "ticker": ticker, "error": f"{type(exc).__name__}: {exc}"}

    if payload.get("available"):
        cache.cache_set(cache_key, payload, cache.ttl_dashboard_seconds())
    return payload


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #
def _user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        created_at=user.created_at.isoformat(),
    )


@app.post("/auth/register", response_model=TokenResponse, status_code=201)
def register(req: RegisterRequest, db_session: Session = Depends(db.get_db)) -> TokenResponse:
    """Create an account and return a token, so the SPA can go straight in."""
    username = req.username.strip().lower()
    if store.find_user_by_username(db_session, username) is not None:
        raise HTTPException(status_code=409, detail="Username already taken")

    user = store.create_user(
        db_session,
        username=username,
        password_hash=auth.hash_password(req.password),
        display_name=req.display_name,
    )
    db_session.commit()
    db_session.refresh(user)

    token, expires_in = auth.create_access_token(user)
    return TokenResponse(access_token=token, expires_in=expires_in, user=_user_out(user))


@app.post("/auth/login", response_model=TokenResponse)
def login(req: LoginRequest, db_session: Session = Depends(db.get_db)) -> TokenResponse:
    user = store.find_user_by_username(db_session, req.username)
    # One message for "no such user" and "wrong password": telling them apart
    # would let anyone enumerate valid usernames.
    if user is None or not auth.verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect username or password")

    user.last_login_at = utcnow()
    db_session.commit()
    db_session.refresh(user)

    token, expires_in = auth.create_access_token(user)
    return TokenResponse(access_token=token, expires_in=expires_in, user=_user_out(user))


@app.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(auth.current_user)) -> UserOut:
    """Who am I — used by the SPA to validate a stored token on page load."""
    return _user_out(user)


@app.post("/auth/logout")
def logout(payload: dict[str, Any] = Depends(auth.current_payload)) -> dict[str, Any]:
    """Sign out server-side by denylisting this token's ``jti``.

    Always succeeds from the caller's point of view — the client drops the token
    either way, and a missing Redis (``revoked: false``) only means the token
    keeps working until its natural expiry, which is the pre-existing behaviour.
    """
    return {"ok": True, "revoked": auth.revoke_token(payload)}


# --------------------------------------------------------------------------- #
# Persisted analyses
# --------------------------------------------------------------------------- #
def _summary(row: AnalysisRun) -> AnalysisSummary:
    return AnalysisSummary(
        id=row.id,
        run_id=row.run_id,
        ticker=row.ticker,
        trade_date=row.trade_date,
        asset_type=row.asset_type,
        rating=row.rating,
        side=row.side,
        confidence=row.confidence,
        status=row.status,
        range=row.range,
        created_at=row.created_at.isoformat(),
    )


def _detail(row: AnalysisRun) -> AnalysisDetail:
    return AnalysisDetail(
        **_summary(row).model_dump(),
        strategy=row.strategy,
        note=row.note,
        provider=row.provider,
        deep_think_llm=row.deep_think_llm,
        quick_think_llm=row.quick_think_llm,
        output_language=row.output_language,
        dashboard=row.dashboard,
    )


@app.get("/analyses", response_model=AnalysisListResponse)
def list_analyses(
    limit: int = 50,
    offset: int = 0,
    ticker: str | None = None,
    user: User = Depends(auth.current_user),
    db_session: Session = Depends(db.get_db),
) -> AnalysisListResponse:
    """The caller's own run history, newest first."""
    limit = max(1, min(limit, 200))
    stmt = select(AnalysisRun).where(AnalysisRun.user_id == user.id)
    if ticker:
        stmt = stmt.where(AnalysisRun.ticker == ticker.strip().upper())
    stmt = stmt.order_by(AnalysisRun.created_at.desc(), AnalysisRun.id.desc()).limit(limit).offset(max(0, offset))
    rows = list(db_session.execute(stmt).scalars().all())
    return AnalysisListResponse(total=store.count_runs(db_session, user.id), items=[_summary(r) for r in rows])


@app.get("/analyses/latest/{ticker}", response_model=AnalysisDetail | None)
def latest_analysis(
    ticker: str,
    user: User = Depends(auth.current_user),
    db_session: Session = Depends(db.get_db),
) -> AnalysisDetail | None:
    """The user's most recent run for ``ticker``, or ``null``.

    Declared *before* ``/analyses/{run_pk}`` so the literal path segment wins
    the route match instead of being parsed as an id.
    """
    row = store.latest_run_for(db_session, user.id, ticker)
    return _detail(row) if row else None


@app.get("/analyses/{run_pk}", response_model=AnalysisDetail)
def get_analysis(
    run_pk: int,
    user: User = Depends(auth.current_user),
    db_session: Session = Depends(db.get_db),
) -> AnalysisDetail:
    """One stored run. Scoped to its owner — another user's id 404s."""
    row = store.get_run(db_session, user.id, run_pk)
    if row is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return _detail(row)


# --------------------------------------------------------------------------- #
# Runs
# --------------------------------------------------------------------------- #
def _persist_run(
    *,
    user_id: int,
    run_id: str,
    req: RunRequest,
    decision: dict[str, Any],
    dash: dict[str, Any] | None,
) -> None:
    """Write a finished run to the database, in its own transaction.

    Called from the run thread, so it opens its own session via
    ``session_scope``. Confidence is not emitted by TradingAgents — it is
    backfilled from the dashboard's ``agent-confidence`` card, which is the only
    place the rating→0-1 mapping is materialised.
    """
    stored_decision = dict(decision)
    if isinstance(dash, dict) and dash.get("available"):
        for metric in dash.get("metrics") or []:
            if metric.get("id") == "agent-confidence":
                raw = metric.get("rawValue")
                if isinstance(raw, (int, float)) and raw > 0:
                    stored_decision["confidence"] = round(float(raw) / 100, 4)
                break

    with db.session_scope() as session:
        store.save_run(
            session,
            user_id=user_id,
            run_id=run_id,
            ticker=req.ticker,
            trade_date=req.trade_date,
            asset_type=req.asset_type,
            decision=stored_decision,
            dashboard=dash if isinstance(dash, dict) and dash.get("available") else None,
            dashboard_range=(dash or {}).get("range") if isinstance(dash, dict) else None,
            provider=req.provider,
            deep_think_llm=req.deep_think_llm,
            quick_think_llm=req.quick_think_llm,
            output_language=req.output_language,
        )


@app.post("/run", response_model=RunResponse)
def start_run(
    req: RunRequest,
    response: Response,
    user: User = Depends(auth.current_user),
) -> RunResponse:
    """Start an analysis. **Requires a token** — a run is billed to an account
    and its result is persisted under that account.

    Rate limited per user (``RUN_RATE_LIMIT`` per ``RUN_RATE_WINDOW_SECONDS``):
    every run burns real LLM credits, so one account cannot loop the endpoint.
    The limit fails open when Redis is unavailable.
    """
    limit, window = cache.run_rate_limit()
    allowed, remaining, retry_after = cache.rate_limit(f"run:{user.id}", limit, window)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Analysis limit reached — at most {limit} runs per "
                f"{window // 60} minutes. Try again in "
                f"{max(1, retry_after // 60)} minute(s)."
            ),
            headers={"Retry-After": str(retry_after)},
        )

    # Let the client show the remaining quota instead of discovering it via 429.
    response.headers["X-RateLimit-Limit"] = str(limit)
    response.headers["X-RateLimit-Remaining"] = str(remaining)
    response.headers["X-RateLimit-Reset"] = str(retry_after)

    run_id = uuid.uuid4().hex[:12]
    q: Queue[tuple[str, dict[str, Any]]] = Queue()
    RUNS[run_id] = {"queue": q, "status": "running", "user_id": user.id}
    user_id = user.id

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
            dash: dict[str, Any] | None = None
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

            # Persist before "done" so a client that closes on the sentinel still
            # finds the row. A storage failure must never lose the stream or the
            # decision the user just watched the agent produce.
            try:
                _persist_run(
                    user_id=user_id, run_id=run_id, req=req, decision=decision, dash=dash
                )
            except Exception:  # noqa: BLE001
                logger.exception("failed to persist run %s", run_id)

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
