import * as vscode from "vscode";
import { registerPostCommitStyleReview } from "./git/postCommitStyleReview";
import { registerLiveStyleDiagnostics } from "./liveStyleDiagnostics";
import { SidebarProvider } from "./panels/SidebarProvider";

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel("OnBirdie Style Review");
  context.subscriptions.push(outputChannel);

  const sidebarProvider = new SidebarProvider(context, outputChannel);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("onbirdie.styleReviewStaged", () =>
      sidebarProvider.runStagedStyleReviewFromCommand()
    )
  );
  registerPostCommitStyleReview(context, {
    onResult: (outcome) => sidebarProvider.notifyStyleReviewOutcome(outcome),
    outputChannel,
  });
  registerLiveStyleDiagnostics(context);
}

export function deactivate(): void {}
