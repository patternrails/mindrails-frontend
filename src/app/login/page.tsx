"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useBackendConnection } from "@/providers/backend-connection-provider";
import { useAuth } from "@/providers/auth-provider";
import { safeReturnTo } from "@/lib/auth-return-to";
import { loginSession } from "@/lib/auth-session";
import { quickSetupSessionKey } from "@/lib/provider-quick-setup";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/wordmark";
import { useI18n } from "@/i18n/use-i18n";

export default function LoginPage() {
  const connection = useBackendConnection(); const auth = useAuth(); const router = useRouter(); const { t } = useI18n();
  const [loginId, setLoginId] = useState(""); const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (auth.user) router.replace(safeReturnTo(new URLSearchParams(window.location.search).get("returnTo"))); }, [auth.user, router]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setPending(true); setError(null);
    try {
      const base = connection.config?.BASE_URL;
      if (!base) throw new Error(t("auth.configurationError"));
      const session = await loginSession(base, loginId, password);
      try { sessionStorage.removeItem(quickSetupSessionKey(`${base}:${session.user.id}`)); }
      catch { /* The console also tracks automatic openings in memory. */ }
      setPassword(""); router.replace(safeReturnTo(new URLSearchParams(window.location.search).get("returnTo")));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to sign in"); }
    finally { setPending(false); }
  }
  return <main className="login-page"><section className="login-card">
    <Wordmark /><h1>{t("auth.title")}</h1><p>{t("auth.description")}</p>
    {connection.error && <div className="field-error" role="alert"><p>{t(connection.config ? "auth.backendUnavailable" : "auth.configurationError")}</p>
      <Button onClick={() => void connection.recheck()} disabled={connection.status === "checking"}>{t("auth.retry")}</Button></div>}
    <form className="agent-form" onSubmit={submit} aria-busy={pending}>
      <fieldset disabled={pending || !connection.initialized || !connection.config}>
        <div className="form-field"><label htmlFor="login-id">{t("auth.loginId")}</label>
          <input id="login-id" autoComplete="username" value={loginId} onChange={e => setLoginId(e.target.value)} required maxLength={64} /></div>
        <div className="form-field"><label htmlFor="login-password">{t("auth.password")}</label>
          <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required maxLength={128} /></div>
        {(error || auth.error) && <p className="field-error" role="alert">{error || auth.error}</p>}
        <Button type="submit" variant="primary">{t(pending ? "auth.signingIn" : "auth.login")}</Button>
      </fieldset>
    </form>
  </section></main>;
}
