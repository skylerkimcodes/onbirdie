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

function truncateBody(s: string | undefined, max: number): string {
  const t = (s ?? "").trim();
  if (t.length <= max) {
    return t;
  }
  return `${t.slice(0, max - 1)}…`;
}

function compactTaskTitle(title: string | undefined): string {
  const t = (title ?? "").trim();
  return t || "Task";
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

  const sortedEmployerTasks = useMemo(
    () => [...tasks].sort((a, b) => a.sort_order - b.sort_order),
    [tasks]
  );

  const unifiedSubtitle = useMemo(() => {
    const nTeam = tasks.length;
    const nRun = progress.total;
    const doneRun = progress.done;
    if (nTeam > 0 && nRun > 0) {
      return `${nTeam} team · ${doneRun}/${nRun} quests`;
    }
    if (nTeam > 0) {
      return `${nTeam} team task${nTeam === 1 ? "" : "s"} · run below`;
    }
    if (nRun > 0) {
      return `${doneRun}/${nRun} quests`;
    }
    return "Start a run to track your first week";
  }, [tasks.length, progress.done, progress.total]);

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

  const wrapStyle = embedded ? { ...styles.wrap, ...styles.wrapEmbedded } : styles.wrap;

  return (
    <div style={wrapStyle}>
      <div style={embedded ? { ...styles.headRow, ...styles.headRowEmbedded } : styles.headRow}>
        <div style={styles.titleRow}>
          <div style={styles.titleBlock}>
            <div style={styles.title}>Onboarding</div>
            <div style={styles.sub}>{unifiedSubtitle}</div>
          </div>
        </div>
      </div>

      {sortedEmployerTasks.length > 0 && (
        <div style={styles.teamSection} aria-label="Employer team tasks">
          <div style={styles.teamSectionLabel}>Team tasks</div>
          <ol style={styles.teamOl}>
            {sortedEmployerTasks.map((t, i) => {
              const title = compactTaskTitle(t.title);
              const desc = (t.description ?? "").trim();
              return (
                <li key={t.id} style={styles.teamLi} title={desc ? `${title}\n\n${desc}` : title}>
                  <span style={styles.teamNum}>{i + 1}</span>
                  <span style={styles.teamTitle}>{title}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {plan?.steps && plan.steps.length > 0 && (
        <>
          <div style={styles.runCard}>
            <div style={styles.runCardTop}>
              <div style={styles.rankPill} title="Rank updates as you complete quests">
                <span style={styles.rankEmoji} aria-hidden>
                  {rank.emoji}
                </span>
                <span style={styles.rankLabel}>{rank.label}</span>
              </div>
              <div style={styles.xpLine} aria-label={`${progress.xp} of ${progress.xpMax} experience points`}>
                <span style={styles.xpStrong}>{progress.xp}</span>
                <span style={styles.xpMuted}>/{progress.xpMax}</span>
              </div>
            </div>
            <div style={styles.progressTrack} role="progressbar" aria-valuenow={progress.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${progress.pct} percent complete`}>
              <div style={{ ...styles.progressFill, width: `${progress.pct}%` }} />
            </div>
            <div style={styles.progressCaption}>
              {progress.done === progress.total ? (
                <span style={styles.winText}>All quests done.</span>
              ) : (
                <>
                  <span>
                    {progress.done}/{progress.total}
                  </span>
                  <span style={styles.dotSep}>·</span>
                  <span>{progress.pct}%</span>
                </>
              )}
            </div>
            {!embedded && progress.done < progress.total && nextStepTitle ? (
              <div style={styles.nextUpBlock}>
                <div style={styles.nextUpLabel}>Next</div>
                <div style={styles.nextUpTitle} title={nextStepTitle}>
                  {truncateTitle(nextStepTitle, 72)}
                </div>
              </div>
            ) : null}
          </div>

          {embedded ? (
            <div style={styles.runQuestLabelRow}>
              <span style={styles.teamSectionLabel}>Run quests</span>
            </div>
          ) : null}

          <ul style={styles.stepList}>
            {plan.steps.map((s, i) => {
              const isNext = !s.done && s.id === nextStepId;
              const detail = (s.detail ?? "").trim();
              const guide = (s.guidance ?? "").trim();
              const questTip = [detail, guide].filter(Boolean).join("\n\n");
              return (
                <li
                  key={s.id}
                  style={{
                    ...styles.questCard,
                    ...(embedded ? styles.questCardEmbedded : {}),
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
                        aria-label={s.done ? `Mark incomplete: ${s.title}` : `Mark complete: ${s.title}`}
                      />
                      <span
                        style={{ ...styles.stepTitle, ...(s.done ? styles.stepTitleDone : {}) }}
                        title={embedded && questTip ? questTip : undefined}
                      >
                        {(s.title ?? "").trim() || "Quest"}
                      </span>
                    </label>
                    {!s.done ? (
                      <span style={styles.xpChip} aria-hidden>
                        +{XP_PER_QUEST}
                      </span>
                    ) : (
                      <span style={styles.clearedChip} aria-label="Completed">
                        ✓
                      </span>
                    )}
                  </div>
                  {!embedded && detail ? (
                    <p style={styles.stepDetail} title={detail}>
                      {truncateBody(s.detail, 220)}
                    </p>
                  ) : null}
                  {!embedded && guide ? (
                    <p style={styles.guidance} title={guide}>
                      <span style={styles.guidanceMark}>Tip · </span>
                      {truncateBody(s.guidance, 180)}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div
        style={
          steps.length > 0
            ? embedded
              ? { ...styles.planControls, ...styles.planControlsEmbedded }
              : styles.planControls
            : embedded
              ? { ...styles.planControlsFirst, ...styles.planControlsEmbedded }
              : styles.planControlsFirst
        }
      >
        {tasks.length > 0 && (
          <label style={styles.focusLabel}>
            Focus task (optional)
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
    marginBottom: "8px",
  },
  headRowEmbedded: {
    marginBottom: "4px",
  },
  teamSection: {
    marginBottom: "8px",
    padding: "6px 8px",
    borderRadius: "6px",
    border: "1px solid var(--vscode-widget-border, rgba(255,255,255,0.08))",
    background: "var(--vscode-editorWidget-background, rgba(255,255,255,0.02))",
  },
  teamSectionLabel: {
    fontSize: "9px",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--vscode-descriptionForeground)",
    marginBottom: "5px",
  },
  teamOl: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: "3px",
  },
  teamLi: {
    display: "grid",
    gridTemplateColumns: "18px 1fr",
    alignItems: "center",
    gap: "6px",
    fontSize: "10px",
    minWidth: 0,
    lineHeight: 1.3,
  },
  teamNum: {
    width: "18px",
    height: "18px",
    borderRadius: "4px",
    fontSize: "9px",
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--vscode-badge-background)",
    color: "var(--vscode-badge-foreground)",
    flexShrink: 0,
  },
  teamTitle: {
    fontWeight: 500,
    color: "var(--vscode-foreground)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  runQuestLabelRow: {
    marginBottom: "5px",
    marginTop: "-2px",
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
    lineHeight: 1.4,
    color: "var(--vscode-descriptionForeground)",
  },
  runCard: {
    borderRadius: "6px",
    padding: "8px 8px 6px",
    marginBottom: "8px",
    background: "var(--vscode-editorWidget-background, rgba(255,255,255,0.03))",
    border: "1px solid var(--vscode-widget-border, rgba(255,255,255,0.08))",
  },
  runCardTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "6px",
    marginBottom: "6px",
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
    height: "5px",
    borderRadius: "3px",
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
    marginTop: "5px",
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
  planControlsEmbedded: {
    marginTop: "8px",
    paddingTop: "8px",
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
    gap: "6px",
  },
  questCard: {
    borderRadius: "6px",
    padding: "8px 8px 6px",
    border: "1px solid var(--vscode-widget-border, rgba(255,255,255,0.1))",
    background: "var(--vscode-sideBar-background)",
    minWidth: 0,
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
    marginTop: "6px",
    paddingTop: "6px",
    borderTop: "1px solid var(--vscode-widget-border, rgba(255,255,255,0.06))",
  },
  nextUpLabel: {
    fontSize: "9px",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--vscode-textLink-foreground)",
    marginBottom: "2px",
  },
  nextUpTitle: {
    fontSize: "10px",
    fontWeight: 600,
    lineHeight: 1.35,
    color: "var(--vscode-foreground)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  questHead: {
    display: "grid",
    gridTemplateColumns: "20px 1fr auto",
    alignItems: "start",
    gap: "6px",
    marginBottom: "2px",
  },
  questIndex: {
    width: "20px",
    height: "20px",
    borderRadius: "999px",
    fontSize: "9px",
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
    gap: "6px",
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--vscode-foreground)",
    cursor: "pointer",
    minWidth: 0,
  },
  stepTitle: {
    flex: 1,
    lineHeight: 1.35,
    wordBreak: "break-word",
  },
  stepTitleDone: {
    fontWeight: 500,
    color: "var(--vscode-descriptionForeground)",
  },
  clearedChip: {
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--vscode-testing-iconPassed, var(--vscode-gitDecoration-addedResourceForeground, #73c991))",
    paddingTop: "1px",
    flexShrink: 0,
    lineHeight: 1,
  },
  xpChip: {
    fontSize: "9px",
    fontWeight: 700,
    letterSpacing: "0.02em",
    color: "var(--vscode-textLink-foreground)",
    opacity: 0.9,
    paddingTop: "1px",
    flexShrink: 0,
  },
  stepDetail: {
    fontSize: "10px",
    lineHeight: 1.45,
    color: "var(--vscode-descriptionForeground)",
    margin: "4px 0 0 0",
    paddingLeft: "26px",
  },
  guidance: {
    fontSize: "10px",
    lineHeight: 1.4,
    color: "var(--vscode-descriptionForeground)",
    margin: "4px 0 0 0",
    paddingLeft: "26px",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    wordBreak: "break-word",
  } as React.CSSProperties,
  guidanceMark: {
    fontWeight: 700,
    color: "var(--vscode-textLink-foreground)",
    marginRight: "2px",
  },
};
