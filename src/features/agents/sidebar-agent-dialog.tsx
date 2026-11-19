"use client";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { AgentForm } from "./agent-form";
import { AgentError } from "./agent-error";
import { useBackendAgents } from "@/providers/backend-agents-provider";
import { useI18n } from "@/i18n/use-i18n";
import type { BackendAgent } from "@/lib/backend-agents";

export type SidebarAgentDialog = { epoch: number; type: "create" | "edit" | "view" | "delete"; agent?: BackendAgent };
export function SidebarAgentDialog({ dialog, onDismiss }: { dialog: SidebarAgentDialog; onDismiss: () => void }) {
  const state = useBackendAgents(), { t } = useI18n();
  if (dialog.epoch !== state.epoch || state.status === "unavailable" || (dialog.agent && !state.agents.some(agent => agent.id === dialog.agent!.id))) return null;
  const busy = state.mutation !== null || state.paused || dialog.type !== "view" && !!dialog.agent && state.runningAgentIds.includes(dialog.agent.id);
  const detail = state.detail?.id === dialog.agent?.id && state.detailStatus === "ready" ? state.detail : null;
  const type = dialog.type;
  return <Modal title={t(type === "create" ? "agents.create" : type === "edit" ? "agents.editAgent" : type === "delete" ? "agents.deleteTitle" : "sidebar.viewAgent")}
    description={type === "delete" ? t("agents.deleteDescription", { name: dialog.agent!.name, sessions: t(dialog.agent!.sessions.length === 1 ? "agents.sessionOne" : "agents.sessionMany", { count: dialog.agent!.sessions.length }) }) : type === "create" ? t("agents.createDescription") : dialog.agent?.name ?? ""}
    dismissDisabled={busy} onDismiss={onDismiss}>
    {type === "create" ? <AgentForm editing={false} pending={busy} serverError={state.mutationError} uncertain={state.uncertain} onCancel={onDismiss} onSubmit={async value => {
      const result = await state.create(value); if (state.isCurrent(dialog.epoch) && result.ok) onDismiss();
    }} /> : type === "delete" ? <>
      {state.mutationError && <AgentError error={state.mutationError} />}
      {state.uncertain && <p role="alert" className="field-error">{t("agents.writeUncertain")}</p>}
      <div className="modal-actions"><Button disabled={busy} onClick={onDismiss}>{t("common.cancel")}</Button><Button variant="danger" disabled={busy || state.uncertain} onClick={async () => { const result = await state.remove(dialog.agent!.id); if (state.isCurrent(dialog.epoch) && result.ok) onDismiss(); }}>{t("agents.deleteAgent")}</Button></div>
    </> : !detail ? <>
      {state.detailError ? <><AgentError error={state.detailError} /><Button onClick={() => void state.select(dialog.agent!.id)}>{t("agents.retry")}</Button></> : <p role="status">{t("agents.loadingDetail")}</p>}
    </> : type === "edit" ? <AgentForm editing initialValue={detail} pending={busy} serverError={state.mutationError} uncertain={state.uncertain} onCancel={onDismiss} onSubmit={async value => {
      const result = await state.update(detail.id, value); if (state.isCurrent(dialog.epoch) && result.ok) onDismiss();
    }} /> : <><dl className="sidebar-agent-detail">{([ ["agents.name", detail.name], ["agents.descriptionLabel", detail.description], ["agents.goal", detail.goal], ["agents.systemMessage", detail.systemMessage] ] as const).map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value || "—"}</dd></div>)}</dl><Button onClick={onDismiss}>{t("common.cancel")}</Button></>}
  </Modal>;
}
