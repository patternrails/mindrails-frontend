"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, PlugZap, Plus, Power, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/i18n/use-i18n";
import { BackendClientError, type BackendClient } from "@/lib/backend-client";
import {
  parseWebSearchProviders,
  webSearchTypes,
  webSearchTypesInfo,
  type WebSearchProvider,
  type WebSearchProviderInput,
  type WebSearchType,
} from "@/lib/web-search-providers";
import { useArchiveRequest } from "./use-archive-request";
import { useQuickSetupProviderRevision } from "./provider-quick-setup";

const root = "api/web-search-provider";
const pageSize = 20;
type Selection = { client: BackendClient; entry?: WebSearchProvider; remove: boolean };

function WebSearchProviderEditor({ entry, busy, error, onSave, onDismiss }: {
  entry?: WebSearchProvider;
  busy: boolean;
  error?: string;
  onSave: (data: WebSearchProviderInput) => void;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(entry?.name ?? "");
  const [type, setType] = useState<WebSearchType>(entry?.type ?? "bocha_web_search");
  const [endpoint, setEndpoint] = useState(entry?.endpoint ?? webSearchTypesInfo[type].endpoint);
  const [apiKey, setApiKey] = useState("");
  const [modelName, setModelName] = useState(entry?.modelName ?? "");
  const [timeout, setTimeout] = useState(String(entry?.timeoutMillis ?? 15000));
  const [freshness, setFreshness] = useState(entry?.options.freshness ?? "noLimit");
  const [summary, setSummary] = useState(entry?.options.summary ?? true);
  const [context, setContext] = useState(entry?.options.search_context_size ?? "medium");
  const [content, setContent] = useState(entry?.options.need_content ?? false);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const options = type === "bocha_web_search" ? { freshness: freshness.trim() || "noLimit", summary }
      : type === "openai_responses" ? { search_context_size: context }
      : { need_content: content };
    onSave({ name: name.trim(), type, endpoint: endpoint.trim(), apiKey: apiKey.trim() || null,
      modelName: type === "openai_responses" ? modelName.trim() : null,
      timeoutMillis: Number(timeout), options, version: entry?.version });
  }

  return <Modal title={t(entry ? "providerAdmin.edit" : "providerAdmin.create")} description={t("webSearchProviders.title")}
    onDismiss={onDismiss} dismissDisabled={busy}>
    <form className="agent-form provider-form" onSubmit={submit}>
      <label>{t("providerAdmin.name")}<input required maxLength={100} value={name} disabled={busy} onChange={e => setName(e.target.value)} /></label>
      <label>{t("webSearchProviders.type")}<select className="agent-select" value={type} disabled={busy} onChange={e => {
        const next = e.target.value as WebSearchType;
        setType(next);
        setEndpoint(next === entry?.type ? entry.endpoint : webSearchTypesInfo[next].endpoint);
      }}>
        {webSearchTypes.map(value => <option key={value} value={value}>{webSearchTypesInfo[value].label}</option>)}
      </select></label>
      <label>{t("providers.endpoint")}<input type="url" required maxLength={2048} value={endpoint} disabled={busy} onChange={e => setEndpoint(e.target.value)} /></label>
      {type === "openai_responses" && <label>{t("rest.model")}<input required maxLength={255} value={modelName}
        disabled={busy} onChange={e => setModelName(e.target.value)} /></label>}
      <label>{t("providerAdmin.apiKey")}<input type="password" autoComplete="new-password" required={!entry} maxLength={4096}
        value={apiKey} disabled={busy} placeholder={entry ? t("providerAdmin.keepKey") : undefined} onChange={e => setApiKey(e.target.value)} /></label>
      <label>{t("providerAdmin.timeout")}<input type="number" required min={1} max={120000} value={timeout}
        disabled={busy} onChange={e => setTimeout(e.target.value)} /></label>
      {type === "bocha_web_search" && <>
        <label>{t("webSearchProviders.freshness")}<input value={freshness} disabled={busy} list="web-search-freshness"
          onChange={e => setFreshness(e.target.value)} /><small>{t("webSearchProviders.freshnessHint")}</small></label>
        <datalist id="web-search-freshness">{["noLimit", "oneDay", "oneWeek", "oneMonth", "oneYear"].map(value =>
          <option key={value} value={value} />)}</datalist>
        <label className="mcp-checkbox"><input type="checkbox" checked={summary} disabled={busy}
          onChange={e => setSummary(e.target.checked)} />{t("webSearchProviders.summary")}</label>
      </>}
      {type === "openai_responses" && <label>{t("webSearchProviders.context")}<select className="agent-select" value={context}
        disabled={busy} onChange={e => setContext(e.target.value)}>
        <option value="low">{t("webSearchProviders.low")}</option><option value="medium">{t("webSearchProviders.medium")}</option>
        <option value="high">{t("webSearchProviders.high")}</option>
      </select></label>}
      {type === "deepseek_search" && <label className="mcp-checkbox"><input type="checkbox" checked={content}
        disabled={busy} onChange={e => setContent(e.target.checked)} />{t("webSearchProviders.needContent")}</label>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <Button disabled={busy} onClick={onDismiss}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" disabled={busy}>{t("webSearchProviders.save")}</Button>
      </div>
    </form>
  </Modal>;
}

export function WebSearchProvidersSettings() {
  const { t } = useI18n();
  const setupRevision = useQuickSetupProviderRevision();
  const [page, setPage] = useState(0);
  const resource = useArchiveRequest(`${root}?page=${page}&size=${pageSize}`, parseWebSearchProviders, setupRevision);
  const { client } = resource;
  const [selection, setSelection] = useState<Selection | null>(null);
  const [operation, setOperation] = useState<{ client: BackendClient; busy: boolean; error?: string } | null>(null);
  const [test, setTest] = useState<{ client: BackendClient; id: string; version: number; result?: {
    connected: boolean; latencyMs: number; message: string;
  } } | null>(null);
  const pending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const request = new AbortController();
    controller.current = request;
    pending.current = false;
    return () => request.abort();
  }, [client]);
  const selected = selection?.client === client ? selection : null;
  const current = operation?.client === client ? operation : null;
  const busy = !!current?.busy;

  async function mutate(action: "save" | "activate" | "delete", entry?: WebSearchProvider, data?: WebSearchProviderInput) {
    const signal = controller.current?.signal;
    if (!client || !signal || pending.current) return;
    pending.current = true;
    setOperation({ client, busy: true });
    try {
      const path = entry ? `${root}/${entry.id}` : root;
      await client.request(action === "activate" ? `${path}/active` : path, {
        method: action === "delete" ? "DELETE" : entry ? "PUT" : "POST", json: data, signal, reportTimeout: false,
      });
      if (signal.aborted) return;
      setSelection(null);
      setOperation(null);
      if (action === "activate" || action === "save" && !entry) setPage(0);
      if (action === "delete" && page > 0 && resource.data?.length === 1) setPage(page - 1);
      resource.retry();
    } catch (error) {
      if (signal.aborted) return;
      const status = error instanceof BackendClientError ? error.status : undefined;
      setOperation({ client, busy: false,
        error: t(status === 400 ? "providerAdmin.invalid" : status === 409 ? "providerAdmin.conflict" : "providerAdmin.error") });
      resource.retry();
    } finally {
      if (controller.current?.signal === signal) pending.current = false;
    }
  }

  async function testConnection(entry: WebSearchProvider) {
    const signal = controller.current?.signal;
    if (!client || !signal || pending.current) return;
    pending.current = true;
    setOperation({ client, busy: true });
    setTest({ client, id: entry.id, version: entry.version });
    try {
      const response = await client.request(`${root}/${entry.id}/test`, {
        method: "POST", signal, timeoutMs: entry.timeoutMillis + 5000, reportTimeout: false,
      });
      if (signal.aborted) return;
      const result = response as { providerId: string; version: number; connected: boolean; latencyMs: number; message: string } | null;
      if (!result || result.providerId !== entry.id || !Number.isSafeInteger(result.version)
        || typeof result.connected !== "boolean" || !Number.isFinite(result.latencyMs) || result.latencyMs < 0
        || typeof result.message !== "string") throw new Error("Invalid web search test result");
      setTest({ client, id: entry.id, version: result.version, result });
      setOperation(null);
      if (result.version !== entry.version) resource.retry();
    } catch {
      if (!signal.aborted) {
        setTest(null);
        setOperation({ client, busy: false, error: t("providerAdmin.error") });
      }
    } finally {
      if (controller.current?.signal === signal) pending.current = false;
    }
  }

  function open(entry?: WebSearchProvider, remove = false) {
    if (!client) return;
    setOperation(null);
    setSelection({ client, entry, remove });
  }

  return <section className="provider-section">
    <div className="section-heading">
      <h3>{t("webSearchProviders.title")}</h3>
      <div className="knowledge-toolbar">
        <IconButton icon={RefreshCw} label={t("archive.refresh")} disabled={!client || busy || resource.loading} onClick={resource.retry} />
        <IconButton icon={Plus} label={t("providerAdmin.create")} disabled={!client || busy} onClick={() => open()} />
      </div>
    </div>
    <p className="local-note">{t("webSearchProviders.description")}</p>
    {resource.loading && <p role="status">{t("providers.loading")}</p>}
    {resource.error && <p role="alert" className="form-error">{t("providers.loadError")}</p>}
    {current?.error && !selected && <p role="alert" className="form-error">{current.error}</p>}
    {resource.data?.length === 0 && <p>{t("settings.providers.empty")}</p>}
    <ul className="providers-list">{(resource.data ?? resource.previousData)?.map(entry => {
      const check = test?.client === client && test.id === entry.id && test.version === entry.version ? test : null;
      return <li className="provider-row" key={entry.id}>
      <div className="provider-header">
        <div className="provider-info"><strong>{entry.name}</strong>
          <span className="provider-model">{webSearchTypesInfo[entry.type].label}{entry.modelName && ` · ${entry.modelName}`}</span></div>
        <div className="knowledge-toolbar">
          {entry.active ? <span className="provider-default">{t("webSearchProviders.active")}</span>
            : <IconButton icon={Power} label={t("webSearchProviders.activate")} disabled={busy || resource.loading} onClick={() => void mutate("activate", entry)} />}
          <IconButton icon={PlugZap} label={t("providerAdmin.test")} disabled={busy || resource.loading} onClick={() => void testConnection(entry)} />
          <IconButton icon={Pencil} label={t("providerAdmin.edit")} disabled={busy} onClick={() => open(entry)} />
          <IconButton icon={Trash2} label={t("providerAdmin.delete")} disabled={busy} onClick={() => open(entry, true)} />
        </div>
      </div>
      <p className="provider-endpoint"><code>{entry.endpoint}</code></p>
      {check && <p role="status" className={`provider-test-result ${check.result ? check.result.connected ? "is-connected" : "is-failed" : ""}`}>
        {check.result ? <>{t(check.result.connected ? "providerAdmin.testSuccess" : "providerAdmin.testFailure")} · {check.result.latencyMs} ms
          {!check.result.connected && <> · {check.result.message}</>}</> : t("providerAdmin.testing")}
      </p>}
    </li>; })}</ul>
    {(page > 0 || resource.data?.length === pageSize) && <div className="archive-toolbar">
      <IconButton icon={ChevronLeft} label={t("skills.previous")} disabled={busy || page === 0 || resource.loading} onClick={() => setPage(page - 1)} />
      <span>{page + 1}</span>
      <IconButton icon={ChevronRight} label={t("skills.next")} disabled={busy || resource.data?.length !== pageSize || resource.loading} onClick={() => setPage(page + 1)} />
    </div>}
    {selected && !selected.remove && <WebSearchProviderEditor entry={selected.entry} busy={busy} error={current?.error}
      onSave={data => void mutate("save", selected.entry, data)} onDismiss={() => setSelection(null)} />}
    {selected?.remove && <Modal title={t("providerAdmin.delete")} description={selected.entry?.name ?? ""}
      onDismiss={() => setSelection(null)} dismissDisabled={busy}>
      <p>{t(selected.entry?.active ? "webSearchProviders.deleteActive" : "providerAdmin.deleteConfirm")}</p>
      {current?.error && <p className="form-error" role="alert">{current.error}</p>}
      <div className="modal-actions">
        <Button disabled={busy} onClick={() => setSelection(null)}>{t("common.cancel")}</Button>
        <Button variant="danger" disabled={busy} onClick={() => void mutate("delete", selected.entry)}>{t("providerAdmin.delete")}</Button>
      </div>
    </Modal>}
  </section>;
}
