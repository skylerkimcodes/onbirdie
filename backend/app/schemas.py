from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, model_validator


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
    role_options: list[str] = Field(default_factory=list)
    highlight_paths: list[str] = Field(default_factory=list)


class OnboardingTaskPublic(BaseModel):
    id: str
    title: str
    description: str
    sort_order: int = 0


class UserPublic(BaseModel):
    id: str
    email: str
    employer_id: str
    profile_completed: bool = False
    display_name: Optional[str] = None
    employee_role: Optional[str] = None
    experience_band: Optional[str] = None
    linkedin_url: Optional[str] = None
    has_resume: bool = False
    skills_summary: Optional[str] = None


class PlanStepPublic(BaseModel):
    id: str
    title: str
    detail: str
    guidance: str = ""
    done: bool = False


class OnboardingPlanPublic(BaseModel):
    focus_task_id: Optional[str] = None
    steps: list[PlanStepPublic] = Field(default_factory=list)
    updated_at: Optional[str] = None


class MeResponse(BaseModel):
    user: UserPublic
    employer: EmployerPublic
    onboarding_tasks: list[OnboardingTaskPublic] = Field(default_factory=list)
    onboarding_plan: Optional[OnboardingPlanPublic] = None


class GeneratePlanBody(BaseModel):
    focus_task_id: Optional[str] = Field(default=None, max_length=200)


class PlanStepPatchBody(BaseModel):
    step_id: str = Field(min_length=1, max_length=200)
    done: bool


class OnboardingProfileBody(BaseModel):
    display_name: str = Field(min_length=1, max_length=200)
    employee_role: str = Field(min_length=1, max_length=200)
    experience_band: str = Field(min_length=1, max_length=80)
    linkedin_url: str = Field(default="", max_length=500)
    resume_text: str = Field(default="", max_length=100_000)
    skills_summary: str = Field(default="", max_length=4000)

    @model_validator(mode="after")
    def linkedin_or_resume(self) -> "OnboardingProfileBody":
        if not self.linkedin_url.strip() and not self.resume_text.strip():
            raise ValueError("Provide a LinkedIn URL or resume text (paste or upload).")
        return self


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=24_000)


class ChatRequest(BaseModel):
    messages: list[ChatTurn] = Field(min_length=1, max_length=60)


class ChatResponse(BaseModel):
    message: str
