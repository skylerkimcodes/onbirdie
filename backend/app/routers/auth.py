from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.db import get_db
from app.employer_lookup import find_employer_by_join_code
from app.jwt_utils import create_access_token
from app.schemas import LoginBody, RegisterBody, TokenResponse
from app.security import hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
async def register(body: RegisterBody) -> TokenResponse:
    db = get_db()
    employer, cohort = await find_employer_by_join_code(db, body.employer_join_code)
    if employer is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unknown employer join code",
        )
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )
    user_doc: dict = {
        "email": body.email.lower(),
        "password_hash": hash_password(body.password),
        "employer_id": employer["_id"],
    }
    if cohort:
        user_doc["cohort_join_code"] = (cohort.get("join_code") or "").strip()
        dar = (cohort.get("default_employee_role") or "").strip()
        if dar:
            user_doc["suggested_employee_role"] = dar
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    token = create_access_token(user_id)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginBody) -> TokenResponse:
    db = get_db()
    user = await db.users.find_one({"email": body.email.lower()})
    if user is None or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    user_id = str(user["_id"])
    token = create_access_token(user_id)
    return TokenResponse(access_token=token)
