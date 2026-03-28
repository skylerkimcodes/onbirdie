import React, { useState, useRef, useEffect } from "react";
import type {
  MeResponse,
  StyleReviewOutcome,
  WorkspaceHintFile,
} from "../../../lib/types";
import { Profile } from "./ProfileView";
import {
  requestStyleReview,
  requestWorkspaceHints,
  sendChatMessages,
  subscribeToExtension,
  type ExtensionToWebviewMessage,
} from "../vscodeBridge";
import { WorkspaceGuidePanel } from "../components/WorkspaceGuidePanel";
import { SidebarTabBar, type SidebarTabId } from "../components/SidebarTabBar";
import { TourTab } from "../components/TourTab";

interface Message {
  id: number;
  role: "agent" | "user";
  text: string;
}

interface Props {
  me: MeResponse;
  profile: Profile;
  onMeUpdated: (me: MeResponse) => void;
  onSignOut?: () => void;
}

function buildWelcome(me: MeResponse, profile: Profile): string {
  const name = profile.name || me.user.display_name || me.user.email.split("@")[0] || "there";
  const role = profile.role || me.user.employee_role || "engineer";
  const skills = (profile.skillsSummary || me.user.skills_summary || "").trim();
  let skillsBlock = "";
  if (skills) {
    const short = skills.length > 450 ? `${skills.slice(0, 450)}…` : skills;
    skillsBlock = `\n\n**From your profile:** ${short}`;
  }
  if (me.user.has_resume && !skillsBlock) {
    skillsBlock = `\n\nWe saved your resume text so I can reference your background when it helps.`;
  }
  return `Hey ${name}! I'm OnBirdie, your onboarding agent. I know you're a **${role}** — I'll tailor guidance to that.${skillsBlock}\n\nHere's what I can help you with:\n• **Chat tab** — ask about the repo or your tasks\n• **Guide tab** — suggested files, employer tasks, and your XP onboarding run\n• **Tour tab** — walk the codebase for your role\n\nWhat would you like to start with?`;
}

