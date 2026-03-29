import React from "react";
import type { StyleReviewOutcome } from "../../../lib/types";
import { OB_EASE } from "../motion";

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

function severityTintBg(sev: string): string {
  if (sev === "error") {
    return "color-mix(in srgb, var(--vscode-errorForeground, #f14c4c) 14%, transparent)";
  }
  if (sev === "warning") {
    return "color-mix(in srgb, var(--vscode-editorWarning-foreground, #cca700) 14%, transparent)";
  }
  return "color-mix(in srgb, var(--vscode-textLink-foreground) 12%, transparent)";
}

/** Surface file path, optional line, and hint as the primary “where” row. */
function formatIssueLocation(it: {
  file_path?: string | null;
  line_start?: number | null;
  line_hint?: string | null;
}): string {
  const parts: string[] = [];
  if (it.file_path) {
    parts.push(it.file_path);
  }
  if (it.line_start != null && it.line_start > 0) {
    parts.push(`line ${it.line_start}`);
  }
  if (it.line_hint) {
    parts.push(it.line_hint);
  }
  return parts.join(" · ");
}

/** Emphasize quoted snippets in model text (e.g. error message strings). */
function highlightQuotedText(text: string): React.ReactNode {
  const segments = text.split(/('[^']*'|"[^"]*")/g);
  return segments.map((seg, i) => {
    const q =
      (seg.startsWith("'") && seg.endsWith("'")) || (seg.startsWith('"') && seg.endsWith('"'));
    if (q && seg.length > 1) {
      return (
        <mark key={i} style={styles.quoteHighlight}>
          {seg}
        </mark>
      );
    }
    return <React.Fragment key={i}>{seg}</React.Fragment>;
  });
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
          {result.issues.map((it, idx) => {
            const loc = formatIssueLocation(it);
            const sevColor = severityColor(it.severity);
            const tint = severityTintBg(it.severity);
            return (
              <li
                key={idx}
                style={{
                  ...styles.issueItem,
                  borderLeftColor: sevColor,
                }}
              >
                <div
                  style={{
                    ...styles.issueLocationBar,
                    background: tint,
                    borderColor: `color-mix(in srgb, ${sevColor} 35%, transparent)`,
                  }}
                >
                  <span style={{ ...styles.issueSeverity, color: sevColor }}>{it.severity}</span>
                  {loc ? (
                    <span style={styles.issueFile} title={loc}>
                      {loc}
                    </span>
                  ) : null}
                </div>
                <div style={styles.issueGuide}>
                  <span style={styles.issueGuideLabel}>From the guide: </span>
                  {it.guide_quote}
                </div>
                <p style={styles.issueBody}>{highlightQuotedText(it.explanation)}</p>
                <p style={styles.issueSuggest}>
                  <span style={styles.issueGuideLabel}>Try: </span>
                  {highlightQuotedText(it.suggestion)}
                </p>
              </li>
            );
          })}
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
    padding: "8px 12px 12px",
    gap: "10px",
    overflow: "hidden",
    animation: `ob-fade-in 0.4s ${OB_EASE}`,
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
    transition: `opacity 0.22s ${OB_EASE}, transform 0.18s ${OB_EASE}`,
  },
  resultWrap: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "8px 12px 12px",
    borderRadius: "6px",
    border: "1px solid var(--vscode-widget-border, rgba(255,255,255,0.1))",
    background: "var(--vscode-editor-background)",
    animation: `ob-panel-in 0.45s ${OB_EASE}`,
    transition: `border-color 0.25s ${OB_EASE}`,
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
    borderLeftWidth: "4px",
    borderLeftColor: "var(--vscode-focusBorder)",
    borderRadius: "8px",
    padding: "0",
    overflow: "hidden",
    background: "var(--vscode-sideBar-background)",
    animation: `ob-msg-in 0.38s ${OB_EASE}`,
    transition: `border-color 0.25s ${OB_EASE}, box-shadow 0.25s ${OB_EASE}`,
  },
  issueLocationBar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "10px",
    padding: "8px 12px",
    margin: 0,
    borderBottom: "1px solid",
    borderBottomColor: "var(--vscode-widget-border, rgba(255,255,255,0.08))",
    transition: `background 0.28s ${OB_EASE}, border-color 0.28s ${OB_EASE}`,
  },
  issueSeverity: {
    fontSize: "10px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    flexShrink: 0,
  },
  issueFile: {
    fontSize: "10px",
    color: "var(--vscode-foreground)",
    fontFamily: "var(--vscode-editor-font-family, monospace)",
    fontWeight: 500,
    lineHeight: 1.35,
    minWidth: 0,
    wordBreak: "break-word",
  },
  quoteHighlight: {
    backgroundColor: "var(--vscode-editor-findMatchHighlightBackground, rgba(255, 200, 0, 0.35))",
    color: "var(--vscode-foreground)",
    padding: "0 2px",
    borderRadius: "3px",
    fontFamily: "var(--vscode-editor-font-family, monospace)",
    fontSize: "0.95em",
  },
  issueGuide: {
    fontSize: "11px",
    color: "var(--vscode-textPreformat-foreground, var(--vscode-foreground))",
    fontStyle: "italic",
    lineHeight: 1.45,
    margin: "0",
    padding: "8px 12px 4px",
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
    padding: "0 12px",
  },
  issueSuggest: {
    fontSize: "11px",
    color: "var(--vscode-foreground)",
    lineHeight: 1.5,
    margin: 0,
    padding: "6px 12px 10px",
  },
};
