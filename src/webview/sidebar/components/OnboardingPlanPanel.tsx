import React, { useMemo, useState } from "react";
import type { MeResponse } from "../../../lib/types";
import {
  requestPlanClear,
  requestPlanGenerate,
  requestPlanStep,
} from "../vscodeBridge";

const XP_PER_QUEST = 35;

function truncateTitle(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) {
    return t;
  }
  return `${t.slice(0, max - 1)}…`;
}

interface RankInfo {
  label: string;
  emoji: string;
}

function rankForProgress(done: number, total: number): RankInfo {
  if (total === 0) {
    return { label: "No run yet", emoji: "○" };
  }
  const ratio = done / total;
  if (ratio >= 1) {
    return { label: "First week champion", emoji: "🏆" };
  }
  if (ratio >= 0.66) {
    return { label: "Closer", emoji: "⚡" };
  }
  if (ratio >= 0.33) {
    return { label: "Building momentum", emoji: "🔥" };
  }
  if (ratio > 0) {
    return { label: "Explorer", emoji: "🧭" };
  }
  return { label: "Ready to roll", emoji: "🎯" };
}

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
      return { pct: 0, done: 0, total: 0, xp: 0, xpMax: 0 };
    }
    const done = steps.filter((s) => s.done).length;
    const total = steps.length;
    return {
      pct: Math.round((done / total) * 100),
      done,
      total,
      xp: done * XP_PER_QUEST,
      xpMax: total * XP_PER_QUEST,
    };
  }, [steps]);

  const rank = useMemo(() => rankForProgress(progress.done, progress.total), [progress.done, progress.total]);

  const nextStepId = useMemo(() => {
    const first = steps.find((s) => !s.done);
    return first?.id ?? null;
  }, [steps]);

  const nextStepTitle = useMemo(() => {
    const first = steps.find((s) => !s.done);
    return (first?.title ?? "").trim();
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
        <div style={styles.titleRow}>
          <div style={styles.titleBlock}>
            <div style={styles.title}>Onboarding run</div>
            <div style={styles.sub}>
              Quests are bite-sized wins — check one off, earn XP, level up your first week.
            </div>
          </div>
        </div>
      </div>

      {plan?.steps && plan.steps.length > 0 && (
        <>
          <div style={styles.runCard}>
            <div style={styles.runCardTop}>
              <div style={styles.rankPill} title="Rank changes as you complete quests">
                <span style={styles.rankEmoji} aria-hidden>
                  {rank.emoji}
                </span>
                <span style={styles.rankLabel}>{rank.label}</span>
              </div>
              <div style={styles.xpLine}>
                <span style={styles.xpStrong}>{progress.xp}</span>
                <span style={styles.xpMuted}> / {progress.xpMax} XP</span>
              </div>
            </div>
            <div style={styles.progressTrack} aria-hidden>
              <div style={{ ...styles.progressFill, width: `${progress.pct}%` }} />
            </div>
            <div style={styles.progressCaption}>
              {progress.done === progress.total ? (
                <span style={styles.winText}>Run complete — nice work.</span>
              ) : (
                <>
                  <span>
                    {progress.done}/{progress.total} quests
                  </span>
                  <span style={styles.dotSep}>·</span>
                  <span>{progress.pct}% cleared</span>
                </>
              )}
            </div>
            {progress.done < progress.total && nextStepTitle ? (
              <div style={styles.nextUpBlock}>
                <div style={styles.nextUpLabel}>Next up</div>
                <div style={styles.nextUpTitle}>{truncateTitle(nextStepTitle, 120)}</div>
              </div>
            ) : null}
          </div>

          <ul style={styles.stepList}>
            {plan.steps.map((s, i) => {
              const isNext = !s.done && s.id === nextStepId;
              return (
                <li
                  key={s.id}
                  style={{
                    ...styles.questCard,
                    ...(s.done ? styles.questCardDone : {}),
                    ...(isNext ? styles.questCardNext : {}),
                  }}
                >
                  <div style={styles.questHead}>
                    <div style={styles.questIndex} aria-hidden>
                      {i + 1}
                    </div>
                    <label style={styles.stepLabel}>
                      <input
                        type="checkbox"
                        checked={s.done}
                        disabled={busy}
                        onChange={(e) => toggleStep(s.id, e.target.checked)}
                      />
                      <span style={{ ...styles.stepTitle, ...(s.done ? styles.stepTitleDone : {}) }}>
                        {s.title}
                      </span>
                    </label>
                    {s.done ? (
                      <span style={styles.clearedChip}>Cleared</span>
                    ) : (
                      <span style={styles.xpChip} aria-hidden>
                        +{XP_PER_QUEST} XP
                      </span>
                    )}
                  </div>
                  <p style={styles.stepDetail}>{s.detail}</p>
                  {s.guidance ? (
                    <p style={styles.guidance}>
                      <span style={styles.guidanceMark}>💡</span> {s.guidance}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div style={steps.length > 0 ? styles.planControls : styles.planControlsFirst}>
        {tasks.length > 0 && (
          <label style={styles.focusLabel}>
            Focus employer task (optional)
            <select
              style={styles.select}
              value={focusId}
              onChange={(e) => setFocusId(e.target.value)}
              disabled={busy}
            >
              <option value="">Balanced first week</option>
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
            style={{ ...styles.primaryBtn, opacity: busy ? 0.55 : 1 }}
            disabled={busy}
            onClick={runGenerate}
          >
            {plan?.steps?.length ? "Reroll quests" : "Start my run"}
          </button>
          {plan?.steps?.length ? (
            <button type="button" style={styles.ghostBtn} disabled={busy} onClick={clearPlan}>
              Reset run
            </button>
          ) : null}
        </div>

        {error && <p style={styles.err}>{error}</p>}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    flexShrink: 0,
    padding: "12px 0 4px",
    borderBottom: "1px solid var(--vscode-sideBarSectionHeader-border, rgba(255,255,255,0.08))",
    maxHeight: "380px",
    overflowY: "auto",
  },
  wrapEmbedded: {
    padding: "4px 0 0",
    borderBottom: "none",
    maxHeight: "none",
  },
  headRow: {
    marginBottom: "10px",
  },
  titleRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "8px",
  },
  titleBlock: {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    minWidth: 0,
  },
  title: {
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: "var(--vscode-foreground)",
  },
  sub: {
    fontSize: "10px",
    lineHeight: 1.5,
    color: "var(--vscode-descriptionForeground)",
  },
  runCard: {
    borderRadius: "8px",
    padding: "10px 10px 8px",
    marginBottom: "12px",
    background: "var(--vscode-editorWidget-background, rgba(255,255,255,0.03))",
    border: "1px solid var(--vscode-widget-border, rgba(255,255,255,0.08))",
  },
  runCardTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    marginBottom: "8px",
    flexWrap: "wrap",
  },
  rankPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "10px",
    fontWeight: 600,
    color: "var(--vscode-foreground)",
    maxWidth: "100%",
  },
  rankEmoji: {
    fontSize: "13px",
    lineHeight: 1,
    flexShrink: 0,
  },
  rankLabel: {
    lineHeight: 1.25,
  },
  xpLine: {
    fontSize: "11px",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  xpStrong: {
    fontWeight: 700,
    color: "var(--vscode-textLink-foreground)",
  },
  xpMuted: {
    color: "var(--vscode-descriptionForeground)",
    fontWeight: 500,
  },
  progressTrack: {
    height: "8px",
    borderRadius: "4px",
    background: "var(--vscode-input-background)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background:
      "linear-gradient(90deg, var(--vscode-textLink-foreground), var(--vscode-progressBar-background, var(--vscode-button-background)))",
    borderRadius: "4px",
    transition: "width 0.35s ease",
  },
  progressCaption: {
    fontSize: "10px",
    color: "var(--vscode-descriptionForeground)",
    marginTop: "6px",
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "4px",
  },
  winText: {
    color: "var(--vscode-textLink-foreground)",
    fontWeight: 600,
  },
  dotSep: {
    opacity: 0.45,
    userSelect: "none",
  },
  planControls: {
    marginTop: "12px",
    paddingTop: "12px",
    borderTop: "1px solid var(--vscode-sideBarSectionHeader-border, rgba(255,255,255,0.08))",
  },
  planControlsFirst: {
    marginTop: "6px",
  },
  focusLabel: {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    fontSize: "10px",
    fontWeight: 600,
    color: "var(--vscode-descriptionForeground)",
    marginBottom: "10px",
  },
  select: {
    marginTop: "2px",
    fontSize: "11px",
    padding: "6px 8px",
    background: "var(--vscode-dropdown-background)",
    color: "var(--vscode-dropdown-foreground)",
    border: "1px solid var(--vscode-dropdown-border, rgba(255,255,255,0.15))",
    borderRadius: "6px",
    fontFamily: "var(--vscode-font-family)",
  },
  actions: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    marginBottom: "6px",
  },
  primaryBtn: {
    padding: "6px 14px",
    fontSize: "11px",
    fontWeight: 600,
    borderRadius: "6px",
    border: "none",
    background: "var(--vscode-button-background)",
    color: "var(--vscode-button-foreground)",
    cursor: "pointer",
    fontFamily: "var(--vscode-font-family)",
  },
  ghostBtn: {
    padding: "6px 12px",
    fontSize: "11px",
    fontWeight: 500,
    borderRadius: "6px",
    border: "1px solid var(--vscode-widget-border, rgba(255,255,255,0.12))",
    background: "transparent",
    color: "var(--vscode-descriptionForeground)",
    cursor: "pointer",
    fontFamily: "var(--vscode-font-family)",
  },
  err: {
    fontSize: "11px",
    color: "var(--vscode-errorForeground, #f14c4c)",
    margin: "6px 0 0 0",
  },
  stepList: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  questCard: {
    borderRadius: "8px",
    padding: "10px 10px 8px 10px",
    border: "1px solid var(--vscode-widget-border, rgba(255,255,255,0.1))",
    background: "var(--vscode-sideBar-background)",
  },
  questCardDone: {
    opacity: 0.88,
    borderColor: "var(--vscode-widget-border, rgba(255,255,255,0.06))",
  },
  questCardNext: {
    borderColor: "var(--vscode-focusBorder, var(--vscode-textLink-foreground))",
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)",
  },
  nextUpBlock: {
    marginTop: "8px",
    paddingTop: "8px",
    borderTop: "1px solid var(--vscode-widget-border, rgba(255,255,255,0.06))",
  },
  nextUpLabel: {
    fontSize: "9px",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--vscode-textLink-foreground)",
    marginBottom: "4px",
  },
  nextUpTitle: {
    fontSize: "11px",
    fontWeight: 600,
    lineHeight: 1.4,
    color: "var(--vscode-foreground)",
  },
  questHead: {
    display: "grid",
    gridTemplateColumns: "22px 1fr auto",
    alignItems: "start",
    gap: "8px",
    marginBottom: "4px",
  },
  questIndex: {
    width: "22px",
    height: "22px",
    borderRadius: "999px",
    fontSize: "10px",
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--vscode-badge-background)",
    color: "var(--vscode-badge-foreground)",
    flexShrink: 0,
  },
  stepLabel: {
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--vscode-foreground)",
    cursor: "pointer",
    minWidth: 0,
  },
  stepTitle: {
    flex: 1,
    lineHeight: 1.35,
  },
  stepTitleDone: {
    fontWeight: 500,
    color: "var(--vscode-descriptionForeground)",
  },
  clearedChip: {
    fontSize: "9px",
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--vscode-testing-iconPassed, var(--vscode-gitDecoration-addedResourceForeground, #73c991))",
    paddingTop: "2px",
    flexShrink: 0,
  },
  xpChip: {
    fontSize: "9px",
    fontWeight: 700,
    letterSpacing: "0.03em",
    color: "var(--vscode-textLink-foreground)",
    opacity: 0.9,
    paddingTop: "2px",
    flexShrink: 0,
  },
  stepDetail: {
    fontSize: "11px",
    lineHeight: 1.5,
    color: "var(--vscode-descriptionForeground)",
    margin: "0 0 0 30px",
  },
  guidance: {
    fontSize: "10px",
    lineHeight: 1.45,
    color: "var(--vscode-descriptionForeground)",
    margin: "6px 0 0 30px",
  },
  guidanceMark: {
    marginRight: "4px",
    opacity: 0.85,
  },
};
