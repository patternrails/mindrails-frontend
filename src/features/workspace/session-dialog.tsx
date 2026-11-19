"use client";

import { ListTodo, MessageSquare } from "lucide-react";
import { useTasks } from "@/providers/task-workspace-provider";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useBackendProviders } from "@/providers/backend-providers-provider";
import { useWorkspace } from "@/providers/workspace-provider";
import { useI18n } from "@/i18n/use-i18n";
import { sessionWrite, type BackendSession } from "@/lib/backend-sessions";
import { WorkspaceFeedback } from "./workspace-feedback";

export function SessionDialog({ session, onDismiss, onCreated }: { session?: BackendSession; onDismiss: () => void; onCreated?: () => void }) {
  const { t } = useI18n(), w = useWorkspace(), p = useBackendProviders(), tasks = useTasks();
  const [kind, setKind] = useState<"session" | "task">("session");
  const busy = w.busy || !!tasks.mutation || !!session && w.activeWaiting;
  const compatible = p.providers;
  const [providerChoice, setProvider] = useState<string | null>(session?.provider.id ?? null);
  const providerId = providerChoice ?? p.defaultProvider?.id ?? "";
  const [systemMessage, setSystemMessage] = useState(session?.systemMessage ?? "");
  const [name, setName] = useState(session?.name ?? "");
  const selected = compatible.find((provider) => provider.id === providerId) ??
    (session?.provider.id === providerId ? session.provider : null);
  const instructions = systemMessage.trim() ? systemMessage : null;
  const unchanged = !!session && providerId === session.provider.id && instructions === session.systemMessage && (name.trim() || null) === session.name;
  return <Modal title={t(session ? "rest.edit" : "tasks.createResource")}
    description={t(session ? "rest.resetHint" : "tasks.createHint")} dismissDisabled={busy} onDismiss={onDismiss}>
    <form className="agent-form" onSubmit={async (event) => {
      event.preventDefault();
      if (!selected || busy || w.uncertain || (session && unchanged)) return;
      if (!session && kind === "task") {
        if (w.agentId && tasks.startDraft(w.agentId, selected)) { onDismiss(); onCreated?.(); }
        return;
      }
      const success = session ? await w.updateSession(sessionWrite(session, providerId, instructions, name.trim() || null)) : await w.startSession(providerId);
      if (success) { if (!session) tasks.closeWorkspace(); onDismiss(); if (!session) onCreated?.(); }
    }}>
      {!session && <fieldset className="workspace-kind-choice"><legend>{t("tasks.resourceType")}</legend>
        <label data-selected={kind === "session"}><input type="radio" name="resource-kind" value="session" checked={kind === "session"} disabled={busy} onChange={() => setKind("session")} /><MessageSquare size={19} aria-hidden="true" /><span><strong>{t("tasks.session")}</strong><small>{t("tasks.sessionHint")}</small></span></label>
        <label data-selected={kind === "task"}><input type="radio" name="resource-kind" value="task" checked={kind === "task"} disabled={busy} onChange={() => setKind("task")} /><ListTodo size={19} aria-hidden="true" /><span><strong>{t("tasks.task")}</strong><small>{t("tasks.taskHint")}</small></span></label>
      </fieldset>}
      <label className="field-label" htmlFor="session-provider">{t("rest.provider")}</label>
      <select id="session-provider" className="agent-select" value={providerId} disabled={busy} required onChange={(e) => setProvider(e.target.value)}>
        <option value="">{t("rest.chooseProvider")}</option>
        {session && !compatible.some((p) => p.id === session.provider.id) &&
          <option value={session.provider.id}>{session.provider.name} · {session.provider.modelName}</option>}
        {compatible.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} · {provider.modelName}{provider.streaming ? ` · ${t("providers.streaming")}` : ""}{provider.id === p.defaultProvider?.id ? ` · ${t("providers.default")}` : ""}</option>)}
      </select>
      {p.status === "loading" && <p role="status">{t("providers.loading")}</p>}
      {(p.status === "error" || compatible.length === 0) && <p>{t("rest.noProvider")} <Button disabled={busy} onClick={() => void p.retry()}>{t("providers.retry")}</Button></p>}
      {session && <>
        <div className="form-field">
          <label htmlFor="session-name">{t("rest.sessionName")}</label>
          <input id="session-name" maxLength={160} value={name} disabled={busy} onChange={e => setName(e.target.value)} />
        </div>
        <div className="form-field">
          <label htmlFor="session-system">{t("agents.systemMessage")}</label>
          <textarea id="session-system" rows={5} value={systemMessage} disabled={busy} onChange={(e) => setSystemMessage(e.target.value)} />
        </div>
      </>}
      <WorkspaceFeedback />
      <div className="modal-actions"><Button disabled={busy} onClick={onDismiss}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" disabled={busy || w.uncertain || !selected || (!!session && unchanged)}>{t(session ? "agents.save" : kind === "task" ? "tasks.new" : "workspace.newSession")}</Button></div>
    </form>
  </Modal>;
}
