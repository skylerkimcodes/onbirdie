import React, { useMemo, useState } from "react";
import type { MeResponse } from "../../../lib/types";
import {
  requestPlanClear,
  requestPlanGenerate,
  requestPlanStep,
} from "../vscodeBridge";

interface Props {
  me: MeResponse;
  onMeUpdated: (me: MeResponse) => void;
  /** Inside WorkspaceGuidePanel — tighter chrome */
  embedded?: boolean;
}

export const OnboardingPlanPanel: React.FC<Props> = ({ me, onMeUpdated, embedded }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [focusId, setFocusId] = useState<string>("");

  const plan = me.onboarding_plan;
  const tasks = me.onboarding_tasks ?? [];
  const steps = plan?.steps ?? [];

  const progress = useMemo(() => {
    if (steps.length === 0) {
      return { pct: 0, done: 0, total: 0 };
    }
    const done = steps.filter((s) => s.done).length;
    return { pct: Math.round((done / steps.length) * 100), done, total: steps.length };
  }, [steps]);

  const runGenerate = async () => {
    setError(undefined);
    setBusy(true);
    try {
      const r = await requestPlanGenerate(focusId || undefined);
      if (r.ok) {
        onMeUpdated(r.me);
      } else {
        setError(r.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleStep = async (stepId: string, done: boolean) => {
    setError(undefined);
    setBusy(true);
    try {
      const r = await requestPlanStep(stepId, done);
      if (r.ok) {
        onMeUpdated(r.me);
      } else {
        setError(r.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const clearPlan = async () => {
    setError(undefined);
    setBusy(true);
    try {
      const r = await requestPlanClear();
      if (r.ok) {
        onMeUpdated(r.me);
      } else {
        setError(r.error);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={embedded ? { ...styles.wrap, ...styles.wrapEmbedded } : styles.wrap}>
      <div style={styles.headRow}>
        <div style={styles.titleBlock}>
          <div style={styles.title}>Your plan</div>
          <div style={styles.sub}>
            Actionable steps from your employer tasks — check them off as you go.
          </div>
        </div>
      </div>

      {tasks.length > 0 && (
        <label style={styles.focusLabel}>
          Focus employer task (optional)
          <select
            style={styles.select}
            value={focusId}
            onChange={(e) => setFocusId(e.target.value)}
            disabled={busy}
          >
            <option value="">All tasks (balanced first week)</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
      )}

      <div style={styles.actions}>
        <button
          type="button"
          style={{ ...styles.primaryBtn, opacity: busy ? 0.5 : 1 }}
          disabled={busy}
          onClick={runGenerate}
        >
          {plan?.steps?.length ? "Regenerate plan" : "Build my plan"}
        </button>
        {plan?.steps?.length ? (
          <button type="button" style={styles.ghostBtn} disabled={busy} onClick={clearPlan}>
            Clear
          </button>
        ) : null}
      </div>

      {error && <p style={styles.err}>{error}</p>}

      {plan?.steps && plan.steps.length > 0 && (
        <>
          <div style={styles.progressRow}>
            <div style={styles.progressMeta}>
              Progress {progress.done}/{progress.total}
            </div>
            <div style={styles.progressTrack}>
              <div style={{ ...styles.progressFill, width: `${progress.pct}%` }} />
            </div>
          </div>

          <ul style={styles.stepList}>
            {plan.steps.map((s) => (
                <li key={s.id} style={styles.stepLi}>
                  <label style={styles.stepLabel}>
                    <input
                      type="checkbox"
                      checked={s.done}
                      disabled={busy}
                      onChange={(e) => toggleStep(s.id, e.target.checked)}
                    />
                    <span style={styles.stepTitle}>{s.title}</span>
                  </label>
                  <p style={styles.stepDetail}>{s.detail}</p>
                  {s.guidance ? <p style={styles.guidance}>Tip: {s.guidance}</p> : null}
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    flexShrink: 0,
    padding: "10px 12px 12px",
    borderBottom: "1px solid var(--vscode-sideBarSectionHeader-border, rgba(255,255,255,0.08))",
    maxHeight: "320px",
    overflowY: "auto",
  },
  wrapEmbedded: {
    padding: "4px 0 0",
    borderBottom: "none",
    maxHeight: "260px",
  },
  headRow: {
    marginBottom: "8px",
  },
  titleBlock: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  title: {
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--vscode-foreground)",
  },
  sub: {
    fontSize: "10px",
    lineHeight: 1.45,
    color: "var(--vscode-descriptionForeground)",
  },
  focusLabel: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    fontSize: "10px",
    fontWeight: 600,
    color: "var(--vscode-descriptionForeground)",
    marginBottom: "8px",
  },
  select: {
    marginTop: "4px",
    fontSize: "11px",
    padding: "4px 6px",
    background: "var(--vscode-dropdown-background)",
    color: "var(--vscode-dropdown-foreground)",
    border: "1px solid var(--vscode-dropdown-border, rgba(255,255,255,0.15))",
    borderRadius: "4px",
    fontFamily: "var(--vscode-font-family)",
  },
  actions: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    marginBottom: "8px",
  },
  primaryBtn: {
    padding: "5px 12px",
    fontSize: "11px",
    borderRadius: "4px",
    border: "none",
    background: "var(--vscode-button-background)",
    color: "var(--vscode-button-foreground)",
    cursor: "pointer",
    fontFamily: "var(--vscode-font-family)",
  },
  ghostBtn: {
    padding: "5px 10px",
    fontSize: "11px",
    borderRadius: "4px",
    border: "1px solid var(--vscode-button-secondaryBackground, #555)",
    background: "transparent",
    color: "var(--vscode-foreground)",
    cursor: "pointer",
    fontFamily: "var(--vscode-font-family)",
  },
  err: {
    fontSize: "11px",
    color: "var(--vscode-errorForeground, #f14c4c)",
    margin: "0 0 8px 0",
  },
  progressRow: {
    marginBottom: "10px",
  },
  progressMeta: {
    fontSize: "10px",
    color: "var(--vscode-descriptionForeground)",
    marginBottom: "4px",
  },
  progressTrack: {
    height: "6px",
    borderRadius: "3px",
    background: "var(--vscode-input-background)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "var(--vscode-progressBar-background)",
    borderRadius: "3px",
    transition: "width 0.25s ease",
  },
  stepList: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  stepLi: {
    borderLeft: "2px solid var(--vscode-textLink-foreground)",
    paddingLeft: "8px",
  },
  stepLabel: {
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--vscode-foreground)",
    cursor: "pointer",
  },
  stepTitle: {
    flex: 1,
  },
  stepDetail: {
    fontSize: "11px",
    lineHeight: 1.45,
    color: "var(--vscode-descriptionForeground)",
    margin: "4px 0 0 22px",
  },
  guidance: {
    fontSize: "10px",
    lineHeight: 1.45,
    color: "var(--vscode-textLink-foreground)",
    margin: "4px 0 0 22px",
    fontStyle: "italic",
  },
};
