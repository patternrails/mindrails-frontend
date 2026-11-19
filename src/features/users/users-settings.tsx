"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, RefreshCw, ArrowDown, ArrowUp } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useBackendConnection } from "@/providers/backend-connection-provider";
import { useAuth } from "@/providers/auth-provider";
import { useI18n } from "@/i18n/use-i18n";
import type { UserProfile, UserRole } from "@/lib/auth-session";
import { UserDialog } from "./user-dialog";
import { UserAvatar } from "./user-avatar";

export function UsersSettings() {
  const { client } = useBackendConnection(); const { user: actor } = useAuth(); const { t, locale } = useI18n();
  const [users, setUsers] = useState<UserProfile[]>([]); const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null); const [query, setQuery] = useState("");
  const [role, setRole] = useState<UserRole | "">(""); const [sort, setSort] = useState("name"); const [descending, setDescending] = useState(false);
  const [editing, setEditing] = useState<UserProfile | "new" | null>(null); const [deleting, setDeleting] = useState<UserProfile | null>(null);
  const [pending, setPending] = useState(false); const [notice, setNotice] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!client || actor?.role !== "SystemAdmin") { setLoading(false); return; } setLoading(true); setError(null);
    try { const result = await client.request<UserProfile[]>("api/users", { signal }); if (!signal?.aborted) setUsers(result ?? []); }
    catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Unable to load users"); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [client, actor?.role]);
  useEffect(() => { const controller = new AbortController(); void Promise.resolve().then(() => { if (!controller.signal.aborted) void load(controller.signal); }); return () => controller.abort(); }, [load]);
  const filtered = useMemo(() => users.filter(user => (!role || user.role === role) &&
    [user.name, user.loginId, user.email].some(s => s.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
    .sort((a, b) => (sort === "created" ? Date.parse(b.createdAt) - Date.parse(a.createdAt) :
      (sort === "login" ? a.loginId : a.name).localeCompare(sort === "login" ? b.loginId : b.name, locale)) * (descending ? -1 : 1)),
    [users, query, role, sort, descending, locale]);
  async function remove() {
    if (!client || !deleting) return; setPending(true); setError(null);
    try { await client.request(`api/users/${deleting.id}`, { method: "DELETE" }); setDeleting(null); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to delete user"); }
    finally { setPending(false); }
  }
  if (actor?.role !== "SystemAdmin") return null;
  return <section className="users-settings" aria-label={t("users.label")}>
    <div className="section-heading"><div><h2>{t("users.label")}</h2><p>{t("users.description")}</p></div>
      <div className="user-actions"><IconButton icon={RefreshCw} label={t("users.reload")} onClick={() => void load()} disabled={!client || loading} />
        <IconButton icon={Plus} label={t("users.create")} onClick={() => { setNotice(false); setEditing("new"); }} disabled={!client} /></div></div>
    <div className="users-toolbar">
      <input aria-label={t("users.search")} placeholder={t("users.search")} type="search" value={query} onChange={e => setQuery(e.target.value)} />
      <select className="agent-select" aria-label={t("users.role")} value={role} onChange={e => setRole(e.target.value as UserRole | "")}>
        <option value="">{t("users.allRoles")}</option><option value="SystemAdmin">{t("users.admin")}</option><option value="Normal">{t("users.normal")}</option></select>
      <select className="agent-select" aria-label={t("users.sort")} value={sort} onChange={e => setSort(e.target.value)}>
        <option value="name">{t("users.sortName")}</option><option value="login">{t("users.sortLogin")}</option><option value="created">{t("users.sortNewest")}</option></select>
      <IconButton icon={descending ? ArrowDown : ArrowUp} label={t(descending ? "users.descending" : "users.ascending")} onClick={() => setDescending(v => !v)} />
    </div>
    {error && <p className="field-error" role="alert">{error}</p>}{notice && <p role="status">{t("users.saved")}</p>}
    {loading ? <p role="status">{t("auth.loading")}</p> : !filtered.length ? <p className="field-hint">{t("users.empty")}</p> :
      <ul className="users-list">{filtered.map(user => <li key={user.id}>
        <UserAvatar user={user} /><div className="users-row-copy"><strong>{user.name}</strong><span>{user.loginId}{user.email ? ` · ${user.email}` : ""}</span></div>
        <span className="user-role">{t(user.role === "SystemAdmin" ? "users.admin" : "users.normal")}</span>
        <div className="user-actions"><IconButton icon={Pencil} label={t("users.edit")} onClick={() => { setNotice(false); setEditing(user); }} />
          <IconButton icon={Trash2} label={t("users.delete")} disabled={user.configuredAdmin || actor.id === user.id} onClick={() => { setError(null); setDeleting(user); }} /></div>
      </li>)}</ul>}
    {editing && <UserDialog user={editing === "new" ? undefined : editing} onDismiss={() => setEditing(null)} onSaved={() => { setNotice(true); void load(); }} />}
    {deleting && <Modal title={t("users.delete")} description={t("users.deleteDescription", { name: deleting.name })} onDismiss={() => setDeleting(null)} dismissDisabled={pending}>
      {error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><Button disabled={pending} onClick={() => setDeleting(null)}>{t("common.cancel")}</Button>
        <Button variant="danger" disabled={pending} onClick={() => void remove()}>{t("users.delete")}</Button></div></Modal>}
  </section>;
}
