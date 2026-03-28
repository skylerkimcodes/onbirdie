import React, { useState, useRef, useEffect } from "react";
import { Profile } from "./ProfileView";

interface Message {
  id: number;
  role: "agent" | "user";
  text: string;
}

interface Props {
  profile: Profile;
  onSignOut?: () => void;
}

const WELCOME = (name: string, role: string) =>
  `Hey ${name}! I'm OnBirdie, your onboarding agent. I know you're a ${role} — I'll tailor everything to that.\n\nHere's what I can help you with:\n• **Codebase tour** — I'll walk you through the relevant parts\n• **Task breakdown** — I'll turn your first task into steps\n• **Q&A** — ask me anything about the repo\n\nWhat would you like to start with?`;

export const ChatView: React.FC<Props> = ({ profile, onSignOut }) => {
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, role: "agent", text: WELCOME(profile.name, profile.role) },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const send = () => {
    const text = input.trim();
    if (!text) return;

    const userMsg: Message = { id: Date.now(), role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    // Placeholder — will wire to backend
    setTimeout(() => {
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "agent",
          text: "I'm still being set up — backend coming soon! But I'll be able to help you with that.",
        },
      ]);
    }, 1200);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
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
                <span>•</span><span>•</span><span>•</span>
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
        />
        <button style={styles.sendBtn} onClick={send} disabled={!input.trim()}>
          ↑
        </button>
      </div>
    </div>
  );
};

function formatText(text: string): React.ReactNode {
  return text.split("\n").map((line, i) => (
    <span key={i}>
      {line.replace(/\*\*(.*?)\*\*/g, "$1")}
      {i < text.split("\n").length - 1 && <br />}
    </span>
  ));
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
