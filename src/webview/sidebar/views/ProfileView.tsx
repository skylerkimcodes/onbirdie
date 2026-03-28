import React, { useEffect, useState } from "react";
import type { MeResponse } from "../../../lib/types";
import { uploadResumeToServer } from "../vscodeBridge";

interface Props {
  defaultName?: string;
  employerName?: string;
  roleOptions: string[];
  initial?: Partial<Profile>;
  onComplete: (profile: Profile) => Promise<void>;
  onSignOut?: () => void;
  /** After a server PDF upload, refresh session user (resume text + flags). */
  onMeUpdated?: (me: MeResponse) => void;
  hasResumePdf?: boolean;
  /** True when the API has non-empty resume text (including from a server PDF upload). */
  serverHasResume?: boolean;
}

export interface Profile {
  name: string;
  role: string;
  experience: string;
  linkedinUrl: string;
  resumeText: string;
  skillsSummary: string;
}

const FALLBACK_ROLES = [
  "Frontend Engineer",
  "Backend Engineer",
  "Full Stack Engineer",
  "DevOps / Infra",
  "Mobile Engineer",
  "Data Engineer",
  "Other",
];

const EXPERIENCE = ["< 1 year", "1–3 years", "3–5 years", "5+ years"];

export const ProfileView: React.FC<Props> = ({
  defaultName = "",
  employerName,
  roleOptions,
  initial,
  onComplete,
  onSignOut,
  onMeUpdated,
  hasResumePdf = false,
  serverHasResume = false,
}) => {
  const [name, setName] = useState(initial?.name ?? defaultName);
  const [role, setRole] = useState(initial?.role ?? "");
  const [experience, setExperience] = useState(initial?.experience ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(initial?.linkedinUrl ?? "");
  const [resumeText, setResumeText] = useState(initial?.resumeText ?? "");
  const [skillsSummary, setSkillsSummary] = useState(initial?.skillsSummary ?? "");
  const [saving, setSaving] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [error, setError] = useState<string | undefined>();
  /** True after a successful server PDF upload in this session (parent `me` may lag). */
  const [resumeUploadedServer, setResumeUploadedServer] = useState(
    () => Boolean(serverHasResume || hasResumePdf)
  );

  useEffect(() => {
    setResumeUploadedServer(Boolean(serverHasResume || hasResumePdf));
  }, [serverHasResume, hasResumePdf]);

  const roles = roleOptions.length > 0 ? roleOptions : FALLBACK_ROLES;
  const hasLinkedIn = linkedinUrl.trim().length > 0;
  const hasResumeLocal = resumeText.trim().length > 0;
  const hasResume =
    hasResumeLocal || resumeUploadedServer || Boolean(serverHasResume) || Boolean(hasResumePdf);
  const hasBackground = hasLinkedIn || hasResume;
  const canSubmit = Boolean(name.trim() && role && experience && hasBackground);

  const onUploadPdfServer = async () => {
    setError(undefined);
    setUploadingPdf(true);
    try {
      const result = await uploadResumeToServer();
      if ("cancelled" in result && result.cancelled) {
        return;
      }
      if ("ok" in result && !result.ok) {
        setError(result.error);
        return;
      }
      if ("ok" in result && result.ok) {
        onMeUpdated?.(result.me);
      }
    } finally {
      setUploadingPdf(false);
    }
  };

  const submit = async () => {
    if (!canSubmit || saving) {
      return;
    }
    setError(undefined);
    setSaving(true);
    try {
      await onComplete({
        name: name.trim(),
        role,
        experience,
        linkedinUrl: linkedinUrl.trim(),
        resumeText,
        skillsSummary: skillsSummary.trim(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerTop}>
          <span style={styles.step}>Your profile</span>
          {onSignOut && (
            <button type="button" style={styles.linkBtn} onClick={onSignOut}>
              Sign out
            </button>
          )}
        </div>
        <h2 style={styles.title}>Tell us about yourself</h2>
        <p style={styles.subtitle}>
          {employerName
            ? `Signed in with ${employerName}. We use this to tailor onboarding and highlight the right parts of your workspace.`
            : "We use this to tailor onboarding and highlight the right parts of your workspace."}
        </p>
      </div>

      <div style={styles.form}>
        <label htmlFor="onbirdie-name" style={styles.label}>Your name</label>
        <input
          id="onbirdie-name"
          style={styles.input}
          type="text"
          placeholder="e.g. Alex"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={saving}
        />

        <label style={styles.label}>Your role</label>
        <div style={styles.chips}>
          {roles.map((r) => (
            <button
              key={r}
              type="button"
              style={{ ...styles.chip, ...(role === r ? styles.chipActive : {}) }}
              onClick={() => setRole(r)}
              disabled={saving}
            >
              {r}
            </button>
          ))}
        </div>

        <label style={styles.label}>Years of experience</label>
        <div style={styles.chips}>
          {EXPERIENCE.map((ex) => (
            <button
              key={ex}
              type="button"
              style={{ ...styles.chip, ...(experience === ex ? styles.chipActive : {}) }}
              onClick={() => setExperience(ex)}
              disabled={saving}
            >
              {ex}
            </button>
          ))}
        </div>

        <label style={styles.label}>LinkedIn or resume</label>
        <p style={styles.hint}>
          Add <strong>either</strong> your LinkedIn URL, <strong>paste</strong> resume text below, or{" "}
          <strong>upload a PDF</strong> to the server (we extract text for your profile).
        </p>
        <label htmlFor="onbirdie-linkedin" style={styles.subLabel}>LinkedIn profile URL</label>
        <input
          id="onbirdie-linkedin"
          style={styles.input}
          type="url"
          placeholder="https://www.linkedin.com/in/…"
          value={linkedinUrl}
          onChange={(e) => setLinkedinUrl(e.target.value)}
          disabled={saving}
        />

        <label style={styles.subLabel}>Resume (paste or upload PDF)</label>
        <div style={styles.resumeRow}>
          <button
            type="button"
            style={styles.secondaryBtn}
            onClick={onUploadPdfServer}
            disabled={saving || uploadingPdf}
            title="Stores the PDF on your account and extracts text on the server (up to 5 MB)"
          >
            {uploadingPdf ? "Uploading…" : "Upload PDF to server…"}
          </button>
          {resumeText.trim() ? (
            <span style={styles.resumeMeta}>{resumeText.length.toLocaleString()} characters</span>
          ) : null}
          {(resumeUploadedServer || hasResumePdf || serverHasResume) && !hasResumeLocal ? (
            <span style={styles.resumeMeta}>Resume on file</span>
          ) : null}
        </div>
        <textarea
          style={styles.textarea}
          placeholder="Or paste resume text here (optional if LinkedIn is filled in)"
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value.slice(0, 100_000))}
          disabled={saving}
          rows={5}
        />

        <label style={styles.label}>Skills & highlights (optional)</label>
        <textarea
          style={styles.textarea}
          placeholder="e.g. TypeScript, React, distributed systems — comma or short bullets"
          value={skillsSummary}
          onChange={(e) => setSkillsSummary(e.target.value.slice(0, 4000))}
          disabled={saving}
          rows={3}
        />
      </div>

      {error && <p style={styles.error}>{error}</p>}

      <button
        type="button"
        style={{ ...styles.button, opacity: canSubmit && !saving ? 1 : 0.4 }}
        disabled={!canSubmit || saving}
        onClick={submit}
      >
        {saving ? "Saving…" : "Continue →"}
      </button>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    padding: "20px 16px",
    gap: "16px",
    overflowY: "auto",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  headerTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
  },
  linkBtn: {
    fontSize: "11px",
    color: "var(--vscode-textLink-foreground)",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontFamily: "var(--vscode-font-family)",
    padding: "0",
  },
  step: {
    fontSize: "11px",
    color: "var(--vscode-descriptionForeground)",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  title: {
    fontSize: "16px",
    fontWeight: 700,
    color: "var(--vscode-foreground)",
  },
  subtitle: {
    fontSize: "12px",
    color: "var(--vscode-descriptionForeground)",
    lineHeight: "1.5",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    flex: 1,
  },
  label: {
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--vscode-foreground)",
    marginTop: "4px",
  },
  subLabel: {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--vscode-descriptionForeground)",
    marginTop: "2px",
  },
  hint: {
    fontSize: "11px",
    color: "var(--vscode-descriptionForeground)",
    lineHeight: 1.45,
    margin: "0 0 4px 0",
  },
  input: {
    background: "var(--vscode-input-background)",
    color: "var(--vscode-input-foreground)",
    border: "1px solid var(--vscode-input-border, transparent)",
    borderRadius: "4px",
    padding: "6px 10px",
    fontSize: "13px",
    fontFamily: "var(--vscode-font-family)",
    outline: "none",
    width: "100%",
  },
  textarea: {
    background: "var(--vscode-input-background)",
    color: "var(--vscode-input-foreground)",
    border: "1px solid var(--vscode-input-border, transparent)",
    borderRadius: "4px",
    padding: "8px 10px",
    fontSize: "12px",
    fontFamily: "var(--vscode-font-family)",
    outline: "none",
    width: "100%",
    resize: "vertical",
    lineHeight: 1.45,
  },
  resumeRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
  },
  secondaryBtn: {
    padding: "5px 12px",
    fontSize: "12px",
    borderRadius: "4px",
    border: "1px solid var(--vscode-button-secondaryBackground, #555)",
    background: "transparent",
    color: "var(--vscode-foreground)",
    cursor: "pointer",
    fontFamily: "var(--vscode-font-family)",
  },
  resumeMeta: {
    fontSize: "11px",
    color: "var(--vscode-descriptionForeground)",
  },
  chips: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
  },
  chip: {
    padding: "4px 10px",
    borderRadius: "12px",
    border: "1px solid var(--vscode-button-secondaryBackground, #555)",
    background: "transparent",
    color: "var(--vscode-foreground)",
    fontSize: "11px",
    cursor: "pointer",
    fontFamily: "var(--vscode-font-family)",
  },
  chipActive: {
    background: "var(--vscode-button-background)",
    color: "var(--vscode-button-foreground)",
    border: "1px solid var(--vscode-button-background)",
  },
  button: {
    padding: "8px 20px",
    background: "var(--vscode-button-background)",
    color: "var(--vscode-button-foreground)",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "13px",
    fontFamily: "var(--vscode-font-family)",
    width: "100%",
  },
  error: {
    fontSize: "12px",
    color: "var(--vscode-errorForeground, #f14c4c)",
    margin: "0",
  },
};
