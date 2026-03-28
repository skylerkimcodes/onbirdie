import React, { useState, useRef, useEffect } from "react";
import type { MeResponse, WorkspaceHintFile } from "../../../types";
import { Profile } from "./ProfileView";
import { openFilePath, requestWorkspaceHints, sendChatMessages } from "../vscodeBridge";

interface Message {
  id: number;
  role: "agent" | "user";
  text: string;
}

interface Props {
  me: MeResponse;
  profile: Profile;
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
  return `Hey ${name}! I'm OnBirdie, your onboarding agent. I know you're a **${role}** — I'll tailor guidance to that.${skillsBlock}\n\nHere's what I can help you with:\n• **Codebase tour** — walk through the parts that matter for your role\n• **Task breakdown** — turn your first task into steps\n• **Q&A** — ask about the repo\n\nWhat would you like to start with?`;
}

export const ChatView: React.FC<Props> = ({ me, profile, onSignOut }) => {
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, role: "agent", text: buildWelcome(me, profile) },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [hints, setHints] = useState<WorkspaceHintFile[] | null>(null);
  const [hintsNote, setHintsNote] = useState<string | undefined>();
  const bottomRef = useRef<HTMLDivElement>(null);

  const highlightKey = me.employer.highlight_paths.join("\0");

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
  }, [highlightKey]);

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

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.headerIcon}>🐦</span>
        <div style={styles.headerText}>
          <div style={styles.headerTitle}>OnBirdie</div>
          <div style={styles.headerSub}>{profile.role}</div>
        </div>
        {onSignOut && (
          <button type="button" style={styles.signOut} onClick={onSignOut}>
            Sign out
          </button>
        )}
      </div>

      {hints && hints.length > 0 && (
        <div style={styles.hintsBar}>
          <div style={styles.hintsTitle}>Suggested for you in this repo</div>
          <div style={styles.hintsChips}>
            {hints.map((f) => (
              <button
                key={f.path}
                type="button"
                style={styles.hintChip}
                onClick={() => openFilePath(f.path)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {hints && hints.length === 0 && hintsNote && (
        <div style={styles.hintsNote}>{hintsNote}</div>
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
        >
          ↑
        </button>
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
    padding: "12px 14px",
    borderBottom: "1px solid var(--vscode-sideBarSectionHeader-border, rgba(255,255,255,0.1))",
    flexShrink: 0,
  },
  headerIcon: { fontSize: "20px" },
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
  hintsBar: {
    flexShrink: 0,
    padding: "8px 12px 10px",
    borderBottom: "1px solid var(--vscode-sideBarSectionHeader-border, rgba(255,255,255,0.08))",
    background: "var(--vscode-sideBar-background)",
  },
  hintsTitle: {
    fontSize: "10px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--vscode-descriptionForeground)",
    marginBottom: "6px",
  },
  hintsChips: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
  },
  hintChip: {
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
  hintsNote: {
    fontSize: "11px",
    color: "var(--vscode-descriptionForeground)",
    padding: "6px 14px 4px",
    flexShrink: 0,
  },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
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
