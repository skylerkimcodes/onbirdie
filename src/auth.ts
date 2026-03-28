import * as vscode from "vscode";
import { apiRequest } from "./api";
import type { MeResponse } from "./types";

const ACCESS_TOKEN_KEY = "onbirdie.accessToken";

export type AuthResult =
  | { ok: true; me: MeResponse }
  | { ok: false; error: string };

async function parseErrorDetail(res: Response): Promise<string> {
  let detail = res.statusText;
  try {
    const err = (await res.json()) as { detail?: unknown };
    if (typeof err.detail === "string") {
      detail = err.detail;
    }
  } catch {
    /* ignore */
  }
  return detail;
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

export async function signInInteractive(secrets: vscode.SecretStorage): Promise<boolean> {
  const email = await vscode.window.showInputBox({
    title: "OnBirdie — Sign in",
    prompt: "Work email",
    validateInput: (v) => (v.trim().length === 0 ? "Enter your email" : undefined),
  });
  if (email === undefined) {
    return false;
  }
  const password = await vscode.window.showInputBox({
    title: "OnBirdie — Sign in",
    prompt: "Password",
    password: true,
    validateInput: (v) => (v.length === 0 ? "Enter your password" : undefined),
  });
  if (password === undefined) {
    return false;
  }
  const result = await loginWithCredentials(secrets, email, password);
  if (!result.ok) {
    void vscode.window.showErrorMessage(`Sign in failed: ${result.error}`);
    return false;
  }
  void vscode.window.showInformationMessage(
    `OnBirdie: signed in as ${result.me.user.email} (${result.me.employer.name}).`
  );
  return true;
}

export async function registerInteractive(secrets: vscode.SecretStorage): Promise<boolean> {
  const email = await vscode.window.showInputBox({
    title: "OnBirdie — Create account",
    prompt: "Work email",
    validateInput: (v) => (v.trim().length === 0 ? "Enter your email" : undefined),
  });
  if (email === undefined) {
    return false;
  }
  const password = await vscode.window.showInputBox({
    title: "OnBirdie — Create account",
    prompt: "Password (min 8 characters)",
    password: true,
    validateInput: (v) => (v.length < 8 ? "Use at least 8 characters" : undefined),
  });
  if (password === undefined) {
    return false;
  }
  const code = await vscode.window.showInputBox({
    title: "OnBirdie — Create account",
    prompt: "Employer join code (from your onboarding email)",
    validateInput: (v) => (v.trim().length < 4 ? "Enter the join code" : undefined),
  });
  if (code === undefined) {
    return false;
  }
  const result = await registerWithCredentials(secrets, email, password, code);
  if (!result.ok) {
    void vscode.window.showErrorMessage(`Registration failed: ${result.error}`);
    return false;
  }
  void vscode.window.showInformationMessage(
    `OnBirdie: account ready — ${result.me.employer.name}. You're signed in.`
  );
  return true;
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
