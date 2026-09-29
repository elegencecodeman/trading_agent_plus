"""Read-only catalog for the control-center config pickers.

Exposes the LLM providers / models / languages the backend can actually run,
plus the currently-configured defaults, so the frontend can render its
ticker → model → language selectors without hardcoding anything.

This module intentionally imports nothing from ``cli`` (which pulls in
questionary/rich) — it only reads the shared registries the CLI already uses:

  * ``model_catalog.MODEL_OPTIONS``  → provider → {quick,deep} model lists
  * ``api_key_env.PROVIDER_API_KEY_ENV`` → provider → API-key env var
"""

from __future__ import annotations

import os
from typing import Any

from tradingagents.default_config import DEFAULT_CONFIG
from tradingagents.llm_clients.api_key_env import PROVIDER_API_KEY_ENV
from tradingagents.llm_clients.model_catalog import MODEL_OPTIONS

# Same language list the CLI offers (cli/utils.py::ask_output_language).
LANGUAGES = [
    "English",
    "Chinese",
    "Japanese",
    "Korean",
    "Hindi",
    "Spanish",
    "Portuguese",
    "French",
    "German",
    "Arabic",
    "Russian",
]

# provider id → human label (CLI-facing ids kept as the wire value).
PROVIDER_LABELS: dict[str, str] = {
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "google": "Google (Gemini)",
    "xai": "xAI (Grok)",
    "deepseek": "DeepSeek",
    "qwen": "Qwen (国际)",
    "qwen-cn": "Qwen (国内)",
    "glm": "GLM (Z.AI)",
    "glm-cn": "GLM (BigModel)",
    "minimax": "MiniMax (国际)",
    "minimax-cn": "MiniMax (国内)",
    "openrouter": "OpenRouter",
    "mistral": "Mistral",
    "kimi": "Kimi (Moonshot)",
    "groq": "Groq",
    "nvidia": "NVIDIA NIM",
    "ollama": "Ollama (本地)",
    "openai_compatible": "OpenAI 兼容 (自定义)",
    "bedrock": "AWS Bedrock",
}

# Providers the UI cannot fully drive without extra config (base_url / region /
# deployment) that this bridge does not yet expose. Listed, but flagged so the
# frontend can show a hint instead of silently failing at run time.
_NEEDS_SETUP = {"openai_compatible", "bedrock"}


def _has_key(provider: str) -> bool:
    env_var = PROVIDER_API_KEY_ENV.get(provider)
    if env_var is None:
        return True  # keyless (ollama) or auth-via-chain (bedrock)
    return bool(os.environ.get(env_var))


def _provider_entry(provider: str) -> dict[str, Any]:
    modes = MODEL_OPTIONS.get(provider)
    return {
        "id": provider,
        "label": PROVIDER_LABELS.get(provider, provider),
        "hasKey": _has_key(provider),
        "needsSetup": provider in _NEEDS_SETUP,
        "models": {
            "quick": [{"label": label, "value": value} for label, value in modes.get("quick", [])],
            "deep": [{"label": label, "value": value} for label, value in modes.get("deep", [])],
        },
    }


def build_options() -> dict[str, Any]:
    """Assemble the /options payload."""
    return {
        "providers": [_provider_entry(p) for p in MODEL_OPTIONS],
        "languages": LANGUAGES,
        "current": {
            "provider": DEFAULT_CONFIG.get("llm_provider", "openai"),
            "deepThinkLlm": DEFAULT_CONFIG.get("deep_think_llm", ""),
            "quickThinkLlm": DEFAULT_CONFIG.get("quick_think_llm", ""),
            "outputLanguage": DEFAULT_CONFIG.get("output_language", "English"),
        },
    }


def detect_asset_type(ticker: str) -> str:
    """Yahoo convention: crypto pairs end with ``-USD``; everything else (incl.
    FX pairs like ``EURUSD=X``) runs the stock pipeline."""
    t = (ticker or "").strip().upper()
    return "crypto" if t.endswith("-USD") else "stock"
