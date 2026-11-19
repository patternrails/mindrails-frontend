"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { safeReturnTo } from "@/lib/auth-return-to";
import { useBackendConnection } from "@/providers/backend-connection-provider";
import { authState, refreshSession, subscribeAuth, type UserProfile } from "@/lib/auth-session";
import { useI18n } from "@/i18n/use-i18n";

type Auth = { user: UserProfile | null; loading: boolean; error: string | null; retry: () => void };
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const { config, initialized } = useBackendConnection();
  const base = config?.BASE_URL;
  const [revision, setRevision] = useState(0);
  const [restored, setRestored] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  useEffect(() => subscribeAuth(() => setRevision(v => v + 1)), []);
  useEffect(() => {
    if (!initialized || !base) return;
    let active = true;
    void refreshSession(base).catch(cause => {
      if (active && !(cause && typeof cause === "object" && "status" in cause && [401, 403].includes(cause.status as number)))
        setError(cause instanceof Error ? cause.message : "Unable to restore login");
    }).finally(() => { if (active) setRestored(base); });
    return () => { active = false; };
  }, [base, initialized, retryCount]);
  const session = base ? authState(base)?.session : null;
  void revision;
  return <Context.Provider value={{ user: session?.user ?? null, loading: !initialized || (!!base && restored !== base && !session), error,
    retry: () => { setError(null); setRestored(null); setRetryCount(c => c + 1); } }}>{children}</Context.Provider>;
}
export function useAuth() {
  const value = useContext(Context); if (!value) throw new Error("AuthProvider is required"); return value;
}
export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading, error, retry } = useAuth();
  const router = useRouter(), pathname = usePathname(); const { t } = useI18n();
  useEffect(() => {
    if (!loading && !user && !error) {
      const target = safeReturnTo(pathname);
      router.replace(target === "/workspace" ? "/login" : `/login?returnTo=${encodeURIComponent(target)}`);
    }
  }, [loading, user, error, router, pathname]);
  if (!user) return <main className="auth-loading" aria-live="polite">{error ? <><p role="alert">{error}</p><button className="ui-button" onClick={retry}>{t("auth.retry")}</button></> : t("auth.loading")}</main>;
  return <div className="authenticated-app" key={user.id}>{children}</div>;
}
