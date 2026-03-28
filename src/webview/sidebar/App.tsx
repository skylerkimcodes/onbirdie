import React, { useEffect, useState } from "react";
import type { MeResponse } from "../../types";
import { LoginView } from "./components/LoginView";
import { ProfileView, Profile } from "./components/ProfileView";
import { ChatView } from "./components/ChatView";
import {
  getPersistedState,
  requestLogout,
  requestSession,
  setPersistedState,
  subscribeToExtension,
  type ExtensionToWebviewMessage,
} from "./vscodeBridge";

type Phase = "loading" | "login" | "profile" | "chat";

export const App: React.FC = () => {
  const [phase, setPhase] = useState<Phase>("loading");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    const unsub = subscribeToExtension((msg: ExtensionToWebviewMessage) => {
      if (msg.type === "auth/session") {
        const sessionUser = msg.payload.me;
        setMe(sessionUser);
        if (sessionUser) {
          const persisted = getPersistedState()?.profile;
          if (persisted) {
            setProfile(persisted);
            setPhase("chat");
          } else {
            setPhase("profile");
          }
        } else {
          setPhase("login");
        }
        return;
      }
      if (msg.type === "auth/logoutResult") {
        setMe(null);
        setProfile(null);
        setPersistedState({});
        setPhase("login");
      }
    });
    requestSession();
    return unsub;
  }, []);

  const handleLoggedIn = (m: MeResponse) => {
    setMe(m);
    setPhase("profile");
  };

  const handleProfileComplete = (p: Profile) => {
    setProfile(p);
    setPersistedState({ profile: p });
    setPhase("chat");
  };

  const handleSignOut = () => {
    requestLogout();
  };

  if (phase === "loading") {
    return (
      <div style={loadingStyles.wrap}>
        <p style={loadingStyles.text}>Loading…</p>
      </div>
    );
  }

  if (phase === "login") {
    return <LoginView onLoggedIn={handleLoggedIn} />;
  }

  if (phase === "profile" && me) {
    const defaultName = me.user.email.split("@")[0] ?? "";
    return (
      <ProfileView
        defaultName={defaultName}
        employerName={me.employer.name}
        onComplete={handleProfileComplete}
        onSignOut={handleSignOut}
      />
    );
  }

  if (phase === "chat" && profile) {
    return <ChatView profile={profile} onSignOut={handleSignOut} />;
  }

  return <LoginView onLoggedIn={handleLoggedIn} />;
};

const loadingStyles: Record<string, React.CSSProperties> = {
  wrap: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    padding: "24px",
  },
  text: {
    fontSize: "13px",
    color: "var(--vscode-descriptionForeground)",
  },
};
