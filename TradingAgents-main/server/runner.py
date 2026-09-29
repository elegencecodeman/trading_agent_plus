"""Streaming adapter around ``TradingAgentsGraph``.

``TradingAgentsGraph.propagate`` runs the whole pipeline in one blocking call
and returns ``(final_state, decision)``. For the UI we want the *progress*, so
this runner mirrors ``TradingAgentsGraph._run_graph``'s setup but streams the
graph with ``stream_mode="updates"`` to receive one ``{node_name: delta}`` per
executed node. Each node is then mapped onto the frontend's data model:

  * ``stage``    → ``PipelineStage[]`` (AgentMonitorDrawer timeline)
  * ``activity`` → ``ActivityEntry``     (ActivityLog rows)
  * ``report``   → analyst research text (drawer "Evidence" / "Decision Summary")
  * ``decision`` → final ``Signal``      (LiveSignalsCard row)
  * ``meta``     → ``AgentStatus``       (state / task)

Every event is a ``(event_name, payload_dict)`` tuple handed to ``emit``; the
HTTP layer serializes them to SSE frames. Nothing here depends on FastAPI, so
it can be unit-tested against a fake graph.

The runner also reproduces ``propagate()``'s memory round-trip, which the
streaming path used to skip (so decisions were never stored and never
reflected on): pending log entries are settled *before* the state is built
(like ``propagate``), and the finished decision is stored *after* the graph
completes (like ``_run_graph``).

``"done"`` is NOT emitted here — the caller queues it once every trailing
event (e.g. ``dashboard``) has been enqueued, because the SSE reader closes
the stream on ``"done"``.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, Callable

from tradingagents.graph.trading_graph import TradingAgentsGraph

Emit = Callable[[str, dict[str, Any]], None]

# Graph node name → (frontend stage id, activity agent label, activity type).
NODE_META: dict[str, tuple[str, str, str]] = {
    "Market Analyst": ("observe", "analyst", "reasoning"),
    "Sentiment Analyst": ("analyze", "analyst", "reasoning"),
    "News Analyst": ("analyze", "analyst", "reasoning"),
    "Fundamentals Analyst": ("analyze", "analyst", "reasoning"),
    "Bull Researcher": ("analyze", "researcher", "reasoning"),
    "Bear Researcher": ("analyze", "researcher", "reasoning"),
    "Research Manager": ("analyze", "manager", "reasoning"),
    "Trader": ("decide", "trader", "signal"),
    "Aggressive Analyst": ("risk", "risk", "risk"),
    "Conservative Analyst": ("risk", "risk", "risk"),
    "Neutral Analyst": ("risk", "risk", "risk"),
    "Portfolio Manager": ("execute", "pm", "order"),
}

STAGE_ORDER: list[tuple[str, str]] = [
    ("observe", "Observe"),
    ("analyze", "Analyze"),
    ("decide", "Decide"),
    ("risk", "Risk Check"),
    ("execute", "Execute"),
]

# Analyst state fields → report kind surfaced to the UI.
REPORT_FIELDS: dict[str, str] = {
    "market_report": "market",
    "sentiment_report": "sentiment",
    "news_report": "news",
    "fundamentals_report": "fundamentals",
}

# parse_rating() → frontend Side.
RATING_TO_SIDE: dict[str, str] = {
    "Buy": "BUY",
    "Overweight": "BUY",
    "Sell": "SELL",
    "Underweight": "SELL",
    "Hold": "HOLD",
}


def _now() -> str:
    return datetime.now(timezone.utc).astimezone().strftime("%H:%M:%S")


def _truncate(text: str, n: int = 160) -> str:
    collapsed = " ".join(str(text).split())
    return collapsed if len(collapsed) <= n else collapsed[: n - 1].rstrip() + "…"


def _message_content(value: Any) -> str:
    content = getattr(value, "content", "")
    if isinstance(content, list):  # some providers return content blocks
        content = " ".join(str(part) for part in content)
    return str(content or "")


class StreamingRunner:
    """Runs one ticker/date analysis and emits frontend-shaped SSE events."""

    def __init__(self, graph: TradingAgentsGraph):
        self.graph = graph

    def run(self, ticker: str, trade_date: str, asset_type: str, emit: Emit) -> dict[str, Any]:
        g = self.graph
        emit(
            "meta",
            {
                "state": "Analyzing",
                "task": f"Scanning {ticker} ({asset_type}) momentum signals",
                "market": asset_type,
                "ticker": ticker,
                "tradeDate": trade_date,
            },
        )

        # Settle yesterday's predictions first — same order as
        # TradingAgentsGraph.propagate(), so a reflection generated here lands
        # in the past_context read on the very next line.
        self._settle_pending(ticker, emit)

        # Mirrors TradingAgentsGraph._run_graph's state setup.
        past_context = g.memory_log.get_past_context(ticker)
        instrument_context = g.resolve_instrument_context(ticker, asset_type)
        init_state = g.propagator.create_initial_state(
            ticker,
            trade_date,
            asset_type=asset_type,
            past_context=past_context,
            instrument_context=instrument_context,
        )
        args = g.propagator.get_graph_args()
        args["stream_mode"] = "updates"  # node-name → delta (vs. full-state values)

        active_stage: str | None = None
        done_stages: set[str] = set()
        stage_started: dict[str, float] = {}
        decision_text = ""
        seq = 0

        for update in g.graph.stream(init_state, **args):
            if not update:
                continue
            node, delta = next(iter(update.items()))
            meta = NODE_META.get(node)
            if meta is None:
                # tool / msg-clear nodes are noise for the UI; skip them.
                continue
            stage_id, agent, act_type = meta
            now = time.monotonic()

            # Stage transition.
            if stage_id != active_stage:
                if active_stage is not None:
                    done_stages.add(active_stage)
                active_stage = stage_id
                if stage_id not in stage_started:
                    stage_started[stage_id] = now
                emit("stage", {"stages": self._build_stages(active_stage, done_stages, stage_started, now)})

            # Activity row.
            seq += 1
            emit(
                "activity",
                {
                    "id": f"{ticker}-{seq}",
                    "time": _now(),
                    "type": act_type,
                    "agent": agent,
                    "message": self._summarize(node, delta),
                    "durationMs": 0,
                    "status": "success",
                },
            )

            # Research report text → drawer evidence.
            for field, kind in REPORT_FIELDS.items():
                if delta.get(field):
                    emit("report", {"kind": kind, "label": self._report_label(kind), "text": delta[field]})

            for field in ("trader_investment_plan", "investment_plan"):
                if delta.get(field):
                    emit("report", {"kind": "plan", "label": "Investment Plan", "text": delta[field]})

            if delta.get("final_trade_decision"):
                decision_text = delta["final_trade_decision"]

        # Close out stages.
        if active_stage is not None:
            done_stages.add(active_stage)
        emit("stage", {"stages": self._build_stages(None, done_stages, stage_started, time.monotonic())})

        # Final decision → one Signal.
        rating = g.process_signal(decision_text) if decision_text else "Hold"
        decision = {
            "symbol": ticker,
            "side": RATING_TO_SIDE.get(rating, "HOLD"),
            "rating": rating,
            "confidence": None,  # TradingAgents does not emit a numeric confidence.
            "strategy": "multi-agent research",
            "note": decision_text,
            "status": "pending",
        }
        self._store_decision(ticker, trade_date, decision_text, emit)
        emit("decision", decision)
        # No "done" here — see the module docstring: the caller emits it after
        # every trailing event, otherwise "done" truncates the stream and the
        # dashboard event never reaches the client.
        return decision

    # ------------------------------------------------------------------ memory
    def _settle_pending(self, ticker: str, emit: Emit) -> None:
        """Resolve the memory log's pending entries for ``ticker``.

        ``propagate()`` calls ``_resolve_pending_entries`` before every run: it
        fetches the realised return for each past decision and writes a
        reflection. It is a private method with no public equivalent, so it is
        accessed directly here — guarded, because a reflection failure (LLM or
        price-fetch hiccup) must not abort the analysis the user is waiting for.
        """
        try:
            self.graph._resolve_pending_entries(ticker)  # noqa: SLF001
        except Exception as exc:  # noqa: BLE001
            emit(
                "activity",
                {
                    "id": f"{ticker}-memory",
                    "time": _now(),
                    "type": "reasoning",
                    "agent": "manager",
                    "message": f"Memory reflection skipped ({type(exc).__name__}: {exc})",
                    "durationMs": 0,
                    "status": "error",
                },
            )

    def _store_decision(
        self, ticker: str, trade_date: str, decision_text: str, emit: Emit
    ) -> None:
        """Append this run's decision to the memory log (``pending`` outcome).

        Mirrors what ``_run_graph`` does after the graph completes. Without it
        the streaming path only ever *read* memory, so the log never grew and
        the next run had nothing to reflect on. Idempotent upstream.
        """
        if not decision_text:
            return
        try:
            self.graph.memory_log.store_decision(
                ticker=ticker,
                trade_date=trade_date,
                final_trade_decision=decision_text,
            )
        except Exception as exc:  # noqa: BLE001 — never lose the decision over a write
            emit(
                "activity",
                {
                    "id": f"{ticker}-memory-write",
                    "time": _now(),
                    "type": "reasoning",
                    "agent": "manager",
                    "message": f"Decision not persisted ({type(exc).__name__}: {exc})",
                    "durationMs": 0,
                    "status": "error",
                },
            )

    def _build_stages(
        self, active: str | None, done: set[str], started: dict[str, float], now: float
    ) -> list[dict[str, Any]]:
        stages: list[dict[str, Any]] = []
        for sid, label in STAGE_ORDER:
            if sid in done:
                status = "done"
            elif sid == active:
                status = "active"
            else:
                status = "pending"
            duration_ms = int((now - started[sid]) * 1000) if sid in started else 0
            stages.append(
                {
                    "id": sid,
                    "label": label,
                    "status": status,
                    "summary": "",
                    "startedAt": "",
                    "durationMs": duration_ms if status == "done" else 0,
                }
            )
        return stages

    def _summarize(self, node: str, delta: dict[str, Any]) -> str:
        for field in REPORT_FIELDS:
            if delta.get(field):
                return _truncate(delta[field])
        for field in ("trader_investment_plan", "investment_plan", "final_trade_decision"):
            if delta.get(field):
                return _truncate(delta[field])
        messages = delta.get("messages")
        if messages:
            text = _message_content(messages[-1])
            if text:
                return _truncate(text)
        return f"{node} completed"

    @staticmethod
    def _report_label(kind: str) -> str:
        return {
            "market": "Market Analysis",
            "sentiment": "Sentiment Analysis",
            "news": "News Analysis",
            "fundamentals": "Fundamentals Analysis",
        }.get(kind, kind.title())
