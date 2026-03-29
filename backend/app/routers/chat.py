from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.chat_service import (
    build_system_prompt,
    parse_code_refs_footer,
    run_chat,
    strip_thinking_tags,
)
from app.deps import get_user_and_employer
from app.sample_tasks import resolve_onboarding_tasks
from app.schemas import ChatRequest, ChatResponse, CodeRef

router = APIRouter(tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    user_employer: tuple[dict, dict] = Depends(get_user_and_employer),
) -> ChatResponse:
    user, employer = user_employer

<<<<<<< Updated upstream
    onboarding_tasks = resolve_onboarding_tasks(employer, user)
=======
    onboarding_tasks = resolve_onboarding_tasks(employer, user.get("employee_role"))
>>>>>>> Stashed changes
    workspace_files = [wf.model_dump() for wf in body.workspace_files]
    system_prompt = build_system_prompt(
        user,
        employer,
        onboarding_tasks=onboarding_tasks,
        workspace_files=workspace_files or None,
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

    cleaned = strip_thinking_tags(reply)
    message_text, raw_refs = parse_code_refs_footer(cleaned)
    code_refs = [
        CodeRef(
            path=r["path"],
            start_line=r["start_line"],
            end_line=r["end_line"],
        )
        for r in raw_refs
    ]
    return ChatResponse(message=message_text, code_refs=code_refs)
