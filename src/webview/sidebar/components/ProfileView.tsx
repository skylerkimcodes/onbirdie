import React, { useState } from "react";

interface Props {
  onComplete: (profile: Profile) => void;
}

export interface Profile {
  name: string;
  role: string;
  experience: string;
}

const ROLES = ["Frontend Engineer", "Backend Engineer", "Full Stack Engineer", "DevOps / Infra", "Mobile Engineer", "Data Engineer", "Other"];
const EXPERIENCE = ["< 1 year", "1–3 years", "3–5 years", "5+ years"];

export const ProfileView: React.FC<Props> = ({ onComplete }) => {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [experience, setExperience] = useState("");

  const canSubmit = name.trim() && role && experience;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.step}>Step 1 of 2</span>
        <h2 style={styles.title}>Tell us about yourself</h2>
        <p style={styles.subtitle}>
          OnBirdie uses this to personalize your onboarding experience.
        </p>
      </div>

      <div style={styles.form}>
        <label style={styles.label}>Your name</label>
        <input
          style={styles.input}
          type="text"
          placeholder="e.g. Alex"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <label style={styles.label}>Your role</label>
        <div style={styles.chips}>
          {ROLES.map((r) => (
            <button
              key={r}
              style={{ ...styles.chip, ...(role === r ? styles.chipActive : {}) }}
              onClick={() => setRole(r)}
            >
              {r}
            </button>
          ))}
        </div>

        <label style={styles.label}>Years of experience</label>
        <div style={styles.chips}>
          {EXPERIENCE.map((e) => (
            <button
              key={e}
              style={{ ...styles.chip, ...(experience === e ? styles.chipActive : {}) }}
              onClick={() => setExperience(e)}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      <button
        style={{ ...styles.button, opacity: canSubmit ? 1 : 0.4 }}
        disabled={!canSubmit}
        onClick={() => onComplete({ name: name.trim(), role, experience })}
      >
        Continue →
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
};
