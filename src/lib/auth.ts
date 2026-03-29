import * as vscode from "vscode";
import { apiRequest, apiUploadFile } from "./api";
import { getApiBaseUrl } from "./config";
import type {
  ChatApiMessage,
  ChatCodeRef,
  ChatSendResult,
  EmployerAdminWorkspace,
  EmployerAdminApiResult,
  MeResponse,
  OnboardingProfilePayload,
  ProfileSaveResult,
  StyleGuideApiResult,
  StyleGuideGetResponse,
} from "./types";

const ACCESS_TOKEN_KEY = "onbirdie.accessToken";
const EMPLOYER_ADMIN_TOKEN_KEY = "onbirdie.employerAdminToken";

export type AuthResult =
  | { ok: true; me: MeResponse }
  | { ok: false; error: string };

function stringifyDetail(detail: unknown): string {
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: unknown }).msg);
        }
        return JSON.stringify(item);
      })
      .join(" ");
  }
  return "Request failed";
}

export async function parseErrorDetail(res: Response): Promise<string> {
  let detail = res.statusText;
  try {
    const err = (await res.json()) as { detail?: unknown };
    if (err.detail !== undefined) {
      detail = stringifyDetail(err.detail);
    }
  } catch {
    /* ignore */
  }
  return detail;
}

export async function getAccessToken(secrets: vscode.SecretStorage): Promise<string | undefined> {
  return secrets.get(ACCESS_TOKEN_KEY);
}

export async function setAccessToken(
  secrets: vscode.SecretStorage,
  token: string | undefined
): Promise<void> {
  if (token === undefined) {
    await secrets.delete(ACCESS_TOKEN_KEY);
  } else {
    await secrets.store(ACCESS_TOKEN_KEY, token);
  }
}

export async function getEmployerAdminToken(
  secrets: vscode.SecretStorage
): Promise<string | undefined> {
  return secrets.get(EMPLOYER_ADMIN_TOKEN_KEY);
}

export async function setEmployerAdminToken(
  secrets: vscode.SecretStorage,
  token: string | undefined
): Promise<void> {
  if (token === undefined) {
    await secrets.delete(EMPLOYER_ADMIN_TOKEN_KEY);
  } else {
    await secrets.store(EMPLOYER_ADMIN_TOKEN_KEY, token);
  }
}

export async function employerAdminLogin(
  secrets: vscode.SecretStorage,
  companyIdentifier: string,
  adminCode: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await apiRequest("POST", "/api/v1/employer-admin/login", {
      body: {
        company_identifier: companyIdentifier.trim(),
        admin_code: adminCode,
      },
    });
    if (!res.ok) {
      return { ok: false, error: await parseErrorDetail(res) };
    }
    const data = (await res.json()) as { access_token: string };
    await setEmployerAdminToken(secrets, data.access_token);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: authFailureMessage(e) };
  }
}

export async function fetchEmployerAdminWorkspace(
  secrets: vscode.SecretStorage
): Promise<EmployerAdminApiResult> {
  const token = await getEmployerAdminToken(secrets);
  if (!token) {
    return { ok: false, error: "Not signed in to employer portal." };
  }
  try {
    const res = await apiRequest("GET", "/api/v1/employer-admin/workspace", {
      token,
      timeoutMs: 30_000,
    });
    if (res.status === 401) {
      await setEmployerAdminToken(secrets, undefined);
      return { ok: false, error: "Employer session expired. Sign in again." };
    }
    if (!res.ok) {
      return { ok: false, error: await parseErrorDetail(res) };
    }
    const data = (await res.json()) as EmployerAdminWorkspace;
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: authFailureMessage(e) };
  }
}

export async function employerAdminSignOut(secrets: vscode.SecretStorage): Promise<void> {
  await setEmployerAdminToken(secrets, undefined);
}

export async function saveEmployerAdminWorkspace(
  secrets: vscode.SecretStorage,
  body: Pick<EmployerAdminWorkspace, "style_guide" | "role_options" | "cohorts">
): Promise<EmployerAdminApiResult> {
  const token = await getEmployerAdminToken(secrets);
  if (!token) {
    return { ok: false, error: "Not signed in to employer portal." };
  }
  try {
    const res = await apiRequest("PUT", "/api/v1/employer-admin/workspace", {
      token,
      body: {
        style_guide: body.style_guide,
        role_options: body.role_options,
        cohorts: body.cohorts,
      },
      timeoutMs: 60_000,
    });
    if (res.status === 401) {
      await setEmployerAdminToken(secrets, undefined);
      return { ok: false, error: "Employer session expired. Sign in again." };
    }
    if (!res.ok) {
      return { ok: false, error: await parseErrorDetail(res) };
    }
    const data = (await res.json()) as EmployerAdminWorkspace;
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: authFailureMessage(e) };
  }
}

