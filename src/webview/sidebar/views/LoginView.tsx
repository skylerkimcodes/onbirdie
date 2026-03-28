import React, { useEffect, useRef, useState } from "react";
import type { MeResponse } from "../../../lib/types";
import {
  requestLogin,
  requestRegister,
  subscribeToExtension,
  type ExtensionToWebviewMessage,
} from "../vscodeBridge";

interface Props {
  onLoggedIn: (me: MeResponse) => void;
}

export const LoginView: React.FC<Props> = ({ onLoggedIn }) => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef<"login" | "register" | null>(null);

  useEffect(() => {
    return subscribeToExtension((msg: ExtensionToWebviewMessage) => {
      if (msg.type === "auth/loginResult" && pendingRef.current === "login") {
        pendingRef.current = null;
        setBusy(false);
        if (msg.payload.ok) {
          onLoggedIn(msg.payload.me);
        } else {
          setError(msg.payload.error);
        }
        return;
      }
      if (msg.type === "auth/registerResult" && pendingRef.current === "register") {
        pendingRef.current = null;
        setBusy(false);
        if (msg.payload.ok) {
          onLoggedIn(msg.payload.me);
        } else {
          setError(msg.payload.error);
        }
      }
    });
  }, [onLoggedIn]);

  const submit = () => {
    setError(undefined);
    const e = email.trim();
    const p = password;
    if (!e || !p) {
      setError("Enter email and password.");
      return;
    }
    if (mode === "register") {
      const code = joinCode.trim();
      if (code.length < 4) {
        setError("Enter your employer join code (from onboarding).");
        return;
      }
      setBusy(true);
      pendingRef.current = "register";
      requestRegister(e, p, code);
    } else {
      setBusy(true);
      pendingRef.current = "login";
      requestLogin(e, p);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.logo}>🐦</div>
      <h1 style={styles.title}>OnBirdie</h1>
      <p style={styles.subtitle}>Your AI onboarding agent</p>

      <div style={styles.tabs}>
        <button
          type="button"
          style={{ ...styles.tab, ...(mode === "login" ? styles.tabActive : {}) }}
          onClick={() => {
            setMode("login");
            setError(undefined);
          }}
        >
          Sign in
        </button>
        <button
          type="button"
          style={{ ...styles.tab, ...(mode === "register" ? styles.tabActive : {}) }}
          onClick={() => {
            setMode("register");
            setError(undefined);
          }}
        >
          Create account
        </button>
      </div>

      <label htmlFor="onbirdie-email" style={styles.label}>Work email</label>
      <input
        id="onbirdie-email"
        style={styles.input}
        type="email"
        autoComplete="email"
        placeholder="you@company.com"
        value={email}
        onChange={(ev) => setEmail(ev.target.value)}
        disabled={busy}
      />

      <label htmlFor="onbirdie-password" style={styles.label}>Password</label>
      <input
        id="onbirdie-password"
        style={styles.input}
        type="password"
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        placeholder={mode === "register" ? "At least 8 characters" : "••••••••"}
        value={password}
        onChange={(ev) => setPassword(ev.target.value)}
        disabled={busy}
      />

      {mode === "register" && (
        <>
          <label htmlFor="onbirdie-joincode" style={styles.label}>Employer join code</label>
          <input
            id="onbirdie-joincode"
            style={styles.input}
            type="text"
            autoComplete="off"
            placeholder="e.g. onbirdie"
            value={joinCode}
            onChange={(ev) => setJoinCode(ev.target.value)}
            disabled={busy}
          />
        </>
      )}

      {error && <p style={styles.error}>{error}</p>}

      <button type="button" style={styles.button} disabled={busy} onClick={submit}>
        {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
      </button>

      <p style={styles.hint}>
        Default dev join code: <strong>onbirdie</strong>. Your employer may share a different code.
      </p>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "flex-start",
    height: "100%",
    padding: "20px 16px",
    gap: "8px",
    textAlign: "left",
    overflowY: "auto",
  },
  logo: {
    fontSize: "40px",
    textAlign: "center",
    marginBottom: "4px",
  },
  title: {
    fontSize: "20px",
    fontWeight: 700,
    color: "var(--vscode-foreground)",
    textAlign: "center",
  },
  subtitle: {
    fontSize: "12px",
    color: "var(--vscode-descriptionForeground)",
    textAlign: "center",
    marginBottom: "12px",
  },
  tabs: {
    display: "flex",
    gap: "4px",
    marginBottom: "8px",
  },
  tab: {
    flex: 1,
    padding: "6px 8px",
    fontSize: "12px",
    borderRadius: "4px",
    border: "1px solid var(--vscode-button-secondaryBackground, #555)",
    background: "transparent",
    color: "var(--vscode-foreground)",
    cursor: "pointer",
    fontFamily: "var(--vscode-font-family)",
  },
  tabActive: {
    background: "var(--vscode-button-background)",
    color: "var(--vscode-button-foreground)",
    borderColor: "var(--vscode-button-background)",
  },
  label: {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--vscode-foreground)",
    marginTop: "4px",
  },
  input: {
    background: "var(--vscode-input-background)",
    color: "var(--vscode-input-foreground)",
    border: "1px solid var(--vscode-input-border, transparent)",
    borderRadius: "4px",
    padding: "8px 10px",
    fontSize: "13px",
    fontFamily: "var(--vscode-font-family)",
    outline: "none",
    width: "100%",
  },
  error: {
    fontSize: "12px",
    color: "var(--vscode-errorForeground, #f14c4c)",
    marginTop: "4px",
  },
  button: {
    marginTop: "12px",
    padding: "10px 16px",
    background: "var(--vscode-button-background)",
    color: "var(--vscode-button-foreground)",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "13px",
    fontFamily: "var(--vscode-font-family)",
    width: "100%",
  },
  hint: {
    fontSize: "11px",
    color: "var(--vscode-descriptionForeground)",
    lineHeight: 1.5,
    marginTop: "12px",
    textAlign: "center",
  },
};
