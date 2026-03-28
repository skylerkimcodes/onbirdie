import React, { useEffect, useMemo, useState } from "react";
import type { MeResponse, OnboardingProfilePayload } from "../../lib/types";
import { LoginView } from "./views/LoginView";
import { ProfileView, Profile } from "./views/ProfileView";
import { ChatView } from "./views/ChatView";
import {
  getPersistedState,
  requestLogout,
  requestSession,
  saveOnboardingProfile,
  setPersistedState,
  subscribeToExtension,
  type ExtensionToWebviewMessage,
} from "./vscodeBridge";

type Phase = "loading" | "login" | "profile" | "chat";

function profileFromMe(me: MeResponse): Profile {
  const u = me.user;
  return {
    name: u.display_name?.trim() || u.email.split("@")[0] || "",
    role: u.employee_role ?? "",
    experience: u.experience_band ?? "",
    linkedinUrl: u.linkedin_url ?? "",
    resumeText: "",
    skillsSummary: u.skills_summary ?? "",
  };
}

function mergePersistedLocal(me: MeResponse): Profile {
  const base = profileFromMe(me);
  const persisted = getPersistedState()?.profile;
  if (!persisted) {
    return base;
  }
  return {
    ...base,
    name: persisted.name || base.name,
    role: persisted.role || base.role,
    experience: persisted.experience || base.experience,
    linkedinUrl: persisted.linkedinUrl || base.linkedinUrl,
    resumeText: persisted.resumeText || base.resumeText,
    skillsSummary: persisted.skillsSummary || base.skillsSummary,
  };
}

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
          if (sessionUser.user.profile_completed) {
            const p = profileFromMe(sessionUser);
            setProfile(p);
            setPersistedState({ profile: p });
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
    if (m.user.profile_completed) {
      const p = profileFromMe(m);
      setProfile(p);
      setPersistedState({ profile: p });
      setPhase("chat");
    } else {
      setPhase("profile");
    }
  };

  const handleProfileComplete = async (p: Profile) => {
    const body: OnboardingProfilePayload = {
      display_name: p.name,
      employee_role: p.role,
      experience_band: p.experience,
      linkedin_url: p.linkedinUrl,
      resume_text: p.resumeText,
      skills_summary: p.skillsSummary,
    };
    const r = await saveOnboardingProfile(body);
    if (!r.ok) {
      throw new Error(r.error);
    }
    setMe(r.me);
    const next = profileFromMe(r.me);
    setProfile(next);
    setPersistedState({ profile: next });
    setPhase("chat");
  };

  const handleSignOut = () => {
    requestLogout();
  };

  const profileInitial = useMemo(() => {
    if (!me) {
      return undefined;
    }
    return mergePersistedLocal(me);
  }, [me]);

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
        roleOptions={me.employer.role_options ?? []}
        initial={profileInitial}
        onComplete={handleProfileComplete}
        onSignOut={handleSignOut}
      />
    );
  }

  if (phase === "chat" && me && profile) {
    return (
      <ChatView
        me={me}
        profile={profile}
        onMeUpdated={setMe}
        onSignOut={handleSignOut}
      />
    );
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
