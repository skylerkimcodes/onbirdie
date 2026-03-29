from __future__ import annotations

from bson import Binary, ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.db import get_db
from app.deps import get_current_user_id, get_user_and_employer
from app.resume_pdf import extract_pdf_plain_text
from app.onboarding_defaults import DEFAULT_HIGHLIGHT_PATHS, DEFAULT_ROLE_OPTIONS
from app.sample_tasks import resolve_onboarding_tasks
from app.schemas import (
    EmployerPublic,
    MeResponse,
    OnboardingPlanPublic,
    OnboardingProfileBody,
    OnboardingTaskPublic,
    PlanStepPublic,
    StyleGuideGetResponse,
    StyleGuidePutBody,
    UserPublic,
)
from app.style_guide_effective import effective_source, effective_style_guide_text

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
        diff_raw = s.get("difficulty", 3)
        try:
            di = int(float(diff_raw))
        except (TypeError, ValueError):
            di = 3
        di = max(1, min(5, di))
        steps.append(
            PlanStepPublic(
                id=sid,
                title=title,
                detail=detail,
                guidance=str(s.get("guidance") or "")[:500],
                done=bool(s.get("done")),
                difficulty=di,
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


def me_response(user: dict, employer: dict) -> MeResponse:
    """Build the public ``MeResponse`` from raw Mongo docs.

    Shared by the ``/me`` endpoint and other routers (plan, etc.).
    """
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
        has_resume_pdf=bool(user.get("resume_pdf")),
        skills_summary=user.get("skills_summary") or None,
    )


@router.get("/me", response_model=MeResponse)
async def me(
    user_employer: tuple[dict, dict] = Depends(get_user_and_employer),
) -> MeResponse:
    user, employer = user_employer
    return me_response(user, employer)


def _profile_has_background(
    linkedin_url: str, resume_text_body: str, user: dict
) -> bool:
    """LinkedIn, pasted resume, existing stored resume text, or a server-side PDF upload."""
    if linkedin_url.strip():
        return True
    if resume_text_body.strip():
        return True
    if (user.get("resume_text") or "").strip():
        return True
    if user.get("resume_pdf"):
        return True
    return False


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
    if not _profile_has_background(body.linkedin_url, body.resume_text, user):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide a LinkedIn URL, paste resume text, or upload a PDF resume first.",
        )

    new_resume = body.resume_text.strip()
    had_stored_resume = bool((user.get("resume_text") or "").strip())
    had_pdf = bool(user.get("resume_pdf"))

    set_fields: dict = {
        "display_name": body.display_name.strip(),
        "employee_role": body.employee_role.strip(),
        "experience_band": body.experience_band.strip(),
        "linkedin_url": body.linkedin_url.strip() or None,
        "skills_summary": body.skills_summary.strip() or None,
    }
    if new_resume:
        set_fields["resume_text"] = new_resume
    elif had_stored_resume or had_pdf:
        # Keep PDF-extracted or previously saved text when the form sends an empty textarea.
        pass
    else:
        set_fields["resume_text"] = ""

    await db.users.update_one(
        {"_id": oid},
        {"$set": set_fields},
    )
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
    return me_response(user, employer)


MAX_RESUME_PDF_BYTES = 5 * 1024 * 1024
MAX_RESUME_TEXT = 100_000


@router.get("/me/style-guide", response_model=StyleGuideGetResponse)
async def get_style_guide(
    user_employer: tuple[dict, dict] = Depends(get_user_and_employer),
) -> StyleGuideGetResponse:
    user, employer = user_employer
    personal = (user.get("style_guide") or "").strip()
    team = (employer.get("style_guide") or "").strip()
    return StyleGuideGetResponse(
        personal_style_guide=personal,
        employer_style_guide=team,
        effective_style_guide=effective_style_guide_text(user, employer),
        effective_source=effective_source(user, employer),
    )


@router.put("/me/style-guide", response_model=StyleGuideGetResponse)
async def put_style_guide(
    body: StyleGuidePutBody,
    user_id: str = Depends(get_current_user_id),
) -> StyleGuideGetResponse:
    """Replace the entire guide for **personal** or **employer**; empty clears that bucket."""
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
    if body.target == "personal":
        await db.users.update_one(
            {"_id": oid},
            {"$set": {"style_guide": body.style_guide}},
        )
    else:
        await db.employers.update_one(
            {"_id": user["employer_id"]},
            {"$set": {"style_guide": body.style_guide}},
        )
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
    personal = (user.get("style_guide") or "").strip()
    team = (employer.get("style_guide") or "").strip()
    return StyleGuideGetResponse(
        personal_style_guide=personal,
        employer_style_guide=team,
        effective_style_guide=effective_style_guide_text(user, employer),
        effective_source=effective_source(user, employer),
    )


@router.post("/me/resume-upload", response_model=MeResponse)
async def upload_resume_pdf(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
) -> MeResponse:
    """Store a PDF on the account and set ``resume_text`` from server-side extraction."""
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

    data = await file.read()
    if len(data) > MAX_RESUME_PDF_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"PDF too large (max {MAX_RESUME_PDF_BYTES // (1024 * 1024)} MB).",
        )
    if len(data) < 8 or not data.startswith(b"%PDF"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Upload a PDF file.",
        )
    try:
        plain = extract_pdf_plain_text(data)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not read PDF: {e!s}",
        ) from e
    if not plain.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No text could be extracted from this PDF.",
        )
    truncated = plain[:MAX_RESUME_TEXT]
    fname = (file.filename or "resume.pdf").strip() or "resume.pdf"

    await db.users.update_one(
        {"_id": oid},
        {
            "$set": {
                "resume_text": truncated,
                "resume_pdf": Binary(data),
                "resume_pdf_filename": fname[:500],
            }
        },
    )
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
    return me_response(user, employer)
