from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt

from app.config import settings


def create_access_token(subject: str, extra: dict[str, Any] | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    to_encode: dict[str, Any] = {
        "sub": subject,
        "exp": expire,
    }
    if extra:
        to_encode.update(extra)
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


def subject_from_token(token: str) -> str:
    try:
        payload = decode_access_token(token)
        if payload.get("typ") == "employer_admin":
            raise JWTError("employer admin token cannot be used as a user session")
        sub = payload.get("sub")
        if not isinstance(sub, str) or not sub:
            raise JWTError("missing sub")
        return sub
    except JWTError as e:
        raise ValueError("invalid token") from e


def create_employer_admin_token(employer_id: str) -> str:
    """JWT for employer portal (style guide + cohorts); not a user session."""
    return create_access_token(employer_id, extra={"typ": "employer_admin"})


def employer_id_from_employer_admin_token(token: str) -> str:
    payload = decode_access_token(token)
    if payload.get("typ") != "employer_admin":
        raise ValueError("not an employer admin token")
    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub:
        raise ValueError("missing sub")
    return sub
