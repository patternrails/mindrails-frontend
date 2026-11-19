"use client";

import { FileOutput, Paperclip, Wrench, Activity } from "lucide-react";
import type { BackendSession } from "@/lib/backend-sessions";
import type { ChatTurn } from "@/lib/workspace-conversation";
import { backendEndpoint } from "@/lib/backend-url";
import { sessionToolCounts } from "@/lib/session-summary";
import { useI18n } from "@/i18n/use-i18n";
import { StatusBadge } from "./status-badge";
import { SessionFileList } from "./session-file-list";
import { SessionMetrics } from "./session-metrics";
import type { SessionResources } from "./use-session-resources";

export function SessionDetails({ session, agentName, knowledgeBaseIds, turns, resources, running }: {
  session: BackendSession | null; agentName?: string; knowledgeBaseIds?: readonly string[]; turns: ChatTurn[];
  resources: SessionResources; running: boolean;
}) {
  const { t, locale } = useI18n();
  const missing = t("archive.unknown"), provider = session?.provider, turn = turns.at(-1);
  const tools = sessionToolCounts(turns);
  const number = (value: number | null | undefined) => value == null ? missing : value.toLocaleString(locale);
  const date = (value: string) => new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en");
  const rows = (values: [string, string][]) => <dl className="agent-details">{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
  return <><header><h2>{t("details.title")}</h2><p>{session?.name?.trim() || t("workspace.newSession")}</p></header>
    {session && provider ? <div className="session-details-content">
      <section className="session-details-section"><h3><Paperclip size={14} aria-hidden="true" />{t("sessionDetails.attachments.title")}<span>{resources.attachments.length}</span></h3>
        {resources.attachmentsEnabled ? <SessionFileList kind="attachments" files={resources.attachments.map(file => ({ id: file.id, name: file.filename, bytes: file.bytes,
          description: `v${file.number}`, href: resources.client ? backendEndpoint(resources.client.BASE_URL, `api/asset-storage/versions/${file.id}/download`) : "" }))}
          loading={resources.attachmentsLoading} error={resources.attachmentsError} deleting={resources.deleting} disabled={running}
          onRemove={id => resources.remove("attachments", id)} onRetry={resources.refreshAttachments} /> : <p className="session-details-empty">{t("sessionDetails.filesDisabled")}</p>}
      </section>
      <section className="session-details-section" id="session-deliverables"><h3><FileOutput size={14} aria-hidden="true" />{t("sessionDetails.deliverables.title")}<span>{resources.deliverables.length}</span></h3>
        {resources.deliverablesEnabled ? <SessionFileList kind="deliverables" files={resources.deliverables.map(file => ({ id: file.id, name: file.name, bytes: file.bytes,
          href: resources.client ? backendEndpoint(resources.client.BASE_URL, file.downloadUrl) : "" }))}
          loading={resources.deliverablesLoading} error={resources.deliverablesError} deleting={resources.deleting} disabled={running}
          onRemove={id => resources.remove("deliverables", id)} onRetry={resources.refreshDeliverables} /> : <p className="session-details-empty">{t("sessionDetails.filesDisabled")}</p>}
      </section>
      {resources.mutationError && <p role="alert" className="session-file-error">{resources.mutationError}</p>}
      <section className="session-details-section"><h3><Wrench size={14} aria-hidden="true" />{t("sessionDetails.tools")}<span>{tools.length}</span></h3>
        {tools.length ? <ul className="session-tools-list">{tools.map(tool => <li key={tool.name}><code>{tool.name}</code><span title={t("sessionDetails.executions", { count: tool.count })}>{tool.count.toLocaleString(locale)}×</span></li>)}</ul>
          : <p className="session-details-empty">{t("sessionDetails.noTools")}</p>}
      </section>
      <section className="session-details-section"><h3><Activity size={14} aria-hidden="true" />{t("sessionDetails.execution")}</h3>
        <details className="agent-resource-details" open><summary>{t("rest.latestRequest")}</summary>
          <p className="session-details-empty">{t("sessionDetails.requestScope")}</p>
          {turn ? <><div className="selected-turn"><span>{t("workspace.turn", { count: turns.length })}</span><StatusBadge status={turn.status} /></div>
            {rows([[t("rest.totalWait"), turn.elapsedMs === null ? t("status.waiting") : t("rest.elapsed", { seconds: (turn.elapsedMs / 1000).toFixed(1) })],
              [t("sessionDetails.tokensTotal"), number(turn.usage?.totalTokens)],
              [t("sessionDetails.tokensInput"), number(turn.usage?.inputTokens)],
              [t("sessionDetails.tokensOutput"), number(turn.usage?.outputTokens)]])}
          </> : <p className="session-details-empty">{t("rest.noLocalRequest")}</p>}
        </details>
        <SessionMetrics sessionId={session.id} running={running} feedback={turn?.lastFeedbackAt ? `${turn.id}:${turn.status}` : undefined} />
        <details className="agent-resource-details"><summary>{t("rest.sessionConfig")}</summary>
          {rows([[t("workspace.currentAgent"), agentName ?? missing], [t("rest.sessionName"), session.name ?? missing],
            [t("agents.createdAt"), date(session.createdAt)], [t("rest.configUpdated"), date(session.updatedAt)],
            [t("rest.provider"), provider.name], [t("rest.model"), provider.modelName],
            [t("providers.streaming"), t(provider.streaming ? "providers.enabled" : "providers.disabled")],
            [t("providers.endpoint"), provider.baseUrl ?? missing],
            [t("providers.reasoning"), provider.reasoning === null ? missing : t(provider.reasoning ? "providers.enabled" : "providers.disabled")],
            [t("providers.thinkingLevel"), provider.thinkingLevel ?? missing],
            [t("providers.contextWindow"), number(provider.contextWindow)], [t("providers.maxTokens"), number(provider.maxTokens)]])}
        </details>
        <details className="agent-resource-details"><summary>{t("agents.resourceInfo")}</summary>
          {rows([[t("rest.sessionId"), session.id],
            [t("agents.memoryId"), session.memoryId ?? missing], [t("agents.knowledgeBaseId"), knowledgeBaseIds?.join("\n") || missing]])}
        </details>
      </section>
    </div> : <div className="details-empty"><h3>{t("workspace.chooseSession")}</h3><p>{t("rest.detailsEmpty")}</p></div>}
  </>;
}
