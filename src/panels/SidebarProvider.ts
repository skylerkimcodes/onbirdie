import { createHash } from "crypto";
import * as vscode from "vscode";
import {
  clearOnboardingPlan,
  employerAdminLogin,
  employerAdminSignOut,
  fetchEmployerAdminWorkspace,
  fetchMe,
  fetchStyleGuide,
  generateOnboardingPlan,
  generateTour,
  getAccessToken,
  loginWithCredentials,
  parseErrorDetail,
  patchPlanStep,
  putStyleGuide,
  registerWithCredentials,
  saveEmployerAdminWorkspace,
  saveOnboardingProfile,
  sendChat,
  signOut,
  uploadResumePdf,
} from "../lib/auth";
import type { ChatApiMessage, EmployerAdminWorkspace, OnboardingProfilePayload } from "../lib/types";
import { extractResumePlainText } from "../lib/resumeText";
import { getStagedGitDiff } from "../git/stagedDiff";
import type { StyleReviewOutcome } from "../styleReviewCore";
import { runStyleReviewForDiff, writeStyleReviewOutput } from "../styleReviewCore";

const TOUR_CACHE_STATE_KEY = "onbirdie.tourCache.v1";

/** Relative paths under `sample-project/` (tour fallback + style review when no folder is open). */
const SAMPLE_PROJECT_REL_PATHS = [
  "index.js",
  "routes/users.js",
  "models/user.js",
  "middleware/auth.js",
] as const;

/** Persisted tour steps (no absolute paths); paths are re-resolved when served from cache. */
interface TourCachePayload {
  fingerprint: string;
  userRole: string;
  rawSteps: Array<{
    file: string;
    startLine: number;
    endLine: number;
    title: string;
    explanation: string;
  }>;
}

