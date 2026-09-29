"""Read-only Alpaca paper-trading client.

Alpaca's paper environment simulates a brokerage account: it tracks positions,
cash and equity the same way live trading does, but every order is simulated and
no real money moves. A single base URL serves both US equities and crypto, so one
client covers the ``us`` and ``crypto`` dashboard markets.

This module is deliberately **read-only** — it exposes account / positions /
portfolio-history reads only, never order submission, so wiring it into the
bridge can't place trades by accident.

Credentials come from the environment (``server.main`` already ``load_dotenv``s
the repo-root ``.env``):

    ALPACA_API_KEY=...      # paper API key id
    ALPACA_SECRET_KEY=...   # paper secret

When either key is missing, :func:`is_configured` returns False and the bridge
falls back to its synthetic paper model — the app never depends on Alpaca.
"""

from __future__ import annotations

import os
from typing import Any

import requests

PAPER_BASE = "https://paper-api.alpaca.markets"


def is_configured() -> bool:
    return bool(os.environ.get("ALPACA_API_KEY") and os.environ.get("ALPACA_SECRET_KEY"))


class AlpacaClient:
    def __init__(self) -> None:
        self._key = os.environ["ALPACA_API_KEY"]
        self._secret = os.environ["ALPACA_SECRET_KEY"]
        self._session = requests.Session()
        self._session.headers.update(
            {"APCA-API-KEY-ID": self._key, "APCA-API-SECRET-KEY": self._secret}
        )

    def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        resp = self._session.get(f"{PAPER_BASE}{path}", params=params, timeout=10)
        if not resp.ok:
            raise RuntimeError(f"Alpaca {path}: HTTP {resp.status_code}")
        return resp.json()

    def get_account(self) -> dict[str, float]:
        a = self._get("/v2/account")
        return {
            "equity": float(a.get("equity") or 0.0),
            "last_equity": float(a.get("last_equity") or 0.0),
            "cash": float(a.get("cash") or 0.0),
        }

    def get_positions(self) -> list[dict[str, Any]]:
        return self._get("/v2/positions") or []

    def get_portfolio_history(self, period: str = "1M", timeframe: str = "1D") -> dict[str, Any]:
        return self._get(
            "/v2/portfolio/history",
            params={"period": period, "timeframe": timeframe},
        )


def get_client() -> AlpacaClient | None:
    """Return a client when configured, else ``None`` (caller falls back)."""
    return AlpacaClient() if is_configured() else None
