from __future__ import annotations

import base64
import json
from typing import Any
from urllib.parse import quote

import httpx

from app.config import settings


def _forward_bearer() -> str:
    """Bearer token for Lava /forward: secret key, or forward token if BYOK is required."""
    secret = settings.lava_secret_key.strip()
    if not secret:
        raise RuntimeError("LAVA_SECRET_KEY is not set")
    pk = settings.lava_light_provider_key.strip()
    if not pk:
        return secret
    token_data: dict[str, Any] = {
        "secret_key": secret,
        "provider_key": pk,
    }
    return base64.b64encode(json.dumps(token_data).encode()).decode()


async def lava_forward_chat_completions(
    *,
    upstream_chat_completions_url: str,
    body: dict[str, Any],
    timeout_s: float = 120.0,
) -> dict[str, Any]:
    """
    OpenAI-compatible chat completions proxied through Lava (usage + billing on gateway).

    See: https://lava.so/docs/gateway/forward-proxy
    """
    base = settings.lava_api_base_url.rstrip("/")
    u = quote(upstream_chat_completions_url.strip(), safe="")
    url = f"{base}/forward?u={u}"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {_forward_bearer()}",
    }
    async with httpx.AsyncClient(timeout=timeout_s) as client:
        res = await client.post(url, headers=headers, json=body)
        if res.status_code >= 400:
            detail = res.text[:2000]
            raise RuntimeError(f"Lava forward failed ({res.status_code}): {detail}")
        return res.json()


def openai_message_content(response: dict[str, Any]) -> str:
    try:
        return str(response["choices"][0]["message"]["content"])
    except (KeyError, IndexError, TypeError) as e:
        raise RuntimeError(f"Unexpected chat completion shape: {response!r}") from e
