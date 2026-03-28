import type {
  ChatApiMessage,
  ChatSendResult,
  MeResponse,
  OnboardingProfilePayload,
  ProfileSaveResult,
  StyleGuideApiResult,
  StyleReviewOutcome,
  TourGenerateResult,
  WorkspaceHintsResult,
} from "../../lib/types";

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): WebviewPersistedState | undefined;
  setState(state: WebviewPersistedState): void;
};

export const vscode = acquireVsCodeApi();

/** Local cache for UI; server `profile_completed` is authoritative. */
export interface WebviewPersistedState {
  profile?: {
    name: string;
    role: string;
    experience: string;
    linkedinUrl: string;
    resumeText: string;
    skillsSummary: string;
  };
}

export function getPersistedState(): WebviewPersistedState | undefined {
  return vscode.getState();
}

export function setPersistedState(state: WebviewPersistedState): void {
  vscode.setState(state);
}

export function requestSession(): void {
  vscode.postMessage({ type: "auth/getSession" });
}

export function requestLogin(email: string, password: string): void {
  vscode.postMessage({ type: "auth/login", payload: { email, password } });
}

export function requestRegister(
  email: string,
  password: string,
  employerJoinCode: string
): void {
  vscode.postMessage({
    type: "auth/register",
    payload: { email, password, employerJoinCode },
  });
}

export function requestLogout(): void {
  vscode.postMessage({ type: "auth/logout" });
}

export function requestStyleReview(): void {
  vscode.postMessage({ type: "styleReview/run" });
}

let saveResolve: ((r: ProfileSaveResult) => void) | undefined;
let hintsResolve: ((r: WorkspaceHintsResult) => void) | undefined;
let chatResolve: ((r: ChatSendResult) => void) | undefined;
let planMutResolve: ((r: ProfileSaveResult) => void) | undefined;
let tourResolve: ((r: TourGenerateResult) => void) | undefined;
let styleGuideGetResolve: ((r: StyleGuideApiResult) => void) | undefined;
let styleGuideSaveResolve: ((r: StyleGuideApiResult) => void) | undefined;
export type ResumePickResult =
  | { text: string }
  | { cancelled: true }
  | { error: string };

export type ResumeServerUploadResult =
  | ProfileSaveResult
  | { cancelled: true };

let resumeResolve: ((r: ResumePickResult) => void) | undefined;
let resumeServerResolve: ((r: ResumeServerUploadResult) => void) | undefined;

if (typeof window !== "undefined") {
  window.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as { type?: string; payload?: unknown };
    if (!data?.type) {
      return;
    }
    if (data.type === "profile/saveResult" && saveResolve) {
      const fn = saveResolve;
      saveResolve = undefined;
      fn(data.payload as ProfileSaveResult);
    }
    if (data.type === "workspace/hints" && hintsResolve) {
      const fn = hintsResolve;
      hintsResolve = undefined;
      fn(data.payload as WorkspaceHintsResult);
    }
    if (data.type === "chat/result" && chatResolve) {
      const fn = chatResolve;
      chatResolve = undefined;
      fn(data.payload as ChatSendResult);
    }
    if (data.type === "plan/mutResult" && planMutResolve) {
      const fn = planMutResolve;
      planMutResolve = undefined;
      fn(data.payload as ProfileSaveResult);
    }
    if (data.type === "profile/resumePicked" && resumeResolve) {
      const fn = resumeResolve;
      resumeResolve = undefined;
      fn(data.payload as ResumePickResult);
    }
    if (data.type === "profile/resumeUploadResult" && resumeServerResolve) {
      const fn = resumeServerResolve;
      resumeServerResolve = undefined;
      fn(data.payload as ResumeServerUploadResult);
    }
    if (data.type === "styleGuide/result" && styleGuideGetResolve) {
      const fn = styleGuideGetResolve;
      styleGuideGetResolve = undefined;
      fn(data.payload as StyleGuideApiResult);
    }
    if (data.type === "styleGuide/saveResult" && styleGuideSaveResolve) {
      const fn = styleGuideSaveResolve;
      styleGuideSaveResolve = undefined;
      fn(data.payload as StyleGuideApiResult);
    }
    if (data.type === "tour/result" && tourResolve) {
      const fn = tourResolve;
      tourResolve = undefined;
      fn(data.payload as TourGenerateResult);
    }
  });
}

