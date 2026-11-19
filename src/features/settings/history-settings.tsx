"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Eye, Trash2, RefreshCw, Filter, ChevronLeft, ChevronRight, ChevronsUp, ChevronsDown } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/i18n/use-i18n";
import { useBackendProviders } from "@/providers/backend-providers-provider";
import { BackendClient, BackendClientError } from "@/lib/backend-client";
import { deleteHistory, isArchiveId, parseHistoryPreview, parseHistoryMetadata, parseHistoryOriginalMessage, parseHistoryPage, type HistorySummary } from "@/lib/backend-observability";
import { toolDisplayName } from "@/lib/tool-presentation";
import { ArchiveNotice } from "./archive-common";
import { useArchiveRequest } from "./use-archive-request";

type Selection = { record: HistorySummary; client: BackendClient };
function HistoryProviderName({ id }: { id: string | null }) {
  const { t } = useI18n();
  const { providers } = useBackendProviders();
  const provider = providers.find(provider => provider.id === id);
  return <>{provider ? `${provider.name} · ${provider.modelName}` : t("archive.unknown")}</>;
}
function HistoryText({ text, collapsible = false }: { text: string; collapsible?: boolean }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const long = collapsible && text.length > 6000;
  const limit = /[\uD800-\uDBFF]/.test(text.charAt(5999)) ? 5999 : 6000;
  return <><pre>{long && !expanded ? `${text.slice(0, limit)}…` : text}</pre>{long && <IconButton icon={expanded ? ChevronsUp : ChevronsDown} label={t(expanded ? "history.showLess" : "history.showAll")} variant="ghost" onClick={() => setExpanded(value => !value)} />}</>;
}
function HistoryJsonDisclosure({ recordId, messageIndex, className }: { recordId: string; messageIndex?: number; className?: string }) {
  const { t } = useI18n();
  const [requested, setRequested] = useState(false);
  const parser = useMemo(() => (value: unknown) => messageIndex === undefined ? parseHistoryMetadata(value, recordId) : parseHistoryOriginalMessage(value, recordId, messageIndex), [recordId, messageIndex]);
  const path = `api/history/${recordId}/${messageIndex === undefined ? "metadata" : `messages/${messageIndex}`}`;
  const resource = useArchiveRequest(requested ? path : null, parser);
  return <details className={className} onToggle={event => { if (event.currentTarget.open) setRequested(true); }}>
    <summary>{t(messageIndex === undefined ? "history.metadata" : "history.rawMessage")}</summary>
    {requested && <><ArchiveNotice connected={!!resource.client} loading={resource.loading} error={resource.error} retry={resource.retry} />
      {resource.data && <HistoryText text={JSON.stringify(resource.data, null, 2)} collapsible />}</>}
  </details>;
}
function HistoryDetailPanel({ record, onDismiss }: { record: HistorySummary; onDismiss: () => void }) {
  const { t, locale } = useI18n();
  const parser = useMemo(() => (value: unknown) => { const detail = parseHistoryPreview(value); if (detail.id !== record.id) throw new BackendClientError("invalid-response", "History ID mismatch."); return detail; }, [record.id]);
  const resource = useArchiveRequest(`api/history/${record.id}/preview`, parser);
  const data = resource.data;
  const partial = data?.partial;
  return <Modal wide dismissOnOutside title={t("history.detail")} description={new Date(record.startedAt).toLocaleString(locale)} onDismiss={onDismiss}>
    <ArchiveNotice connected={!!resource.client} loading={resource.loading} error={resource.error} retry={resource.retry} />
    {data && <div className="history-detail">
      <dl><dt>{t("history.session")}</dt><dd><code>{data.sessionId ?? t("archive.unknown")}</code></dd><dt>{t("history.agent")}</dt><dd><code>{data.agentId ?? t("archive.unknown")}</code></dd><dt>{t("history.provider")}</dt><dd><HistoryProviderName id={data.providerId} /></dd></dl>
      <h3>{t("history.messages")}</h3>
      {data.messages.length === 0 && <p>{t("history.noMessages")}</p>}
      {data.messages.map(message => <article className="history-message" key={message.index}><h3>{message.type}</h3>
        {message.text && <HistoryText text={message.text} />}
        {message.thinking && <details><summary>{t("details.thinking")}</summary><HistoryText text={message.thinking} /></details>}
        {message.toolCalls.map((tool, n) => <details key={n}><summary title={tool.name}>{toolDisplayName(tool.name)}</summary>
          {toolDisplayName(tool.name) !== tool.name && <><h4>{t("tool.name")}</h4><HistoryText text={tool.name} /></>}
          <HistoryText text={tool.arguments} /></details>)}
        {message.truncated && <p className="archive-notice">{t("history.truncated")}</p>}
        <HistoryJsonDisclosure recordId={record.id} messageIndex={message.index} />
      </article>)}
      {data.status !== "COMPLETED" && partial && (partial.answer || partial.thinking) && <article className="history-message"><h3>{t("history.partialResponse")}</h3>
        {partial.answer && <HistoryText text={partial.answer} />}{partial.thinking && <details><summary>{t("details.thinking")}</summary><HistoryText text={partial.thinking} /></details>}{partial.truncated && <p className="archive-notice">{t("history.partialTruncated")}</p>}
      </article>}
      <HistoryJsonDisclosure recordId={record.id} />
    </div>}
  </Modal>;
}
function HistoryMetadata({ record }: { record: HistorySummary }) {
  const { t } = useI18n();
  const duration = record.finishedAt ? Math.max(0, Date.parse(record.finishedAt) - Date.parse(record.startedAt)) : null;
  return <div className="history-row-content">
    <p className="history-snippet"><span className="history-preview">{record.transport} · {t("history.provider")}: <HistoryProviderName id={record.providerId} /></span></p>
    <p className="history-response">{t("history.tokens")}: {record.totalTokens ?? t("archive.unknown")}{duration !== null && ` · ${duration.toLocaleString()} ms`}{record.finishReason && ` · ${record.finishReason}`}</p>
    <HistoryJsonDisclosure key={record.id} recordId={record.id} className="history-row-metadata" />
  </div>;
}
export function HistorySettings() {
  const { t, locale } = useI18n();
  const [page, setPage] = useState(0); const [filters, setFilters] = useState({ agentId: "", sessionId: "", status: "" });
  const [invalid, setInvalid] = useState(false);
  const [detail, setDetail] = useState<Selection | null>(null); const [target, setTarget] = useState<Selection | null>(null);
  const [operation, setOperation] = useState<{ client: BackendClient; pending: boolean; error?: BackendClientError } | null>(null);
  const mutation = useRef<AbortController | null>(null);
  const query = new URLSearchParams({ page: String(page), size: "20" });
  Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value); });
  const resource = useArchiveRequest(`api/history?${query}`, parseHistoryPage); const data = resource.data;
  const client = resource.client; const busy = operation?.client === client && operation?.pending === true;
  const deleteError = operation?.client === client ? operation.error : undefined;
  useEffect(() => () => { mutation.current?.abort(); }, [client]);
  const stateText = (status: HistorySummary["status"]) => t(status === "COMPLETED" ? "status.completed" : status === "FAILED" ? "status.failed" : "status.stopped");
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const next = { agentId: String(form.get("agentId") ?? "").trim(), sessionId: String(form.get("sessionId") ?? "").trim(), status: String(form.get("status") ?? "") };
    if ([next.agentId, next.sessionId].some(v => v && !isArchiveId(v))) { setInvalid(true); return; }
    setInvalid(false); setPage(0); setFilters(next); resource.retry();
  }
  async function remove(selection: Selection) {
    if (!client || client !== selection.client || busy) return;
    const controller = new AbortController(); mutation.current?.abort(); mutation.current = controller;
    setOperation({ client, pending: true });
    try {
      await deleteHistory(client, selection.record.id, controller.signal);
      if (controller.signal.aborted) return;
      setOperation({ client, pending: false }); setTarget(null); setDetail(null);
      if (data?.items.length === 1 && page > 0) setPage(page - 1);
      resource.retry();
    } catch (cause) {
      if (controller.signal.aborted) return;
      setOperation({ client, pending: false, error: cause instanceof BackendClientError ? cause : new BackendClientError("network", "History deletion unconfirmed.") });
    }
  }
  return <div className="archive-settings">
    <p className="settings-intro">{t("history.intro")}</p>
    <form className="archive-toolbar archive-filters" onSubmit={filter}><label>{t("history.agent")}<input name="agentId" placeholder="UUID" defaultValue={filters.agentId} disabled={busy} /></label>
      <label>{t("history.session")}<input name="sessionId" placeholder="UUID" defaultValue={filters.sessionId} disabled={busy} /></label>
      <label>{t("history.status")}<select name="status" className="agent-select" defaultValue={filters.status} disabled={busy}><option value="">{t("history.all")}</option>{(["COMPLETED", "FAILED", "CANCELLED"] as const).map(s => <option key={s} value={s}>{stateText(s)}</option>)}</select></label>
      <IconButton icon={Filter} label={t("history.filter")} type="submit" disabled={busy || !client} /><IconButton icon={RefreshCw} label={t("archive.refresh")} disabled={busy || !client || resource.loading} onClick={resource.retry} />
    </form>
    {invalid && <p role="alert" className="field-error">{t("history.invalidId")}</p>}
    <ArchiveNotice connected={!!client} loading={resource.loading} error={resource.error} retry={resource.retry} />
    {data && <>
      {!data.recordingEnabled && <p role="status" className="archive-notice">{t("history.disabled")}</p>}
      <section className="history-panel" aria-label={t("settings.history.title")}>
        <p className="history-panel-heading">{t("history.count", { count: data.total, visible: data.visibleTotal, limit: data.limit })}</p>
        {data.items.length === 0 ? <p role="status" className="history-empty">{t("history.empty")}</p> : <div className="history-list-scroll" role="region" aria-label={t("history.records")} tabIndex={0}><ul className="history-list">{data.items.map(record => <li key={record.id}>
          <div className="history-row-meta"><time dateTime={record.startedAt}>{new Date(record.startedAt).toLocaleString(locale)}</time>
            <div className="history-row-heading"><span className="history-status" data-status={record.status}>{stateText(record.status)}</span><code title={`${t("history.session")}: ${record.sessionId}`}>{record.sessionId.slice(0, 8)}</code></div>
          </div>
          <HistoryMetadata record={record} />
          <div className="history-row-actions">
            <IconButton icon={Eye} label={t("history.view")} disabled={busy} onClick={() => client && setDetail({ record, client })} />
            <IconButton icon={Trash2} label={t("history.delete")} disabled={busy} onClick={() => { if (client) { setOperation(null); setTarget({ record, client }); } }} />
          </div>
        </li>)}</ul></div>}
        <div className="history-pagination"><IconButton icon={ChevronLeft} label={t("history.previous")} disabled={busy || resource.loading || page === 0} onClick={() => setPage(n => n - 1)} /><span>{t("history.page", { count: page + 1 })}</span><IconButton icon={ChevronRight} label={t("history.next")} disabled={busy || resource.loading || !data.hasNext} onClick={() => setPage(n => n + 1)} /></div>
      </section>
    </>}
    {detail && detail.client === client && <HistoryDetailPanel key={detail.record.id} record={detail.record} onDismiss={() => setDetail(null)} />}
    {target && target.client === client && <Modal title={t("history.deleteTitle")} description={t("history.deleteDescription")} onDismiss={() => setTarget(null)} dismissDisabled={busy}>
      {deleteError && <p role="alert" className="field-error">{t(deleteError.status === 404 ? "archive.missing" : "history.deleteUncertain")}</p>}
      <div className="modal-actions"><Button disabled={busy} onClick={() => setTarget(null)}>{t("common.cancel")}</Button><Button variant="danger" disabled={busy} onClick={() => void remove(target)}>{t(busy ? "history.deleting" : "history.delete")}</Button></div>
    </Modal>}
  </div>;
}
