from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.chat_service import build_system_prompt, run_chat
from app.deps import get_user_and_employer
from app.sample_tasks import resolve_onboarding_tasks
from app.schemas import ChatRequest, ChatResponse

router = APIRouter(tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    user_employer: tuple[dict, dict] = Depends(get_user_and_employer),
) -> ChatResponse:
    user, employer = user_employer

    onboarding_tasks = resolve_onboarding_tasks(employer, user)
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
