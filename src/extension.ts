import * as vscode from "vscode";
import { SidebarProvider } from "./panels/SidebarProvider";

export function activate(context: vscode.ExtensionContext): void {
  const sidebarProvider = new SidebarProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider)
  );
}

export function deactivate(): void {}
