import React from "react";

interface Props {
  onLogin: () => void;
}

export const LoginView: React.FC<Props> = ({ onLogin }) => {
  return (
    <div style={styles.container}>
      <div style={styles.logo}>🐦</div>
      <h1 style={styles.title}>OnBirdie</h1>
      <p style={styles.subtitle}>Your AI onboarding agent</p>
      <p style={styles.description}>
        Get up to speed with your new codebase faster. OnBirdie guides you through the
        codebase, answers questions, and tracks your onboarding progress.
      </p>
      <button style={styles.button} onClick={onLogin}>
        Sign in to get started
      </button>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    padding: "24px",
    gap: "12px",
    textAlign: "center",
  },
  logo: {
    fontSize: "48px",
    marginBottom: "4px",
  },
  title: {
    fontSize: "22px",
    fontWeight: 700,
    color: "var(--vscode-foreground)",
  },
  subtitle: {
    fontSize: "13px",
    color: "var(--vscode-descriptionForeground)",
    marginTop: "-4px",
  },
  description: {
    fontSize: "12px",
    color: "var(--vscode-descriptionForeground)",
    lineHeight: "1.6",
    maxWidth: "260px",
    marginTop: "8px",
  },
  button: {
    marginTop: "16px",
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
