import React from "react";
import type { StyleReviewOutcome } from "../../../lib/types";

export interface StyleReviewTabProps {
  busy: boolean;
  outcome: StyleReviewOutcome | null;
  onRun: () => void;
}

export function StyleReviewTab({ busy, outcome, onRun }: StyleReviewTabProps): React.ReactElement {
  return (
    <div style={styles.root}>
      <p style={styles.lead}>
        Compare <strong>staged changes</strong> to your style guide. Stage files in Source Control first, then run a
        review.
      </p>
      <button
        type="button"
        style={{ ...styles.primary, opacity: busy ? 0.65 : 1 }}
        onClick={onRun}
        disabled={busy}
      >
        {busy ? "Reviewing…" : "Run style review"}
      </button>

      {(busy || outcome) && (
        <div style={styles.resultWrap}>
          {busy && <p style={styles.busyText}>Reading staged diff and checking the guide…</p>}
          {outcome && !busy && <StyleReviewBlock outcome={outcome} />}
        </div>
      )}
    </div>
  );
}

function severityColor(sev: string): string {
  if (sev === "error") return "var(--vscode-errorForeground, #f14c4c)";
  if (sev === "warning") return "var(--vscode-editorWarning-foreground, #cca700)";
  return "var(--vscode-textLink-foreground)";
}

const StyleReviewBlock: React.FC<{ outcome: StyleReviewOutcome }> = ({ outcome }) => {
  if (!outcome.ok) {
    return <p style={styles.err}>{outcome.error}</p>;
  }
  const { result } = outcome;
  return (
    <div style={styles.blockInner}>
      <p style={styles.summary}>{result.summary}</p>
      {result.tier_used && (
        <p style={styles.tier}>
          Review tier: {result.tier_used === "lava_light" ? "light (Lava)" : "K2"}
        </p>
      )}
      {result.issues.length === 0 ? (
        <p style={styles.muted}>No issues reported against the style guide.</p>
      ) : (
        <ul style={styles.issueList}>
          {result.issues.map((it, idx) => (
            <li key={idx} style={styles.issueItem}>
              <div style={styles.issueHeader}>
                <span style={{ ...styles.issueSeverity, color: severityColor(it.severity) }}>
                  {it.severity}
                </span>
                {(it.file_path || it.line_hint) && (
                  <span style={styles.issueFile}>
                    {[it.file_path, it.line_hint].filter(Boolean).join(" · ")}
                  </span>
                )}
              </div>
              <div style={styles.issueGuide}>
                <span style={styles.issueGuideLabel}>From the guide: </span>
                {it.guide_quote}
              </div>
              <p style={styles.issueBody}>{it.explanation}</p>
              <p style={styles.issueSuggest}>
                <span style={styles.issueGuideLabel}>Try: </span>
                {it.suggestion}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    padding: "12px",
    gap: "12px",
    overflow: "hidden",
  },
  lead: {
    margin: 0,
    fontSize: "11px",
    lineHeight: 1.55,
    color: "var(--vscode-descriptionForeground)",
  },
  primary: {
    alignSelf: "flex-start",
    padding: "7px 14px",
    fontSize: "11px",
    fontWeight: 600,
    borderRadius: "6px",
    border: "none",
    background: "var(--vscode-button-background)",
    color: "var(--vscode-button-foreground)",
    cursor: "pointer",
    fontFamily: "var(--vscode-font-family)",
  },
  resultWrap: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "10px 10px 12px",
    borderRadius: "6px",
    border: "1px solid var(--vscode-widget-border, rgba(255,255,255,0.1))",
    background: "var(--vscode-editor-background)",
  },
  busyText: {
    margin: 0,
    fontSize: "12px",
    color: "var(--vscode-descriptionForeground)",
    lineHeight: 1.5,
  },
  err: {
    margin: 0,
    fontSize: "12px",
    color: "var(--vscode-errorForeground, #f14c4c)",
    lineHeight: 1.5,
  },
  blockInner: { display: "flex", flexDirection: "column", gap: "8px" },
  summary: {
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--vscode-foreground)",
    lineHeight: 1.5,
    margin: 0,
  },
  tier: {
    fontSize: "10px",
    color: "var(--vscode-descriptionForeground)",
    margin: 0,
  },
  muted: {
    fontSize: "11px",
    color: "var(--vscode-descriptionForeground)",
    marginTop: "6px",
    marginBottom: 0,
  },
  issueList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  issueItem: {
    border: "1px solid var(--vscode-widget-border, rgba(255,255,255,0.1))",
    borderRadius: "8px",
    padding: "8px 10px",
    background: "var(--vscode-sideBar-background)",
  },
  issueHeader: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "8px",
    marginBottom: "4px",
  },
  issueSeverity: {
    fontSize: "10px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  issueFile: {
    fontSize: "10px",
    color: "var(--vscode-descriptionForeground)",
    fontFamily: "var(--vscode-editor-font-family, monospace)",
  },
  issueGuide: {
    fontSize: "11px",
    color: "var(--vscode-textPreformat-foreground, var(--vscode-foreground))",
    fontStyle: "italic",
    lineHeight: 1.45,
    marginBottom: "4px",
  },
  issueGuideLabel: {
    fontStyle: "normal",
    fontWeight: 600,
    color: "var(--vscode-descriptionForeground)",
  },
  issueBody: {
    fontSize: "11px",
    color: "var(--vscode-foreground)",
    lineHeight: 1.5,
    margin: 0,
  },
  issueSuggest: {
    fontSize: "11px",
    color: "var(--vscode-foreground)",
    lineHeight: 1.5,
    margin: "6px 0 0 0",
  },
};
