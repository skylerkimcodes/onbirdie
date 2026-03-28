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

    # LLM — prefer Lava gateway (see https://lava.so/docs/gateway/forward-proxy)
    lava_secret_key: str = ""
    lava_api_base_url: str = "https://api.lava.so/v1"
    # Upstream URL passed to Lava ?u= (Gemini OpenAI-compatible chat by default)
    lava_forward_upstream: str = (
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    )

    # Chat + light-tier defaults (style review uses lava_light_model when set, else chat_model)
    chat_model: str = "gpt-4o-mini"
    lava_light_model: str = ""
    lava_light_provider_key: str = ""

    # Fallback: K2 / OpenAI-compatible, or OpenAI directly
    k2_base_url: str = ""
    k2_api_key: str = ""
    k2_model: str = "k2-think-v2"
    openai_api_key: str = ""
    openai_base_url: str = ""
    # Used when LAVA_SECRET_KEY is set; falls back to chat_model when empty.
    lava_chat_model: str = ""

    # Style review: "lava_light" uses Lava + small model; "k2" uses K2 directly.
    style_review_tier: str = "lava_light"

    # Demo: use hardcoded Microsoft-style guide instead of employer.style_guide in MongoDB.
    style_guide_use_microsoft_demo: bool = True


settings = Settings()
