from __future__ import annotations

from typing import Literal, Optional

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
    role_options: list[str] = Field(default_factory=list)
    highlight_paths: list[str] = Field(default_factory=list)
    """Legacy single join code; employees may also use cohort codes."""
    join_code: str = ""


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
    has_resume_pdf: bool = False
    skills_summary: Optional[str] = None
    cohort_join_code: Optional[str] = Field(
        default=None,
        description="Set when the user registered with a cohort join code.",
    )
    cohort_label: Optional[str] = Field(
        default=None,
        description="Human-readable cohort name (e.g. Frontend).",
    )
    suggested_employee_role: Optional[str] = Field(
        default=None,
        description="Default role from the cohort join code (for profile pre-fill).",
    )


class PlanStepPublic(BaseModel):
    id: str
    title: str
    detail: str
    guidance: str = ""
    done: bool = False
    difficulty: int = Field(
        default=3,
        ge=1,
        le=5,
        description="1 = lightest lift, 5 = hardest; weights share of 100 run points.",
    )


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


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=24_000)


class WorkspaceContextFile(BaseModel):
    """Workspace-relative path plus excerpt sent from the VS Code extension."""

    path: str = Field(min_length=1, max_length=2000)
    excerpt: str = Field(default="", max_length=12_000)


class ChatRequest(BaseModel):
    messages: list[ChatTurn] = Field(min_length=1, max_length=60)
    workspace_files: list[WorkspaceContextFile] = Field(default_factory=list, max_length=24)


class CodeRef(BaseModel):
    """A file range the assistant wants the user to open in the editor."""

    path: str = Field(min_length=1, max_length=2000)
    start_line: int = Field(default=1, ge=1)
    end_line: int = Field(default=1, ge=1)


class ChatResponse(BaseModel):
    message: str
    code_refs: list[CodeRef] = Field(default_factory=list)


class StyleReviewRequest(BaseModel):
    """Staged diff text from the client (`git diff --cached`)."""

    diff: str = Field(min_length=1, max_length=250_000)


class StyleLiveRequest(BaseModel):
    """Current file snapshot for live editor checks."""

    file_path: str = Field(min_length=1, max_length=2000)
    content: str = Field(min_length=1, max_length=120_000)


class StyleIssue(BaseModel):
    severity: Literal["info", "warning", "error"] = "warning"
    file_path: str | None = None
    line_start: int | None = Field(
        default=None,
        description="1-based line number in the file (live review); omit if unknown",
    )
    line_hint: str | None = Field(
        default=None,
        description="Line or hunk the issue refers to, if known from the diff",
    )
    guide_quote: str = Field(
        ...,
        description="Short verbatim or paraphrased rule from the company style guide",
    )
    explanation: str
    suggestion: str


class StyleReviewResponse(BaseModel):
    summary: str
    issues: list[StyleIssue] = Field(default_factory=list)
    tier_used: Literal["lava_light", "k2"] | None = Field(
        default=None,
        description="Which backend ran the review (for cost / routing visibility)",
    )


class StyleGuideGetResponse(BaseModel):
    """Stored guides and what the API uses for reviews (personal overrides employer overrides demo)."""

    personal_style_guide: str = ""
    employer_style_guide: str = ""
    effective_style_guide: str
    effective_source: Literal["personal", "employer", "demo", "none"]


class StyleGuidePutBody(BaseModel):
    """Replaces the **entire** guide for the target; empty string clears that bucket."""

    style_guide: str = Field(default="", max_length=500_000)
    target: Literal["personal", "employer"] = "personal"


class CohortTaskBody(BaseModel):
    id: str = Field(default="", max_length=200)
    title: str = Field(default="", max_length=500)
    description: str = Field(default="", max_length=4000)
    sort_order: int = 0


class EmployerCohortBody(BaseModel):
    join_code: str = Field(min_length=4, max_length=64)
    label: str = Field(min_length=1, max_length=200)
    default_employee_role: str = Field(min_length=1, max_length=200)
    tasks: list[CohortTaskBody] = Field(default_factory=list)
    highlight_paths: list[str] = Field(default_factory=list)


class EmployerAdminLoginBody(BaseModel):
    """Company slug, legacy join code, or any cohort code + admin password."""

    company_identifier: str = Field(min_length=1, max_length=200)
    admin_code: str = Field(min_length=4, max_length=200)


class EmployerAdminWorkspaceBody(BaseModel):
    """Full replace of team-visible onboarding config (admin portal)."""

    style_guide: str = Field(default="", max_length=500_000)
    role_options: list[str] = Field(default_factory=list)
    cohorts: list[EmployerCohortBody] = Field(default_factory=list)


class EmployerAdminWorkspaceResponse(BaseModel):
    company_name: str
    slug: str
    join_code: str
    style_guide: str = ""
    role_options: list[str] = Field(default_factory=list)
    cohorts: list[EmployerCohortBody] = Field(default_factory=list)
