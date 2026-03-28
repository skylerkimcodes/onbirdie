from __future__ import annotations

from typing import Optional

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

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
