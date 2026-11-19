"use client";
import { useCallback, useState } from "react";
import { Activity, CalendarClock, FileOutput, Wrench } from "lucide-react";
import type { BackendTask, TaskExecution } from "@/lib/backend-tasks";
import type { SessionStream } from "@/lib/session-stream";
import { useI18n } from "@/i18n/use-i18n";
import { useArchiveRequest } from "@/features/settings/use-archive-request";
import { parseTaskDeliverables } from "@/lib/task-deliverables";
import { backendEndpoint } from "@/lib/backend-url";
import { SessionFileList } from "./session-file-list";
import { taskStatusLabels } from "./task-status";
const parseConfig = (value: unknown) => value as { enabled: boolean; deliverablesEnabled?: boolean };
export function TaskDetails({ task, execution, stream, agentName, running, feedback }: {
  task: BackendTask; execution?: TaskExecution; stream?: SessionStream; agentName?: string; running: boolean; feedback: string;
}) {
  const { t, locale } = useI18n(), cfg = useArchiveRequest("api/asset-storage/config", parseConfig);
  const parse = useCallback((value: unknown) => parseTaskDeliverables(value, execution?.id), [execution?.id]);
  const files = useArchiveRequest(execution && cfg.data?.deliverablesEnabled ? `api/asset-storage/task-executions/${execution.id}/deliverables` : null, parse, JSON.stringify([running, feedback]));
  const [deleting, setDeleting] = useState<string | null>(null), [fileError, setFileError] = useState(false);
  const unknown = t("archive.unknown"), number = (n: number | null | undefined) => n == null ? unknown : n.toLocaleString(locale);
  const tools = new Map<string, number>();
  const names = stream ? stream.tools.filter(tool => tool.executed).map(tool => tool.name) : execution?.toolExecutions.map(tool => tool.name) ?? [];
  names.forEach(name => tools.set(name, (tools.get(name) ?? 0) + 1));
  const rows = (values: [string, string][]) => <dl className="agent-details">{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
  return <><header><h2>{t("tasks.details")}</h2><p>{task.name?.trim() || t("tasks.new")}</p></header>
    <div className="session-details-content">
      <section className="session-details-section"><h3><FileOutput size={14} aria-hidden="true" />{t("sessionDetails.deliverables.title")}<span>{files.data?.length ?? 0}</span></h3>
        {cfg.data?.deliverablesEnabled ? <SessionFileList kind="deliverables" files={(files.data ?? files.previousData ?? []).map(file => ({ id: file.id, name: file.name, bytes: file.bytes,
          href: files.client ? backendEndpoint(files.client.BASE_URL, file.downloadUrl) : "" }))} loading={files.loading} error={files.error || fileError ? t("tasks.filesError") : undefined} deleting={deleting} disabled={running}
          onRetry={files.retry} onRemove={async id => {
            if (!files.client || !execution) return;
            setDeleting(`deliverables:${id}`); setFileError(false);
            try { await files.client.request(`api/asset-storage/task-executions/${execution.id}/deliverables/${id}`, { method: "DELETE", reportTimeout: false }); files.retry(); }
            catch { setFileError(true); } finally { setDeleting(null); }
          }} /> : <p className="session-details-empty">{t("sessionDetails.filesDisabled")}</p>}
      </section>
      <section className="session-details-section"><h3><Wrench size={14} aria-hidden="true" />{t("sessionDetails.tools")}<span>{tools.size}</span></h3>
        {tools.size ? <ul className="session-tools-list">{[...tools].map(([name, count]) => <li key={name}><code>{name}</code><span>{count}×</span></li>)}</ul> : <p className="session-details-empty">{t("tasks.noTools")}</p>}
      </section>
      <section className="session-details-section"><h3><Activity size={14} aria-hidden="true" />{t("sessionDetails.execution")}</h3>
        {execution ? rows([[t("tasks.executionStatus"), t(taskStatusLabels[execution.status])], [t("tasks.trigger"), t(execution.trigger.type === "CRON" ? "tasks.scheduledTrigger" : "tasks.manualTrigger")],
          [t("rest.totalWait"), execution.durationMs == null ? t("status.running") : t("rest.elapsed", { seconds: (execution.durationMs / 1000).toFixed(1) })],
          [t("sessionDetails.tokensTotal"), number(execution.usage?.totalTokens ?? stream?.usage?.totalTokens)], [t("sessionDetails.tokensInput"), number(execution.usage?.inputTokens ?? stream?.usage?.inputTokens)],
          [t("sessionDetails.tokensOutput"), number(execution.usage?.outputTokens ?? stream?.usage?.outputTokens)], [t("tasks.executionId"), execution.id]]) : <p className="session-details-empty">{t("tasks.noExecutions")}</p>}
      </section>
      <section className="session-details-section"><h3><CalendarClock size={14} aria-hidden="true" />{t("tasks.schedule")}</h3><p className="session-system-message">{task.cronjob ?? t("tasks.manualOnly")}</p></section>
      <section className="session-details-section"><details className="agent-resource-details" open><summary>{t("tasks.configuration")}</summary>
        {rows([[t("workspace.currentAgent"), agentName ?? unknown], [t("tasks.name"), task.name ?? t("tasks.new")], [t("rest.provider"), task.provider.name], [t("rest.model"), task.provider.modelName],
          [t("providers.streaming"), t(task.provider.streaming ? "providers.enabled" : "providers.disabled")], [t("providers.contextWindow"), number(task.provider.contextWindow)],
          [t("providers.maxTokens"), number(task.provider.maxTokens)], [t("agents.createdAt"), new Date(task.createdAt).toLocaleString(locale === "zh" ? "zh-CN" : "en")],
          [t("tasks.taskId"), task.local ? t("tasks.draft") : task.id]])}
      </details><details className="agent-resource-details"><summary>{t("tasks.instructions")}</summary><p className="session-system-message">{task.instructions || t("tasks.saveBeforeExecute")}</p></details></section>
    </div>
  </>;
}
