from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mongodb_uri: str = ""
    mongodb_db_name: str = "onbirdie"
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    bootstrap_employer_name: str = ""
    bootstrap_employer_join_code: str = ""
    # Plain-text admin password for the default "onbirdie" employer (hashed on bootstrap).
    default_employer_admin_code: str = "onbirdie-admin"

    # Lava = forward proxy to an upstream OpenAI-compatible API (not a model by itself).
    # See https://lava.so/docs/gateway/forward-proxy
    lava_secret_key: str = ""
    lava_api_base_url: str = "https://api.lava.so/v1"
    # Upstream URL passed to Lava ?u= (Gemini OpenAI-compatible chat by default)
    lava_forward_upstream: str = (
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    )

    # Default model id when routing through Lava (e.g. Gemini Flash) — used if K2 is not configured for chat.
    chat_model: str = "gpt-4o-mini"
    # Style-review light tier only (else chat_model)
    lava_light_model: str = ""
    lava_light_provider_key: str = ""

    # K2: preferred for chat, plan JSON, and tour when K2_BASE_URL + K2_API_KEY are set.
    k2_base_url: str = ""
    k2_api_key: str = ""
    k2_model: str = "MBZUAI-IFM/K2-Think-v2"
    openai_api_key: str = ""
    openai_base_url: str = ""
    # When chat falls back to Lava (no K2): model id must match upstream.
    lava_chat_model: str = ""

    # Style review: lava_light = Lava + small/cheap model; k2 = force K2 for reviews too.
    style_review_tier: str = "lava_light"

    # Demo: use hardcoded Microsoft-style guide instead of employer.style_guide in MongoDB.
    style_guide_use_microsoft_demo: bool = True


settings = Settings()
