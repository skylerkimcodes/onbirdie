import * as vscode from "vscode";

const API_BASE_KEY = "apiBaseUrl";

export function getApiBaseUrl(): string {
  const raw = vscode.workspace.getConfiguration("onbirdie").get<string>(API_BASE_KEY);
  const base = (raw ?? "http://127.0.0.1:8000").trim().replace(/\/$/, "");
  return base;
}
