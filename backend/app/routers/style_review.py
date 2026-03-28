from __future__ import annotations

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status

from app.config import settings
from app.db import get_db
from app.deps import get_current_user_id
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
    user_id: str = Depends(get_current_user_id),
) -> StyleReviewResponse:
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
    style_guide = _style_guide_text(employer)

    try:
        return await run_style_review(style_guide=style_guide, diff=body.diff)
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        ) from e


@router.post("/style-review/live", response_model=StyleReviewResponse)
async def style_review_live(
    body: StyleLiveRequest,
    user_id: str = Depends(get_current_user_id),
) -> StyleReviewResponse:
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
