import React, { useEffect, useMemo, useState } from "react";
import type {
  MeResponse,
  StyleGuideEffectiveSource,
  StyleGuideGetResponse,
  WorkspaceHintFile,
} from "../../../lib/types";
import { openFilePath, requestStyleGuideState, saveStyleGuide } from "../vscodeBridge";
import { OnboardingPlanPanel } from "./OnboardingPlanPanel";

interface Props {
  me: MeResponse;
  hints: WorkspaceHintFile[] | null;
  hintsNote: string | undefined;
  onMeUpdated: (me: MeResponse) => void;
}

function effectiveSourceLabel(s: StyleGuideEffectiveSource): string {
  switch (s) {
    case "personal":
      return "Your personal guide";
    case "employer":
      return "Team guide";
    case "demo":
      return "Built-in demo";
    case "none":
      return "Defaults only";
    default:
      return s;
  }
}

export const WorkspaceGuidePanel: React.FC<Props> = ({
  me,
  hints,
  hintsNote,
  onMeUpdated,
}) => {
  const tasks = me.onboarding_tasks ?? [];
  const plan = me.onboarding_plan;

  const [styleGuide, setStyleGuide] = useState<StyleGuideGetResponse | null>(null);
  const [styleGuideLoading, setStyleGuideLoading] = useState(true);
  const [styleGuideError, setStyleGuideError] = useState<string | undefined>();
  const [personalDraft, setPersonalDraft] = useState("");
  const [employerDraft, setEmployerDraft] = useState("");
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [savingEmployer, setSavingEmployer] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setStyleGuideLoading(true);
      setStyleGuideError(undefined);
      const res = await requestStyleGuideState();
      if (cancelled) {
        return;
      }
      setStyleGuideLoading(false);
      if (!res.ok) {
        setStyleGuideError(res.error);
        return;
      }
      setStyleGuide(res.data);
      setPersonalDraft(res.data.personal_style_guide);
      setEmployerDraft(res.data.employer_style_guide);
    })();
    return () => {
      cancelled = true;
    };
  }, [me.user.id]);

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
      parts.push(`quests ${done}/${plan.steps.length}`);
    } else {
      parts.push("no run yet");
    }
    return parts.join(" · ");
  }, [hints, hintsNote, tasks.length, plan]);

  return (
    <div style={styles.root} role="tabpanel" aria-labelledby="onbirdie-tab-guide">
      <div style={styles.panelHeader}>
        <div style={styles.panelTitle}>Guide</div>
        <div style={styles.panelSubtitle}>{subtitle}</div>
      </div>
      <div style={styles.scroll}>
        {hints && hints.length > 0 && (
          <section style={styles.section}>
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
          </section>
        )}

        {hints && hints.length === 0 && hintsNote && (
          <section style={styles.section}>
            <p style={styles.note}>{hintsNote}</p>
          </section>
        )}

        {tasks.length > 0 && (
          <section style={styles.section}>
            <div style={styles.sectionLabel}>{me.employer.name} — tasks</div>
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
          </section>
        )}

        <section style={styles.sectionLast}>
          <OnboardingPlanPanel me={me} onMeUpdated={onMeUpdated} embedded />
        </section>
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
    padding: "12px 12px 10px",
    borderBottom: "1px solid var(--vscode-sideBarSectionHeader-border, rgba(255,255,255,0.08))",
  },
  panelTitle: {
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "-0.01em",
    color: "var(--vscode-foreground)",
  },
  panelSubtitle: {
    fontSize: "10px",
    color: "var(--vscode-descriptionForeground)",
    lineHeight: 1.4,
    marginTop: "5px",
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "10px 12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: "0",
  },
  section: {
    marginBottom: "14px",
  },
  sectionLast: {
    marginBottom: "0",
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
    margin: "0 0 8px 0",
    lineHeight: 1.45,
  },
  subLabel: {
    fontSize: "10px",
    fontWeight: 600,
    color: "var(--vscode-descriptionForeground)",
    display: "block",
    marginTop: "8px",
    marginBottom: "4px",
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--vscode-input-background)",
    color: "var(--vscode-input-foreground)",
    border: "1px solid var(--vscode-input-border, transparent)",
    borderRadius: "4px",
    padding: "8px 10px",
    fontSize: "11px",
    fontFamily: "var(--vscode-font-family)",
    lineHeight: 1.45,
    resize: "vertical",
    marginBottom: "6px",
  },
  stylePreview: {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.04))",
    color: "var(--vscode-descriptionForeground)",
    border: "1px solid var(--vscode-widget-border, rgba(255,255,255,0.08))",
    borderRadius: "4px",
    padding: "8px 10px",
    fontSize: "11px",
    fontFamily: "var(--vscode-font-family)",
    lineHeight: 1.45,
    resize: "vertical",
    marginBottom: "8px",
  },
  smallBtn: {
    fontSize: "11px",
    padding: "5px 12px",
    borderRadius: "4px",
    border: "1px solid var(--vscode-button-background)",
    background: "var(--vscode-button-background)",
    color: "var(--vscode-button-foreground)",
    cursor: "pointer",
    fontFamily: "var(--vscode-font-family)",
    marginBottom: "6px",
  },
  styleError: {
    fontSize: "11px",
    color: "var(--vscode-errorForeground, #f14c4c)",
    margin: "0 0 8px 0",
    lineHeight: 1.4,
  },
  taskList: {
    margin: 0,
    paddingLeft: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  taskLi: {
    fontSize: "11px",
    lineHeight: 1.5,
    color: "var(--vscode-foreground)",
    padding: "8px 10px",
    borderRadius: "6px",
    background: "var(--vscode-editorWidget-background, rgba(255,255,255,0.02))",
    border: "1px solid var(--vscode-widget-border, rgba(255,255,255,0.06))",
  },
  taskTitle: { fontWeight: 600, marginBottom: "3px" },
  taskDesc: { color: "var(--vscode-descriptionForeground)", fontWeight: 400 },
};