export const ChatView: React.FC<Props> = ({ me, profile, onMeUpdated, onSignOut }) => {
  const [activeTab, setActiveTab] = useState<SidebarTabId>("tour");
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, role: "agent", text: buildWelcome(me, profile) },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [hints, setHints] = useState<WorkspaceHintFile[] | null>(null);
  const [hintsNote, setHintsNote] = useState<string | undefined>();
  const [styleBusy, setStyleBusy] = useState(false);
  const [styleOutcome, setStyleOutcome] = useState<StyleReviewOutcome | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const highlightKey = me.employer.highlight_paths.join("\0");

  useEffect(() => {
    return subscribeToExtension((msg: ExtensionToWebviewMessage) => {
      if (msg.type === "styleReview/result") {
        setStyleBusy(false);
        setStyleOutcome(msg.payload);
      }
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping, styleBusy, styleOutcome]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await requestWorkspaceHints(me.employer.highlight_paths);
      if (cancelled) {
        return;
      }
      if (res.ok) {
        setHints(res.files);
        if (res.files.length === 0) {
          setHintsNote("Open a workspace folder to see file suggestions here.");
        } else {
          setHintsNote(undefined);
        }
      } else {
        setHints([]);
        setHintsNote(res.error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [highlightKey, me.employer.highlight_paths]);

  const send = () => {
    const text = input.trim();
    if (!text) {
      return;
    }

    const userMsg: Message = { id: Date.now(), role: "user", text };
    const thread = [...messages, userMsg];
    setMessages(thread);
    setInput("");
    setIsTyping(true);

    const apiMessages = thread.map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.text,
    }));

    void (async () => {
      const result = await sendChatMessages(apiMessages);
      setIsTyping(false);
      if (result.ok) {
        setMessages((prev) => [
          ...prev,
          { id: Date.now() + 1, role: "agent", text: result.message },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            role: "agent",
            text: `**Could not reach the assistant.** ${result.error}\n\nConfigure **LAVA_SECRET_KEY** in \`backend/.env\` (see https://lava.so/docs), run the API with \`uvicorn\`, or set **K2_API_KEY** / **OPENAI_API_KEY** as a fallback.`,
          },
        ]);
      }
    })();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isTyping) {
        send();
      }
    }
  };

  const runStyleReview = () => {
    setStyleBusy(true);
    setStyleOutcome(null);
    requestStyleReview();
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.headerIcon}>🐦</span>
        <div style={styles.headerText}>
          <div style={styles.headerTitle}>OnBirdie</div>
          <div style={styles.headerSub}>{profile.role}</div>
        </div>
        <div style={styles.headerActions}>
          <button
            type="button"
            style={styles.styleBtn}
            onClick={runStyleReview}
            disabled={styleBusy}
            title="Compare staged files to your employer style guide (git add first)"
          >
            {styleBusy ? "Reviewing…" : "Style review"}
          </button>
          {onSignOut && (
            <button type="button" style={styles.signOut} onClick={onSignOut}>
              Sign out
            </button>
          )}
        </div>
      </div>

      <SidebarTabBar active={activeTab} onChange={setActiveTab} />

      {activeTab === "chat" ? (
        <div style={styles.tabPanel} role="tabpanel" aria-labelledby="onbirdie-tab-chat">
          {(styleBusy || styleOutcome) && (
            <div style={styles.stylePanel}>
              {styleBusy && (
                <p style={styles.stylePanelText}>Reading staged diff and checking the guide…</p>
              )}
              {styleOutcome && !styleBusy && <StyleReviewBlock outcome={styleOutcome} />}
            </div>
          )}
          <div style={styles.messages}>
            {messages.map((msg) => (
              <div key={msg.id} style={msg.role === "user" ? styles.userRow : styles.agentRow}>
                <div style={msg.role === "user" ? styles.userBubble : styles.agentBubble}>
                  {formatText(msg.text)}
                </div>
              </div>
            ))}
            {isTyping && (
              <div style={styles.agentRow}>
                <div style={styles.agentBubble}>
                  <span style={styles.typingDots}>
                    <span>•</span>
                    <span>•</span>
                    <span>•</span>
                  </span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div style={styles.inputRow}>
            <textarea
              style={styles.input}
              placeholder="Ask OnBirdie anything..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              rows={1}
              disabled={isTyping}
            />
            <button
              type="button"
              style={styles.sendBtn}
              onClick={send}
              disabled={!input.trim() || isTyping}
              aria-label="Send message"
            >
              ↑
            </button>
          </div>
        </div>
      ) : activeTab === "tour" ? (
        <div style={styles.tabPanel} role="tabpanel" aria-labelledby="onbirdie-tab-tour">
          <TourTab userRole={profile.role} />
        </div>
      ) : (
        <WorkspaceGuidePanel
          me={me}
          hints={hints}
          hintsNote={hintsNote}
          onMeUpdated={onMeUpdated}
        />
      )}
    </div>
  );
};

function formatText(text: string): React.ReactNode {
  const lines = text.split("\n");
  return lines.map((line, i) => (
    <span key={i}>
      {formatLine(line)}
      {i < lines.length - 1 && <br />}
    </span>
  ));
}

function severityColor(sev: string): string {
  if (sev === "error") return "var(--vscode-errorForeground, #f14c4c)";
  if (sev === "warning") return "var(--vscode-editorWarning-foreground, #cca700)";
  return "var(--vscode-textLink-foreground)";
}

