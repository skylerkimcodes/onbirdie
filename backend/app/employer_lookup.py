"""Resolve employers by join code (legacy single code or cohort sub-codes)."""

from __future__ import annotations

from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase


async def find_employer_by_join_code(
    db: AsyncIOMotorDatabase, code: str
) -> tuple[dict | None, dict[str, Any] | None]:
    """Return (employer_doc, cohort_subdoc_or_none).

    Legacy: match on ``employers.join_code``. Cohort: match ``cohorts[].join_code``.
    """
    raw = code.strip()
    if len(raw) < 4:
        return None, None

    emp = await db.employers.find_one({"join_code": raw})
    if emp is not None:
        return emp, None

    emp = await db.employers.find_one({"cohorts.join_code": raw})
    if emp is None:
        return None, None

    cohorts = emp.get("cohorts")
    if not isinstance(cohorts, list):
        return emp, None
    for c in cohorts:
        if isinstance(c, dict) and (c.get("join_code") or "").strip() == raw:
            return emp, c
    return emp, None


async def find_employer_by_admin_identifier(
    db: AsyncIOMotorDatabase, identifier: str
) -> dict | None:
    """Locate company by slug, legacy join_code, or any cohort join_code."""
    raw = identifier.strip()
    if not raw:
        return None

    slug = raw.lower().replace(" ", "-")
    emp = await db.employers.find_one({"slug": slug})
    if emp is not None:
        return emp

    emp = await db.employers.find_one({"join_code": raw})
    if emp is not None:
        return emp

    return await db.employers.find_one({"cohorts.join_code": raw})


async def cohort_join_code_in_use_elsewhere(
    db: AsyncIOMotorDatabase,
    code: str,
    employer_oid: ObjectId,
) -> bool:
    """True if another employer already uses this code (top-level or cohort)."""
    raw = code.strip()
    other = await db.employers.find_one(
        {
            "_id": {"$ne": employer_oid},
            "$or": [{"join_code": raw}, {"cohorts.join_code": raw}],
        }
    )
    return other is not None


async def validate_cohort_codes_for_employer(
    db: AsyncIOMotorDatabase,
    employer_oid: ObjectId,
    legacy_join_code: str,
    cohorts: list[dict[str, Any]],
) -> None:
    """Raise ValueError if duplicates within list or globally."""
    seen: set[str] = set()
    for c in cohorts:
        jc = (c.get("join_code") or "").strip()
        if len(jc) < 4:
            raise ValueError("Each cohort join code must be at least 4 characters.")
        if jc in seen:
            raise ValueError(f"Duplicate cohort join code: {jc}")
        seen.add(jc)
        if jc == legacy_join_code.strip():
            raise ValueError(
                f"Cohort join code {jc!r} conflicts with the company join code."
            )
        if await cohort_join_code_in_use_elsewhere(db, jc, employer_oid):
            raise ValueError(f"Join code {jc!r} is already used by another company.")
