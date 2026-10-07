"""Redis-backed acceleration: response cache, per-user rate limit, JWT denylist.

Redis is **optional infrastructure**. Every helper in this module is written so
that a missing or unreachable Redis degrades to the pre-Redis behaviour instead
of failing the request:

* ``cache_get`` returns ``None``  → the caller rebuilds from yfinance
* ``rate_limit`` returns allowed  → the run proceeds
* ``is_revoked`` returns ``False`` → the token is treated as still valid

The alternative (fail-closed) would turn a local cache outage into a full API
outage, and would lock every user out of a *read* endpoint. The cost is that
while Redis is down a revoked token stays usable — an acceptable trade for a
denylist that only shortens a token's life, never extends it.

A failed connection opens a circuit breaker (see ``_note_failure``) so a client
does not pay a connect timeout on every single request while Redis is down.

Env vars, all optional (see ``.env.example``):

* ``REDIS_URL`` — default ``redis://127.0.0.1:6379/0``. Set to ``none``/``off``
  to switch Redis off entirely.
* ``QUOTE_CACHE_SECONDS`` — default 30.
* ``DASHBOARD_CACHE_SECONDS`` — default 60.
* ``RUN_RATE_LIMIT`` — analyses per window, per user. Default 10.
* ``RUN_RATE_WINDOW_SECONDS`` — default 3600.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from datetime import date, datetime
from typing import Any

logger = logging.getLogger("server.cache")

DEFAULT_REDIS_URL = "redis://127.0.0.1:6379/0"
_KEY_PREFIX = "ta"
# Values that mean "do not use Redis at all" — distinct from "unset", which
# means "use the default URL".
_DISABLED_VALUES = frozenset({"", "none", "off", "disabled", "false", "0", "no"})

# How long to stop trying after a failure, doubling per consecutive failure.
_RETRY_BASE_SECONDS = 15.0
_RETRY_MAX_SECONDS = 120.0

# Keep every Redis call short: a slow Redis must not become a slow API.
_CONNECT_TIMEOUT = 1.0
_SOCKET_TIMEOUT = 1.0

_lock = threading.Lock()
_client: Any = None  # redis.Redis once connected, None otherwise
_down_until: float = 0.0  # time.monotonic() deadline for the circuit breaker
_failure_count: int = 0
_last_log_at: float = 0.0


# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #
def _env_int(name: str, default: int) -> int:
    try:
        value = int(os.environ.get(name) or default)
    except ValueError:
        return default
    return value if value > 0 else default


def redis_url() -> str | None:
    """The configured URL, or ``None`` when Redis is switched off."""
    raw = os.environ.get("REDIS_URL")
    if raw is None:
        return DEFAULT_REDIS_URL
    raw = raw.strip()
    return None if raw.lower() in _DISABLED_VALUES else raw


def _masked_url(url: str) -> str:
    """A URL safe to log — passwords are stripped."""
    if "@" not in url:
        return url
    scheme, _, rest = url.partition("://")
    return f"{scheme}://***@{rest.rpartition('@')[2]}"


def ttl_quote_seconds() -> int:
    return _env_int("QUOTE_CACHE_SECONDS", 30)


def ttl_dashboard_seconds() -> int:
    return _env_int("DASHBOARD_CACHE_SECONDS", 60)


def run_rate_limit() -> tuple[int, int]:
    """``(limit, window_seconds)`` for analyses started per user."""
    return (
        _env_int("RUN_RATE_LIMIT", 10),
        _env_int("RUN_RATE_WINDOW_SECONDS", 60 * 60),
    )


# --------------------------------------------------------------------------- #
# Connection handling
# --------------------------------------------------------------------------- #
def _note_failure(exc: BaseException) -> None:
    """Open/back off the circuit breaker and log at most once a minute."""
    global _failure_count, _down_until, _last_log_at
    _failure_count += 1
    delay = min(_RETRY_BASE_SECONDS * (2 ** (_failure_count - 1)), _RETRY_MAX_SECONDS)
    _down_until = time.monotonic() + delay
    now = time.monotonic()
    if now - _last_log_at >= 60.0:
        _last_log_at = now
        logger.warning(
            "redis unavailable (%s: %s); continuing without cache/limits, "
            "next retry in %.0fs",
            type(exc).__name__,
            exc,
            delay,
        )


def _drop(exc: BaseException) -> None:
    """Forget the live client after an operation failed."""
    global _client
    with _lock:
        _client = None
    _note_failure(exc)


def _get_client() -> Any:
    """A connected ``redis.Redis``, or ``None`` to fail open."""
    global _client, _failure_count
    url = redis_url()
    if url is None:
        return None
    if _client is not None:
        return _client
    if time.monotonic() < _down_until:
        return None
    with _lock:
        if _client is not None:
            return _client
        if time.monotonic() < _down_until:
            return None
        try:
            import redis  # imported lazily: the dependency itself is optional
        except ImportError as exc:
            _note_failure(exc)
            return None
        try:
            client = redis.Redis.from_url(
                url,
                decode_responses=True,
                socket_connect_timeout=_CONNECT_TIMEOUT,
                socket_timeout=_SOCKET_TIMEOUT,
                health_check_interval=30,
            )
            client.ping()
        except Exception as exc:  # noqa: BLE001 — any client/network error fails open
            _note_failure(exc)
            return None
        _client = client
        _failure_count = 0
        logger.info("redis connected: %s", _masked_url(url))
        return _client


def reset() -> None:
    """Close the client and clear the breaker. For tests and manual recovery."""
    global _client, _down_until, _failure_count, _last_log_at
    with _lock:
        client, _client = _client, None
        _down_until = 0.0
        _failure_count = 0
        _last_log_at = 0.0
    if client is not None:
        try:
            client.close()
        except Exception:  # noqa: BLE001
            pass


def _key(key: str) -> str:
    return f"{_KEY_PREFIX}:{key}"


def _json_default(obj: Any) -> Any:
    """Encode the few non-JSON types the market payloads can carry.

    Anything else raises, which makes ``cache_set`` skip caching rather than
    store a lossy ``str()`` of a number.
    """
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    item = getattr(obj, "item", None)  # numpy scalar -> python scalar
    if callable(item):
        return item()
    raise TypeError(f"not JSON-serializable: {type(obj).__name__}")


# --------------------------------------------------------------------------- #
# Response cache
# --------------------------------------------------------------------------- #
def cache_get(key: str) -> Any | None:
    """The cached value, or ``None`` on a miss *or* any Redis problem."""
    client = _get_client()
    if client is None:
        return None
    try:
        raw = client.get(_key(key))
    except Exception as exc:  # noqa: BLE001
        _drop(exc)
        return None
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        logger.warning("discarding unreadable cache entry %s", key)
        return None


def cache_set(key: str, value: Any, ttl_seconds: int) -> bool:
    """Store ``value`` under ``key``. Returns False when nothing was cached."""
    client = _get_client()
    if client is None:
        return False
    try:
        raw = json.dumps(value, default=_json_default)
    except (TypeError, ValueError) as exc:
        logger.debug("not caching %s: %s", key, exc)
        return False
    try:
        client.set(_key(key), raw, ex=ttl_seconds)
    except Exception as exc:  # noqa: BLE001
        _drop(exc)
        return False
    return True


# --------------------------------------------------------------------------- #
# Rate limiting
# --------------------------------------------------------------------------- #
def rate_limit(bucket: str, limit: int, window_seconds: int) -> tuple[bool, int, int]:
    """Count one hit against ``bucket`` (fixed window).

    Returns ``(allowed, remaining, retry_after_seconds)``. Fails **open**: a
    Redis outage allows the request and reports the full quota as remaining.

    The window index is part of the key, so the counter expires on its own even
    if the ``EXPIRE`` never lands — an ``INCR`` that outlives its window would
    otherwise lock the caller out permanently.
    """
    client = _get_client()
    if client is None:
        return True, limit, 0

    now = int(time.time())
    window_id, elapsed = divmod(now, window_seconds)
    retry_after = window_seconds - elapsed
    key = _key(f"rl:{bucket}:{window_id}")
    try:
        # One round trip, and the expiry is set on the first hit of the window.
        pipe = client.pipeline(transaction=True)
        pipe.incr(key)
        pipe.expire(key, window_seconds + 5)
        count = int(pipe.execute()[0])
    except Exception as exc:  # noqa: BLE001
        _drop(exc)
        return True, limit, 0

    if count > limit:
        return False, 0, retry_after
    return True, limit - count, retry_after


# --------------------------------------------------------------------------- #
# Token revocation (denylist keyed by the JWT ``jti`` claim)
# --------------------------------------------------------------------------- #
def revoke(jti: str, ttl_seconds: int) -> bool:
    """Deny ``jti`` until the token would have expired anyway."""
    client = _get_client()
    if client is None or ttl_seconds <= 0:
        return False
    try:
        client.set(_key(f"revoked:{jti}"), "1", ex=ttl_seconds)
    except Exception as exc:  # noqa: BLE001
        _drop(exc)
        return False
    return True


def is_revoked(jti: str | None) -> bool:
    """True when ``jti`` is on the denylist. Fails open (False) on any error."""
    if not jti:
        return False
    client = _get_client()
    if client is None:
        return False
    try:
        return bool(client.exists(_key(f"revoked:{jti}")))
    except Exception as exc:  # noqa: BLE001
        _drop(exc)
        return False


# --------------------------------------------------------------------------- #
# Diagnostics
# --------------------------------------------------------------------------- #
def status() -> dict[str, Any]:
    """Live reachability snapshot for ``/health`` (unlike the helpers above,
    this intentionally pays the round trip so the answer is current)."""
    url = redis_url()
    if url is None:
        return {"enabled": False, "reachable": False}
    client = _get_client()
    if client is None:
        return {"enabled": True, "reachable": False, "url": _masked_url(url)}
    try:
        client.ping()
    except Exception as exc:  # noqa: BLE001
        _drop(exc)
        return {
            "enabled": True,
            "reachable": False,
            "url": _masked_url(url),
            "error": f"{type(exc).__name__}: {exc}",
        }
    return {
        "enabled": True,
        "reachable": True,
        "url": _masked_url(url),
        "ttl": {"quote": ttl_quote_seconds(), "dashboard": ttl_dashboard_seconds()},
    }
