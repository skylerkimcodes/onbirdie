import React, { useEffect, useState } from "react";
import type { EmployerAdminWorkspace } from "../../../lib/types";
import {
  requestEmployerAdminLoadWorkspace,
  requestEmployerAdminLogin,
  requestEmployerAdminLogout,
  requestEmployerAdminSaveWorkspace,
} from "../vscodeBridge";

interface Props {
  onBack: () => void;
}

export const EmployerPortalView: React.FC<Props> = ({ onBack }) => {
  const [phase, setPhase] = useState<"loading" | "login" | "editor">("loading");
  const [identifier, setIdentifier] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [ws, setWs] = useState<EmployerAdminWorkspace | null>(null);
  const [styleGuide, setStyleGuide] = useState("");
  const [roleLines, setRoleLines] = useState("");
  const [cohortsJson, setCohortsJson] = useState("[]");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await requestEmployerAdminLoadWorkspace();
      if (cancelled) {
        return;
      }
      if (res.ok) {
        applyWorkspace(res.data);
        setPhase("editor");
        return;
      }
      if (res.error.includes("Not signed in")) {
        setPhase("login");
        return;
      }
      setError(res.error);
      setPhase("login");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyWorkspace = (data: EmployerAdminWorkspace) => {
    setWs(data);
    setStyleGuide(data.style_guide);
    setRoleLines((data.role_options || []).join("\n"));
    setCohortsJson(JSON.stringify(data.cohorts || [], null, 2));
  };

  const doLogin = async () => {
    setError(undefined);
    setBusy(true);
    try {
      const login = await requestEmployerAdminLogin(identifier.trim(), adminCode);
      if (!login.ok) {
        setError(login.error);
        return;
      }
      const res = await requestEmployerAdminLoadWorkspace();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      applyWorkspace(res.data);
      setPhase("editor");
    } finally {
      setBusy(false);
    }
  };

  const doSave = async () => {
    setError(undefined);
    let cohorts: EmployerAdminWorkspace["cohorts"];
    try {
      cohorts = JSON.parse(cohortsJson) as EmployerAdminWorkspace["cohorts"];
      if (!Array.isArray(cohorts)) {
        throw new Error("Cohorts must be a JSON array.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid cohorts JSON.");
      return;
    }
    setBusy(true);
    try {
      const res = await requestEmployerAdminSaveWorkspace({
        style_guide: styleGuide,
        role_options: roleLines
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        cohorts,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      applyWorkspace(res.data);
    } finally {
      setBusy(false);
    }
  };

  const doLogout = () => {
    requestEmployerAdminLogout();
    setPhase("login");
    setWs(null);
    setAdminCode("");
  };

  if (phase === "loading") {
    return (
      <div style={styles.container}>
        <p style={styles.muted}>Loading employer portal…</p>
      </div>
    );
  }

  if (phase === "login") {
    return (
      <div style={styles.container}>
        <button type="button" style={styles.linkBtn} onClick={onBack}>
          ← Back to sign in
        </button>
        <h2 style={styles.title}>Employer portal</h2>
        <p style={styles.subtitle}>
          Enter your <strong>company identifier</strong> (slug, company join code, or any cohort code) and your{" "}
          <strong>admin code</strong> to edit the team style guide, role list, and per-team join codes.
        </p>
        <label htmlFor="emp-id" style={styles.label}>
          Company identifier
        </label>
        <input
          id="emp-id"
          style={styles.input}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="e.g. onbirdie or ONBD-FE"
          disabled={busy}
          autoComplete="off"
        />
        <label htmlFor="emp-admin" style={styles.label}>
          Admin code
        </label>
        <input
          id="emp-admin"
          style={styles.input}
          type="password"
          value={adminCode}
          onChange={(e) => setAdminCode(e.target.value)}
          placeholder="Admin password"
          disabled={busy}
          autoComplete="off"
        />
        {error && <p style={styles.error}>{error}</p>}
        <button type="button" style={styles.button} disabled={busy} onClick={doLogin}>
          {busy ? "Please wait…" : "Continue"}
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <button type="button" style={styles.linkBtn} onClick={onBack}>
        ← Back to sign in
      </button>
      <h2 style={styles.title}>{ws?.company_name ?? "Company"}</h2>
      <p style={styles.subtitle}>
        Slug: <code style={styles.code}>{ws?.slug}</code> · Company join:{" "}
        <code style={styles.code}>{ws?.join_code}</code>
      </p>
      <p style={styles.muted}>
        Employees register with the <strong>company</strong> join code or a <strong>cohort</strong> code below. Cohort
        codes set default role, tasks, and file hints for that group.
      </p>

      <label htmlFor="emp-style" style={styles.label}>
        Team style guide (markdown)
      </label>
      <textarea
        id="emp-style"
        style={styles.textareaLarge}
        value={styleGuide}
        onChange={(e) => setStyleGuide(e.target.value.slice(0, 500_000))}
        disabled={busy}
        rows={12}
      />

      <label htmlFor="emp-roles" style={styles.label}>
        Role options (one per line)
      </label>
      <textarea
        id="emp-roles"
        style={styles.textarea}
        value={roleLines}
        onChange={(e) => setRoleLines(e.target.value)}
        disabled={busy}
        rows={6}
        placeholder="Frontend Engineer&#10;Backend Engineer"
      />

      <label htmlFor="emp-cohorts" style={styles.label}>
        Cohorts (JSON)
      </label>
      <textarea
        id="emp-cohorts"
        style={styles.textareaLarge}
        value={cohortsJson}
        onChange={(e) => setCohortsJson(e.target.value)}
        disabled={busy}
        rows={14}
        spellCheck={false}
      />
      <p style={styles.muted}>
        Each cohort: <code style={styles.code}>join_code</code>, <code style={styles.code}>label</code>,{" "}
        <code style={styles.code}>default_employee_role</code>, <code style={styles.code}>tasks</code> (array),{" "}
        <code style={styles.code}>highlight_paths</code> (array).
      </p>

      {error && <p style={styles.error}>{error}</p>}

      <div style={styles.row}>
        <button type="button" style={styles.button} disabled={busy} onClick={doSave}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" style={styles.secondary} disabled={busy} onClick={doLogout}>
          Sign out portal
        </button>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "16px",
    height: "100%",
    overflowY: "auto",
    textAlign: "left",
  },
  title: { fontSize: "16px", fontWeight: 700, margin: 0, color: "var(--vscode-foreground)" },
  subtitle: { fontSize: "12px", color: "var(--vscode-descriptionForeground)", margin: 0, lineHeight: 1.45 },
  muted: { fontSize: "11px", color: "var(--vscode-descriptionForeground)", margin: 0, lineHeight: 1.45 },
  label: { fontSize: "11px", fontWeight: 600, color: "var(--vscode-foreground)" },
  input: {
    background: "var(--vscode-input-background)",
    color: "var(--vscode-input-foreground)",
    border: "1px solid var(--vscode-input-border, transparent)",
    borderRadius: "4px",
    padding: "8px 10px",
    fontSize: "13px",
    fontFamily: "var(--vscode-font-family)",
    width: "100%",
  },
  textarea: {
    background: "var(--vscode-input-background)",
    color: "var(--vscode-input-foreground)",
    border: "1px solid var(--vscode-input-border, transparent)",
    borderRadius: "4px",
    padding: "8px 10px",
    fontSize: "12px",
    fontFamily: "var(--vscode-editor-font-family, monospace)",
    width: "100%",
    resize: "vertical",
  },
  textareaLarge: {
    background: "var(--vscode-input-background)",
    color: "var(--vscode-input-foreground)",
    border: "1px solid var(--vscode-input-border, transparent)",
    borderRadius: "4px",
    padding: "8px 10px",
    fontSize: "12px",
    fontFamily: "var(--vscode-editor-font-family, monospace)",
    width: "100%",
    resize: "vertical",
    lineHeight: 1.4,
  },
  button: {
    padding: "8px 16px",
    background: "var(--vscode-button-background)",
    color: "var(--vscode-button-foreground)",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "13px",
    fontFamily: "var(--vscode-font-family)",
  },
  secondary: {
    padding: "8px 16px",
    background: "transparent",
    color: "var(--vscode-foreground)",
    border: "1px solid var(--vscode-widget-border, rgba(255,255,255,0.2))",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "12px",
    fontFamily: "var(--vscode-font-family)",
  },
  row: { display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" },
  linkBtn: {
    alignSelf: "flex-start",
    background: "none",
    border: "none",
    color: "var(--vscode-textLink-foreground)",
    cursor: "pointer",
    fontSize: "12px",
    fontFamily: "var(--vscode-font-family)",
    padding: 0,
  },
  error: { fontSize: "12px", color: "var(--vscode-errorForeground, #f14c4c)", margin: 0 },
  code: { fontFamily: "var(--vscode-editor-font-family, monospace)", fontSize: "11px" },
};
