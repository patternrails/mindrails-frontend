"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bot, Plus } from "lucide-react";
import { ManagementPage } from "@/components/shell/management-page";
import { SectionTabs } from "@/components/ui/section-tabs";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { AgentForm } from "@/features/agents/agent-form";
import { AgentError } from "@/features/agents/agent-error";
import { useBackendAgents } from "@/providers/backend-agents-provider";
import type { BackendAgent } from "@/lib/backend-agents";
import { useI18n } from "@/i18n/use-i18n";

type AgentDialog = { epoch: number; type: "create" } |
  { epoch: number; type: "edit" | "delete"; agent: BackendAgent } | null;

export function Agents() {
  const { t, locale } = useI18n();
  const state = useBackendAgents();
  const [tab, setTab] = useState("list");
  const [dialog, setDialog] = useState<AgentDialog>(null);
  const busy = state.mutation !== null || state.paused;
  const available = state.status !== "unavailable";
  const selected = state.agents.find((agent) => agent.id === state.selectedId);
  const liveDialog = dialog?.epoch === state.epoch && available &&
    (dialog.type === "create" || state.agents.some((agent) => agent.id === dialog.agent.id)) ? dialog : null;
  const detail = state.detail;
  const { select, selectedId, detailStatus } = state;

  useEffect(() => {
    if (tab === "details" && selectedId && detailStatus === "idle" && !busy && state.status === "ready") void select(selectedId);
  }, [tab, selectedId, detailStatus, busy, select, state.status]);

  function openDialog(next: AgentDialog) {
    state.clearMutationError();
    setDialog(next);
    if (next && next.type === "edit") void state.select(next.agent.id);
  }
  async function refresh() {
    await state.refresh();
  }
  const createButton = <Button variant="primary" disabled={busy || state.status !== "ready"}
    onClick={() => openDialog({ epoch: state.epoch, type: "create" })}>
    <Plus size={15} aria-hidden="true" />{t("agents.create")}</Button>;
  const emptyState = <div className="empty-state agent-empty"><span className="empty-icon"><Bot size={24} aria-hidden="true" /></span>
    <h2>{t("workspace.noAgentsYet")}</h2><p>{t("agents.empty")}</p>{createButton}</div>;
  const date = (value: string) => <time dateTime={value}>{new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", {
    dateStyle: "medium", timeStyle: "medium",
  }).format(new Date(value))}</time>;
  const editButton = (agent: BackendAgent) => <Button disabled={busy || state.runningAgentIds.includes(agent.id)} onClick={() =>
    openDialog({ epoch: state.epoch, type: "edit", agent })}>{t("agents.editAgent")}</Button>;

  return <ManagementPage title={t("nav.agents")} description={t("agents.description")}>
    {!available ? <div className="agent-notice"><p role="status">{t("agents.unavailable")}</p>
      {state.interruptedWrite && <p role="alert">{t(state.interruptedWrite === "confirmed" ? "agents.savedReconnect" : "agents.writeUncertain")}</p>}

    </div> : <>
      {state.status === "loading" && <p className="agent-loading" role="status">{t("agents.loading")}</p>}
      {state.listError && <div className="agent-notice"><AgentError error={state.listError} />
        {state.feedback && state.feedback.kind !== "missing" && <p>{t("agents.refreshAfterSaveFailed")}</p>}
        <Button disabled={busy} onClick={() => void refresh()}>{t("agents.retry")}</Button></div>}
      <SectionTabs label={t("agents.sections")} value={tab} onValueChange={setTab} items={[
        { id: "list", label: t("agents.list"), content: <>
          <div className="section-heading"><div><h2>{t("agents.yours")} <span className="count-badge">{state.agents.length}</span></h2>
            <p>{t("agents.backendList")}</p></div><div className="agent-actions">
              <Button disabled={busy || state.status === "loading"} onClick={() => void refresh()}>{t("agents.refresh")}</Button>
              {state.agents.length > 0 && createButton}
            </div></div>
          {state.status === "ready" && state.agents.length === 0 ? emptyState : <ul className="agent-list">
            {state.agents.map((agent) => <li className="agent-row" key={agent.id}>
              <span className="agent-icon"><Bot size={19} aria-hidden="true" /></span>
              <div className="agent-summary"><div className="agent-name"><h3>{agent.name}</h3>
              </div><p>{agent.description || t("agents.noDescription")}</p>
                <span className="agent-meta">{t(agent.sessions.length === 1 ? "agents.sessionOne" : "agents.sessionMany", { count: agent.sessions.length })}</span>
              </div>
              <div className="agent-actions" role="group" aria-label={t("agents.actions", { name: agent.name })}>
                <Button variant="ghost" disabled={busy} onClick={() => { setTab("details"); void state.select(agent.id); }}>{t("agents.view")}</Button>
                <Button disabled={busy || state.runningAgentIds.includes(agent.id)} onClick={() => openDialog({ epoch: state.epoch, type: "edit", agent })}>{t("agents.edit")}</Button>
                <Button variant="ghost" className="danger-text" disabled={busy || state.runningAgentIds.includes(agent.id)} onClick={() =>
                  openDialog({ epoch: state.epoch, type: "delete", agent })}>{t("agents.delete")}</Button>
              </div>
            </li>)}
          </ul>}
        </> },
        { id: "details", label: t("agents.details"), content: <>
          {selected ? <>
            <div className="section-heading"><div><h2>{selected.name}</h2><p>{t("agents.configuration")}</p></div>{editButton(selected)}</div>
            <label className="field-label" htmlFor="details-agent">{t("agents.viewAgent")}</label>
            <select className="agent-select details-agent-select" id="details-agent" value={selected.id} disabled={busy}
              onChange={(event) => void state.select(event.target.value)}>
              {state.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
          </> : state.status === "ready" && state.agents.length === 0 ? emptyState : null}
          {state.detailStatus === "loading" && <p className="agent-loading" role="status">{t("agents.loadingDetail")}</p>}
          {state.detailError && <div className="agent-notice"><AgentError error={state.detailError} />
            {state.feedback && state.feedback.kind !== "missing" && <p>{t("agents.refreshAfterSaveFailed")}</p>}
            <Button disabled={busy} onClick={() => selected && void state.select(selected.id)}>{t("agents.retry")}</Button></div>}
          {detail && <>
            <dl className="agent-details">{([
              ["agents.name", detail.name], ["agents.descriptionLabel", detail.description],
              ["agents.goal", detail.goal], ["agents.systemMessage", detail.systemMessage],
            ] as const).map(([label, value]) => <div key={label}><dt>{t(label)}</dt>
              <dd>{value || <span className="muted-value">{t("agents.notProvided")}</span>}</dd></div>)}
              <div><dt>{t("agents.createdAt")}</dt><dd>{date(detail.createdAt)}</dd></div>
              <div><dt>{t("agents.updatedAt")}</dt><dd>{date(detail.updatedAt)}</dd></div>
              <div><dt>{t("agents.sessionsCount")}</dt><dd>{detail.sessions.length}</dd></div>
            </dl>
            <p className="local-note"><Link href="/library">{t("knowledge.assignInLibrary")}</Link></p>
            <details className="agent-resource-details"><summary>{t("agents.resourceInfo")}</summary>
              <dl className="agent-details">{([
                ["agents.id", detail.id], ["agents.ownerId", detail.ownerId], ["agents.memoryId", detail.memoryId],
                ["agents.knowledgeBaseId", detail.knowledgeBaseIds.join("\n")],
              ] as const).map(([label, value]) => <div key={label}><dt>{t(label)}</dt>
                <dd>{value ? <code>{value}</code> : t("agents.notProvided")}</dd></div>)}</dl>
            </details>
            <p className="local-note">{t("agents.sessionConfigHint")}</p>
          </>}
        </> },
      ]} />
      <p className="management-feedback" role="status">{state.feedback && (state.feedback.kind === "missing" ?
        t("agents.error.missing") : t(`agents.${state.feedback.kind}`, { name: state.feedback.name }))}</p>
      {state.mutationError && !liveDialog && <AgentError error={state.mutationError} />}
      {state.uncertain && !liveDialog && <p className="field-error" role="alert">{t("agents.writeUncertain")}</p>}
      <p className="local-note">{t("agents.backendNote")}</p>
    </>}
    {liveDialog?.type === "create" && <Modal title={t("agents.create")} description={t("agents.createDescription")}
      dismissDisabled={busy} onDismiss={() => setDialog(null)}>
      <AgentForm key={liveDialog.epoch} editing={false} pending={busy} serverError={state.mutationError} uncertain={state.uncertain}
        onCancel={() => setDialog(null)} onSubmit={async (value) => {
          const result = await state.create(value);
          if (state.isCurrent(liveDialog.epoch) && result.ok) { setDialog(null); setTab("details"); }
        }} />
    </Modal>}
    {liveDialog?.type === "edit" && <Modal title={t("agents.editAgent")} description={t("agents.editDescription")}
      dismissDisabled={busy} onDismiss={() => setDialog(null)}>
      {detail?.id === liveDialog.agent.id && state.detailStatus === "ready" ?
        <AgentForm key={`${liveDialog.epoch}-${detail.id}`} editing initialValue={detail} pending={busy || state.runningAgentIds.includes(liveDialog.agent.id)}
          serverError={state.mutationError} uncertain={state.uncertain} onCancel={() => setDialog(null)} onSubmit={async (value) => {
            const result = await state.update(liveDialog.agent.id, value);
            if (state.isCurrent(liveDialog.epoch) && result.ok) setDialog(null);
          }} /> : <>
          {state.detailError ? <><AgentError error={state.detailError} />
            <Button onClick={() => void state.select(liveDialog.agent.id)}>{t("agents.retry")}</Button></> :
            <p role="status">{t("agents.loadingDetail")}</p>}
          <Button disabled={busy} onClick={() => setDialog(null)}>{t("common.cancel")}</Button>
        </>}
    </Modal>}
    {liveDialog?.type === "delete" && <Modal title={t("agents.deleteTitle")} description={t("agents.deleteDescription", {
      name: liveDialog.agent.name, sessions: t(liveDialog.agent.sessions.length === 1 ? "agents.sessionOne" : "agents.sessionMany", { count: liveDialog.agent.sessions.length }),
    })} dismissDisabled={busy} onDismiss={() => setDialog(null)}>
      {state.mutationError && <AgentError error={state.mutationError} />}
      {state.uncertain && <p className="field-error" role="alert">{t("agents.writeUncertain")}</p>}
      {busy && <p role="status">{t("agents.deleting")}</p>}
      <div className="modal-actions"><Button disabled={busy} onClick={() => setDialog(null)}>{t("common.cancel")}</Button>
        <Button variant="danger" disabled={busy || state.uncertain || state.runningAgentIds.includes(liveDialog.agent.id)} onClick={async () => {
          const result = await state.remove(liveDialog.agent.id);
          if (state.isCurrent(liveDialog.epoch) && result.ok) setDialog(null);
        }}>{t("agents.deleteAgent")}</Button></div>
    </Modal>}
  </ManagementPage>;
}
