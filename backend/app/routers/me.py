from __future__ import annotations

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status

from app.db import get_db
from app.deps import get_current_user_id
from app.schemas import EmployerPublic, MeResponse, UserPublic

router = APIRouter(tags=["me"])


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
    return MeResponse(
        user=UserPublic(
            id=str(user["_id"]),
            email=user["email"],
            employer_id=str(user["employer_id"]),
        ),
        employer=EmployerPublic(
            id=str(employer["_id"]),
            name=employer["name"],
            slug=employer["slug"],
        ),
    )
