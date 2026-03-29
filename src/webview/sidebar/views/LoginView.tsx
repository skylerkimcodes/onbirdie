import React, { useEffect, useRef, useState } from "react";
import { OB_EASE } from "../motion";
import type { MeResponse } from "../../../lib/types";
import {
  requestLogin,
  requestRegister,
  subscribeToExtension,
  type ExtensionToWebviewMessage,
} from "../vscodeBridge";
import { EmployerPortalView } from "./EmployerPortalView";

interface Props {
  onLoggedIn: (me: MeResponse) => void;
}

export const LoginView: React.FC<Props> = ({ onLoggedIn }) => {
  /** Top-level: employee sign-in vs employer admin portal */
  const [topTab, setTopTab] = useState<"user" | "admin">("user");
  /** Under Sign in: login form vs registration */
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef<"login" | "register" | null>(null);
  const busyDeadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearBusyDeadline = () => {
    if (busyDeadlineRef.current !== null) {
      clearTimeout(busyDeadlineRef.current);
      busyDeadlineRef.current = null;
    }
  };

  const onLoggedInRef = useRef(onLoggedIn);
  onLoggedInRef.current = onLoggedIn;

  useEffect(() => {
    return subscribeToExtension((msg: ExtensionToWebviewMessage) => {
      if (msg.type === "auth/loginResult" && pendingRef.current === "login") {
        pendingRef.current = null;
        clearBusyDeadline();
        setBusy(false);
        if (msg.payload.ok) {
          onLoggedInRef.current(msg.payload.me);
        } else {
          setError(msg.payload.error);
        }
        return;
      }
      if (msg.type === "auth/registerResult" && pendingRef.current === "register") {
        pendingRef.current = null;
        clearBusyDeadline();
        setBusy(false);
        if (msg.payload.ok) {
          onLoggedInRef.current(msg.payload.me);
        } else {
          setError(msg.payload.error);
        }
      }
    });
  }, []);

  useEffect(() => {
    return () => clearBusyDeadline();
  }, []);

  const submit = () => {
    setError(undefined);
    const e = email.trim();
    const p = password;
    if (!e || !p) {
      setError("Enter email and password.");
      return;
    }
    if (authMode === "register") {
      const code = joinCode.trim();
      if (code.length < 4) {
        setError("Enter your employer join code (from onboarding).");
        return;
      }
      clearBusyDeadline();
      busyDeadlineRef.current = setTimeout(() => {
        busyDeadlineRef.current = null;
        if (pendingRef.current === "register") {
          pendingRef.current = null;
          setBusy(false);
          setError("No response from the extension. Try again or reload the window.");
        }
      }, 45_000);
      setBusy(true);
      pendingRef.current = "register";
      requestRegister(e, p, code);
    } else {
      clearBusyDeadline();
      busyDeadlineRef.current = setTimeout(() => {
        busyDeadlineRef.current = null;
        if (pendingRef.current === "login") {
          pendingRef.current = null;
          setBusy(false);
          setError("No response from the extension. Try again or reload the window.");
        }
      }, 45_000);
      setBusy(true);
      pendingRef.current = "login";
      requestLogin(e, p);
    }
  };

  if (topTab === "admin") {
    return <EmployerPortalView onBack={() => setTopTab("user")} />;
  }

  return (
    <div style={styles.container}>
      <div style={styles.logo} aria-hidden>
        🐦
      </div>
      <h1 style={styles.title}>OnBirdie</h1>
      <p style={styles.subtitle}>Your AI onboarding agent</p>

      <div style={styles.tabs}>
        <button
          type="button"
          style={{ ...styles.tab, ...styles.tabActive }}
          onClick={() => {
            setError(undefined);
          }}
        >
          Sign in
        </button>
        <button
          type="button"
          style={styles.tab}
          onClick={() => {
            setTopTab("admin");
            setError(undefined);
          }}
        >
          Admin sign in
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
        autoComplete={authMode === "login" ? "current-password" : "new-password"}
        placeholder={authMode === "register" ? "At least 8 characters" : "••••••••"}
        value={password}
        onChange={(ev) => setPassword(ev.target.value)}
        disabled={busy}
      />

      {authMode === "register" && (
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
        {busy ? "Please wait…" : authMode === "login" ? "Sign in" : "Create account"}
      </button>

      <div style={styles.authModeRow}>
        {authMode === "login" ? (
          <button
            type="button"
            style={styles.linkBtn}
            onClick={() => {
              setAuthMode("register");
              setError(undefined);
            }}
          >
            Create account
          </button>
        ) : (
          <button
            type="button"
            style={styles.linkBtn}
            onClick={() => {
              setAuthMode("login");
              setError(undefined);
            }}
          >
            Back to sign in
          </button>
        )}
      </div>

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
    animation: `ob-fade-in 0.45s ${OB_EASE}`,
  },
  logo: {
    fontSize: "40px",
    textAlign: "center",
    marginBottom: "4px",
    animation: `ob-msg-in 0.5s ${OB_EASE}`,
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
    marginBottom: "4px",
  },
  authModeRow: {
    display: "flex",
    justifyContent: "center",
    marginTop: "4px",
    minHeight: "22px",
  },
  linkBtn: {
    background: "none",
    border: "none",
    padding: "2px 4px",
    fontSize: "12px",
    color: "var(--vscode-textLink-foreground)",
    cursor: "pointer",
    fontFamily: "var(--vscode-font-family)",
    textDecoration: "underline",
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
    transform: "scale(1)",
    transition: `background 0.24s ${OB_EASE}, color 0.24s ${OB_EASE}, border-color 0.24s ${OB_EASE}, transform 0.18s ${OB_EASE}`,
  },
  tabActive: {
    background: "var(--vscode-button-background)",
    color: "var(--vscode-button-foreground)",
    borderColor: "var(--vscode-button-background)",
    transform: "scale(1.01)",
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
    transition: `border-color 0.22s ${OB_EASE}, box-shadow 0.22s ${OB_EASE}`,
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
    transition: `opacity 0.22s ${OB_EASE}, transform 0.18s ${OB_EASE}`,
  },
  hint: {
    fontSize: "11px",
    color: "var(--vscode-descriptionForeground)",
    lineHeight: 1.5,
    marginTop: "12px",
    textAlign: "center",
  },
};