export function saveOnboardingProfile(
  payload: OnboardingProfilePayload
): Promise<ProfileSaveResult> {
  return new Promise((resolve) => {
    saveResolve = resolve;
    vscode.postMessage({ type: "profile/save", payload });
  });
}

export function pickResumeFile(): Promise<ResumePickResult> {
  return new Promise((resolve) => {
    resumeResolve = resolve;
    vscode.postMessage({ type: "profile/pickResume" });
  });
}

/** Pick a PDF and upload to the API (stores file + extracted text on the account). */
export function uploadResumeToServer(): Promise<ResumeServerUploadResult> {
  return new Promise((resolve) => {
    resumeServerResolve = resolve;
    vscode.postMessage({ type: "profile/resumeUploadServer" });
  });
}

export function requestStyleGuideState(): Promise<StyleGuideApiResult> {
  return new Promise((resolve) => {
    styleGuideGetResolve = resolve;
    vscode.postMessage({ type: "styleGuide/get" });
  });
}

export function saveStyleGuide(
  text: string,
  target: "personal" | "employer"
): Promise<StyleGuideApiResult> {
  return new Promise((resolve) => {
    styleGuideSaveResolve = resolve;
    vscode.postMessage({ type: "styleGuide/save", payload: { text, target } });
  });
}

export function requestWorkspaceHints(highlightPaths: string[]): Promise<WorkspaceHintsResult> {
  return new Promise((resolve) => {
    hintsResolve = resolve;
    vscode.postMessage({ type: "workspace/getHints", payload: { highlightPaths } });
  });
}

export function sendChatMessages(messages: ChatApiMessage[]): Promise<ChatSendResult> {
  return new Promise((resolve) => {
    chatResolve = resolve;
    vscode.postMessage({ type: "chat/send", payload: { messages } });
  });
}

export function requestPlanGenerate(focusTaskId?: string): Promise<ProfileSaveResult> {
  return new Promise((resolve) => {
    planMutResolve = resolve;
    vscode.postMessage({
      type: "plan/generate",
      payload: { focus_task_id: focusTaskId ?? "" },
    });
  });
}

export function requestPlanStep(stepId: string, done: boolean): Promise<ProfileSaveResult> {
  return new Promise((resolve) => {
    planMutResolve = resolve;
    vscode.postMessage({ type: "plan/step", payload: { step_id: stepId, done } });
  });
}

export function requestPlanClear(): Promise<ProfileSaveResult> {
  return new Promise((resolve) => {
    planMutResolve = resolve;
    vscode.postMessage({ type: "plan/clear" });
  });
}

export function openFilePath(fsPath: string): void {
  vscode.postMessage({ type: "openFile", payload: fsPath });
}

export function requestTourGenerate(userRole: string): Promise<TourGenerateResult> {
  return new Promise((resolve) => {
    tourResolve = resolve;
    vscode.postMessage({ type: "tour/generate", payload: { userRole } });
  });
}

export function requestTourGoto(absolutePath: string, startLine: number, endLine: number): void {
  vscode.postMessage({ type: "tour/goto", payload: { absolutePath, startLine, endLine } });
}

export function subscribeToExtension(
  handler: (msg: ExtensionToWebviewMessage) => void
): () => void {
  const listener = (event: MessageEvent) => {
    const data = event.data as ExtensionToWebviewMessage | undefined;
    if (data && typeof data === "object" && "type" in data) {
      handler(data);
    }
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}

export type ExtensionToWebviewMessage =
  | { type: "auth/session"; payload: { me: MeResponse | null } }
  | {
      type: "auth/loginResult";
      payload: { ok: true; me: MeResponse } | { ok: false; error: string };
    }
  | {
      type: "auth/registerResult";
      payload: { ok: true; me: MeResponse } | { ok: false; error: string };
    }
  | { type: "auth/logoutResult" }
  | { type: "styleReview/result"; payload: StyleReviewOutcome };