export async function fetchMe(secrets: vscode.SecretStorage): Promise<MeResponse | null> {
  try {
    const token = await getAccessToken(secrets);
    if (!token) {
      return null;
    }
    const res = await apiRequest("GET", "/api/v1/me", { token });
    if (res.status === 401) {
      await setAccessToken(secrets, undefined);
      return null;
    }
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as MeResponse;
  } catch {
    return null;
  }
}

function authFailureMessage(e: unknown): string {
  const baseUrl = getApiBaseUrl();
  if (e instanceof Error) {
    if (e.name === "AbortError") {
      return `Request timed out to ${baseUrl}. Start the backend or change onbirdie.apiBaseUrl in Settings.`;
    }
    const msg = (e.message || "").toLowerCase();
    const cause = e.cause;
    const causeMsg = cause instanceof Error ? (cause.message || "").toLowerCase() : "";
    if (
      msg === "fetch failed" ||
      msg.includes("econnrefused") ||
      msg.includes("enotfound") ||
      msg.includes("getaddrinfo") ||
      msg.includes("socket") ||
      causeMsg.includes("econnrefused") ||
      causeMsg.includes("connect")
    ) {
      return `Could not connect to ${baseUrl}. Start the OnBirdie API (backend) locally or set Settings → OnBirdie → API base URL to match where it runs.`;
    }
    return e.message;
  }
  return `Could not reach ${baseUrl}. Check your network and API URL in Settings.`;
}

export async function loginWithCredentials(
  secrets: vscode.SecretStorage,
  email: string,
  password: string
): Promise<AuthResult> {
  try {
    const res = await apiRequest("POST", "/api/v1/auth/login", {
      body: { email: email.trim(), password },
    });
    if (!res.ok) {
      return { ok: false, error: await parseErrorDetail(res) };
    }
    const data = (await res.json()) as { access_token: string };
    await setAccessToken(secrets, data.access_token);
    const me = await fetchMe(secrets);
    if (!me) {
      return { ok: false, error: "Signed in but could not load account." };
    }
    return { ok: true, me };
  } catch (e) {
    return { ok: false, error: authFailureMessage(e) };
  }
}

export async function registerWithCredentials(
  secrets: vscode.SecretStorage,
  email: string,
  password: string,
  employerJoinCode: string
): Promise<AuthResult> {
  try {
    const res = await apiRequest("POST", "/api/v1/auth/register", {
      body: {
        email: email.trim(),
        password,
        employer_join_code: employerJoinCode.trim(),
      },
    });
    if (!res.ok) {
      return { ok: false, error: await parseErrorDetail(res) };
    }
    const data = (await res.json()) as { access_token: string };
    await setAccessToken(secrets, data.access_token);
    const me = await fetchMe(secrets);
    if (!me) {
      return { ok: false, error: "Account created but could not load profile." };
    }
    return { ok: true, me };
  } catch (e) {
    return { ok: false, error: authFailureMessage(e) };
  }
}

export async function signOut(
  secrets: vscode.SecretStorage,
  options?: { silent?: boolean }
): Promise<void> {
  await setAccessToken(secrets, undefined);
  await setEmployerAdminToken(secrets, undefined);
  if (!options?.silent) {
    void vscode.window.showInformationMessage("OnBirdie: signed out.");
  }
}

export async function uploadResumePdf(
  secrets: vscode.SecretStorage,
  file: Uint8Array,
  fileName: string
): Promise<ProfileSaveResult> {
  const token = await getAccessToken(secrets);
  if (!token) {
    return { ok: false, error: "Not signed in." };
  }
  const res = await apiUploadFile("/api/v1/me/resume-upload", file, fileName, token);
  if (res.status === 401) {
    await setAccessToken(secrets, undefined);
    return { ok: false, error: "Session expired. Sign in again." };
  }
  if (!res.ok) {
    return { ok: false, error: await parseErrorDetail(res) };
  }
  const me = (await res.json()) as MeResponse;
  return { ok: true, me };
}

export async function fetchStyleGuide(secrets: vscode.SecretStorage): Promise<StyleGuideApiResult> {
  const token = await getAccessToken(secrets);
  if (!token) {
    return { ok: false, error: "Not signed in." };
  }
  const res = await apiRequest("GET", "/api/v1/me/style-guide", { token });
  if (res.status === 401) {
    await setAccessToken(secrets, undefined);
    return { ok: false, error: "Session expired. Sign in again." };
  }
  if (!res.ok) {
    return { ok: false, error: await parseErrorDetail(res) };
  }
  const data = (await res.json()) as StyleGuideGetResponse;
  return { ok: true, data };
}

export async function putStyleGuide(
  secrets: vscode.SecretStorage,
  body: { style_guide: string; target: "personal" | "employer" }
): Promise<StyleGuideApiResult> {
  const token = await getAccessToken(secrets);
  if (!token) {
    return { ok: false, error: "Not signed in." };
  }
  const res = await apiRequest("PUT", "/api/v1/me/style-guide", {
    token,
    body: { style_guide: body.style_guide, target: body.target },
  });
  if (res.status === 401) {
    await setAccessToken(secrets, undefined);
    return { ok: false, error: "Session expired. Sign in again." };
  }
  if (!res.ok) {
    return { ok: false, error: await parseErrorDetail(res) };
  }
  const data = (await res.json()) as StyleGuideGetResponse;
  return { ok: true, data };
}

