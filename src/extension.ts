import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext): void {
  const welcome = vscode.commands.registerCommand("onbirdie.welcome", () => {
    void vscode.window.showInformationMessage(
      "OnBirdie — your onboarding copilots will live here. Use the command palette to explore as we add agents."
    );
  });

  context.subscriptions.push(welcome);
}

export function deactivate(): void {}