function fingerprintTourInputs(
  userRole: string,
  files: { path: string; content: string }[]
): string {
  const h = createHash("sha256");
  h.update(userRole.trim());
  h.update("\0");
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  for (const f of sorted) {
    h.update(f.path);
    h.update("\0");
    h.update(f.content);
    h.update("\0");
  }
  return h.digest("hex");
}

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "onbirdie.sidebar";

  private _view: vscode.WebviewView | undefined;
  private _tourDecoration: vscode.TextEditorDecorationType | undefined;

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _outputChannel: vscode.OutputChannel
  ) {}

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
            let me: Awaited<ReturnType<typeof fetchMe>> = null;
            try {
              me = await fetchMe(secrets);
            } catch {
              me = null;
            }
            wv.postMessage({ type: "auth/session", payload: { me } });
            break;
          }
          case "auth/login": {
            try {
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
            } catch (e) {
              const err = e instanceof Error ? e.message : "Sign-in failed.";
              wv.postMessage({
                type: "auth/loginResult",
                payload: { ok: false as const, error: err },
              });
            }
            break;
          }
          case "auth/register": {
            try {
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
            } catch (e) {
              const err = e instanceof Error ? e.message : "Registration failed.";
              wv.postMessage({
                type: "auth/registerResult",
                payload: { ok: false as const, error: err },
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
          case "openCodeRef": {
            const p = message.payload as {
              path?: string;
              start_line?: number;
              end_line?: number;
            };
            if (!p?.path) {
              break;
            }
            const folders = vscode.workspace.workspaceFolders;
            if (!folders?.length) {
              break;
            }
            const segments = p.path.replace(/\\/g, "/").split("/").filter(Boolean);
            if (segments.length === 0) {
              break;
            }
            const uri = vscode.Uri.joinPath(folders[0].uri, ...segments);
            const start = typeof p.start_line === "number" ? p.start_line : 1;
            const end = typeof p.end_line === "number" ? p.end_line : start;
            void this._openAndHighlightRange(uri.fsPath, start, end);
            break;
          }
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
          case "profile/resumeUploadServer": {
            const uris = await vscode.window.showOpenDialog({
              canSelectMany: false,
              openLabel: "Upload PDF to OnBirdie",
              filters: { PDF: ["pdf"] },
            });
            if (!uris?.[0]) {
              wv.postMessage({
                type: "profile/resumeUploadResult",
                payload: { cancelled: true as const },
              });
              break;
            }
            try {
              const buf = await vscode.workspace.fs.readFile(uris[0]);
              const base = uris[0].path.split(/[/\\]/).pop() || "resume.pdf";
              const result = await uploadResumePdf(secrets, buf, base);
              wv.postMessage({ type: "profile/resumeUploadResult", payload: result });
            } catch (e) {
              const message =
                e instanceof Error ? e.message : "Could not upload this PDF.";
              wv.postMessage({
                type: "profile/resumeUploadResult",
                payload: { ok: false as const, error: message },
              });
            }
            break;
          }
          case "chat/send": {
            try {
              const p = message.payload as {
                messages?: ChatApiMessage[];
                highlight_paths?: string[];
              };
              const msgs = p?.messages ?? [];
              let workspaceFiles: { path: string; excerpt: string }[] = [];
              try {
                workspaceFiles = await collectWorkspaceContextForChat(
                  p?.highlight_paths ?? [],
                  12,
                  4000
                );
              } catch {
                workspaceFiles = [];
              }
              const result = await sendChat(secrets, msgs, workspaceFiles);
              wv.postMessage({ type: "chat/result", payload: result });
            } catch (e) {
              const err = e instanceof Error ? e.message : "Chat request failed.";
              wv.postMessage({
                type: "chat/result",
                payload: { ok: false as const, error: err },
              });
            }
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
            const p = message.payload as { userRole?: string; force?: boolean } | undefined;
            const userRole = p?.userRole ?? "";
            const force = Boolean(p?.force);
            try {
              const { files, pathMap } = await this._collectTourFiles();
              const fp = fingerprintTourInputs(userRole, files);
              if (!force) {
                const cached = this._context.workspaceState.get<TourCachePayload | undefined>(
                  TOUR_CACHE_STATE_KEY
                );
                if (
                  cached &&
                  cached.fingerprint === fp &&
                  cached.userRole === userRole.trim() &&
                  cached.rawSteps.length > 0
                ) {
                  const steps = cached.rawSteps.map((s) => ({
                    ...s,
                    absolutePath: pathMap.get(s.file) ?? "",
                  }));
                  wv.postMessage({ type: "tour/result", payload: { ok: true, steps } });
                  break;
                }
              }
              const result = await generateTour(secrets, files, userRole);
              if (!result.ok) {
                wv.postMessage({ type: "tour/result", payload: { ok: false, error: result.error } });
                break;
              }
              const steps = result.rawSteps.map((s) => ({
                ...s,
                absolutePath: pathMap.get(s.file) ?? "",
              }));
              await this._context.workspaceState.update(TOUR_CACHE_STATE_KEY, {
                fingerprint: fp,
                userRole: userRole.trim(),
                rawSteps: result.rawSteps,
              });
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
            if (!p?.absolutePath) {
              break;
            }
            void this._openAndHighlightRange(
              p.absolutePath,
              p.startLine ?? 1,
              p.endLine ?? p.startLine ?? 1
            );
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
            const result = await fetchStyleGuide(secrets);
            wv.postMessage({ type: "styleGuide/result", payload: result });
            break;
          }
          case "styleGuide/save": {
            const p = message.payload as {
              text?: string;
              target?: "personal" | "employer";
            };
            const result = await putStyleGuide(secrets, {
              style_guide: p?.text ?? "",
              target: p?.target ?? "personal",
            });
            wv.postMessage({ type: "styleGuide/saveResult", payload: result });
            break;
          }
          case "employerAdmin/login": {
            const p = message.payload as { identifier?: string; adminCode?: string };
            const r = await employerAdminLogin(
              secrets,
              p?.identifier ?? "",
              p?.adminCode ?? ""
            );
            wv.postMessage({ type: "employerAdmin/loginResult", payload: r });
            break;
          }
          case "employerAdmin/loadWorkspace": {
            const r = await fetchEmployerAdminWorkspace(secrets);
            wv.postMessage({ type: "employerAdmin/workspaceResult", payload: r });
            break;
          }
          case "employerAdmin/logout": {
            await employerAdminSignOut(secrets);
            break;
          }
          case "employerAdmin/saveWorkspace": {
            const p = message.payload as Pick<
              EmployerAdminWorkspace,
              "style_guide" | "role_options" | "cohorts"
            >;
            const r = await saveEmployerAdminWorkspace(secrets, {
              style_guide: p.style_guide ?? "",
              role_options: p.role_options ?? [],
              cohorts: p.cohorts ?? [],
            });
            wv.postMessage({ type: "employerAdmin/workspaceResult", payload: r });
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
    writeStyleReviewOutput(outcome, this._outputChannel);
  }

  /** Push style-review results to the sidebar webview (e.g. after automatic post-commit review). */
  notifyStyleReviewOutcome(outcome: StyleReviewOutcome): void {
    this._view?.webview.postMessage({ type: "styleReview/result", payload: outcome });
  }

  private async _runStagedStyleReview(): Promise<StyleReviewOutcome> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      const diff = await this._buildSampleProjectUnifiedDiff();
      if (!diff.trim()) {
        return { ok: false, error: "Could not load bundled sample project for style review." };
      }
      return runStyleReviewForDiff(this._context.secrets, diff);
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

  /** Open a file and highlight a 1-based line range (same decoration as Tour). */
  private async _openAndHighlightRange(
    absolutePath: string,
    startLine1Based: number,
    endLine1Based: number
  ): Promise<void> {
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
      const uri = vscode.Uri.file(absolutePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.One,
        preserveFocus: true,
      });
      const startLine = Math.max(0, startLine1Based - 1);
      const endLine = Math.max(startLine, endLine1Based - 1);
      const range = new vscode.Range(startLine, 0, endLine, Number.MAX_SAFE_INTEGER);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      for (const e of vscode.window.visibleTextEditors) {
        e.setDecorations(this._tourDecoration, []);
      }
      editor.setDecorations(this._tourDecoration, [{ range }]);
    } catch {
      /* ignore navigation errors */
    }
  }

  /** Synthetic `git diff`-style patch from bundled `sample-project` (no workspace / git required). */
  private async _buildSampleProjectUnifiedDiff(): Promise<string> {
    const sampleRoot = vscode.Uri.joinPath(this._context.extensionUri, "sample-project");
    const parts: string[] = [];
    for (const name of SAMPLE_PROJECT_REL_PATHS) {
      const uri = vscode.Uri.joinPath(sampleRoot, ...name.split("/"));
      try {
        const buf = await vscode.workspace.fs.readFile(uri);
        const content = Buffer.from(buf).toString("utf8");
        const lines = content.split(/\r?\n/);
        parts.push(`diff --git a/${name} b/${name}`);
        parts.push("--- /dev/null");
        parts.push(`+++ b/${name}`);
        parts.push(`@@ -0,0 +1,${lines.length} @@`);
        for (const line of lines) {
          parts.push(`+${line}`);
        }
        parts.push("");
      } catch {
        /* skip missing */
      }
    }
    return parts.join("\n");
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
    const sampleRoot = vscode.Uri.joinPath(this._context.extensionUri, "sample-project");
    const files: { path: string; content: string }[] = [];
    const pathMap = new Map<string, string>();
    for (const name of SAMPLE_PROJECT_REL_PATHS) {
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

/** File excerpts for chat context: employer highlight globs plus the active editor when in workspace. */
async function collectWorkspaceContextForChat(
  highlightPaths: string[],
  maxFiles: number,
  maxCharsPerFile: number
): Promise<{ path: string; excerpt: string }[]> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length || maxFiles <= 0) {
    return [];
  }
  const out: { path: string; excerpt: string }[] = [];
  const seen = new Set<string>();

  const ed = vscode.window.activeTextEditor;
  if (ed && !ed.document.isUntitled && ed.document.uri.scheme === "file") {
    const rel = vscode.workspace.asRelativePath(ed.document.uri, false);
    if (rel && !rel.startsWith("..")) {
      try {
        const text = ed.document.getText();
        const excerpt =
          text.length > maxCharsPerFile
            ? `${text.slice(0, maxCharsPerFile)}\n… [truncated]`
            : text;
        out.push({ path: rel, excerpt });
        seen.add(rel);
      } catch {
        /* skip */
      }
    }
  }

  const hints = await collectWorkspaceHints(highlightPaths, Math.max(0, maxFiles - out.length));
  for (const h of hints) {
    if (out.length >= maxFiles) {
      break;
    }
    if (seen.has(h.label)) {
      continue;
    }
    try {
      const buf = await vscode.workspace.fs.readFile(vscode.Uri.file(h.path));
      const text = Buffer.from(buf).toString("utf8");
      const excerpt =
        text.length > maxCharsPerFile
          ? `${text.slice(0, maxCharsPerFile)}\n… [truncated]`
          : text;
      out.push({ path: h.label, excerpt });
      seen.add(h.label);
    } catch {
      /* skip */
    }
  }

  return out;
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
