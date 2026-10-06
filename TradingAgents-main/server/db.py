"""SQLAlchemy engine / session plumbing for the bridge's persistence layer.

The app ships **SQLite-first**: no server to install, the database is a single
file under ``data/``. Swapping to MySQL is a one-line change — set
``DATABASE_URL`` in ``.env``::

    DATABASE_URL=mysql+pymysql://user:pass@127.0.0.1:3306/tradingagents?charset=utf8mb4

and install the driver (``pip install pymysql cryptography``). Nothing else in
the code needs to change: every model/query here is dialect-neutral.

Config follows the same convention as ``server/alpaca.py`` — env vars read at
call time, exposed through a small ``is_configured()``-style surface, so the
module imports cleanly even before ``.env`` is loaded.

Sessions are created per request / per background thread (never shared), which
matters because ``POST /run`` finishes its work on a `threading.Thread`.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# Repo root is one level above ``server/``; keep the DB next to the other
# runtime state (``data/``). ``*.sqlite3`` is git-ignored, so the file never
# gets committed.
_REPO_ROOT = Path(__file__).resolve().parents[1]
_DEFAULT_DB_PATH = _REPO_ROOT / "data" / "agent_console.sqlite3"

# SQLite connection string. ``check_same_thread=False`` is required: the engine
# pool hands a connection to whichever thread asks, and the run worker is a
# different thread from the request handler that created it.
DEFAULT_DATABASE_URL = f"sqlite:///{_DEFAULT_DB_PATH.as_posix()}"


def database_url() -> str:
    """Resolve the DSN: ``DATABASE_URL`` from the environment, else local SQLite."""
    return os.environ.get("DATABASE_URL") or DEFAULT_DATABASE_URL


def is_sqlite() -> bool:
    return database_url().startswith("sqlite")


class Base(DeclarativeBase):
    """Declarative base for every ORM model."""


def _make_engine():
    url = database_url()
    kwargs: dict = {"future": True, "pool_pre_ping": True}
    if url.startswith("sqlite"):
        # Ensure the parent directory exists before SQLite tries to open it.
        _DEFAULT_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        kwargs["connect_args"] = {"check_same_thread": False}
    return create_engine(url, **kwargs)


engine = _make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@contextmanager
def session_scope() -> Iterator[Session]:
    """Transactional scope for background threads (no FastAPI dependency).

    Commits on success, rolls back on any exception — the same "never lose the
    decision over a write" defensiveness used by ``runner._store_decision``.
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a request-scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create tables if absent. Idempotent — safe to call on every boot.

    Deliberately ``create_all`` rather than Alembic: this is a single-app
    SQLite-first schema with no migration history yet. Move to Alembic the
    moment the schema needs to change on a database that already holds data.
    """
    from server import models  # noqa: F401 — registers tables on Base.metadata

    Base.metadata.create_all(bind=engine)
