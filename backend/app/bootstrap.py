from __future__ import annotations

from app.config import settings
from app.db import get_db
from app.onboarding_defaults import DEFAULT_HIGHLIGHT_PATHS, DEFAULT_ROLE_OPTIONS

DEFAULT_ONBOARDING_JOIN_CODE = "onbirdie"
DEFAULT_ONBOARDING_EMPLOYER_NAME = "OnBirdie"


async def _ensure_employer(join_code: str, name: str) -> None:
    db = get_db()
    code = join_code.strip()
    if not code:
        return
    existing = await db.employers.find_one({"join_code": code})
    if existing is not None:
        return
    display_name = name.strip() or code
    slug = "-".join(display_name.lower().split())[:48] or "employer"
    await db.employers.insert_one(
        {
            "name": display_name,
            "slug": slug,
            "join_code": code,
            "role_options": DEFAULT_ROLE_OPTIONS,
            "highlight_paths": DEFAULT_HIGHLIGHT_PATHS,
        }
    )


async def bootstrap_default_employer() -> None:
    await _ensure_employer(DEFAULT_ONBOARDING_JOIN_CODE, DEFAULT_ONBOARDING_EMPLOYER_NAME)

    if settings.bootstrap_employer_name.strip() and settings.bootstrap_employer_join_code.strip():
        await _ensure_employer(
            settings.bootstrap_employer_join_code.strip(),
            settings.bootstrap_employer_name.strip(),
        )

    db = get_db()
    await db.employers.update_many(
        {"role_options": {"$exists": False}},
        {"$set": {"role_options": DEFAULT_ROLE_OPTIONS}},
    )
    await db.employers.update_many(
        {"highlight_paths": {"$exists": False}},
        {"$set": {"highlight_paths": DEFAULT_HIGHLIGHT_PATHS}},
    )
