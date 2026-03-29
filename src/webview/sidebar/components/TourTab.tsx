import React, { useState, useEffect, useRef, useCallback } from "react";
import type { TourStep } from "../../../lib/types";
import { openFilePath, requestTourGenerate, requestTourGoto } from "../vscodeBridge";

/** Delay between automatic step advances (startup walkthrough). */
const AUTO_ADVANCE_MS = 3_500;

interface Props {
  userRole: string;
  /** False when another sidebar tab is selected — avoids background auto-advance opening files. */
  isActive: boolean;
}

export const TourTab: React.FC<Props> = ({ userRole, isActive }) => {
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState<string | undefined>();

  const stepsRef = useRef<TourStep[]>([]);
  stepsRef.current = steps;

  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearAutoAdvance = useCallback(() => {
    if (autoTimerRef.current !== null) {
      clearInterval(autoTimerRef.current);
      autoTimerRef.current = null;
    }
  }, []);

  const goTo = useCallback(
    (index: number, fromUser?: boolean) => {
      if (fromUser) {
        clearAutoAdvance();
      }
      const list = stepsRef.current;
      const s = list[index];
      if (!s) {
        return;
      }
      setActiveIndex(index);
      if (s.absolutePath) {
        requestTourGoto(s.absolutePath, s.startLine, s.endLine);
      } else {
        openFilePath(s.file);
      }
    },
    [clearAutoAdvance]
  );

  const runTour = useCallback(
    async (force: boolean) => {
      clearAutoAdvance();
      setStatus("loading");
      setError(undefined);
      const result = await requestTourGenerate(userRole, { force });
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
    },
    [userRole, clearAutoAdvance]
  );

  /** Fresh tour on every mount / role change (force bypasses workspace cache). */
  useEffect(() => {
    void runTour(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only re-run when role changes
  }, [userRole]);

  /** Slowly advance through steps on each successful load. */
  useEffect(() => {
    if (status !== "done" || steps.length <= 1) {
      return;
    }
    const id = window.setInterval(() => {
      setActiveIndex((prev) => {
        const list = stepsRef.current;
        if (list.length === 0) {
          return prev;
        }
        if (prev >= list.length - 1) {
          if (autoTimerRef.current !== null) {
            clearInterval(autoTimerRef.current);
            autoTimerRef.current = null;
          }
          return prev;
        }
        const next = prev + 1;
        const s = list[next];
        if (s?.absolutePath) {
          requestTourGoto(s.absolutePath, s.startLine, s.endLine);
        } else if (s) {
          openFilePath(s.file);
        }
        return next;
      });
    }, AUTO_ADVANCE_MS);
    autoTimerRef.current = id;
    return () => {
      clearInterval(id);
      if (autoTimerRef.current === id) {
        autoTimerRef.current = null;
      }
    };
  }, [status, steps.length, isActive, clearAutoAdvance]);

  if (status === "error") {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>🗺️</div>
          <div style={styles.emptyTitle}>Codebase Tour</div>
          <p style={styles.emptyDesc}>
            OnBirdie will walk you through the key files and patterns in this codebase.
            {!steps.length && " No workspace open? A sample project will be used instead."}
          </p>
          {error && <p style={styles.errorText}>{error}</p>}
          <button type="button" style={styles.generateBtn} onClick={() => void runTour(true)}>
            Try again
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
      <style>
        {`
          @keyframes onbirdieTourCardIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}
      </style>
      <div style={styles.tourBody}>
        {/* Dot indicators */}
        <div style={styles.dots}>
          {steps.map((_, i) => (
            <button
              key={i}
              type="button"
              style={{ ...styles.dot, ...(i === activeIndex ? styles.dotActive : {}) }}
              onClick={() => goTo(i, true)}
              title={steps[i].title}
              aria-label={`Go to step ${i + 1}: ${steps[i].title}`}
            />
          ))}
        </div>

        {/* Current step card */}
        {current && (
          <div key={activeIndex} style={styles.card}>
            <div style={styles.cardFile}>{current.file}</div>
            <div style={styles.cardLines}>
              Lines {current.startLine}–{current.endLine}
            </div>
            <div style={styles.cardTitle}>{current.title}</div>
            <p style={styles.cardExplanation}>{current.explanation}</p>
            <button type="button" style={styles.openBtn} onClick={() => goTo(activeIndex)}>
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
              onClick={() => goTo(i, true)}
            >
              <span style={styles.stepNum}>{i + 1}</span>
              <span style={styles.stepTitle}>{s.title}</span>
            </button>
          ))}
        </div>

        {/* Restart */}
        <button
          type="button"
          style={styles.restartBtn}
          onClick={() => {
            void runTour(true);
          }}
        >
          ↺ New tour
        </button>
      </div>

      {/* Step counter + nav — pinned to bottom of tour panel */}
      <div style={styles.navBar}>
        <button
          type="button"
          style={{ ...styles.navBtn, opacity: activeIndex === 0 ? 0.3 : 1 }}
          disabled={activeIndex === 0}
          onClick={() => goTo(activeIndex - 1, true)}
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
          onClick={() => goTo(activeIndex + 1, true)}
        >
          Next ›
        </button>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    padding: "8px 6px 12px",
    boxSizing: "border-box",
  },
  tourBody: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    overflowX: "hidden",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    paddingBottom: "6px",
    boxSizing: "border-box",
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
    minWidth: 0,
    gap: "4px",
    paddingTop: "8px",
    marginTop: "6px",
    borderTop: "1px solid var(--vscode-widget-border, rgba(255,255,255,0.12))",
  },
  navBtn: {
    background: "none",
    border: "1px solid var(--vscode-widget-border, rgba(255,255,255,0.12))",
    color: "var(--vscode-foreground)",
    borderRadius: "4px",
    padding: "4px 6px",
    fontSize: "11px",
    cursor: "pointer",
    fontFamily: "var(--vscode-font-family)",
    flexShrink: 0,
    transition: "opacity 0.25s ease, border-color 0.2s ease, background 0.2s ease",
  },
  counter: {
    fontSize: "12px",
    color: "var(--vscode-descriptionForeground)",
    transition: "opacity 0.2s ease",
    fontVariantNumeric: "tabular-nums",
  },
  dots: {
    display: "flex",
    gap: "8px",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
    /* Space above dots only — avoids shrinking the whole panel like extra container padding */
    marginTop: "2px",
    paddingTop: "6px",
    paddingBottom: "2px",
  },
  dot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: "var(--vscode-widget-border, rgba(255,255,255,0.2))",
    border: "none",
    cursor: "pointer",
    padding: 0,
    transform: "scale(1)",
    transition: "background 0.28s ease, transform 0.28s ease",
  },
  dotActive: {
    background: "var(--vscode-focusBorder, var(--vscode-textLink-foreground))",
    transform: "scale(1.35)",
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
    animation: "onbirdieTourCardIn 0.38s ease",
    transition: "border-color 0.25s ease, box-shadow 0.25s ease",
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
    transition: "color 0.2s ease",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },
  cardExplanation: {
    fontSize: "12px",
    color: "var(--vscode-foreground)",
    lineHeight: 1.6,
    margin: 0,
    transition: "opacity 0.25s ease",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
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
    minWidth: 0,
    width: "100%",
  },
  stepItem: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 6px",
    minWidth: 0,
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    background: "transparent",
    border: "1px solid transparent",
    borderRadius: "6px",
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "var(--vscode-font-family)",
    transition: "background 0.28s ease, border-color 0.28s ease, box-shadow 0.22s ease",
  },
  stepItemActive: {
    background: "var(--vscode-editorWidget-background)",
    border: "1px solid var(--vscode-focusBorder, var(--vscode-textLink-foreground))",
    boxShadow: "inset 3px 0 0 0 var(--vscode-focusBorder, var(--vscode-textLink-foreground))",
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
    transition: "background 0.25s ease, color 0.25s ease, transform 0.25s ease",
  },
  stepTitle: {
    fontSize: "12px",
    color: "var(--vscode-foreground)",
    flex: 1,
    minWidth: 0,
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
    marginTop: "2px",
    flexShrink: 0,
  },
};
