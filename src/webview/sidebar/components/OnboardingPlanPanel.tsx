import React, { useEffect, useMemo, useRef, useState } from "react";
import type { MeResponse, PlanStepPublic } from "../../../lib/types";
import { ConfettiBurst } from "./ConfettiBurst";
import { OB_EASE } from "../motion";
import { requestPlanGenerate, requestPlanStep } from "../vscodeBridge";

/** Points for a full run cap at this (split across birdies). */
const MAX_RUN_POINTS = 100;

function clampDifficulty(d: number | undefined): number {
  if (d == null || Number.isNaN(d)) {
    return 3;
  }
  return Math.min(5, Math.max(1, Math.round(d)));
}

/** Split `total` integer points across steps proportionally to weights; sums exactly to `total`. */
function allocatePointsByWeights(weights: number[], total: number): number[] {
  const n = weights.length;
  if (n === 0) {
    return [];
  }
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0) {
    const base = Math.floor(total / n);
    const rem = total - base * n;
    return weights.map((_, i) => base + (i < rem ? 1 : 0));
  }
  const exact = weights.map((w) => (w / sumW) * total);
  const floors = exact.map((x) => Math.floor(x));
  const allocated = floors.reduce((a, b) => a + b, 0);
  let remainder = total - allocated;
  const order = exact.map((x, i) => ({ i, frac: x - Math.floor(x) }));
  order.sort((a, b) => b.frac - a.frac);
  const result = [...floors];
  for (let k = 0; k < remainder; k++) {
    result[order[k].i] += 1;
  }
  return result;
}

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

/** Step body text: API uses `detail`; some payloads use `description` or `body`. */
function stepDetailText(s: PlanStepPublic & { body?: string }): string {
  return String(s.detail || s.description || s.body || "").trim();
}

