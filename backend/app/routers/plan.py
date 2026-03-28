from __future__ import annotations

from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status

from app.db import get_db
from app.deps import get_current_user_id, get_user_and_employer
from app.plan_service import generate_onboarding_plan_steps
from app.routers.me import me_response
from app.schemas import GeneratePlanBody, MeResponse, PlanStepPatchBody

router = APIRouter(tags=["plan"])


def _reload_user_response(oid: ObjectId, employer: dict):
    """Re-fetch the user after a mutation and build the MeResponse."""
    async def _inner() -> MeResponse:
        db = get_db()
        user = await db.users.find_one({"_id": oid})
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
            )
        return me_response(user, employer)
    return _inner


@router.post("/plan/generate", response_model=MeResponse)
async def generate_plan(
    body: GeneratePlanBody,
    user_employer: tuple[dict, dict] = Depends(get_user_and_employer),
) -> MeResponse:
    user, employer = user_employer
    oid = user["_id"]

    focus = (body.focus_task_id or "").strip() or None
    try:
        steps = await generate_onboarding_plan_steps(
            user, employer, focus_task_id=focus
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
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
    db = get_db()
    await db.users.update_one({"_id": oid}, {"$set": {"onboarding_plan": plan_doc}})
    return await _reload_user_response(oid, employer)()


@router.patch("/plan/step", response_model=MeResponse)
async def patch_plan_step(
    body: PlanStepPatchBody,
    user_employer: tuple[dict, dict] = Depends(get_user_and_employer),
) -> MeResponse:
    user, employer = user_employer
    oid = user["_id"]

    plan = user.get("onboarding_plan")
    if not isinstance(plan, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No onboarding plan yet — generate one first.",
        )
    steps = plan.get("steps")
    if not isinstance(steps, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid plan shape",
        )

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
    db = get_db()
    await db.users.update_one({"_id": oid}, {"$set": {"onboarding_plan": plan}})
    return await _reload_user_response(oid, employer)()


@router.delete("/plan", response_model=MeResponse)
async def clear_plan(
    user_employer: tuple[dict, dict] = Depends(get_user_and_employer),
) -> MeResponse:
    user, employer = user_employer
    oid = user["_id"]
    db = get_db()
    await db.users.update_one({"_id": oid}, {"$unset": {"onboarding_plan": ""}})
    return await _reload_user_response(oid, employer)()
