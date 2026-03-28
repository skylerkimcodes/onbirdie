import * as vscode from "vscode";
import type { StyleIssue } from "./lib/types";
import { runStyleReviewForFile } from "./styleReviewCore";

const LIVE_ID = "onbirdie-style-live";
const MAX_DIAGNOSTICS = 24;
const MAX_CHARS = 100_000;

const LIVE_LANG = new Set([
  "typescript",
  "javascript",
  "typescriptreact",
  "javascriptreact",
  "python",
  "json",
  "markdown",
  "html",
  "css",
  "csharp",
  "java",
  "go",
  "rust",
  "plaintext",
]);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Try to find a 1-based line by searching for an identifier mentioned in the issue text. */
function guessLine1Based(doc: vscode.TextDocument, issue: StyleIssue): number | undefined {
  const blob = `${issue.explanation}\n${issue.suggestion}`;
  const m = blob.match(/(?:variable|identifier|binding|The)\s+[`'"]([a-zA-Z_$][\w$]*)[`'"]/i);
  if (!m) {
    return undefined;
  }
  const name = m[1];
  const re = new RegExp(`\\b${escapeRegExp(name)}\\b`);
  for (let i = 0; i < doc.lineCount; i++) {
    if (re.test(doc.lineAt(i).text)) {
      return i + 1;
    }
  }
  return undefined;
}

function issueToDiagnostic(
  doc: vscode.TextDocument,
  issue: StyleIssue,
  index: number
): vscode.Diagnostic {
  const sev =
    issue.severity === "error"
      ? vscode.DiagnosticSeverity.Error
      : issue.severity === "warning"
        ? vscode.DiagnosticSeverity.Warning
        : vscode.DiagnosticSeverity.Information;

  const lineStart = issue.line_start;
  let line1Based: number | undefined =
    typeof lineStart === "number" && lineStart >= 1 && lineStart <= doc.lineCount
      ? lineStart
      : undefined;
  if (line1Based === undefined) {
    line1Based = guessLine1Based(doc, issue);
  }
  if (line1Based === undefined) {
    // Stagger 1-based lines so entries do not all stack on line 1
    line1Based = Math.min(index + 1, doc.lineCount);
  }

  const lineIdx = line1Based - 1;
  const line = doc.lineAt(lineIdx);
  let startCol = 0;
  let endCol = Math.max(line.text.length, 1);

  const blob = `${issue.explanation} ${issue.suggestion}`;
  const nameMatch = blob.match(/(?:variable|identifier|binding|The)\s+[`'"]([a-zA-Z_$][\w$]*)[`'"]/i);
  if (nameMatch) {
    const name = nameMatch[1];
    const idx = line.text.search(new RegExp(`\\b${escapeRegExp(name)}\\b`));
    if (idx >= 0) {
      startCol = idx;
      endCol = idx + name.length;
    }
  }

  const range = new vscode.Range(lineIdx, startCol, lineIdx, endCol);

  const msg = `[OnBirdie style] ${issue.guide_quote}\n${issue.explanation}\n→ ${issue.suggestion}`;
  const d = new vscode.Diagnostic(range, msg, sev);
  d.source = "OnBirdie";
  d.code = "style-guide";
  return d;
}

export function registerLiveStyleDiagnostics(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection(LIVE_ID);
  context.subscriptions.push(collection);

  const pending = new Map<string, NodeJS.Timeout>();

  const run = async (doc: vscode.TextDocument) => {
    try {
      const cfg = vscode.workspace.getConfiguration("onbirdie");
      if (!cfg.get<boolean>("liveStyleCheck", true)) {
        collection.delete(doc.uri);
        return;
      }
      if (doc.uri.scheme !== "file") {
        return;
      }
      if (!LIVE_LANG.has(doc.languageId)) {
        collection.delete(doc.uri);
        return;
      }
      const text = doc.getText();
      if (text.length > MAX_CHARS) {
        collection.delete(doc.uri);
        return;
      }

      const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
      const rel = folder ? vscode.workspace.asRelativePath(doc.uri, false) : doc.uri.fsPath;

      const outcome = await runStyleReviewForFile(context.secrets, rel, text);
      if (!outcome.ok) {
        const authHint = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 1),
          `[OnBirdie style] ${outcome.error}`,
          vscode.DiagnosticSeverity.Information
        );
        authHint.source = "OnBirdie";
        authHint.code = "style-guide-auth";
        collection.set(doc.uri, [authHint]);
        return;
      }
      const issues = outcome.result.issues.slice(0, MAX_DIAGNOSTICS);
      const diags = issues.map((it: StyleIssue, i: number) => issueToDiagnostic(doc, it, i));
      collection.set(doc.uri, diags);
    } catch {
      /* Silently ignore errors from live diagnostics to avoid noisy rejection warnings. */
    }
  };

  const schedule = (doc: vscode.TextDocument) => {
    const key = doc.uri.toString();
    const prev = pending.get(key);
    if (prev) {
      clearTimeout(prev);
    }
    const ms = vscode.workspace.getConfiguration("onbirdie").get<number>("liveStyleDebounceMs", 100);
    pending.set(
      key,
      setTimeout(() => {
        pending.delete(key);
        void run(doc);
      }, ms)
    );
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document === vscode.window.activeTextEditor?.document) {
        schedule(e.document);
      }
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((ed) => {
      if (ed?.document) {
        schedule(ed.document);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (doc === vscode.window.activeTextEditor?.document) {
        schedule(doc);
      }
    })
  );

  if (vscode.window.activeTextEditor) {
    schedule(vscode.window.activeTextEditor.document);
  }
}
