from __future__ import annotations

from typing import Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.db import get_db
from app.jwt_utils import subject_from_token

security = HTTPBearer(auto_error=False)


async def get_current_user_id(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> str:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        return subject_from_token(creds.credentials)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid token") from None


async def get_user_and_employer(
    user_id: str = Depends(get_current_user_id),
) -> tuple[dict, dict]:
    """Resolve the authenticated user and their employer from MongoDB.

    Returns ``(user_doc, employer_doc)`` or raises an appropriate HTTP error.
    Used by every router that needs the full user + employer context.
    """
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
    return user, employer
