export interface EmployerPublic {
  id: string;
  name: string;
  slug: string;
  role_options: string[];
  highlight_paths: string[];
  /** Company-wide join code; cohort codes are separate. */
  join_code?: string;
}

export interface UserPublic {
  id: string;
  email: string;
  employer_id: string;
  profile_completed: boolean;
  display_name?: string | null;
  employee_role?: string | null;
  experience_band?: string | null;
  linkedin_url?: string | null;
  has_resume: boolean;
  /** Stored PDF on the server (multipart upload), distinct from pasted text. */
  has_resume_pdf?: boolean;
  skills_summary?: string | null;
  cohort_join_code?: string | null;
  cohort_label?: string | null;
  /** Suggested role from cohort registration (profile pre-fill). */
  suggested_employee_role?: string | null;
}

/** Employer portal (admin token — not employee session). */
export interface EmployerCohortDTO {
  join_code: string;
  label: string;
  default_employee_role: string;
  tasks: Array<{
    id?: string;
    title: string;
    description: string;
    sort_order: number;
  }>;
  highlight_paths: string[];
}

export interface EmployerAdminWorkspace {
  company_name: string;
  slug: string;
  join_code: string;
  style_guide: string;
  role_options: string[];
  cohorts: EmployerCohortDTO[];
}

export type EmployerAdminApiResult =
  | { ok: true; data: EmployerAdminWorkspace }
  | { ok: false; error: string };

export type StyleGuideEffectiveSource = "personal" | "employer" | "demo" | "none";

/** Stored guides plus what the API uses for style review (personal overrides employer overrides demo). */
export interface StyleGuideGetResponse {
  personal_style_guide: string;
  employer_style_guide: string;
  effective_style_guide: string;
  effective_source: StyleGuideEffectiveSource;
}

export type StyleGuideApiResult =
  | { ok: true; data: StyleGuideGetResponse }
  | { ok: false; error: string };

export interface OnboardingTaskPublic {
  id: string;
  title: string;
  description: string;
  sort_order: number;
}

export interface PlanStepPublic {
  id: string;
  title: string;
  detail: string;
  /** Legacy / LLM alias — prefer `detail`; UI and API normalize to `detail`. */
  description?: string;
  guidance: string;
  done: boolean;
  /** 1–5 from the planner; weights how many of the 100 points this birdie is worth. */
  difficulty?: number;
}

export interface OnboardingPlanPublic {
  focus_task_id?: string | null;
  steps: PlanStepPublic[];
  updated_at?: string | null;
}

export interface MeResponse {
  user: UserPublic;
  employer: EmployerPublic;
  onboarding_tasks: OnboardingTaskPublic[];
  onboarding_plan?: OnboardingPlanPublic | null;
}

export interface OnboardingProfilePayload {
  display_name: string;
  employee_role: string;
  experience_band: string;
  linkedin_url: string;
  resume_text: string;
  skills_summary: string;
}

export interface WorkspaceHintFile {
  path: string;
  label: string;
}

export type ProfileSaveResult =
  | { ok: true; me: MeResponse }
  | { ok: false; error: string };

export type WorkspaceHintsResult =
  | { ok: true; files: WorkspaceHintFile[] }
  | { ok: false; error: string };

export interface ChatApiMessage {
  role: "user" | "assistant";
  content: string;
}

export type ChatSendResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export interface TourStep {
  file: string;
  absolutePath: string;
  startLine: number;
  endLine: number;
  title: string;
  explanation: string;
}

export type TourGenerateResult =
  | { ok: true; steps: TourStep[] }
  | { ok: false; error: string };

export interface StyleIssue {
  severity: "info" | "warning" | "error";
  file_path?: string | null;
  line_start?: number | null;
  line_hint?: string | null;
  guide_quote: string;
  explanation: string;
  suggestion: string;
}

export interface StyleReviewResult {
  summary: string;
  issues: StyleIssue[];
  tier_used?: "lava_light" | "k2" | null;
}

export type StyleReviewOutcome =
  | { ok: true; result: StyleReviewResult }
  | { ok: false; error: string };
