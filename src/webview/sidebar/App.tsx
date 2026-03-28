import React, { useState } from "react";
import { LoginView } from "./components/LoginView";
import { ProfileView, Profile } from "./components/ProfileView";
import { ChatView } from "./components/ChatView";

type Screen = "login" | "profile" | "chat";

export const App: React.FC = () => {
  const [screen, setScreen] = useState<Screen>("login");
  const [profile, setProfile] = useState<Profile | null>(null);

  if (screen === "login") {
    return <LoginView onLogin={() => setScreen("profile")} />;
  }

  if (screen === "profile") {
    return (
      <ProfileView
        onComplete={(p) => {
          setProfile(p);
          setScreen("chat");
        }}
      />
    );
  }

  return <ChatView profile={profile!} />;
};
