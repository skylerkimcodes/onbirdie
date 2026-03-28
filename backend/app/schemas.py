from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class RegisterBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    employer_join_code: str = Field(min_length=4)


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class EmployerPublic(BaseModel):
    id: str
    name: str
    slug: str


class UserPublic(BaseModel):
    id: str
    email: str
    employer_id: str


class MeResponse(BaseModel):
    user: UserPublic
    employer: EmployerPublic
