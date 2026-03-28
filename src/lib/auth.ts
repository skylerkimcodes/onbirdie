import * as vscode from "vscode";
import { apiRequest, apiUploadFile } from "./api";
import type {
  ChatApiMessage,
  ChatSendResult,
  MeResponse,
  OnboardingProfilePayload,
  ProfileSaveResult,
  StyleGuideApiResult,
  StyleGuideGetResponse,
} from "./types";

const ACCESS_TOKEN_KEY = "onbirdie.accessToken";

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

export async function fetchMe(secrets: vscode.SecretStorage): Promise<MeResponse | null> {
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
}

export async function loginWithCredentials(
  secrets: vscode.SecretStorage,
  email: string,
  password: string
): Promise<AuthResult> {
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
}

export async function registerWithCredentials(
  secrets: vscode.SecretStorage,
  email: string,
  password: string,
  employerJoinCode: string
): Promise<AuthResult> {
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
}

export async function signOut(
  secrets: vscode.SecretStorage,
  options?: { silent?: boolean }
): Promise<void> {
  await setAccessToken(secrets, undefined);
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
  messages: ChatApiMessage[]
): Promise<ChatSendResult> {
  const token = await getAccessToken(secrets);
  if (!token) {
    return { ok: false, error: "Not signed in." };
  }
  const res = await apiRequest("POST", "/api/v1/chat", { token, body: { messages } });
  if (res.status === 401) {
    await setAccessToken(secrets, undefined);
    return { ok: false, error: "Session expired. Sign in again." };
  }
  if (!res.ok) {
    return { ok: false, error: await parseErrorDetail(res) };
  }
  const data = (await res.json()) as { message: string };
  return { ok: true, message: data.message };
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
