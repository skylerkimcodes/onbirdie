import React from "react";

export type SidebarTabId = "chat" | "guide";

interface TabDef {
  id: SidebarTabId;
  label: string;
}

const TABS: TabDef[] = [
  { id: "chat", label: "Chat" },
  { id: "guide", label: "Guide" },
];

interface Props {
  active: SidebarTabId;
  onChange: (id: SidebarTabId) => void;
}

export const SidebarTabBar: React.FC<Props> = ({ active, onChange }) => {
  return (
    <div style={styles.row} role="tablist" aria-label="OnBirdie sidebar">
      {TABS.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            id={`onbirdie-tab-${t.id}`}
            style={{
              ...styles.tab,
              ...(isActive ? styles.tabActive : styles.tabIdle),
            }}
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: "flex",
    flexDirection: "row",
    flexShrink: 0,
    borderBottom: "1px solid var(--vscode-sideBarSectionHeader-border, rgba(255,255,255,0.1))",
    padding: "0 8px",
    gap: "2px",
    background: "var(--vscode-sideBar-background)",
  },
  tab: {
    flex: 1,
    padding: "8px 10px",
    fontSize: "11px",
    fontWeight: 600,
    fontFamily: "var(--vscode-font-family)",
    border: "none",
    borderBottom: "2px solid transparent",
    borderRadius: "4px 4px 0 0",
    marginBottom: "-1px",
    cursor: "pointer",
    background: "transparent",
  },
  tabActive: {
    color: "var(--vscode-foreground)",
    borderBottomColor: "var(--vscode-focusBorder, var(--vscode-textLink-foreground))",
  },
  tabIdle: {
    color: "var(--vscode-descriptionForeground)",
  },
};
