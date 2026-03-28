export interface EmployerPublic {
  id: string;
  name: string;
  slug: string;
  role_options: string[];
  highlight_paths: string[];
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
  skills_summary?: string | null;
}

export interface MeResponse {
  user: UserPublic;
  employer: EmployerPublic;
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
