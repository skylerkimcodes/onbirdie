from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.config import settings
from app.deps import get_user_and_employer
from app.microsoft_style_guide_demo import MICROSOFT_STYLE_GUIDE_DEMO
from app.schemas import StyleLiveRequest, StyleReviewRequest, StyleReviewResponse
from app.services.style_review import run_style_review, run_style_review_live

router = APIRouter(tags=["style-review"])


def _style_guide_text(employer: dict) -> str:
    if settings.style_guide_use_microsoft_demo:
        return MICROSOFT_STYLE_GUIDE_DEMO
    return (employer.get("style_guide") or "").strip()


@router.post("/style-review", response_model=StyleReviewResponse)
async def style_review(
    body: StyleReviewRequest,
    user_employer: tuple[dict, dict] = Depends(get_user_and_employer),
) -> StyleReviewResponse:
    _user, employer = user_employer
    style_guide = _style_guide_text(employer)

    try:
        return await run_style_review(style_guide=style_guide, diff=body.diff)
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Style review error: {e!s}",
        ) from e


@router.post("/style-review/live", response_model=StyleReviewResponse)
async def style_review_live(
    body: StyleLiveRequest,
    user_employer: tuple[dict, dict] = Depends(get_user_and_employer),
) -> StyleReviewResponse:
    _user, employer = user_employer
    style_guide = _style_guide_text(employer)

    try:
        return await run_style_review_live(
            style_guide=style_guide,
            file_path=body.file_path,
            content=body.content,
        )
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Style review error: {e!s}",
        ) from e
