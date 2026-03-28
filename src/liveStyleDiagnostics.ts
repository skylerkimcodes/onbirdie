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

  let range: vscode.Range;
  const lineStart = issue.line_start;
  if (typeof lineStart === "number" && lineStart >= 1 && lineStart <= doc.lineCount) {
    const line = doc.lineAt(lineStart - 1);
    range = new vscode.Range(lineStart - 1, 0, lineStart - 1, Math.max(line.text.length, 1));
  } else {
    range = new vscode.Range(0, 0, 0, Math.min(80, doc.lineAt(0).text.length || 1));
  }

  const msg = `${issue.guide_quote}\n${issue.explanation}\n→ ${issue.suggestion}`;
  const d = new vscode.Diagnostic(range, msg, sev);
  d.source = "OnBirdie";
  d.code = `style-${index}`;
  return d;
}

export function registerLiveStyleDiagnostics(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection(LIVE_ID);
  context.subscriptions.push(collection);

  const pending = new Map<string, NodeJS.Timeout>();

  const run = async (doc: vscode.TextDocument) => {
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
      collection.set(doc.uri, [
        new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 1),
          `OnBirdie live style: ${outcome.error}`,
          vscode.DiagnosticSeverity.Information
        ),
      ]);
      return;
    }
    const issues = outcome.result.issues.slice(0, MAX_DIAGNOSTICS);
    const diags = issues.map((it: StyleIssue, i: number) => issueToDiagnostic(doc, it, i));
    collection.set(doc.uri, diags);
  };

  const schedule = (doc: vscode.TextDocument) => {
    const key = doc.uri.toString();
    const prev = pending.get(key);
    if (prev) {
      clearTimeout(prev);
    }
    const ms = vscode.workspace.getConfiguration("onbirdie").get<number>("liveStyleDebounceMs", 1400);
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
