import React from "react";
import { OB_EASE } from "../motion";

export type SidebarTabId = "guide" | "tour" | "style";

interface TabDef {
  id: SidebarTabId;
  label: string;
}

const TABS: TabDef[] = [
  { id: "tour", label: "Tour" },
  { id: "guide", label: "Guide" },
  { id: "style", label: "Style" },
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
    borderBottom: "1px solid var(--vscode-sideBarSectionHeader-border, rgba(255,255,255,0.08))",
    padding: "8px 10px",
    gap: "6px",
    background: "var(--vscode-sideBar-background)",
  },
  tab: {
    flex: 1,
    padding: "7px 10px",
    fontSize: "11px",
    fontWeight: 600,
    fontFamily: "var(--vscode-font-family)",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    transition: `background 0.24s ${OB_EASE}, color 0.24s ${OB_EASE}, box-shadow 0.24s ${OB_EASE}, transform 0.2s ${OB_EASE}`,
  },
  tabActive: {
    color: "var(--vscode-foreground)",
    background: "var(--vscode-editorWidget-background, rgba(255,255,255,0.06))",
    boxShadow: "inset 0 0 0 1px var(--vscode-widget-border, rgba(255,255,255,0.08))",
    transform: "translateY(-0.5px)",
  },
  tabIdle: {
    color: "var(--vscode-descriptionForeground)",
    background: "transparent",
    transform: "translateY(0)",
    boxShadow: "none",
  },
};
