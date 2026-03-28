from __future__ import annotations

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status

from app.chat_service import build_system_prompt, run_chat
from app.db import get_db
from app.deps import get_current_user_id
from app.sample_tasks import resolve_onboarding_tasks
from app.schemas import ChatRequest, ChatResponse

router = APIRouter(tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    user_id: str = Depends(get_current_user_id),
) -> ChatResponse:
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

    onboarding_tasks = resolve_onboarding_tasks(employer, user.get("employee_role"))
    system_prompt = build_system_prompt(
        user, employer, onboarding_tasks=onboarding_tasks
    )
    try:
        reply = await run_chat(system_prompt, body.messages)
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Assistant error: {e!s}",
        ) from e

    return ChatResponse(message=reply)