export async function saveOnboardingProfile(
  secrets: vscode.SecretStorage,
  body: OnboardingProfilePayload
): Promise<ProfileSaveResult> {
  const token = await getAccessToken(secrets);
  if (!token) {
    return { ok: false, error: "Not signed in." };
  }
  const res = await apiRequest("PATCH", "/api/v1/me/profile", { token, body });
  if (res.status === 401) {
    await setAccessToken(secrets, undefined);
    return { ok: false, error: "Session expired. Sign in again." };
  }
  if (!res.ok) {
    return { ok: false, error: await parseErrorDetail(res) };
  }
  const me = (await res.json()) as MeResponse;
  return { ok: true, me };
}

export async function sendChat(
  secrets: vscode.SecretStorage,
  messages: ChatApiMessage[],
  workspaceFiles?: { path: string; excerpt: string }[]
): Promise<ChatSendResult> {
  const token = await getAccessToken(secrets);
  if (!token) {
    return { ok: false, error: "Not signed in." };
  }
  const res = await apiRequest("POST", "/api/v1/chat", {
    token,
    body: {
      messages,
      workspace_files: workspaceFiles ?? [],
    },
  });
  if (res.status === 401) {
    await setAccessToken(secrets, undefined);
    return { ok: false, error: "Session expired. Sign in again." };
  }
  if (!res.ok) {
    return { ok: false, error: await parseErrorDetail(res) };
  }
  const data = (await res.json()) as {
    message: string;
    code_refs?: ChatCodeRef[];
  };
  return {
    ok: true,
    message: data.message,
    code_refs: data.code_refs ?? [],
  };
}

export async function generateOnboardingPlan(
  secrets: vscode.SecretStorage,
  body: { focus_task_id?: string }
): Promise<ProfileSaveResult> {
  const token = await getAccessToken(secrets);
  if (!token) {
    return { ok: false, error: "Not signed in." };
  }
  const res = await apiRequest("POST", "/api/v1/plan/generate", {
    token,
    body: { focus_task_id: body.focus_task_id?.trim() || undefined },
  });
  if (res.status === 401) {
    await setAccessToken(secrets, undefined);
    return { ok: false, error: "Session expired. Sign in again." };
  }
  if (!res.ok) {
    return { ok: false, error: await parseErrorDetail(res) };
  }
  const me = (await res.json()) as MeResponse;
  return { ok: true, me };
}

export async function patchPlanStep(
  secrets: vscode.SecretStorage,
  stepId: string,
  done: boolean
): Promise<ProfileSaveResult> {
  const token = await getAccessToken(secrets);
  if (!token) {
    return { ok: false, error: "Not signed in." };
  }
  const res = await apiRequest("PATCH", "/api/v1/plan/step", {
    token,
    body: { step_id: stepId, done },
  });
  if (res.status === 401) {
    await setAccessToken(secrets, undefined);
    return { ok: false, error: "Session expired. Sign in again." };
  }
  if (!res.ok) {
    return { ok: false, error: await parseErrorDetail(res) };
  }
  const me = (await res.json()) as MeResponse;
  return { ok: true, me };
}

export async function clearOnboardingPlan(secrets: vscode.SecretStorage): Promise<ProfileSaveResult> {
  const token = await getAccessToken(secrets);
  if (!token) {
    return { ok: false, error: "Not signed in." };
  }
  const res = await apiRequest("DELETE", "/api/v1/plan", { token });
  if (res.status === 401) {
    await setAccessToken(secrets, undefined);
    return { ok: false, error: "Session expired. Sign in again." };
  }
  if (!res.ok) {
    return { ok: false, error: await parseErrorDetail(res) };
  }
  const me = (await res.json()) as MeResponse;
  return { ok: true, me };
}

export async function generateTour(
  secrets: vscode.SecretStorage,
  files: { path: string; content: string }[],
  userRole: string
): Promise<{ ok: true; rawSteps: Array<{ file: string; startLine: number; endLine: number; title: string; explanation: string }> } | { ok: false; error: string }> {
  const token = await getAccessToken(secrets);
  if (!token) {
    return { ok: false, error: "Not signed in." };
  }
  const res = await apiRequest("POST", "/api/v1/tour/generate", {
    token,
    body: { files, user_role: userRole },
  });
  if (res.status === 401) {
    await setAccessToken(secrets, undefined);
    return { ok: false, error: "Session expired. Sign in again." };
  }
  if (!res.ok) {
    return { ok: false, error: await parseErrorDetail(res) };
  }
  const data = (await res.json()) as {
    steps: Array<{ file: string; startLine: number; endLine: number; title: string; explanation: string }>;
  };
  return { ok: true, rawSteps: data.steps };
}