const StyleReviewBlock: React.FC<{ outcome: StyleReviewOutcome }> = ({ outcome }) => {
  if (!outcome.ok) {
    return <p style={styles.styleError}>{outcome.error}</p>;
  }
  const { result } = outcome;
  return (
    <div style={styles.styleBlockInner}>
      <p style={styles.styleSummary}>{result.summary}</p>
      {result.tier_used && (
        <p style={styles.styleTier}>
          Review tier: {result.tier_used === "lava_light" ? "light (Lava)" : "K2"}
        </p>
      )}
      {result.issues.length === 0 ? (
        <p style={styles.stylePanelMuted}>No issues reported against the style guide.</p>
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

function formatLine(line: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = line;
  let key = 0;
  while (remaining.length > 0) {
    const m = remaining.match(/\*\*(.+?)\*\*/);
    if (!m || m.index === undefined) {
      parts.push(remaining);
      break;
    }
    if (m.index > 0) {
      parts.push(remaining.slice(0, m.index));
    }
    parts.push(
      <strong key={key++}>{m[1]}</strong>
    );
    remaining = remaining.slice(m.index + m[0].length);
  }
  return <>{parts}</>;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 12px 10px 14px",
    borderBottom: "1px solid var(--vscode-sideBarSectionHeader-border, rgba(255,255,255,0.08))",
    flexShrink: 0,
    background: "var(--vscode-sideBar-background)",
  },
  headerIcon: { fontSize: "18px", lineHeight: 1 },
  headerText: { flex: 1, minWidth: 0 },
  signOut: {
    fontSize: "11px",
    color: "var(--vscode-textLink-foreground)",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontFamily: "var(--vscode-font-family)",
    flexShrink: 0,
  },
  headerTitle: { fontSize: "13px", fontWeight: 700, color: "var(--vscode-foreground)" },
  headerSub: { fontSize: "11px", color: "var(--vscode-descriptionForeground)" },
  headerActions: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: "4px",
    flexShrink: 0,
  },
  styleBtn: {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--vscode-button-secondaryForeground, var(--vscode-foreground))",
    background: "var(--vscode-button-secondaryBackground, rgba(255,255,255,0.08))",
    border: "1px solid var(--vscode-widget-border, rgba(255,255,255,0.12))",
    borderRadius: "4px",
    padding: "4px 8px",
    cursor: "pointer",
    fontFamily: "var(--vscode-font-family)",
    whiteSpace: "nowrap",
  },
  stylePanel: {
    flexShrink: 0,
    maxHeight: "38vh",
    overflowY: "auto",
    padding: "10px 12px",
    borderBottom: "1px solid var(--vscode-sideBarSectionHeader-border, rgba(255,255,255,0.1))",
    background: "var(--vscode-editor-background)",
  },
  stylePanelText: {
    fontSize: "12px",
    color: "var(--vscode-descriptionForeground)",
    lineHeight: 1.5,
  },
  stylePanelMuted: {
    fontSize: "11px",
    color: "var(--vscode-descriptionForeground)",
    marginTop: "6px",
  },
  styleError: {
    fontSize: "12px",
    color: "var(--vscode-errorForeground, #f14c4c)",
    lineHeight: 1.5,
  },
  styleBlockInner: { display: "flex", flexDirection: "column", gap: "8px" },
  styleSummary: {
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--vscode-foreground)",
    lineHeight: 1.5,
  },
  styleTier: {
    fontSize: "10px",
    color: "var(--vscode-descriptionForeground)",
    marginTop: "2px",
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
  tabPanel: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    minHeight: 0,
  },
  agentRow: { display: "flex", justifyContent: "flex-start" },
  userRow: { display: "flex", justifyContent: "flex-end" },
  agentBubble: {
    background: "var(--vscode-editorWidget-background)",
    color: "var(--vscode-foreground)",
    borderRadius: "12px 12px 12px 2px",
    padding: "8px 12px",
    fontSize: "12px",
    lineHeight: "1.6",
    maxWidth: "85%",
    border: "1px solid var(--vscode-widget-border, rgba(255,255,255,0.1))",
  },
  userBubble: {
    background: "var(--vscode-button-background)",
    color: "var(--vscode-button-foreground)",
    borderRadius: "12px 12px 2px 12px",
    padding: "8px 12px",
    fontSize: "12px",
    lineHeight: "1.6",
    maxWidth: "85%",
  },
  typingDots: {
    display: "inline-flex",
    gap: "3px",
    fontSize: "16px",
    color: "var(--vscode-descriptionForeground)",
  },
  inputRow: {
    display: "flex",
    gap: "6px",
    padding: "10px 12px",
    borderTop: "1px solid var(--vscode-sideBarSectionHeader-border, rgba(255,255,255,0.1))",
    flexShrink: 0,
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    background: "var(--vscode-input-background)",
    color: "var(--vscode-input-foreground)",
    border: "1px solid var(--vscode-input-border, transparent)",
    borderRadius: "6px",
    padding: "7px 10px",
    fontSize: "12px",
    fontFamily: "var(--vscode-font-family)",
    resize: "none",
    outline: "none",
    lineHeight: "1.4",
  },
  sendBtn: {
    width: "30px",
    height: "30px",
    background: "var(--vscode-button-background)",
    color: "var(--vscode-button-foreground)",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
};
