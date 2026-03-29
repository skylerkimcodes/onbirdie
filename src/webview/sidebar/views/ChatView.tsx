import React, { useState, useRef, useEffect } from "react";
import type { MeResponse, StyleReviewOutcome, WorkspaceHintFile } from "../../../lib/types";
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
import { StyleReviewTab } from "../components/StyleReviewTab";
import { TourTab } from "../components/TourTab";

interface Message {
  id: number;
  role: "agent" | "user";
  text: string;
}

interface ChatViewProps {
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
  return `Hey ${name}! I'm OnBirdie, your onboarding agent. I know you're a **${role}** — I'll tailor guidance to that.${skillsBlock}\n\nHere's what I can help you with:\n• **Chat** (below) — ask about the repo or your tasks\n• **Guide** — suggested files, employer tasks, and your onboarding run\n• **Tour** — walk the codebase for your role\n• **Style** — review staged changes against your style guide\n\nWhat would you like to start with?`;
}

export const ChatView: React.FC<ChatViewProps> = ({ me, profile, onMeUpdated, onSignOut }) => {
  const [activeTab, setActiveTab] = useState<SidebarTabId>("tour");
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, role: "agent", text: buildWelcome(me, profile) },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [hints, setHints] = useState<WorkspaceHintFile[] | null>(null);
  const [hintsNote, setHintsNote] = useState<string | undefined>();
  const [styleReviewBusy, setStyleReviewBusy] = useState(false);
  const [styleReviewOutcome, setStyleReviewOutcome] = useState<StyleReviewOutcome | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const highlightKey = me.employer.highlight_paths.join("\0");

  useEffect(() => {
    return subscribeToExtension((msg: ExtensionToWebviewMessage) => {
      if (msg.type === "styleReview/result") {
        setStyleReviewBusy(false);
        setStyleReviewOutcome(msg.payload);
      }
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

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
            text: `**Could not reach the assistant.** ${result.error}\n\nConfigure **K2_BASE_URL** + **K2_API_KEY** (preferred for chat), or **LAVA_SECRET_KEY** (see https://lava.so/docs), or **OPENAI_API_KEY**, in \`backend/.env\`, and run the API with \`uvicorn\`.`,
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

  const startStyleReview = () => {
    setStyleReviewBusy(true);
    setStyleReviewOutcome(null);
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
          {onSignOut && (
            <button type="button" style={styles.signOut} onClick={onSignOut}>
              Sign out
            </button>
          )}
        </div>
      </div>

      <SidebarTabBar active={activeTab} onChange={setActiveTab} />

      <div style={styles.mainSplit}>
        {activeTab === "tour" ? (
          <div style={styles.tabPanel} role="tabpanel" aria-labelledby="onbirdie-tab-tour">
            <TourTab userRole={profile.role} />
          </div>
        ) : activeTab === "style" ? (
          <div style={styles.tabPanel} role="tabpanel" aria-labelledby="onbirdie-tab-style">
            <StyleReviewTab
              busy={styleReviewBusy}
              outcome={styleReviewOutcome}
              onRun={startStyleReview}
            />
          </div>
        ) : (
          <div style={styles.tabPanel} role="tabpanel" aria-labelledby="onbirdie-tab-guide">
            <WorkspaceGuidePanel
              me={me}
              hints={hints}
              hintsNote={hintsNote}
              onMeUpdated={onMeUpdated}
            />
          </div>
        )}

        <div style={styles.chatDock} aria-label="Chat with OnBirdie">
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
      </div>
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
  mainSplit: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  chatDock: {
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    borderTop: "1px solid var(--vscode-sideBarSectionHeader-border, rgba(255,255,255,0.12))",
    maxHeight: "min(30vh, 220px)",
    minHeight: "120px",
    overflow: "hidden",
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
    minHeight: 0,
    overflowY: "auto",
    padding: "6px 10px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  agentRow: { display: "flex", justifyContent: "flex-start" },
  userRow: { display: "flex", justifyContent: "flex-end" },
  agentBubble: {
    background: "var(--vscode-editorWidget-background)",
    color: "var(--vscode-foreground)",
    borderRadius: "10px 10px 10px 2px",
    padding: "6px 10px",
    fontSize: "11px",
    lineHeight: "1.5",
    maxWidth: "85%",
    border: "1px solid var(--vscode-widget-border, rgba(255,255,255,0.1))",
  },
  userBubble: {
    background: "var(--vscode-button-background)",
    color: "var(--vscode-button-foreground)",
    borderRadius: "10px 10px 2px 10px",
    padding: "6px 10px",
    fontSize: "11px",
    lineHeight: "1.5",
    maxWidth: "85%",
  },
  typingDots: {
    display: "inline-flex",
    gap: "3px",
    fontSize: "14px",
    color: "var(--vscode-descriptionForeground)",
  },
  inputRow: {
    display: "flex",
    gap: "5px",
    padding: "6px 10px",
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
    padding: "5px 8px",
    fontSize: "11px",
    fontFamily: "var(--vscode-font-family)",
    resize: "none",
    outline: "none",
    lineHeight: "1.4",
  },
  sendBtn: {
    width: "26px",
    height: "26px",
    background: "var(--vscode-button-background)",
    color: "var(--vscode-button-foreground)",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
    fontSize: "14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
};
