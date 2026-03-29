import React, { useState, useRef, useEffect, useCallback } from "react";
import type { ChatCodeRef, MeResponse, StyleReviewOutcome, WorkspaceHintFile } from "../../../lib/types";
import { Profile } from "./ProfileView";
import {
  requestStyleReview,
  requestWorkspaceHints,
  openCodeRef,
  sendChatMessages,
  subscribeToExtension,
  type ExtensionToWebviewMessage,
} from "../vscodeBridge";
import { WorkspaceGuidePanel } from "../components/WorkspaceGuidePanel";
import { SidebarTabBar, type SidebarTabId } from "../components/SidebarTabBar";
import { StyleReviewTab } from "../components/StyleReviewTab";
import { TourTab } from "../components/TourTab";
import { OB_EASE } from "../motion";

interface Message {
  id: number;
  role: "agent" | "user";
  text: string;
  codeRefs?: ChatCodeRef[];
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
  return `Hey ${name}! I'm OnBirdie, your onboarding agent. I know you're a **${role}** — I'll tailor guidance to that.${skillsBlock}\n\nHere's what I can help you with:\n• **Chat** (below) — ask about the repo or your tasks\n• **Tour** — walk the codebase for your role (opens first; runs a guided pass on startup)\n• **Guide** — suggested files, team tasks, and your flock of **birdies** (onboarding milestones)\n• **Style** — review staged changes against your style guide\n\nWhat would you like to start with?`;
}

const CHAT_HEIGHT_KEY = "onbirdie.sidebarChatHeightPx";
const DEFAULT_CHAT_HEIGHT = 320;
const MIN_CHAT_HEIGHT = 140;
const MAX_CHAT_FRAC = 0.82;

