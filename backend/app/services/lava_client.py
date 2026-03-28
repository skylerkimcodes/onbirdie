"""Unified Lava forward-proxy client for all AI requests.

Both the chat service and the style-review service route through this module
so that URL building, auth-token construction, and response unwrapping live
in one place.

See: https://lava.so/docs/gateway/forward-proxy
"""

from __future__ import annotations

import base64
import json
from typing import Any
from urllib.parse import quote

import httpx

from app.config import settings


def _bearer_token(*, use_byok: bool = False) -> str:
    """Build the Bearer token for the Lava ``/forward`` endpoint.

    When *use_byok* is True **and** ``lava_light_provider_key`` is configured,
    a composite Base64 token is created so the request is billed under the
    provider key (BYOK).  Otherwise the raw ``lava_secret_key`` is used.
    """
    secret = settings.lava_secret_key.strip()
    if not secret:
        raise RuntimeError("LAVA_SECRET_KEY is not set")
    if use_byok:
        pk = settings.lava_light_provider_key.strip()
        if pk:
            payload: dict[str, Any] = {"secret_key": secret, "provider_key": pk}
            return base64.b64encode(json.dumps(payload).encode()).decode()
    return secret


def _unwrap_response(data: Any) -> dict[str, Any]:
    """Normalise Lava response: some upstreams wrap the OpenAI body inside
    ``{"data": {…}}``; if ``choices`` is missing at the top level but present
    inside ``data``, unwrap it."""
    if isinstance(data, dict) and "data" in data and "choices" not in data:
        inner = data.get("data")
        if isinstance(inner, dict):
            return inner
    if isinstance(data, dict):
        return data
    raise RuntimeError(f"Unexpected Lava response shape: {str(data)[:400]}")


async def lava_forward_chat_completions(
    *,
    upstream_chat_completions_url: str,
    body: dict[str, Any],
    use_byok: bool = False,
    timeout_s: float = 120.0,
) -> dict[str, Any]:
    """POST to the Lava forward proxy targeting *upstream_chat_completions_url*.

    Returns an OpenAI-shaped response dict with ``choices`` at the top level
    (auto-unwraps the ``data`` wrapper when present).
    """
    base = settings.lava_api_base_url.rstrip("/")
    u = quote(upstream_chat_completions_url.strip(), safe="")
    url = f"{base}/forward?u={u}"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {_bearer_token(use_byok=use_byok)}",
    }
    async with httpx.AsyncClient(timeout=timeout_s) as client:
        res = await client.post(url, headers=headers, json=body)
        if res.status_code >= 400:
            detail = res.text[:2000]
            raise RuntimeError(f"Lava forward failed ({res.status_code}): {detail}")
        return _unwrap_response(res.json())


def openai_message_content(response: dict[str, Any]) -> str:
    """Extract the assistant message string from an OpenAI chat completion."""
    try:
        msg = response["choices"][0]["message"]
        content = msg.get("content") if isinstance(msg, dict) else None
        if not isinstance(content, str):
            content = str(content) if content is not None else ""
        return content.strip()
    except (KeyError, IndexError, TypeError) as e:
        raise RuntimeError(f"Unexpected chat completion shape: {response!r}") from e
