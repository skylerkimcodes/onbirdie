from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.db import get_db
from app.deps import get_employer_for_admin
from app.employer_lookup import (
    find_employer_by_admin_identifier,
    validate_cohort_codes_for_employer,
)
from app.jwt_utils import create_employer_admin_token
from app.schemas import (
    EmployerAdminLoginBody,
    EmployerAdminWorkspaceBody,
    EmployerAdminWorkspaceResponse,
    TokenResponse,
)
from app.security import verify_password

router = APIRouter(tags=["employer-admin"])


@router.post("/employer-admin/login", response_model=TokenResponse)
async def employer_admin_login(body: EmployerAdminLoginBody) -> TokenResponse:
    """Authenticate with company identifier (slug, company join code, or any cohort code) + admin code."""
    db = get_db()
    emp = await find_employer_by_admin_identifier(db, body.company_identifier)
    if emp is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unknown company identifier",
        )
    h = emp.get("admin_code_hash")
    if not h:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Employer admin is not configured (missing admin_code_hash).",
        )
    if not verify_password(body.admin_code, h):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin code",
        )
    token = create_employer_admin_token(str(emp["_id"]))
    return TokenResponse(access_token=token)


def _cohorts_to_response(employer: dict) -> list[dict]:
    out: list[dict] = []
    for c in employer.get("cohorts") or []:
        if not isinstance(c, dict):
            continue
        tasks = c.get("tasks") or []
        if not isinstance(tasks, list):
            tasks = []
        out.append(
            {
                "join_code": (c.get("join_code") or "").strip(),
                "label": (c.get("label") or "").strip(),
                "default_employee_role": (c.get("default_employee_role") or "").strip(),
                "tasks": tasks,
                "highlight_paths": c.get("highlight_paths") or [],
            }
        )
    return out


def _workspace_from_doc(employer: dict) -> EmployerAdminWorkspaceResponse:
    return EmployerAdminWorkspaceResponse(
        company_name=str(employer.get("name") or ""),
        slug=str(employer.get("slug") or ""),
        join_code=str(employer.get("join_code") or ""),
        style_guide=str(employer.get("style_guide") or ""),
        role_options=list(employer.get("role_options") or []),
        cohorts=_cohorts_to_response(employer),
    )


@router.get("/employer-admin/workspace", response_model=EmployerAdminWorkspaceResponse)
async def get_workspace(employer: dict = Depends(get_employer_for_admin)) -> EmployerAdminWorkspaceResponse:
    return _workspace_from_doc(employer)


@router.put("/employer-admin/workspace", response_model=EmployerAdminWorkspaceResponse)
async def put_workspace(
    body: EmployerAdminWorkspaceBody,
    employer: dict = Depends(get_employer_for_admin),
) -> EmployerAdminWorkspaceResponse:
    db = get_db()
    oid = employer["_id"]
    legacy = str(employer.get("join_code") or "").strip()

    cohort_dicts: list[dict] = []
    for c in body.cohorts:
        d = c.model_dump()
        cohort_dicts.append(d)

    try:
        await validate_cohort_codes_for_employer(db, oid, legacy, cohort_dicts)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        ) from e

    await db.employers.update_one(
        {"_id": oid},
        {
            "$set": {
                "style_guide": body.style_guide,
                "role_options": body.role_options,
                "cohorts": cohort_dicts,
            }
        },
    )
    updated = await db.employers.find_one({"_id": oid})
    if updated is None:
        raise HTTPException(status_code=500, detail="Update failed")
    return _workspace_from_doc(updated)
