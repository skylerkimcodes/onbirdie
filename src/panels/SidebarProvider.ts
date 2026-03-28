import * as vscode from "vscode";
import {
  fetchMe,
  loginWithCredentials,
  registerWithCredentials,
  signOut,
} from "../auth";

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "onbirdie.sidebar";

  constructor(private readonly _context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
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
            const email = p?.email ?? "";
            const password = p?.password ?? "";
            const result = await loginWithCredentials(secrets, email, password);
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
          default:
            break;
        }
      }
    );
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
}

function getNonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
