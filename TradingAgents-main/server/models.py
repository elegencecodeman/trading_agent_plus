"""ORM models: application users and their persisted analysis runs.

Two tables:

``users``
    Account records. Passwords are stored only as a bcrypt hash — see
    ``server/auth.py``. ``username`` is the unique login handle.

``analysis_runs``
    One row per completed agent run, owned by a user. Columns mirror the
    ``decision`` dict emitted by ``server/runner.py`` plus the request context
    and a JSON snapshot of the dashboard so the history view can re-render a
    past run without re-hitting yfinance.

Columns are dialect-neutral (``String``/``Text``/``Float``/``JSON``/``DateTime``)
so the same schema creates cleanly on SQLite and MySQL; no ``server_default``
or ``onupdate`` SQL functions are used, so PostgreSQL/MySQL-specific DDL never
leaks in.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from server.db import Base


def utcnow() -> datetime:
    """Naive UTC timestamp — SQLite and MySQL both store this without tz games."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    # bcrypt hash (never the password). 60 chars today; 255 leaves headroom for
    # a future algorithm/parameter bump without a migration.
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    runs: Mapped[list["AnalysisRun"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # The in-memory SSE run id — lets a stored row be correlated with the live
    # stream that produced it (and with server logs).
    run_id: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )

    # --- request context -----------------------------------------------------
    ticker: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    trade_date: Mapped[str] = mapped_column(String(16), nullable=False)
    asset_type: Mapped[str] = mapped_column(String(16), nullable=False, default="stock")
    provider: Mapped[str | None] = mapped_column(String(48), nullable=True)
    deep_think_llm: Mapped[str | None] = mapped_column(String(96), nullable=True)
    quick_think_llm: Mapped[str | None] = mapped_column(String(96), nullable=True)
    output_language: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # --- the agent's decision (mirrors runner.py's `decision` dict) ----------
    rating: Mapped[str] = mapped_column(String(24), index=True, nullable=False)
    side: Mapped[str] = mapped_column(String(8), nullable=False, default="HOLD")
    # Text: the full final-trade-decision prose, which can run long.
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    strategy: Mapped[str] = mapped_column(String(64), nullable=False, default="multi-agent research")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="pending")
    # Numeric confidence is NOT emitted by TradingAgents; it is backfilled from
    # the dashboard payload (rating → 0-1 map in market.py), so it is nullable.
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)

    # --- dashboard snapshot --------------------------------------------------
    # The full /dashboard payload for this run (metrics, curve, positions, risk,
    # signals, indicators) so the history detail view is a pure read.
    dashboard: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    # Which range the snapshot was built for (the /dashboard period).
    range: Mapped[str | None] = mapped_column(String(8), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, index=True, nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="runs")

    __table_args__ = (
        # The history list is always "my runs, newest first".
        Index("ix_analysis_runs_user_created", "user_id", "created_at"),
    )
