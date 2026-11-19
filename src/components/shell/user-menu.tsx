"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { useI18n } from "@/i18n/use-i18n";
import { useAuth } from "@/providers/auth-provider";
import { useBackendConnection } from "@/providers/backend-connection-provider";
import { logoutSession } from "@/lib/auth-session";
import { UserAvatar } from "@/features/users/user-avatar";
import { UserDialog } from "@/features/users/user-dialog";

export function UserMenu({ collapsed }: { collapsed: boolean }) {
  const { t } = useI18n(); const { user } = useAuth(); const { config } = useBackendConnection();
  const [editing, setEditing] = useState(false);
  if (!user) return null;
  return <div className="user-identity">
    <button type="button" className="user-trigger" aria-label={t("users.profile")} onClick={() => setEditing(true)}>
      <UserAvatar user={user} />{!collapsed && <span className="user-copy"><strong>{user.name}</strong><span>{user.loginId}</span></span>}
    </button>
    <button className="icon-button user-logout" aria-label={t("auth.logout")} title={t("auth.logout")}
      onClick={() => { if (config) void logoutSession(config.BASE_URL).catch(() => {}); }}><LogOut size={16} aria-hidden="true" /></button>
    {editing && <UserDialog user={user} onDismiss={() => setEditing(false)} onSaved={() => {}} />}
  </div>;
}