/** Right-pointing chevron; rotates to “down” when `expanded` (single asset, no glyph swap). */
function ExpandChevron({ expanded }: { expanded: boolean }) {
  return (
    <span style={expandChevronWrap}>
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        style={{
          ...expandChevronSvg,
          transform: expanded ? "rotate(90deg)" : "none",
        }}
        aria-hidden
      >
        <path
          d="M3.25 1.75 L6.75 5 L3.25 8.25"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

const expandChevronWrap: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "11px",
  flexShrink: 0,
};

const expandChevronSvg: React.CSSProperties = {
  display: "block",
  color: "var(--vscode-descriptionForeground)",
  opacity: 0.88,
  transformOrigin: "50% 50%",
  transition: `transform 0.2s ${OB_EASE}`,
};

interface RankInfo {
  label: string;
  emoji: string;
}

function rankForProgress(done: number, total: number): RankInfo {
  if (total === 0) {
    return { label: "Still in the nest", emoji: "🪺" };
  }
  const ratio = done / total;
  if (ratio >= 1) {
    return { label: "Soaring high", emoji: "🦅" };
  }
  if (ratio >= 0.66) {
    return { label: "Strong wings", emoji: "🪶" };
  }
  if (ratio >= 0.33) {
    return { label: "Fledgling", emoji: "🐤" };
  }
  if (ratio > 0) {
    return { label: "First flaps", emoji: "🐦" };
  }
  return { label: "Fresh hatchling", emoji: "🐣" };
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
  const [confettiTick, setConfettiTick] = useState(0);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const prevDoneRef = useRef<number | undefined>(undefined);

  const plan = me.onboarding_plan;
  const steps = plan?.steps ?? [];

  const stepIdsKey = useMemo(() => steps.map((s) => s.id).join("\0"), [steps]);

  useEffect(() => {
    setExpandedStepId(null);
  }, [stepIdsKey]);

  const progress = useMemo(() => {
    if (steps.length === 0) {
      return { pct: 0, done: 0, total: 0, xp: 0, xpMax: MAX_RUN_POINTS, stepPoints: [] as number[] };
    }
    const weights = steps.map((s) => clampDifficulty(s.difficulty));
    const stepPoints = allocatePointsByWeights(weights, MAX_RUN_POINTS);
    let xp = 0;
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].done) {
        xp += stepPoints[i];
      }
    }
    const done = steps.filter((s) => s.done).length;
    const total = steps.length;
    const pct = Math.round((xp / MAX_RUN_POINTS) * 100);
    return {
      pct,
      done,
      total,
      xp,
      xpMax: MAX_RUN_POINTS,
      stepPoints,
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

  const unifiedSubtitle = useMemo(() => {
    const nRun = progress.total;
    const doneRun = progress.done;
    if (nRun > 0) {
      return `${doneRun}/${nRun} birdies`;
    }
    return "Start a run to get your flock going";
  }, [progress.done, progress.total]);

  useEffect(() => {
    const { done, total } = progress;
    if (total <= 0) {
      prevDoneRef.current = done;
      return;
    }
    const prev = prevDoneRef.current;
    prevDoneRef.current = done;
    if (done === total && prev === total - 1) {
      setConfettiTick((c) => c + 1);
    }
  }, [progress.done, progress.total]);

  const runGenerate = async () => {
    setError(undefined);
    setBusy(true);
    try {
      const r = await requestPlanGenerate(undefined);
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

  const wrapStyle = embedded ? { ...styles.wrap, ...styles.wrapEmbedded } : styles.wrap;

  const hasPlanSteps = !!plan?.steps?.length;
  const showStartFlockButton = !hasPlanSteps;
  /** Keep actions visible after the first generation so users can regenerate the guide */
  const planControlsStyle = embedded
    ? {
        ...(hasPlanSteps ? styles.planControls : styles.planControlsFirst),
        ...styles.planControlsEmbedded,
      }
    : hasPlanSteps
      ? styles.planControls
      : styles.planControlsFirst;

  return (
    <div style={wrapStyle}>
      {confettiTick > 0 ? <ConfettiBurst tick={confettiTick} /> : null}
      <div style={embedded ? { ...styles.headRow, ...styles.headRowEmbedded } : styles.headRow}>
        <div style={styles.titleRow}>
          <div style={styles.titleBlock}>
            <div style={styles.title}>Onboarding</div>
            <div style={styles.sub}>{unifiedSubtitle}</div>
          </div>
        </div>
      </div>

      {plan?.steps && plan.steps.length > 0 && (
        <>
          <div style={styles.runCard}>
            <div style={styles.runCardTop}>
              <div style={styles.rankPill} title="Rank updates as you land birdies">
                <span style={styles.rankEmoji} aria-hidden>
                  {rank.emoji}
                </span>
                <span style={styles.rankLabel}>{rank.label}</span>
              </div>
              <div style={styles.xpLine} aria-label={`${progress.xp} of ${progress.xpMax} points`}>
                <span style={styles.xpStrong}>{progress.xp}</span>
                <span style={styles.xpMuted}>/{progress.xpMax}</span>
              </div>
            </div>
            <div style={styles.progressTrack} role="progressbar" aria-valuenow={progress.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${progress.pct} percent complete`}>
              <div style={{ ...styles.progressFill, width: `${progress.pct}%` }} />
            </div>
            <div style={styles.progressCaption}>
              {progress.done === progress.total ? (
                <span style={styles.winText}>Whole flock home.</span>
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
              <span style={styles.teamSectionLabel}>Your birdies</span>
            </div>
          ) : null}

          <ul style={styles.stepList}>
            {plan.steps.map((s, i) => {
              const isNext = !s.done && s.id === nextStepId;
              const detail = stepDetailText(s);
              const guide = (s.guidance ?? "").trim();
              const titleText = (s.title ?? "").trim() || "Birdie";
              const hasBody = !!(detail || guide);
              const isExpanded = embedded && expandedStepId === s.id;

              const cardBorderStyle =
                embedded && isExpanded
                  ? styles.questCardExpanded
                  : isNext
                    ? styles.questCardNext
                    : undefined;

              return (
                <li
                  key={s.id}
                  style={{
                    ...styles.questCard,
                    ...(embedded ? styles.questCardEmbedded : {}),
                    ...(s.done ? styles.questCardDone : {}),
                    ...(cardBorderStyle ?? {}),
                  }}
                >
                  <div
                    style={{
                      ...styles.questHead,
                      ...(embedded ? styles.questHeadEmbedded : {}),
                    }}
                  >
                    <button
                      type="button"
                      style={{
                        ...styles.questIndexBtn,
                        ...(s.done ? styles.questIndexBtnDone : {}),
                      }}
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggleStep(s.id, !s.done);
                      }}
                      aria-pressed={s.done}
                      aria-label={
                        s.done
                          ? `Mark incomplete birdie ${i + 1}: ${titleText}`
                          : `Mark complete birdie ${i + 1}: ${titleText}`
                      }
                      title={s.done ? "Mark incomplete" : "Mark complete"}
                    >
                      {s.done ? "✓" : i + 1}
                    </button>
                    {embedded ? (
                      hasBody ? (
                        <button
                          type="button"
                          style={styles.embeddedRowExpand}
                          onClick={() => setExpandedStepId((id) => (id === s.id ? null : s.id))}
                          aria-expanded={isExpanded}
                          aria-label={
                            isExpanded
                              ? `Collapse details for ${titleText}`
                              : `Show description for ${titleText}`
                          }
                        >
                          <ExpandChevron expanded={isExpanded} />
                          <span style={{ ...styles.stepTitle, ...(s.done ? styles.stepTitleDone : {}) }}>
                            {titleText}
                          </span>
                          {!s.done ? (
                            <span style={styles.xpChip} aria-hidden>
                              +{progress.stepPoints[i] ?? 0}
                            </span>
                          ) : (
                            <span style={styles.xpSlot} aria-hidden />
                          )}
                        </button>
                      ) : (
                        <div style={styles.embeddedRowStatic}>
                          <span style={styles.embeddedRowLead} aria-hidden />
                          <span style={{ ...styles.stepTitle, ...(s.done ? styles.stepTitleDone : {}) }}>
                            {titleText}
                          </span>
                          {!s.done ? (
                            <span style={styles.xpChip} aria-hidden>
                              +{progress.stepPoints[i] ?? 0}
                            </span>
                          ) : (
                            <span style={styles.xpSlot} aria-hidden />
                          )}
                        </div>
                      )
                    ) : (
                      <>
                        <div style={styles.stepTitleRow}>
                          <span style={{ ...styles.stepTitle, ...(s.done ? styles.stepTitleDone : {}) }}>
                            {titleText}
                          </span>
                        </div>
                        {!s.done ? (
                          <span style={styles.xpChip} aria-hidden title={`Worth ${progress.stepPoints[i]} pts`}>
                            +{progress.stepPoints[i] ?? 0}
                          </span>
                        ) : (
                          <span style={styles.xpSlot} aria-hidden />
                        )}
                      </>
                    )}
                  </div>
                  {embedded && isExpanded && hasBody ? (
                    <div style={styles.embeddedExpand}>
                      {detail ? (
                        <>
                          <div style={styles.embeddedDescLabel}>Description</div>
                          <p style={styles.stepDetailEmbedded}>{detail}</p>
                        </>
                      ) : null}
                      {guide ? (
                        <p style={styles.guidanceEmbedded}>
                          <span style={styles.guidanceMark}>Tip · </span>
                          {guide}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {!embedded && detail ? (
                    <p style={styles.stepDetail} title={detail}>
                      {truncateBody(detail, 220)}
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

      <div style={planControlsStyle}>
        <div style={styles.actions}>
          {showStartFlockButton ? (
            <button
              type="button"
              style={{ ...styles.primaryBtn, opacity: busy ? 0.55 : 1 }}
              disabled={busy}
              onClick={runGenerate}
            >
              Start my flock
            </button>
          ) : (
            <button
              type="button"
              style={{ ...styles.secondaryBtn, opacity: busy ? 0.55 : 1 }}
              disabled={busy}
              onClick={runGenerate}
            >
              Regenerate guide
            </button>
          )}
        </div>
        {error ? <p style={styles.err}>{error}</p> : null}
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
    padding: 0,
    borderBottom: "none",
    maxHeight: "none",
  },
  headRow: {
    marginBottom: "8px",
  },
  headRowEmbedded: {
    marginBottom: "6px",
  },
  teamSectionLabel: {
    fontSize: "9px",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--vscode-descriptionForeground)",
    marginBottom: "5px",
  },
  runQuestLabelRow: {
    marginBottom: "6px",
    marginTop: 0,
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
    animation: `ob-panel-in 0.4s ${OB_EASE}`,
    transition: `border-color 0.25s ${OB_EASE}, box-shadow 0.25s ${OB_EASE}`,
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
    transition: `width 0.45s ${OB_EASE}`,
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
    marginTop: "10px",
    paddingTop: "10px",
    borderTop: "1px solid var(--vscode-sideBarSectionHeader-border, rgba(255,255,255,0.08))",
  },
  planControlsFirst: {
    marginTop: "8px",
  },
  planControlsEmbedded: {
    marginTop: "10px",
    paddingTop: "10px",
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
    transition: `opacity 0.22s ${OB_EASE}, transform 0.18s ${OB_EASE}`,
  },
  secondaryBtn: {
    padding: "6px 14px",
    fontSize: "11px",
    fontWeight: 600,
    borderRadius: "6px",
    border: "1px solid var(--vscode-button-secondaryBackground, rgba(255,255,255,0.2))",
    background: "transparent",
    color: "var(--vscode-foreground)",
    cursor: "pointer",
    fontFamily: "var(--vscode-font-family)",
    transition: `opacity 0.22s ${OB_EASE}, border-color 0.2s ${OB_EASE}`,
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
    transition: `opacity 0.28s ${OB_EASE}, border-color 0.28s ${OB_EASE}, box-shadow 0.28s ${OB_EASE}, transform 0.22s ${OB_EASE}`,
  },
  questCardEmbedded: {
    padding: "5px 6px 4px",
  },
  questCardDone: {
    opacity: 0.88,
    borderColor: "var(--vscode-widget-border, rgba(255,255,255,0.06))",
  },
  questCardNext: {
    borderColor: "var(--vscode-focusBorder, var(--vscode-textLink-foreground))",
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)",
  },
  questCardExpanded: {
    background: "var(--vscode-editorWidget-background, rgba(255,255,255,0.04))",
    borderColor: "var(--vscode-focusBorder, var(--vscode-textLink-foreground))",
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)",
  },
  embeddedRowExpand: {
    border: "none",
    background: "transparent",
    padding: 0,
    margin: 0,
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--vscode-foreground)",
    display: "grid",
    gridTemplateColumns: "11px 1fr auto",
    alignItems: "start",
    gap: "4px 6px",
    minWidth: 0,
    width: "100%",
  },
  questHeadEmbedded: {
    gridTemplateColumns: "22px 1fr",
  },
  embeddedRowStatic: {
    display: "grid",
    gridTemplateColumns: "11px 1fr auto",
    alignItems: "start",
    gap: "4px 6px",
    minWidth: 0,
  },
  embeddedRowLead: {
    display: "block",
    width: "11px",
    flexShrink: 0,
  },
  embeddedDescLabel: {
    fontSize: "9px",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--vscode-descriptionForeground)",
    marginBottom: "4px",
  },
  embeddedExpand: {
    marginTop: "8px",
    paddingTop: "8px",
    paddingLeft: "28px",
    paddingRight: "0",
    borderTop: "1px solid var(--vscode-widget-border, rgba(255,255,255,0.08))",
    width: "100%",
    boxSizing: "border-box",
  },
  stepDetailEmbedded: {
    fontSize: "11px",
    lineHeight: 1.5,
    color: "var(--vscode-foreground)",
    opacity: 0.92,
    margin: "0 0 8px 0",
    wordBreak: "break-word",
  },
  guidanceEmbedded: {
    fontSize: "10px",
    lineHeight: 1.45,
    color: "var(--vscode-descriptionForeground)",
    margin: 0,
    wordBreak: "break-word",
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
    gridTemplateColumns: "22px 1fr auto",
    alignItems: "start",
    gap: "6px",
    marginBottom: "2px",
  },
  questIndexBtn: {
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
    border: "none",
    padding: 0,
    cursor: "pointer",
    fontFamily: "var(--vscode-font-family)",
    lineHeight: 1,
    transition: `background 0.22s ${OB_EASE}, color 0.22s ${OB_EASE}, box-shadow 0.22s ${OB_EASE}, transform 0.15s ${OB_EASE}`,
  },
  questIndexBtnDone: {
    background: "transparent",
    boxShadow: "inset 0 0 0 2px var(--vscode-testing-iconPassed, var(--vscode-gitDecoration-addedResourceForeground, #73c991))",
    color: "var(--vscode-testing-iconPassed, var(--vscode-gitDecoration-addedResourceForeground, #73c991))",
  },
  stepTitleRow: {
    display: "flex",
    alignItems: "flex-start",
    minWidth: 0,
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--vscode-foreground)",
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
  xpSlot: {
    minWidth: "28px",
    flexShrink: 0,
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
