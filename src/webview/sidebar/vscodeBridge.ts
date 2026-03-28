import type { MeResponse } from "../../types";

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): WebviewPersistedState | undefined;
  setState(state: WebviewPersistedState): void;
};

export const vscode = acquireVsCodeApi();

export interface WebviewPersistedState {
  profile?: { name: string; role: string; experience: string };
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
  | { type: "auth/logoutResult" };
