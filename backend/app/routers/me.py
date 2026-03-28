from __future__ import annotations

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status

from app.db import get_db
from app.deps import get_current_user_id
from app.onboarding_defaults import DEFAULT_HIGHLIGHT_PATHS, DEFAULT_ROLE_OPTIONS
from app.sample_tasks import resolve_onboarding_tasks
from app.schemas import (
    EmployerPublic,
    MeResponse,
    OnboardingPlanPublic,
    OnboardingProfileBody,
    OnboardingTaskPublic,
    PlanStepPublic,
    UserPublic,
)

router = APIRouter(tags=["me"])


def _employer_public(emp: dict) -> EmployerPublic:
    ro = emp.get("role_options")
    hp = emp.get("highlight_paths")
    if not isinstance(ro, list) or not ro:
        ro = DEFAULT_ROLE_OPTIONS
    if not isinstance(hp, list) or not hp:
        hp = DEFAULT_HIGHLIGHT_PATHS
    return EmployerPublic(
        id=str(emp["_id"]),
        name=emp["name"],
        slug=emp["slug"],
        role_options=[str(x) for x in ro],
        highlight_paths=[str(x) for x in hp],
    )


def _onboarding_plan_public(user: dict) -> OnboardingPlanPublic | None:
    raw = user.get("onboarding_plan")
    if not raw or not isinstance(raw, dict):
        return None
    steps_in = raw.get("steps")
    if not isinstance(steps_in, list) or not steps_in:
        return None
    steps: list[PlanStepPublic] = []
    for s in steps_in:
        if not isinstance(s, dict):
            continue
        sid = str(s.get("id") or "").strip()
        title = str(s.get("title") or "").strip()
        detail = str(s.get("detail") or "").strip()
        if not sid or not title or not detail:
            continue
        steps.append(
            PlanStepPublic(
                id=sid,
                title=title,
                detail=detail,
                guidance=str(s.get("guidance") or "")[:500],
                done=bool(s.get("done")),
            )
        )
    if not steps:
        return None
    fid = raw.get("focus_task_id")
    return OnboardingPlanPublic(
        focus_task_id=str(fid).strip() if fid else None,
        steps=steps,
        updated_at=str(raw["updated_at"]) if raw.get("updated_at") else None,
    )


def _me_response(user: dict, employer: dict) -> MeResponse:
    task_dicts = resolve_onboarding_tasks(employer, user.get("employee_role"))
    tasks = [OnboardingTaskPublic(**d) for d in task_dicts]
    return MeResponse(
        user=_user_public(user),
        employer=_employer_public(employer),
        onboarding_tasks=tasks,
        onboarding_plan=_onboarding_plan_public(user),
    )


def _user_public(user: dict) -> UserPublic:
    dn = user.get("display_name")
    er = user.get("employee_role")
    profile_completed = bool(dn and er)
    resume_text = (user.get("resume_text") or "").strip()
    return UserPublic(
        id=str(user["_id"]),
        email=user["email"],
        employer_id=str(user["employer_id"]),
        profile_completed=profile_completed,
        display_name=dn,
        employee_role=er,
        experience_band=user.get("experience_band"),
        linkedin_url=user.get("linkedin_url") or None,
        has_resume=bool(resume_text),
        skills_summary=user.get("skills_summary") or None,
    )


@router.get("/me", response_model=MeResponse)
async def me(user_id: str = Depends(get_current_user_id)) -> MeResponse:
    db = get_db()
    try:
        oid = ObjectId(user_id)
    except InvalidId:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        ) from None
    user = await db.users.find_one({"_id": oid})
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        )
    employer = await db.employers.find_one({"_id": user["employer_id"]})
    if employer is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Employer record missing",
        )
    return _me_response(user, employer)


@router.patch("/me/profile", response_model=MeResponse)
async def patch_profile(
    body: OnboardingProfileBody,
    user_id: str = Depends(get_current_user_id),
) -> MeResponse:
    db = get_db()
    try:
        oid = ObjectId(user_id)
    except InvalidId:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        ) from None
    user = await db.users.find_one({"_id": oid})
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        )
    await db.users.update_one(
        {"_id": oid},
        {
            "$set": {
                "display_name": body.display_name.strip(),
                "employee_role": body.employee_role.strip(),
                "experience_band": body.experience_band.strip(),
                "linkedin_url": body.linkedin_url.strip() or None,
                "resume_text": body.resume_text,
                "skills_summary": body.skills_summary.strip() or None,
            }
        },
    )
    user = await db.users.find_one({"_id": oid})
    assert user is not None
    employer = await db.employers.find_one({"_id": user["employer_id"]})
    if employer is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Employer record missing",
        )
    return _me_response(user, employer)
