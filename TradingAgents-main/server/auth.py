"""Authentication: bcrypt password hashing, JWT issuance, FastAPI guards.

Design notes
------------
* **Hashing** uses ``bcrypt`` directly rather than ``passlib`` (which is not
  installed here and is unmaintained for new bcrypt releases). bcrypt silently
  truncates at 72 bytes, so passwords are truncated explicitly and identically
  on hash and verify — otherwise a long password would authenticate against a
  shorter prefix.

* **Tokens** are stateless HS256 JWTs signed with ``JWT_SECRET``. There is no
  server-side session table, so logout is purely client-side (drop the token).
  The trade-off is that a leaked token stays valid until it expires — keep
  ``JWT_EXPIRE_MINUTES`` modest and rotate ``JWT_SECRET`` to force a global
  sign-out.

* **Guards**: ``current_user`` requires a valid token (401 otherwise);
  ``optional_user`` returns ``None`` for anonymous callers, which is what lets a
  guest browse market data while analysis runs stay login-only.

Env vars (see ``.env.example``): ``JWT_SECRET``, ``JWT_EXPIRE_MINUTES``.
"""

from __future__ import annotations

import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from server.db import get_db
from server.models import User

_ALGORITHM = "HS256"
DEFAULT_EXPIRE_MINUTES = 60 * 24 * 7  # one week
_BCRYPT_MAX_BYTES = 72

# ``auto_error=False`` so anonymous requests fall through to our own guards
# instead of being rejected by the security scheme itself.
_bearer = HTTPBearer(auto_error=False)


def _dev_secret_warning(secret: str) -> None:
    if secret == _DEV_FALLBACK_SECRET:
        import logging

        logging.getLogger("server.auth").warning(
            "JWT_SECRET is not set — using an insecure built-in development "
            "secret. Set JWT_SECRET in .env before exposing this server."
        )


_DEV_FALLBACK_SECRET = "dev-only-insecure-secret-change-me"


def jwt_secret() -> str:
    secret = os.environ.get("JWT_SECRET") or _DEV_FALLBACK_SECRET
    _dev_secret_warning(secret)
    return secret


def expire_minutes() -> int:
    try:
        return int(os.environ.get("JWT_EXPIRE_MINUTES") or DEFAULT_EXPIRE_MINUTES)
    except ValueError:
        return DEFAULT_EXPIRE_MINUTES


# --------------------------------------------------------------------------- #
# Passwords
# --------------------------------------------------------------------------- #
def hash_password(password: str) -> str:
    """Return a bcrypt hash (``$2b$...``) for ``password``."""
    raw = password.encode("utf-8")[:_BCRYPT_MAX_BYTES]
    return bcrypt.hashpw(raw, bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """Constant-time-ish check; returns False on a malformed stored hash."""
    try:
        raw = password.encode("utf-8")[:_BCRYPT_MAX_BYTES]
        return bcrypt.checkpw(raw, password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# --------------------------------------------------------------------------- #
# Tokens
# --------------------------------------------------------------------------- #
def create_access_token(user: User) -> tuple[str, int]:
    """Return ``(token, expires_in_seconds)`` for ``user``."""
    minutes = expire_minutes()
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(user.id),
        "username": user.username,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=minutes)).timestamp()),
        "jti": secrets.token_hex(8),
    }
    return jwt.encode(payload, jwt_secret(), algorithm=_ALGORITHM), minutes * 60


def decode_token(token: str) -> dict[str, Any] | None:
    """Decode/verify a token; ``None`` when invalid or expired."""
    try:
        return jwt.decode(token, jwt_secret(), algorithms=[_ALGORITHM])
    except jwt.PyJWTError:
        return None


# --------------------------------------------------------------------------- #
# FastAPI guards
# --------------------------------------------------------------------------- #
def _user_from_credentials(
    creds: HTTPAuthorizationCredentials | None, db: Session
) -> User | None:
    if creds is None or not creds.credentials:
        return None
    payload = decode_token(creds.credentials)
    if not payload:
        return None
    try:
        user_id = int(payload.get("sub", ""))
    except (TypeError, ValueError):
        return None
    return db.get(User, user_id)


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    """Require a valid token — 401 when missing/expired/unknown."""
    user = _user_from_credentials(creds, db)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def optional_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User | None:
    """Anonymous-friendly variant: ``None`` instead of raising.

    Not wired to an endpoint today — kept because the dashboard/quote routes are
    the natural place to add "show me my last rating for this ticker" without
    forcing a login. User *lookups* live in ``server/store.py``.
    """
    return _user_from_credentials(creds, db)
