import * as vscode from "vscode";
import { apiRequest } from "../lib/api";
import {
  clearOnboardingPlan,
  fetchMe,
  generateOnboardingPlan,
  generateTour,
  loginWithCredentials,
  patchPlanStep,
  registerWithCredentials,
  saveOnboardingProfile,
  sendChat,
  signOut,
} from "../lib/auth";
import type { ChatApiMessage, OnboardingProfilePayload, StyleReviewResult } from "../lib/types";
import { extractResumePlainText } from "../lib/resumeText";
import { getStagedGitDiff } from "../git/stagedDiff";
import type { StyleReviewOutcome } from "../styleReviewCore";
import { runStyleReviewForDiff, writeStyleReviewOutput } from "../styleReviewCore";

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "onbirdie.sidebar";

  private _tourDecoration: vscode.TextEditorDecorationType | undefined;

  constructor(private readonly _context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._context.extensionUri],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      async (message: { type: string; payload?: unknown }) => {
        const wv = webviewView.webview;
        const secrets = this._context.secrets;

        switch (message.type) {
          case "auth/getSession": {
            const me = await fetchMe(secrets);
            wv.postMessage({ type: "auth/session", payload: { me } });
            break;
          }
          case "auth/login": {
            const p = message.payload as { email?: string; password?: string };
            const result = await loginWithCredentials(
              secrets,
              p?.email ?? "",
              p?.password ?? ""
            );
            if (result.ok) {
              wv.postMessage({
                type: "auth/loginResult",
                payload: { ok: true as const, me: result.me },
              });
            } else {
              wv.postMessage({
                type: "auth/loginResult",
                payload: { ok: false as const, error: result.error },
              });
            }
            break;
          }
          case "auth/register": {
            const p = message.payload as {
              email?: string;
              password?: string;
              employerJoinCode?: string;
            };
            const result = await registerWithCredentials(
              secrets,
              p?.email ?? "",
              p?.password ?? "",
              p?.employerJoinCode ?? ""
            );
            if (result.ok) {
              wv.postMessage({
                type: "auth/registerResult",
                payload: { ok: true as const, me: result.me },
              });
            } else {
              wv.postMessage({
                type: "auth/registerResult",
                payload: { ok: false as const, error: result.error },
              });
            }
            break;
          }
          case "auth/logout": {
            await signOut(secrets, { silent: true });
            wv.postMessage({ type: "auth/logoutResult" });
            break;
          }
          case "openFile":
            void vscode.commands.executeCommand(
              "vscode.open",
              vscode.Uri.file(message.payload as string)
            );
            break;
          case "profile/save": {
            const body = message.payload as OnboardingProfilePayload;
            const result = await saveOnboardingProfile(secrets, body);
            wv.postMessage({ type: "profile/saveResult", payload: result });
            break;
          }
          case "profile/pickResume": {
            const uris = await vscode.window.showOpenDialog({
              canSelectMany: false,
              openLabel: "Use as resume",
              filters: {
                "PDF": ["pdf"],
                "Text": ["txt", "md", "markdown", "csv"],
                "All files": ["*"],
              },
            });
            if (uris?.[0]) {
              try {
                const buf = await vscode.workspace.fs.readFile(uris[0]);
                const text = await extractResumePlainText(uris[0], buf);
                wv.postMessage({ type: "profile/resumePicked", payload: { text } });
              } catch (e) {
                const message =
                  e instanceof Error ? e.message : "Could not read this file as a resume.";
                wv.postMessage({ type: "profile/resumePicked", payload: { error: message } });
              }
            } else {
              wv.postMessage({ type: "profile/resumePicked", payload: { cancelled: true } });
            }
            break;
          }
          case "chat/send": {
            const p = message.payload as { messages?: ChatApiMessage[] };
            const msgs = p?.messages ?? [];
            const result = await sendChat(secrets, msgs);
            wv.postMessage({ type: "chat/result", payload: result });
            break;
          }
          case "plan/generate": {
            const p = message.payload as { focus_task_id?: string };
            const result = await generateOnboardingPlan(secrets, {
              focus_task_id: p?.focus_task_id,
            });
            wv.postMessage({ type: "plan/mutResult", payload: result });
            break;
          }
          case "plan/step": {
            const p = message.payload as { step_id?: string; done?: boolean };
            const result = await patchPlanStep(
              secrets,
              p?.step_id ?? "",
              Boolean(p?.done)
            );
            wv.postMessage({ type: "plan/mutResult", payload: result });
            break;
          }
          case "plan/clear": {
            const result = await clearOnboardingPlan(secrets);
            wv.postMessage({ type: "plan/mutResult", payload: result });
            break;
          }
          case "tour/generate": {
            const p = message.payload as { userRole?: string } | undefined;
            const userRole = p?.userRole ?? "";
            try {
              const { files, pathMap } = await this._collectTourFiles();
              const result = await generateTour(secrets, files, userRole);
              if (!result.ok) {
                wv.postMessage({ type: "tour/result", payload: { ok: false, error: result.error } });
                break;
              }
              const steps = result.rawSteps.map((s) => ({
                ...s,
                absolutePath: pathMap.get(s.file) ?? "",
              }));
              wv.postMessage({ type: "tour/result", payload: { ok: true, steps } });
            } catch (e) {
              wv.postMessage({
                type: "tour/result",
                payload: { ok: false, error: e instanceof Error ? e.message : "Tour generation failed" },
              });
            }
            break;
          }
          case "tour/goto": {
            const p = message.payload as { absolutePath?: string; startLine?: number; endLine?: number } | undefined;
            if (!p?.absolutePath) break;
            if (!this._tourDecoration) {
              this._tourDecoration = vscode.window.createTextEditorDecorationType({
                isWholeLine: true,
                backgroundColor: new vscode.ThemeColor("editor.findMatchHighlightBackground"),
                borderWidth: "0 0 0 3px",
                borderStyle: "solid",
                borderColor: new vscode.ThemeColor("editorInfo.foreground"),
              });
            }
            try {
              const uri = vscode.Uri.file(p.absolutePath);
              const doc = await vscode.workspace.openTextDocument(uri);
              const editor = await vscode.window.showTextDocument(doc, {
                viewColumn: vscode.ViewColumn.One,
                preserveFocus: true,
              });
              const startLine = Math.max(0, (p.startLine ?? 1) - 1);
              const endLine = Math.max(startLine, (p.endLine ?? startLine + 1) - 1);
              const range = new vscode.Range(startLine, 0, endLine, Number.MAX_SAFE_INTEGER);
              editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
              for (const e of vscode.window.visibleTextEditors) {
                e.setDecorations(this._tourDecoration, []);
              }
              editor.setDecorations(this._tourDecoration, [{ range }]);
            } catch { /* ignore navigation errors */ }
            break;
          }
          case "workspace/getHints": {
            try {
              const p = message.payload as { highlightPaths?: string[] };
              const files = await collectWorkspaceHints(p?.highlightPaths ?? [], 28);
              wv.postMessage({
                type: "workspace/hints",
                payload: { ok: true as const, files },
              });
            } catch (e) {
              wv.postMessage({
                type: "workspace/hints",
                payload: {
                  ok: false as const,
                  error: e instanceof Error ? e.message : "Could not scan workspace",
                },
              });
            }
            break;
          }
          case "styleReview/run": {
            const outcome = await this._runStagedStyleReview();
            wv.postMessage({ type: "styleReview/result", payload: outcome });
            break;
          }
          case "styleGuide/get": {
            const token = await getAccessToken(secrets);
            if (!token) {
              wv.postMessage({
                type: "styleGuide/result",
                payload: { ok: false as const, error: "Sign in first." },
              });
              break;
            }
            const res = await apiRequest("GET", "/api/v1/me/style-guide", { token });
            if (!res.ok) {
              let detail = res.statusText;
              try {
                const err = (await res.json()) as { detail?: unknown };
                if (typeof err.detail === "string") {
                  detail = err.detail;
                }
              } catch {
                /* ignore */
              }
              wv.postMessage({
                type: "styleGuide/result",
                payload: { ok: false as const, error: detail },
              });
              break;
            }
            const data = (await res.json()) as { style_guide: string };
            wv.postMessage({
              type: "styleGuide/result",
              payload: { ok: true as const, style_guide: data.style_guide ?? "" },
            });
            break;
          }
          case "styleGuide/save": {
            const p = message.payload as { text?: string };
            const token = await getAccessToken(secrets);
            if (!token) {
              wv.postMessage({
                type: "styleGuide/saveResult",
                payload: { ok: false as const, error: "Sign in first." },
              });
              break;
            }
            const res = await apiRequest("PUT", "/api/v1/me/style-guide", {
              body: { style_guide: p?.text ?? "" },
              token,
            });
            if (!res.ok) {
              let detail = res.statusText;
              try {
                const err = (await res.json()) as { detail?: unknown };
                if (typeof err.detail === "string") {
                  detail = err.detail;
                }
              } catch {
                /* ignore */
              }
              wv.postMessage({
                type: "styleGuide/saveResult",
                payload: { ok: false as const, error: detail },
              });
              break;
            }
            wv.postMessage({ type: "styleGuide/saveResult", payload: { ok: true as const } });
            break;
          }
          default:
            break;
        }
      }
    );
  }

  /** Command palette / pre-commit workflow: same review, also mirrors to Output when sidebar is closed. */
  async runStagedStyleReviewFromCommand(): Promise<void> {
    await vscode.commands.executeCommand("workbench.view.extension.onbirdie");
    const outcome = await this._runStagedStyleReview();
    this._view?.webview.postMessage({ type: "styleReview/result", payload: outcome });
    const ch = vscode.window.createOutputChannel("OnBirdie Style Review");
    writeStyleReviewOutput(outcome, ch);
  }

  /** Push style-review results to the sidebar webview (e.g. after automatic post-commit review). */
  notifyStyleReviewOutcome(outcome: StyleReviewOutcome): void {
    this._view?.webview.postMessage({ type: "styleReview/result", payload: outcome });
  }

  private async _runStagedStyleReview(): Promise<StyleReviewOutcome> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return { ok: false, error: "Open a folder in VS Code (your git repo) first." };
    }
    const { diff, error: gitError } = await getStagedGitDiff(folder.uri.fsPath);
    if (gitError) {
      return {
        ok: false,
        error: `Could not read staged diff. Is this a git repository? ${gitError}`,
      };
    }
    if (!diff.trim()) {
      return {
        ok: false,
        error: "No staged changes. Stage files in Source Control, then run review again.",
      };
    }
    return runStyleReviewForDiff(this._context.secrets, diff);
  }

  private _getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, "out", "webview", "sidebar.js")
    );
    const nonce = getNonce();
    const cspSource = webview.cspSource;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${cspSource}; img-src * data:;" />
  <title>OnBirdie</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      height: 100vh;
      overflow: hidden;
    }
    #root { height: 100vh; display: flex; flex-direction: column; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private async _collectTourFiles(): Promise<{
    files: { path: string; content: string }[];
    pathMap: Map<string, string>;
  }> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) {
      return this._getSampleProjectFiles();
    }
    const root = folders[0];
    const exclude = "**/{node_modules,.git,.venv,venv,dist,build,.next,coverage}/**";
    const uris = await vscode.workspace.findFiles(
      new vscode.RelativePattern(root, "**/*.{js,ts,tsx,jsx,py,go,java,rb}"),
      exclude,
      15
    );
    const files: { path: string; content: string }[] = [];
    const pathMap = new Map<string, string>();
    for (const uri of uris) {
      const rel = vscode.workspace.asRelativePath(uri, false);
      try {
        const buf = await vscode.workspace.fs.readFile(uri);
        const content = Buffer.from(buf).toString("utf8").slice(0, 4_000);
        files.push({ path: rel, content });
        pathMap.set(rel, uri.fsPath);
      } catch { /* skip unreadable files */ }
    }
    return files.length > 0 ? { files, pathMap } : this._getSampleProjectFiles();
  }

  private async _getSampleProjectFiles(): Promise<{
    files: { path: string; content: string }[];
    pathMap: Map<string, string>;
  }> {
    const names = ["index.js", "routes/users.js", "models/user.js", "middleware/auth.js"];
    const sampleRoot = vscode.Uri.joinPath(this._context.extensionUri, "sample-project");
    const files: { path: string; content: string }[] = [];
    const pathMap = new Map<string, string>();
    for (const name of names) {
      const uri = vscode.Uri.joinPath(sampleRoot, ...name.split("/"));
      try {
        const buf = await vscode.workspace.fs.readFile(uri);
        const content = Buffer.from(buf).toString("utf8");
        files.push({ path: name, content });
        pathMap.set(name, uri.fsPath);
      } catch { /* skip */ }
    }
    return { files, pathMap };
  }
}

function getNonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

function highlightPathToGlob(hp: string): string {
  const t = hp.trim();
  if (!t) {
    return "";
  }
  if (t.endsWith("/")) {
    const base = t.replace(/\/+$/, "");
    return `${base}/**/*`;
  }
  return t;
}

async function collectWorkspaceHints(
  highlightPaths: string[],
  maxTotal: number
): Promise<{ path: string; label: string }[]> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length || maxTotal <= 0) {
    return [];
  }
  const root = folders[0];
  const exclude =
    "**/{node_modules,.git,.venv,venv,dist,build,.next,coverage}/**";
  const results: { path: string; label: string }[] = [];
  const seen = new Set<string>();

  for (const hp of highlightPaths) {
    const glob = highlightPathToGlob(hp);
    if (!glob) {
      continue;
    }
    const pattern = new vscode.RelativePattern(root, glob);
    const uris = await vscode.workspace.findFiles(
      pattern,
      exclude,
      Math.max(0, maxTotal - results.length + 8)
    );
    for (const uri of uris) {
      const label = vscode.workspace.asRelativePath(uri, false);
      if (seen.has(label)) {
        continue;
      }
      seen.add(label);
      results.push({ path: uri.fsPath, label });
      if (results.length >= maxTotal) {
        return results;
      }
    }
  }
  return results;
}
