from __future__ import annotations

from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status

from app.db import get_db
from app.deps import get_current_user_id
from app.plan_service import generate_onboarding_plan_steps
from app.routers.me import _me_response
from app.schemas import GeneratePlanBody, MeResponse, PlanStepPatchBody

router = APIRouter(tags=["plan"])


@router.post("/plan/generate", response_model=MeResponse)
async def generate_plan(
    body: GeneratePlanBody,
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
    employer = await db.employers.find_one({"_id": user["employer_id"]})
    if employer is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Employer record missing",
        )

    focus = (body.focus_task_id or "").strip() or None
    try:
        steps = await generate_onboarding_plan_steps(
            user, employer, focus_task_id=focus
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(e),
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Planner error: {e!s}",
        ) from e

    now = datetime.now(timezone.utc).isoformat()
    plan_doc = {
        "focus_task_id": focus,
        "steps": steps,
        "updated_at": now,
    }
    await db.users.update_one({"_id": oid}, {"$set": {"onboarding_plan": plan_doc}})
    user = await db.users.find_one({"_id": oid})
    assert user is not None
    return _me_response(user, employer)


@router.patch("/plan/step", response_model=MeResponse)
async def patch_plan_step(
    body: PlanStepPatchBody,
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
    employer = await db.employers.find_one({"_id": user["employer_id"]})
    if employer is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Employer record missing",
        )

    plan = user.get("onboarding_plan")
    if not isinstance(plan, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No onboarding plan yet — generate one first.",
        )
    steps = plan.get("steps")
    if not isinstance(steps, list):
        raise HTTPException(status_code=400, detail="Invalid plan shape")

    found = False
    for s in steps:
        if isinstance(s, dict) and s.get("id") == body.step_id:
            s["done"] = body.done
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail="Unknown step id")

    plan["steps"] = steps
    plan["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.users.update_one({"_id": oid}, {"$set": {"onboarding_plan": plan}})
    user = await db.users.find_one({"_id": oid})
    assert user is not None
    return _me_response(user, employer)


@router.delete("/plan", response_model=MeResponse)
async def clear_plan(
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
    employer = await db.employers.find_one({"_id": user["employer_id"]})
    if employer is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Employer record missing",
        )
    await db.users.update_one({"_id": oid}, {"$unset": {"onboarding_plan": ""}})
    user = await db.users.find_one({"_id": oid})
    assert user is not None
    return _me_response(user, employer)
