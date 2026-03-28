import React, { useState } from "react";

interface Props {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export const CollapsibleSection: React.FC<Props> = ({
  title,
  subtitle,
  defaultOpen = false,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={styles.wrap}>
      <button
        type="button"
        style={styles.toggle}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span style={styles.chevron} aria-hidden>
          {open ? "▼" : "▶"}
        </span>
        <span style={styles.titleBlock}>
          <span style={styles.title}>{title}</span>
          {subtitle ? <span style={styles.subtitle}>{subtitle}</span> : null}
        </span>
      </button>
      {open ? <div style={styles.body}>{children}</div> : null}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    flexShrink: 0,
    borderBottom: "1px solid var(--vscode-sideBarSectionHeader-border, rgba(255,255,255,0.1))",
  },
  toggle: {
    width: "100%",
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    padding: "8px 12px",
    textAlign: "left",
    background: "var(--vscode-sideBarSectionHeader-background, transparent)",
    border: "none",
    cursor: "pointer",
    fontFamily: "var(--vscode-font-family)",
    color: "var(--vscode-foreground)",
  },
  chevron: {
    fontSize: "10px",
    marginTop: "3px",
    color: "var(--vscode-descriptionForeground)",
    flexShrink: 0,
  },
  titleBlock: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  },
  title: {
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  subtitle: {
    fontSize: "10px",
    color: "var(--vscode-descriptionForeground)",
    lineHeight: 1.35,
  },
  body: {
    padding: "0 12px 10px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
};
