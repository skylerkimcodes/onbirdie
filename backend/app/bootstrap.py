from __future__ import annotations

from app.config import settings
from app.db import get_db
from app.onboarding_defaults import DEFAULT_HIGHLIGHT_PATHS, DEFAULT_ROLE_OPTIONS
from app.security import hash_password

DEFAULT_ONBOARDING_JOIN_CODE = "onbirdie"
DEFAULT_ONBOARDING_EMPLOYER_NAME = "OnBirdie"

# Sample employer style guide for dev (style-review feature). Replace per employer in MongoDB.
DEFAULT_STYLE_GUIDE = """# OnBirdie default engineering style (dev sample)

## TypeScript / React
- Prefer explicit function return types on exported APIs and public components.
- Use functional components and hooks; avoid class components.
- Name React components with PascalCase; hooks with `use` prefix.
- Prefer `const` over `let`; avoid `var`.

## General
- Keep functions focused; extract helpers when a block needs a comment to explain "what".
- Use early returns to reduce nesting.
- User-facing copy: sentence case, no trailing spaces.

## Commits
- Commit messages: imperative mood, ~50 char subject, optional body wrapped at 72 chars.
"""

DEFAULT_DEMO_COHORTS: list[dict] = [
    {
        "join_code": "ONBD-FE",
        "label": "Frontend",
        "default_employee_role": "Frontend Engineer",
        "tasks": [],
        "highlight_paths": [],
    },
    {
        "join_code": "ONBD-BE",
        "label": "Backend",
        "default_employee_role": "Backend Engineer",
        "tasks": [],
        "highlight_paths": [],
    },
]


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


async def _seed_style_guide_if_missing(join_code: str, guide: str) -> None:
    db = get_db()
    code = join_code.strip()
    if not code or not guide.strip():
        return
    await db.employers.update_one(
        {"join_code": code, "style_guide": {"$exists": False}},
        {"$set": {"style_guide": guide.strip()}},
    )


async def _seed_admin_code_and_cohorts() -> None:
    db = get_db()
    emp = await db.employers.find_one({"join_code": DEFAULT_ONBOARDING_JOIN_CODE})
    if emp is None:
        return
    oid = emp["_id"]
    updates: dict = {}
    if not emp.get("admin_code_hash"):
        updates["admin_code_hash"] = hash_password(settings.default_employer_admin_code)
    if not emp.get("cohorts"):
        updates["cohorts"] = DEFAULT_DEMO_COHORTS
    if updates:
        await db.employers.update_one({"_id": oid}, {"$set": updates})


async def bootstrap_default_employer() -> None:
    await _ensure_employer(DEFAULT_ONBOARDING_JOIN_CODE, DEFAULT_ONBOARDING_EMPLOYER_NAME)
    await _seed_style_guide_if_missing(
        DEFAULT_ONBOARDING_JOIN_CODE, DEFAULT_STYLE_GUIDE
    )
    await _seed_admin_code_and_cohorts()

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
