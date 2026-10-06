"""Read/write helpers for persisted analysis runs.

Kept separate from ``server/main.py`` so the endpoints stay thin and the query
shapes live in one place. Every function takes an explicit ``Session`` — the
caller owns the transaction (``get_db`` for requests, ``session_scope`` for the
background run thread) — so nothing here commits behind your back.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from server.models import AnalysisRun, User


def save_run(
    db: Session,
    *,
    user_id: int,
    run_id: str,
    ticker: str,
    trade_date: str,
    asset_type: str,
    decision: dict[str, Any],
    dashboard: dict[str, Any] | None = None,
    dashboard_range: str | None = None,
    provider: str | None = None,
    deep_think_llm: str | None = None,
    quick_think_llm: str | None = None,
    output_language: str | None = None,
) -> AnalysisRun:
    """Insert one row for a completed run and return it.

    ``decision`` is the dict built by ``server/runner.py`` — its keys are read
    with ``.get`` defaults so a future field rename degrades to a blank rather
    than failing the write (the same defensive posture as the markdown memory
    write in ``runner._store_decision``).
    """
    confidence = decision.get("confidence")
    row = AnalysisRun(
        run_id=run_id,
        user_id=user_id,
        ticker=ticker.strip().upper(),
        trade_date=trade_date,
        asset_type=asset_type,
        provider=provider,
        deep_think_llm=deep_think_llm,
        quick_think_llm=quick_think_llm,
        output_language=output_language,
        rating=decision.get("rating") or "Hold",
        side=decision.get("side") or "HOLD",
        note=decision.get("note") or "",
        strategy=decision.get("strategy") or "multi-agent research",
        status=decision.get("status") or "pending",
        confidence=float(confidence) if isinstance(confidence, (int, float)) else None,
        dashboard=dashboard,
        range=dashboard_range,
    )
    db.add(row)
    db.flush()  # assign PK without committing — caller's scope commits
    return row


def list_runs(
    db: Session, user_id: int, *, limit: int = 50, offset: int = 0
) -> list[AnalysisRun]:
    """A user's runs, newest first."""
    stmt = (
        select(AnalysisRun)
        .where(AnalysisRun.user_id == user_id)
        .order_by(AnalysisRun.created_at.desc(), AnalysisRun.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(db.execute(stmt).scalars().all())


def count_runs(db: Session, user_id: int) -> int:
    stmt = select(func.count(AnalysisRun.id)).where(AnalysisRun.user_id == user_id)
    return int(db.execute(stmt).scalar_one())


def get_run(db: Session, user_id: int, run_pk: int) -> AnalysisRun | None:
    """Fetch one run **scoped to its owner**.

    The ``user_id`` filter is not decoration: it is what stops user A from
    reading user B's analysis by guessing an id. Never replace this with a bare
    primary-key lookup.
    """
    stmt = select(AnalysisRun).where(
        AnalysisRun.id == run_pk, AnalysisRun.user_id == user_id
    )
    return db.execute(stmt).scalar_one_or_none()


def latest_run_for(db: Session, user_id: int, ticker: str) -> AnalysisRun | None:
    """Most recent run for a ticker — used to re-hydrate a rated dashboard."""
    stmt = (
        select(AnalysisRun)
        .where(AnalysisRun.user_id == user_id, AnalysisRun.ticker == ticker.strip().upper())
        .order_by(AnalysisRun.created_at.desc(), AnalysisRun.id.desc())
        .limit(1)
    )
    return db.execute(stmt).scalar_one_or_none()


def find_user_by_username(db: Session, username: str) -> User | None:
    """Case-insensitive lookup, so ``Alice`` and ``alice`` are one account.

    Usernames are stored lower-cased by ``create_user``; callers pass whatever
    the user typed and this normalises it the same way.
    """
    stmt = select(User).where(User.username == username.strip().lower())
    return db.execute(stmt).scalar_one_or_none()


def create_user(
    db: Session, *, username: str, password_hash: str, display_name: str | None = None
) -> User:
    """Insert a user. Callers must check ``find_user_by_username`` first."""
    user = User(
        username=username.strip().lower(),
        password_hash=password_hash,
        display_name=(display_name or "").strip() or None,
    )
    db.add(user)
    db.flush()
    return user
