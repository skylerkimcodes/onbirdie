import React, { useState, useEffect } from "react";
import type { TourStep } from "../../../lib/types";
import { openFilePath, requestTourGenerate, requestTourGoto } from "../vscodeBridge";

interface Props {
  userRole: string;
}

export const TourTab: React.FC<Props> = ({ userRole }) => {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => { void generate(); }, []);

  const generate = async () => {
    setStatus("loading");
    setError(undefined);
    const result = await requestTourGenerate(userRole);
    if (result.ok) {
      setSteps(result.steps);
      setActiveIndex(0);
      setStatus("done");
      if (result.steps.length > 0) {
        const s = result.steps[0];
        if (s.absolutePath) {
          requestTourGoto(s.absolutePath, s.startLine, s.endLine);
        }
      }
    } else {
      setError(result.error);
      setStatus("error");
    }
  };

  const goTo = (index: number) => {
    const s = steps[index];
    if (!s) return;
    setActiveIndex(index);
    if (s.absolutePath) {
      requestTourGoto(s.absolutePath, s.startLine, s.endLine);
    } else {
      openFilePath(s.file);
    }
  };

  if (status === "idle" || status === "error") {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>🗺️</div>
          <div style={styles.emptyTitle}>Codebase Tour</div>
          <p style={styles.emptyDesc}>
            OnBirdie will walk you through the key files and patterns in this codebase.
            {!steps.length && " No workspace open? A sample project will be used instead."}
          </p>
          {status === "error" && error && (
            <p style={styles.errorText}>{error}</p>
          )}
          <button type="button" style={styles.generateBtn} onClick={generate}>
            {status === "error" ? "Try again" : "Generate Tour"}
          </button>
        </div>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>
          <div style={styles.spinner}>⏳</div>
          <p style={styles.emptyDesc}>Analyzing codebase with AI…</p>
        </div>
      </div>
    );
  }

  const current = steps[activeIndex];

  return (
    <div style={styles.container}>
      {/* Step counter + nav */}
      <div style={styles.navBar}>
        <button
          type="button"
          style={{ ...styles.navBtn, opacity: activeIndex === 0 ? 0.3 : 1 }}
          disabled={activeIndex === 0}
          onClick={() => goTo(activeIndex - 1)}
        >
          ‹ Prev
        </button>
        <span style={styles.counter}>
          {activeIndex + 1} / {steps.length}
        </span>
        <button
          type="button"
          style={{ ...styles.navBtn, opacity: activeIndex === steps.length - 1 ? 0.3 : 1 }}
          disabled={activeIndex === steps.length - 1}
          onClick={() => goTo(activeIndex + 1)}
        >
          Next ›
        </button>
      </div>

      {/* Dot indicators */}
      <div style={styles.dots}>
        {steps.map((_, i) => (
          <button
            key={i}
            type="button"
            style={{ ...styles.dot, ...(i === activeIndex ? styles.dotActive : {}) }}
            onClick={() => goTo(i)}
            title={steps[i].title}
          />
        ))}
      </div>

      {/* Current step card */}
      {current && (
        <div style={styles.card}>
          <div style={styles.cardFile}>{current.file}</div>
          <div style={styles.cardLines}>
            Lines {current.startLine}–{current.endLine}
          </div>
          <div style={styles.cardTitle}>{current.title}</div>
          <p style={styles.cardExplanation}>{current.explanation}</p>
          <button
            type="button"
            style={styles.openBtn}
            onClick={() => goTo(activeIndex)}
          >
            Open in editor ↗
          </button>
        </div>
      )}

      {/* Step list */}
      <div style={styles.stepList}>
        {steps.map((s, i) => (
          <button
            key={i}
            type="button"
            style={{
              ...styles.stepItem,
              ...(i === activeIndex ? styles.stepItemActive : {}),
            }}
            onClick={() => goTo(i)}
          >
            <span style={styles.stepNum}>{i + 1}</span>
            <span style={styles.stepTitle}>{s.title}</span>
          </button>
        ))}
      </div>

      {/* Restart */}
      <button type="button" style={styles.restartBtn} onClick={() => setStatus("idle")}>
        ↺ New tour
      </button>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
    padding: "12px",
    gap: "10px",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    padding: "24px 16px",
    textAlign: "center",
  },
  emptyIcon: { fontSize: "32px" },
  spinner: { fontSize: "28px" },
  emptyTitle: {
    fontSize: "14px",
    fontWeight: 700,
    color: "var(--vscode-foreground)",
  },
  emptyDesc: {
    fontSize: "12px",
    color: "var(--vscode-descriptionForeground)",
    lineHeight: 1.5,
    maxWidth: "240px",
  },
  errorText: {
    fontSize: "11px",
    color: "var(--vscode-errorForeground, #f14c4c)",
    maxWidth: "240px",
  },
  generateBtn: {
    marginTop: "8px",
    padding: "8px 20px",
    background: "var(--vscode-button-background)",
    color: "var(--vscode-button-foreground)",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "13px",
    fontFamily: "var(--vscode-font-family)",
  },
  navBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexShrink: 0,
  },
  navBtn: {
    background: "none",
    border: "1px solid var(--vscode-widget-border, rgba(255,255,255,0.12))",
    color: "var(--vscode-foreground)",
    borderRadius: "4px",
    padding: "4px 10px",
    fontSize: "12px",
    cursor: "pointer",
    fontFamily: "var(--vscode-font-family)",
  },
  counter: {
    fontSize: "12px",
    color: "var(--vscode-descriptionForeground)",
  },
  dots: {
    display: "flex",
    gap: "6px",
    justifyContent: "center",
    flexShrink: 0,
  },
  dot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: "var(--vscode-widget-border, rgba(255,255,255,0.2))",
    border: "none",
    cursor: "pointer",
    padding: 0,
  },
  dotActive: {
    background: "var(--vscode-focusBorder, var(--vscode-textLink-foreground))",
  },
  card: {
    background: "var(--vscode-editorWidget-background)",
    border: "1px solid var(--vscode-widget-border, rgba(255,255,255,0.1))",
    borderRadius: "8px",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    flexShrink: 0,
  },
  cardFile: {
    fontSize: "10px",
    color: "var(--vscode-textLink-foreground)",
    fontFamily: "var(--vscode-editor-font-family, monospace)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  cardLines: {
    fontSize: "10px",
    color: "var(--vscode-descriptionForeground)",
  },
  cardTitle: {
    fontSize: "13px",
    fontWeight: 700,
    color: "var(--vscode-foreground)",
  },
  cardExplanation: {
    fontSize: "12px",
    color: "var(--vscode-foreground)",
    lineHeight: 1.6,
    margin: 0,
  },
  openBtn: {
    alignSelf: "flex-start",
    marginTop: "4px",
    background: "none",
    border: "none",
    color: "var(--vscode-textLink-foreground)",
    cursor: "pointer",
    fontSize: "11px",
    padding: 0,
    fontFamily: "var(--vscode-font-family)",
  },
  stepList: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    flexShrink: 0,
  },
  stepItem: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "7px 10px",
    background: "transparent",
    border: "1px solid transparent",
    borderRadius: "6px",
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "var(--vscode-font-family)",
  },
  stepItemActive: {
    background: "var(--vscode-editorWidget-background)",
    border: "1px solid var(--vscode-focusBorder, var(--vscode-textLink-foreground))",
  },
  stepNum: {
    width: "18px",
    height: "18px",
    borderRadius: "50%",
    background: "var(--vscode-button-background)",
    color: "var(--vscode-button-foreground)",
    fontSize: "10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stepTitle: {
    fontSize: "12px",
    color: "var(--vscode-foreground)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  restartBtn: {
    alignSelf: "center",
    background: "none",
    border: "none",
    color: "var(--vscode-descriptionForeground)",
    cursor: "pointer",
    fontSize: "11px",
    fontFamily: "var(--vscode-font-family)",
    marginTop: "4px",
  },
};
