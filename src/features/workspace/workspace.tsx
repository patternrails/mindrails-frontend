"use client";

import Link from "next/link";
import { useTasks } from "@/providers/task-workspace-provider";
import { TaskWorkspace } from "./task-workspace";
import { useRef } from "react";
import { WorkspaceFrame } from "@/components/shell/workspace-frame";
import { useWorkspace } from "@/providers/workspace-provider";
import { Transcript } from "./transcript";
import { Composer } from "./composer";
import { SessionDetails } from "./session-details";
import { useSessionResources } from "./use-session-resources";
import { WorkspaceFeedback } from "./workspace-feedback";
import { Button } from "@/components/ui/button";
import { useAssetUploads } from "@/features/assets/use-asset-uploads";
import { pasteClipboardFiles } from "@/lib/clipboard-paste";
import { useArchiveRequest } from "@/features/settings/use-archive-request";
import { useI18n } from "@/i18n/use-i18n";

const parseAssetConfig = (value: unknown) => value as { enabled: boolean; deliverablesEnabled?: boolean };

export function Workspace() {
  const tasks = useTasks();
  return tasks.activeTask ? <TaskWorkspace key={tasks.activeTask.id} task={tasks.activeTask} /> : <SessionWorkspace />;
}

function SessionWorkspace() {
  const w = useWorkspace(), { t } = useI18n(), detailsRef = useRef<HTMLElement>(null);
  const uploads = useAssetUploads(10, w.activeSession?.id);
  const assets = useArchiveRequest("api/asset-storage/config", parseAssetConfig);
  const latest = w.record?.turns.at(-1);
  const resources = useSessionResources({ sessionId: w.activeSession?.id, attachmentsEnabled: !!assets.data?.enabled,
    deliverablesEnabled: !!assets.data?.deliverablesEnabled, running: w.activeWaiting,
    feedback: latest?.lastFeedbackAt ? `${latest.id}:${latest.status}:${latest.stream?.tools.filter(tool => tool.status === "completed").map(tool => tool.id).join(",")}` : "" });
  return <WorkspaceFrame details={<SessionDetails key={w.activeSession?.id} session={w.activeSession} agentName={w.activeAgent?.name}
    knowledgeBaseIds={w.activeAgent?.knowledgeBaseIds} turns={w.record?.turns ?? []} resources={resources} running={w.activeWaiting} />} detailsRef={detailsRef}>
    <section className="workspace-chat" onDragOver={event => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }} onDrop={event => { if (!event.dataTransfer.files.length) return; event.preventDefault(); if (assets.data?.enabled && w.canSend) uploads.add(Array.from(event.dataTransfer.files)); }}
      onPaste={event => { if (assets.data?.enabled && w.canSend) pasteClipboardFiles(event, uploads.add); }} aria-label={t("nav.workspace")}>
      <header className="workspace-heading"><h1>{t("nav.workspace")}</h1>
        <p>{w.activeAgent?.name ?? t("workspace.noAgentSelected")}</p>
        <p className="session-meta"><span>{w.activeSession ? w.activeSession.name?.trim() || t("workspace.newSession") : t("workspace.chooseSession")}</span>
          {w.activeSession && <><span aria-hidden="true">·</span><span>{w.activeSession.provider.modelName}</span></>}
          <span role="status">{w.activeWaiting ? t(w.activeCancelling ? "stream.cancelling" : "status.running") : w.status === "loading" ? t("rest.loading") : ""}</span></p>
      </header>
      <WorkspaceFeedback />
      {w.historyLoading && <p className="local-note" role="status">{t("rest.historyLoading")}</p>}
      {w.activeAgent && w.activeSession && w.record ? <>
        <Transcript session={w.activeSession} record={w.record} agentName={w.activeAgent.name} images={resources.deliverables.filter(file => file.mediaType?.startsWith("image/")).toReversed()} />
        <Composer onAttachmentsSent={resources.refreshAttachments} uploads={uploads} assetsEnabled={!!assets.data?.enabled} key={`${w.epoch}-${w.activeSession.id}`} draft={w.record.draft} generating={w.activeWaiting}
          disabled={!w.canSend} canStop={w.canStop} cancelling={w.activeCancelling} onStop={w.cancelChat}
          onDraftChange={w.setDraft} onSend={w.send} />
      </> : <div className="conversation-empty">
        <h2>{t(w.status === "unavailable" ? "rest.connect" : w.status === "loading" || w.agentsStatus === "loading" ? "rest.loading" : w.activeAgent ? "workspace.start" : "workspace.noAgentsYet")}</h2>
        <p>{t(w.status === "unavailable" ? "rest.connectionHint" : w.activeAgent ? "rest.newFromSidebar" : "workspace.createFirstAgent")}</p>
        {w.status !== "unavailable" && !w.activeAgent && w.agentsStatus === "ready" ? <Link className="text-button" href="/agents">{t("agents.create")}</Link> : null}
        {(w.status === "error" || w.agentsStatus === "error") && <Button disabled={w.busy} onClick={() => { void w.refreshAgents(); void w.refresh(); }}>{t("agents.retry")}</Button>}
      </div>}
    </section>
  </WorkspaceFrame>;
}