function readStoredChatHeight(): number {
  try {
    const raw = localStorage.getItem(CHAT_HEIGHT_KEY);
    if (raw) {
      const n = parseInt(raw, 10);
      if (!Number.isNaN(n) && n >= MIN_CHAT_HEIGHT) {
        return n;
      }
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_CHAT_HEIGHT;
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
  const [chatHeightPx, setChatHeightPx] = useState(readStoredChatHeight);
  const bottomRef = useRef<HTMLDivElement>(null);
  const mainSplitRef = useRef<HTMLDivElement>(null);
  const chatDragRef = useRef<{ startY: number; startH: number } | null>(null);

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
        setHintsNote(undefined);
      } else {
        setHints([]);
        setHintsNote(res.error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [highlightKey, me.employer.highlight_paths]);

  const clampChatHeight = useCallback((h: number) => {
    const el = mainSplitRef.current;
    const maxPx = el
      ? Math.max(MIN_CHAT_HEIGHT, Math.floor(el.clientHeight * MAX_CHAT_FRAC))
      : 560;
    return Math.min(maxPx, Math.max(MIN_CHAT_HEIGHT, Math.round(h)));
  }, []);

  useEffect(() => {
    const root = mainSplitRef.current;
    if (!root) {
      return;
    }
    const apply = () => {
      setChatHeightPx((h) => clampChatHeight(h));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(root);
    return () => ro.disconnect();
  }, [clampChatHeight]);

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
      const result = await sendChatMessages(apiMessages, me.employer.highlight_paths);
      setIsTyping(false);
      if (result.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            role: "agent",
            text: result.message,
            codeRefs: result.code_refs.length ? result.code_refs : undefined,
          },
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

  const userDisplayName = (
    profile.name ||
    me.user.display_name ||
    me.user.email.split("@")[0] ||
    me.user.email
  ).trim();

  const onChatResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      chatDragRef.current = { startY: e.clientY, startH: chatHeightPx };
      document.body.style.cursor = "ns-resize";
      const onMove = (ev: MouseEvent) => {
        const drag = chatDragRef.current;
        if (!drag) {
          return;
        }
        const next = drag.startH + (drag.startY - ev.clientY);
        setChatHeightPx(clampChatHeight(next));
      };
      const onUp = () => {
        chatDragRef.current = null;
        document.body.style.cursor = "";
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        setChatHeightPx((h) => {
          const c = clampChatHeight(h);
          try {
            localStorage.setItem(CHAT_HEIGHT_KEY, String(c));
          } catch {
            /* ignore */
          }
          return c;
        });
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [chatHeightPx, clampChatHeight]
  );

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.headerIcon}>🐦</span>
        <div style={styles.headerText}>
          <div style={styles.headerTitle}>OnBirdie</div>
          <div style={styles.headerSub}>{profile.role}</div>
        </div>
        <div style={styles.headerActions}>
          <div style={styles.userName} title={me.user.email}>
            {userDisplayName}
          </div>
          {onSignOut && (
            <button type="button" style={styles.signOut} onClick={onSignOut}>
              Sign out
            </button>
          )}
        </div>
      </div>

      <SidebarTabBar active={activeTab} onChange={setActiveTab} />

      <div ref={mainSplitRef} style={styles.mainSplit}>
        {activeTab === "tour" ? (
          <div
            key="tour"
            style={styles.tabPanelAnimated}
            role="tabpanel"
            aria-labelledby="onbirdie-tab-tour"
          >
            <TourTab userRole={profile.role} />
          </div>
        ) : activeTab === "style" ? (
          <div
            key="style"
            style={styles.tabPanelAnimated}
            role="tabpanel"
            aria-labelledby="onbirdie-tab-style"
          >
            <StyleReviewTab
              busy={styleReviewBusy}
              outcome={styleReviewOutcome}
              onRun={startStyleReview}
            />
          </div>
        ) : (
          <div
            key="guide"
            style={styles.tabPanelAnimated}
            role="tabpanel"
            aria-labelledby="onbirdie-tab-guide"
          >
            <WorkspaceGuidePanel
              me={me}
              hints={hints}
              hintsNote={hintsNote}
              onMeUpdated={onMeUpdated}
            />
          </div>
        )}

        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Drag to resize chat"
          tabIndex={0}
          style={styles.chatResizeHandle}
          onMouseDown={onChatResizeStart}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 24 : 12;
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              const delta = e.key === "ArrowUp" ? step : -step;
              setChatHeightPx((h) => {
                const c = clampChatHeight(h + delta);
                try {
                  localStorage.setItem(CHAT_HEIGHT_KEY, String(c));
                } catch {
                  /* ignore */
                }
                return c;
              });
            }
          }}
        />

        <div
          style={{ ...styles.chatDock, height: chatHeightPx }}
          aria-label="Chat with OnBirdie"
        >
          <div style={styles.messages}>
            {messages.map((msg) => (
              <div key={msg.id} style={msg.role === "user" ? styles.userRow : styles.agentRow}>
                {msg.role === "user" ? (
                  <div style={styles.userBubble}>{formatText(msg.text)}</div>
                ) : (
                  <div style={styles.agentBlock}>
                    <div style={styles.agentBubble}>{formatText(msg.text)}</div>
                    {msg.codeRefs?.length ? (
                      <div style={styles.codeRefList}>
                        {msg.codeRefs.map((r, i) => (
                          <button
                            key={`${r.path}-${r.start_line}-${i}`}
                            type="button"
                            style={styles.codeRefBtn}
                            onClick={() => openCodeRef(r)}
                          >
                            Open {r.path} — L{r.start_line}–{r.end_line}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
            {isTyping && (
              <div style={styles.agentRow}>
                <div style={styles.agentBubble}>
                  <span style={styles.typingDots}>
                    <span style={styles.typingDot}>•</span>
                    <span style={{ ...styles.typingDot, ...styles.typingDot2 }}>•</span>
                    <span style={{ ...styles.typingDot, ...styles.typingDot3 }}>•</span>
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
    padding: "10px 12px",
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
    transition: `opacity 0.2s ${OB_EASE}, color 0.2s ${OB_EASE}`,
  },
  headerTitle: { fontSize: "13px", fontWeight: 700, color: "var(--vscode-foreground)" },
  headerSub: { fontSize: "11px", color: "var(--vscode-descriptionForeground)" },
  headerActions: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: "5px",
    flexShrink: 0,
    maxWidth: "42%",
    minWidth: 0,
  },
  userName: {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--vscode-foreground)",
    lineHeight: 1.25,
    textAlign: "right",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    width: "100%",
  },
  mainSplit: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  chatResizeHandle: {
    flexShrink: 0,
    height: "7px",
    marginTop: "-1px",
    cursor: "ns-resize",
    userSelect: "none",
    touchAction: "none",
    background: "var(--vscode-sideBar-background)",
    borderTop: "1px solid var(--vscode-sideBarSectionHeader-border, rgba(255,255,255,0.12))",
    borderBottom: "1px solid var(--vscode-sideBarSectionHeader-border, rgba(255,255,255,0.08))",
    position: "relative",
    zIndex: 2,
    transition: `background 0.22s ${OB_EASE}, border-color 0.22s ${OB_EASE}`,
  },
  chatDock: {
    flexShrink: 0,
    flexGrow: 0,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
    transition: `height 0.24s ${OB_EASE}`,
  },
  tabPanel: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  tabPanelAnimated: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    animation: `ob-panel-in 0.36s ${OB_EASE}`,
  },
  messages: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "8px 12px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  agentRow: { display: "flex", justifyContent: "flex-start" },
  userRow: { display: "flex", justifyContent: "flex-end" },
  agentBlock: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "6px",
    maxWidth: "85%",
  },
  agentBubble: {
    background: "var(--vscode-editorWidget-background)",
    color: "var(--vscode-foreground)",
    borderRadius: "10px 10px 10px 2px",
    padding: "8px 12px",
    fontSize: "12px",
    lineHeight: "1.5",
    maxWidth: "100%",
    border: "1px solid var(--vscode-widget-border, rgba(255,255,255,0.1))",
    animation: `ob-msg-in 0.34s ${OB_EASE}`,
    transition: `border-color 0.22s ${OB_EASE}, box-shadow 0.22s ${OB_EASE}`,
  },
  codeRefList: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: "4px",
    width: "100%",
  },
  codeRefBtn: {
    fontSize: "10px",
    fontWeight: 600,
    textAlign: "left",
    padding: "5px 8px",
    borderRadius: "6px",
    border: "1px solid var(--vscode-widget-border, rgba(255,255,255,0.12))",
    background: "var(--vscode-editorWidget-background)",
    color: "var(--vscode-textLink-foreground)",
    cursor: "pointer",
    fontFamily: "var(--vscode-font-family)",
    lineHeight: 1.35,
    transition: `opacity 0.2s ${OB_EASE}, border-color 0.2s ${OB_EASE}`,
  },
  userBubble: {
    background: "var(--vscode-button-background)",
    color: "var(--vscode-button-foreground)",
    borderRadius: "10px 10px 2px 10px",
    padding: "8px 12px",
    fontSize: "12px",
    lineHeight: "1.5",
    maxWidth: "85%",
    animation: `ob-msg-in 0.34s ${OB_EASE}`,
    transition: `opacity 0.2s ${OB_EASE}, transform 0.2s ${OB_EASE}`,
  },
  typingDots: {
    display: "inline-flex",
    gap: "5px",
    fontSize: "14px",
    color: "var(--vscode-descriptionForeground)",
    alignItems: "center",
  },
  typingDot: {
    animation: "ob-pulse-soft 1.1s ease-in-out infinite",
  },
  typingDot2: {
    animationDelay: "0.18s",
  },
  typingDot3: {
    animationDelay: "0.36s",
  },
  inputRow: {
    display: "flex",
    gap: "6px",
    padding: "8px 12px",
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
    padding: "6px 10px",
    fontSize: "12px",
    minHeight: "28px",
    fontFamily: "var(--vscode-font-family)",
    resize: "none",
    outline: "none",
    lineHeight: "1.4",
    transition: `border-color 0.22s ${OB_EASE}, box-shadow 0.22s ${OB_EASE}`,
  },
  sendBtn: {
    width: "30px",
    height: "30px",
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
    transition: `opacity 0.2s ${OB_EASE}, transform 0.15s ${OB_EASE}, background 0.2s ${OB_EASE}`,
  },
};
