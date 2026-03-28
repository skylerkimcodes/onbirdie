import React, { useMemo } from "react";
import type { MeResponse, WorkspaceHintFile } from "../../../lib/types";
import { openFilePath } from "../vscodeBridge";
import { OnboardingPlanPanel } from "./OnboardingPlanPanel";

interface Props {
  me: MeResponse;
  hints: WorkspaceHintFile[] | null;
  hintsNote: string | undefined;
  onMeUpdated: (me: MeResponse) => void;
}

export const WorkspaceGuidePanel: React.FC<Props> = ({
  me,
  hints,
  hintsNote,
  onMeUpdated,
}) => {
  const tasks = me.onboarding_tasks ?? [];
  const plan = me.onboarding_plan;

  const subtitle = useMemo(() => {
    const parts: string[] = [];
    if (hints && hints.length > 0) {
      parts.push(`${hints.length} file${hints.length === 1 ? "" : "s"}`);
    } else if (hintsNote) {
      parts.push("workspace");
    }
    if (tasks.length > 0) {
      parts.push(`${tasks.length} task${tasks.length === 1 ? "" : "s"}`);
    }
    if (plan?.steps?.length) {
      const done = plan.steps.filter((s) => s.done).length;
      parts.push(`plan ${done}/${plan.steps.length}`);
    } else {
      parts.push("no plan yet");
    }
    return parts.join(" · ");
  }, [hints, hintsNote, tasks.length, plan]);

  return (
    <div style={styles.root} role="tabpanel" aria-labelledby="onbirdie-tab-guide">
      <div style={styles.panelHeader}>
        <div style={styles.panelTitle}>Onboarding guide</div>
        <div style={styles.panelSubtitle}>{subtitle}</div>
      </div>
      <div style={styles.scroll}>
        {hints && hints.length > 0 && (
          <div>
            <div style={styles.sectionLabel}>Suggested files</div>
            <div style={styles.chips}>
              {hints.map((f) => (
                <button
                  key={f.path}
                  type="button"
                  style={styles.chip}
                  onClick={() => openFilePath(f.path)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {hints && hints.length === 0 && hintsNote && (
          <p style={styles.note}>{hintsNote}</p>
        )}

        {tasks.length > 0 && (
          <div>
            <div style={styles.sectionLabel}>Employer tasks ({me.employer.name})</div>
            <ol style={styles.taskList}>
              {[...tasks]
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((t) => (
                  <li key={t.id} style={styles.taskLi}>
                    <div style={styles.taskTitle}>{t.title}</div>
                    <div style={styles.taskDesc}>{t.description}</div>
                  </li>
                ))}
            </ol>
          </div>
        )}

        <OnboardingPlanPanel me={me} onMeUpdated={onMeUpdated} embedded />
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  panelHeader: {
    flexShrink: 0,
    padding: "10px 12px 8px",
    borderBottom: "1px solid var(--vscode-sideBarSectionHeader-border, rgba(255,255,255,0.08))",
  },
  panelTitle: {
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--vscode-foreground)",
  },
  panelSubtitle: {
    fontSize: "10px",
    color: "var(--vscode-descriptionForeground)",
    lineHeight: 1.35,
    marginTop: "4px",
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  sectionLabel: {
    fontSize: "10px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "var(--vscode-descriptionForeground)",
    marginBottom: "6px",
  },
  chips: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
  },
  chip: {
    fontSize: "11px",
    padding: "4px 8px",
    borderRadius: "10px",
    border: "1px solid var(--vscode-widget-border, rgba(255,255,255,0.12))",
    background: "var(--vscode-editorWidget-background)",
    color: "var(--vscode-textLink-foreground)",
    cursor: "pointer",
    fontFamily: "var(--vscode-font-family)",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  note: {
    fontSize: "11px",
    color: "var(--vscode-descriptionForeground)",
    margin: 0,
    lineHeight: 1.45,
  },
  taskList: {
    margin: 0,
    paddingLeft: "18px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  taskLi: { fontSize: "11px", lineHeight: 1.45, color: "var(--vscode-foreground)" },
  taskTitle: { fontWeight: 600, marginBottom: "2px" },
  taskDesc: { color: "var(--vscode-descriptionForeground)", fontWeight: 400 },
};
