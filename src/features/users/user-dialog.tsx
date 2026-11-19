"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "./user-avatar";
import { useI18n } from "@/i18n/use-i18n";
import { useAuth } from "@/providers/auth-provider";
import { useBackendConnection } from "@/providers/backend-connection-provider";
import { logoutSession, updateAuthUser, type UserProfile, type UserRole } from "@/lib/auth-session";

export function UserDialog({ user, onDismiss, onSaved }: { user?: UserProfile; onDismiss: () => void; onSaved: () => void }) {
  const { user: actor } = useAuth(); const { client, config } = useBackendConnection(); const { t } = useI18n(); const id = useId();
  const [created, setCreated] = useState<UserProfile | null>(null); const target = created ?? user;
  const [value, setValue] = useState({ loginId: user?.loginId ?? "", name: user?.name ?? "", email: user?.email ?? "", bio: user?.bio ?? "",
    role: user?.role ?? "Normal" as UserRole, password: "", currentPassword: "", confirm: "" });
  const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState<string | undefined>();
  const [removeAvatar, setRemoveAvatar] = useState(false); const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null);
  const configured = target?.configuredAdmin;
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!client || !actor || pending) return;
    if (value.password !== value.confirm) { setError(t("users.passwordMismatch")); return; }
    setPending(true); setError(null); let account = target;
    try {
      if (!account) {
        account = await client.request<UserProfile>("api/users", { method: "POST", json: value });
        if (!account) throw new Error("Invalid user response"); setCreated(account);
      }
      if (file) {
        const body = new FormData(); body.set("file", file);
        account = await client.request<UserProfile>(`api/users/${account.id}/avatar`, { method: "POST", body }) ?? account;
      } else if (removeAvatar) account = await client.request<UserProfile>(`api/users/${account.id}/avatar`, { method: "DELETE" }) ?? account;
      if (target) account = await client.request<UserProfile>(`api/users/${account.id}`, { method: "PUT", json: value }) ?? account;
      const credentialsChanged = actor.id === account.id && (!!value.password || value.loginId.toLowerCase() !== actor.loginId || value.role !== actor.role);
      if (config) updateAuthUser(config.BASE_URL, account);
      onSaved(); onDismiss();
      if (credentialsChanged && config) await logoutSession(config.BASE_URL).catch(() => {});
    } catch (cause) {
      setError(`${!target && account ? t("users.partialCreate") + " " : ""}${cause instanceof Error ? cause.message : "Unable to save user"}`);
    } finally { setPending(false); }
  }
  return <Modal title={t(!target ? "users.create" : actor?.id === target.id ? "users.profile" : "users.edit")}
    description={t("users.profileDescription")} onDismiss={onDismiss} dismissDisabled={pending}>
    <form className="agent-form user-form" onSubmit={submit} aria-busy={pending}>
      <fieldset disabled={pending}>
        <div className="avatar-field"><UserAvatar user={{ name: value.name, avatarUrl: removeAvatar ? "" : target?.avatarUrl ?? "" }} preview={file ? preview : undefined} />
          <div className="form-field"><label htmlFor={`${id}-avatar`}>{t("users.avatar")}</label>
            <input id={`${id}-avatar`} type="file" accept="image/png,image/jpeg" onChange={e => {
              const next = e.target.files?.[0]; if (!next) return;
              if (!["image/png", "image/jpeg"].includes(next.type) || next.size > 2 * 1024 * 1024) { setError(t("users.avatarInvalid")); e.target.value = ""; return; }
              setError(null); setFile(next); setPreview(URL.createObjectURL(next)); setRemoveAvatar(false);
            }} /><p className="field-hint">{t("users.avatarHint")}</p>
            {(file || target?.avatarUrl) && <Button variant="ghost" onClick={() => { setFile(null); setPreview(undefined); setRemoveAvatar(true); }}>{t("users.removeAvatar")}</Button>}
          </div></div>
        {configured && <p className="field-hint">{t("users.configured")}</p>}
        <div className="form-field"><label htmlFor={`${id}-login`}>{t("auth.loginId")}</label>
          <input id={`${id}-login`} required minLength={3} maxLength={64} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,63}" autoComplete="off"
            disabled={configured} value={value.loginId} onChange={e => setValue({ ...value, loginId: e.target.value })} /></div>
        <div className="form-field"><label htmlFor={`${id}-name`}>{t("users.name")}</label>
          <input id={`${id}-name`} required maxLength={100} value={value.name} onChange={e => setValue({ ...value, name: e.target.value })} /></div>
        <div className="form-field"><label htmlFor={`${id}-email`}>{t("users.email")}</label>
          <input id={`${id}-email`} type="email" maxLength={254} autoComplete="email" value={value.email} onChange={e => setValue({ ...value, email: e.target.value })} /></div>
        <div className="form-field"><label htmlFor={`${id}-bio`}>{t("users.bio")}</label>
          <textarea id={`${id}-bio`} maxLength={2000} rows={3} value={value.bio} onChange={e => setValue({ ...value, bio: e.target.value })} /></div>
        <div className="form-field"><label htmlFor={`${id}-role`}>{t("users.role")}</label>
          <select className="agent-select" id={`${id}-role`} disabled={!actor || actor.role !== "SystemAdmin" || configured}
            value={value.role} onChange={e => setValue({ ...value, role: e.target.value as UserRole })}>
            <option value="Normal">{t("users.normal")}</option><option value="SystemAdmin">{t("users.admin")}</option></select></div>
        {!configured && <>
          <div className="form-field"><label htmlFor={`${id}-password`}>{t(target ? "users.newPassword" : "auth.password")}</label>
            <input id={`${id}-password`} type="password" autoComplete="new-password" minLength={12} maxLength={128} required={!target}
              value={value.password} onChange={e => setValue({ ...value, password: e.target.value })} /><p className="field-hint">{t("users.passwordHint")}</p></div>
          <div className="form-field"><label htmlFor={`${id}-confirm`}>{t("users.confirmPassword")}</label>
            <input id={`${id}-confirm`} type="password" autoComplete="new-password" maxLength={128} required={!!value.password}
              value={value.confirm} onChange={e => setValue({ ...value, confirm: e.target.value })} /></div>
          {target?.id === actor?.id && !!value.password && <div className="form-field"><label htmlFor={`${id}-current`}>{t("users.currentPassword")}</label>
            <input id={`${id}-current`} type="password" autoComplete="current-password" required maxLength={128} value={value.currentPassword}
              onChange={e => setValue({ ...value, currentPassword: e.target.value })} /></div>}
        </>}
      </fieldset>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="modal-actions"><Button disabled={pending} onClick={onDismiss}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" disabled={pending || !client}>{t(pending ? "users.saving" : !target ? "users.create" : "users.save")}</Button></div>
    </form>
  </Modal>;
}
