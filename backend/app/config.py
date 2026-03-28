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

    # Fallback: K2 / OpenAI-compatible, or OpenAI directly
    k2_base_url: str = ""
    k2_api_key: str = ""
    openai_api_key: str = ""
    openai_base_url: str = ""
    # Used when LAVA_SECRET_KEY is set (defaults to Gemini; override if Lava upstream is OpenAI, etc.)
    lava_chat_model: str = "gemini-2.0-flash"
    chat_model: str = "gpt-4o-mini"


settings = Settings()
