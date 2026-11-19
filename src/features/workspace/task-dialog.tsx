"use client";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useTasks } from "@/providers/task-workspace-provider";
import { useBackendProviders } from "@/providers/backend-providers-provider";
import type { BackendTask } from "@/lib/backend-tasks";
import { useI18n } from "@/i18n/use-i18n";
import { SkillChoices } from "@/features/agents/skill-choices";
import { TaskFeedback } from "./task-feedback";
export function TaskDialog({ task, onDismiss }: { task: BackendTask; onDismiss: () => void }) {
  const tasks = useTasks(), p = useBackendProviders(), { t } = useI18n();
  const [name, setName] = useState(task.name ?? ""), [providerId, setProviderId] = useState(task.provider.id);
  const [skillIds, setSkillIds] = useState<string[]>([...task.skillIds]);
  const provider = p.providers.find(p => p.id === providerId) ?? (task.provider.id === providerId ? task.provider : null);
  const busy = !!tasks.mutation, unchanged = JSON.stringify(skillIds) === JSON.stringify(task.skillIds) && (name.trim() || null) === task.name && providerId === task.provider.id;
  return <Modal title={t("tasks.edit")} description={t("tasks.editHint")} onDismiss={onDismiss} dismissDisabled={busy}>
    <form className="agent-form" onSubmit={event => { event.preventDefault(); if (provider && !unchanged) void tasks.save(task.id, { name: name.trim() || null, provider, skillIds }).then(ok => { if (ok) onDismiss(); }); }}>
      <div className="form-field"><label htmlFor="task-name">{t("tasks.name")}</label><input id="task-name" maxLength={160} value={name} disabled={busy} placeholder={t("tasks.new")} onChange={e => setName(e.target.value)} /></div>
      <div className="form-field"><label htmlFor="task-provider">{t("rest.provider")}</label>
        <select id="task-provider" className="agent-select" disabled={busy} value={providerId} onChange={e => setProviderId(e.target.value)}>
          {!p.providers.some(p => p.id === task.provider.id) && <option value={task.provider.id}>{task.provider.name} · {task.provider.modelName}</option>}
          {p.providers.map(provider => <option key={provider.id} value={provider.id}>{provider.name} · {provider.modelName}{provider.streaming ? ` · ${t("providers.streaming")}` : ""}</option>)}
        </select>
      </div>
      <SkillChoices selected={skillIds} onChange={setSkillIds} disabled={busy} />
      <TaskFeedback />
      <div className="modal-actions"><Button disabled={busy} onClick={onDismiss}>{t("common.cancel")}</Button><Button type="submit" variant="primary" disabled={busy || unchanged || !provider || tasks.uncertain}>{t("agents.save")}</Button></div>
    </form>
  </Modal>;
}
