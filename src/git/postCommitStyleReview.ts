import * as vscode from "vscode";
import { getLastCommitPatch } from "./lastCommitDiff";
import type { StyleReviewOutcome } from "../styleReviewCore";
import { runStyleReviewForDiff, writeStyleReviewOutput } from "../styleReviewCore";

interface GitRepositoryMinimal {
  readonly rootUri: vscode.Uri;
  readonly onDidCommit: (listener: () => unknown) => vscode.Disposable;
}

interface GitApiMinimal {
  readonly repositories: GitRepositoryMinimal[];
  readonly onDidOpenRepository: (listener: (r: GitRepositoryMinimal) => unknown) => vscode.Disposable;
}

/**
 * After each local commit, run style review on the committed patch (requires sign-in + API).
 */
export function registerPostCommitStyleReview(
  context: vscode.ExtensionContext,
  options: {
    onResult: (outcome: StyleReviewOutcome) => void;
  }
): void {
  const runForRepo = async (repo: GitRepositoryMinimal) => {
    const cfg = vscode.workspace.getConfiguration("onbirdie");
    if (!cfg.get<boolean>("styleReviewOnCommit", true)) {
      return;
    }
    const folder = vscode.workspace.getWorkspaceFolder(repo.rootUri);
    const cwd = folder?.uri.fsPath ?? repo.rootUri.fsPath;
    const { diff, error } = await getLastCommitPatch(cwd);
    if (error || !diff.trim()) {
      return;
    }
    const outcome = await runStyleReviewForDiff(context.secrets, diff);
    options.onResult(outcome);
    const ch = vscode.window.createOutputChannel("OnBirdie Style Review");
    writeStyleReviewOutput(outcome, ch);
    if (outcome.ok) {
      const n = outcome.result.issues.length;
      const summary = outcome.result.summary.trim().slice(0, 100);
      if (n > 0) {
        void vscode.window
          .showInformationMessage(
            `OnBirdie: ${n} style issue(s) in last commit. ${summary}`,
            "Show output"
          )
          .then((sel) => {
            if (sel === "Show output") {
              ch.show(true);
            }
          });
      }
    } else {
      void vscode.window.showWarningMessage(
        `OnBirdie style review: ${outcome.error.slice(0, 180)}`
      );
    }
  };

  const wire = (repo: GitRepositoryMinimal) => {
    context.subscriptions.push(
      repo.onDidCommit(() => {
        void runForRepo(repo);
      })
    );
  };

  const setup = (api: GitApiMinimal) => {
    for (const r of api.repositories) {
      wire(r);
    }
    context.subscriptions.push(api.onDidOpenRepository((r) => wire(r)));
  };

  const gitExt = vscode.extensions.getExtension("vscode.git");
  if (!gitExt) {
    return;
  }

  void (async () => {
    try {
      await gitExt.activate();
      const api = (gitExt.exports as { getAPI(version: number): GitApiMinimal }).getAPI(1);
      setup(api);
    } catch {
      /* Git not available */
    }
  })();
}
