"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Pencil, Trash2, RefreshCw, ChevronLeft, ChevronRight, PlugZap, LoaderCircle, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/i18n/use-i18n";
import { useBackendProviders } from "@/providers/backend-providers-provider";
import { useWorkspace } from "@/providers/workspace-provider";
import { useAuth } from "@/providers/auth-provider";
import { BackendClientError, type BackendClient } from "@/lib/backend-client";
import { parseLanguageProviders, parseEmbeddingProviders, parseProviderTest, type ProviderTestResult, type LanguageProvider, type EmbeddingProvider } from "@/lib/provider-management";
import { useArchiveRequest } from "./use-archive-request";
import { ImageProvidersSettings } from "./image-providers-settings";
import { WebSearchProvidersSettings } from "./web-search-providers-settings";
import { useQuickSetupProviderRevision } from "./provider-quick-setup";

type Kind = "language" | "embedding";
type Entry = LanguageProvider | EmbeddingProvider;
type Selection = { client: BackendClient; kind: Kind; entry?: Entry; remove?: boolean; clone?: boolean; cloneName?: string };
function ProviderEditor({ selection, busy, error, onSave, onDismiss }: { selection: Selection; busy: boolean; error: string | null; onSave: (data: Record<string, unknown>) => void; onDismiss: () => void }) {
  const { t } = useI18n(), p = selection.entry, language = selection.kind === "language";
  const llm = p && "streaming" in p ? p : null, embedding = p && "dimensions" in p ? p : null;
  const [name, setName] = useState(selection.clone ? selection.cloneName ?? "" : p?.name ?? ""), [model, setModel] = useState(p?.modelName ?? ""), [base, setBase] = useState(p?.baseUrl ?? "");
  const [mode, setMode] = useState(llm?.integrationMode ?? embedding?.type ?? (language ? "OpenAiCompiable" : "openai"));
  const [key, setKey] = useState("");
  const [streaming, setStreaming] = useState(llm?.streaming ?? true), [reasoning, setReasoning] = useState(llm?.reasoning === null || !llm ? "default" : String(llm.reasoning));
  const [level, setLevel] = useState(llm?.thinkingLevel ?? ""), [context, setContext] = useState(String(llm?.contextWindow ?? "")), [tokens, setTokens] = useState(String(llm?.maxTokens ?? ""));
  const [dimensions, setDimensions] = useState(String(embedding?.dimensions ?? 1024));
  const [timeout, setTimeoutValue] = useState(String(embedding?.timeoutMillis ?? "")), [retries, setRetries] = useState(String(embedding?.maxRetries ?? "")), [defaultProvider, setDefault] = useState(false);
  const number = (value: string) => value === "" ? null : Number(value);
  return <Modal title={t(selection.clone ? "providerAdmin.clone" : p ? "providerAdmin.edit" : "providerAdmin.create")} description={t(language ? "providerAdmin.language" : "providerAdmin.embedding")} onDismiss={onDismiss} dismissDisabled={busy}>
    <form className="agent-form provider-form" onSubmit={e => { e.preventDefault(); onSave({ name: name.trim(), modelName: model.trim(), baseUrl: base.trim() || null, apiKey: key.trim() || null,
      ...(language ? { chatModel: mode, streaming, reasoning: reasoning === "default" ? null : reasoning === "true", thinkingLevel: level || null, contextWindow: number(context), maxTokens: number(tokens), modelCost: llm?.modelCost ?? null, defaultProvider } : { type: mode, dimensions: number(dimensions), timeoutMillis: number(timeout), maxRetries: number(retries) }) }); }}>
      <label>{t("providerAdmin.name")}<input required maxLength={language ? 255 : 100} pattern={!language ? "[A-Za-z0-9_. \\-]+" : undefined} disabled={busy || !!embedding && !selection.clone} value={name} onChange={e => setName(e.target.value)} /></label>
      <label>{t("rest.model")}<input required maxLength={255} disabled={busy} value={model} onChange={e => setModel(e.target.value)} /></label>
      <label>{t("providerAdmin.integration")}<select className="agent-select" disabled={busy} value={mode} onChange={e => setMode(e.target.value)}>{(language ? ["OpenAiCompiable", "OpenAi", "Anthropic", "GoogleAiGemini", "Qwen"] : ["openai", "qwen"]).map(value => <option key={value}>{value}</option>)}</select></label>
      <label>{t("providers.endpoint")}<input type="url" required={!language || mode === "OpenAiCompiable"} maxLength={2048} disabled={busy} value={base} placeholder="https://api.example.com/v1" onChange={e => setBase(e.target.value)} /></label>
      <label>{t("providerAdmin.apiKey")}<input type="password" autoComplete="new-password" required={!p?.hasApiKey} maxLength={4096} disabled={busy} value={key} placeholder={p?.hasApiKey ? t(selection.clone ? "providerAdmin.reuseKey" : "providerAdmin.keepKey") : "sk-…"} onChange={e => setKey(e.target.value)} /></label>
      {language ? <>
        <label className="mcp-checkbox"><input type="checkbox" checked={streaming} disabled={busy} onChange={e => setStreaming(e.target.checked)} />{t("providers.streaming")}</label>
        <label>{t("providers.reasoning")}<select className="agent-select" disabled={busy} value={reasoning} onChange={e => setReasoning(e.target.value)}><option value="default">{t("providers.modelDefault")}</option><option value="true">{t("providers.enabled")}</option><option value="false">{t("providers.disabled")}</option></select></label>
        <label>{t("providers.thinkingLevel")}<select className="agent-select" disabled={busy} value={level} onChange={e => setLevel(e.target.value)}><option value="">{t("providers.modelDefault")}</option>{["none", "minimal", "low", "medium", "high", "xhigh", "max"].map(l => <option key={l}>{l}</option>)}</select></label>
        <label>{t("providers.contextWindow")}<input type="number" min={1} disabled={busy} value={context} placeholder={t("providers.modelDefault")} onChange={e => setContext(e.target.value)} /><small>{t("providerAdmin.modelDefaultHint")}</small></label>
        <label>{t("providers.maxTokens")}<input type="number" min={1} max={context || undefined} disabled={busy} value={tokens} placeholder={t("providers.modelDefault")} onChange={e => setTokens(e.target.value)} /><small>{t("providerAdmin.modelDefaultHint")}</small></label>
        {!selection.clone && <label className="mcp-checkbox"><input type="checkbox" disabled={busy} checked={defaultProvider} onChange={e => setDefault(e.target.checked)} />{t("providerAdmin.makeDefault")}</label>}
      </> : <>
        <label>{t("knowledge.dimensions")}<input type="number" min={1} max={8192} required disabled={busy} value={dimensions} onChange={e => setDimensions(e.target.value)} /></label>
        <label>{t("providerAdmin.timeout")}<input type="number" min={100} max={60000} disabled={busy} value={timeout} onChange={e => setTimeoutValue(e.target.value)} /></label>
        <label>{t("providerAdmin.retries")}<input type="number" min={0} max={3} disabled={busy} value={retries} onChange={e => setRetries(e.target.value)} /></label>
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><Button disabled={busy} onClick={onDismiss}>{t("common.cancel")}</Button><Button type="submit" variant="primary" disabled={busy}>{t("agents.save")}</Button></div>
    </form>
  </Modal>;
}

export function ProvidersSettings() {
  const { user } = useAuth();
  return user?.role === "SystemAdmin" ? <div className="providers-settings"><ProviderManagement /><ImageProvidersSettings /><WebSearchProvidersSettings /></div> : null;
}

function ProviderManagement() {
  const { t } = useI18n(), shared = useBackendProviders(), workspace = useWorkspace();
  const setupRevision = useQuickSetupProviderRevision();
  const [languagePage, setLanguagePage] = useState(0), [embeddingPage, setEmbeddingPage] = useState(0);
  const language = useArchiveRequest(`api/provider?page=${languagePage}&size=20`, parseLanguageProviders, setupRevision);
  const embedding = useArchiveRequest(`api/embedding-provider?page=${embeddingPage}&size=20`, parseEmbeddingProviders, setupRevision);
  const client = language.client, controller = useRef<AbortController | null>(null), pending = useRef(false);
  const [selection, setSelection] = useState<Selection | null>(null), [operation, setOperation] = useState<{ client: BackendClient; busy: boolean; error: string | null } | null>(null);
  const [tests, setTests] = useState<{ client: BackendClient; results: Record<string, ProviderTestResult> } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const active = selection?.client === client ? selection : null, current = operation?.client === client ? operation : null, busy = workspace.busy || !!current?.busy;
  useEffect(() => { const c = new AbortController(); controller.current = c; pending.current = false; return () => c.abort(); }, [client]);
  const refresh = () => { language.retry(); embedding.retry(); shared.retry(); };
  async function mutate(data?: Record<string, unknown>) {
    const signal = controller.current?.signal;
    if (!client || !active || !signal || busy || pending.current) return;
    pending.current = true; setOperation({ client, busy: true, error: null });
    const root = active.kind === "language" ? "api/provider" : "api/embedding-provider", id = active.entry && ("id" in active.entry ? active.entry.id : active.entry.name);
    try {
      await client.request(`${root}${id ? `/${encodeURIComponent(id)}${active.clone ? "/clone" : ""}` : ""}`, { method: active.remove ? "DELETE" : active.clone ? "POST" : id ? "PUT" : "POST", json: active.remove ? undefined : data, signal, reportTimeout: false });
      if (signal.aborted) return;
      setTests(null); setSelection(null); setOperation({ client, busy: false, error: null }); refresh(); void workspace.refresh();
    } catch (cause) {
      if (!signal.aborted) { setOperation({ client, busy: false, error: t(cause instanceof BackendClientError && cause.status === 409 ? "providerAdmin.conflict" : cause instanceof BackendClientError && cause.status === 400 ? "providerAdmin.invalid" : "providerAdmin.error") }); refresh(); }
    } finally { pending.current = false; }
  }
  async function testConnection(kind: Kind, entry: Entry) {
    const signal = controller.current?.signal;
    if (!client || !signal || busy || pending.current) return;
    const id = "id" in entry ? entry.id : entry.name, testId = `${kind}:${id}`;
    pending.current = true; setTesting(testId); setOperation({ client, busy: true, error: null });
    try {
      const result = parseProviderTest(await client.request(`api/${kind === "language" ? "provider" : "embedding-provider"}/${encodeURIComponent(id)}/test`, { method: "POST", signal, timeoutMs: 35000, reportTimeout: false }));
      if (!signal.aborted) setTests(previous => ({ client, results: { ...(previous?.client === client ? previous.results : {}), [testId]: result } }));
    } catch {
      if (!signal.aborted) setTests(previous => ({ client, results: { ...(previous?.client === client ? previous.results : {}), [testId]: { connected: false, latencyMs: 0 } } }));
    } finally { if (!signal.aborted) { setOperation({ client, busy: false, error: null }); setTesting(null); } pending.current = false; }
  }
  function open(kind: Kind, entry?: Entry, remove = false) { if (client) { setOperation(null); setSelection({ client, kind, entry, remove }); } }
  function clone(kind: Kind, entry: Entry) {
    if (!client) return;
    const entries = kind === "language" ? language.data : embedding.data;
    const names = new Set(entries?.map(p => p.name.toLowerCase()));
    const limit = kind === "language" ? 255 : 100;
    const suffix = kind === "language" ? " copy" : "_copy";
    const original = entry.name.slice(0, limit - suffix.length - 5);
    let name = `${original}${suffix}`, index = 2;
    while (names.has(name.toLowerCase())) name = `${original}${suffix}${index++}`;
    setOperation(null); setSelection({ client, kind, entry, clone: true, cloneName: name });
  }
  return <div>
    {!client && <div className="providers-notice"><p>{t("providers.unavailable")}</p></div>}
    {(["language", "embedding"] as const).map(kind => {
      const resource = kind === "language" ? language : embedding;
      const page = kind === "language" ? languagePage : embeddingPage, setPage = kind === "language" ? setLanguagePage : setEmbeddingPage;
      return <section key={kind} className="provider-section"><div className="section-heading"><h3>{t(kind === "language" ? "providerAdmin.language" : "providerAdmin.embedding")}</h3><div className="knowledge-toolbar">
        <IconButton icon={RefreshCw} label={t("archive.refresh")} disabled={!client || busy || resource.loading} onClick={refresh} /><IconButton icon={Plus} label={t("providerAdmin.create")} disabled={!client || busy} onClick={() => open(kind)} /></div></div>
        {kind === "embedding" && <details className="embedding-default-help"><summary>{t("providerAdmin.embeddingDefaultHelp")}</summary><p>{t("providerAdmin.embeddingDefaultDescription")}</p></details>}
        {resource.loading && <p role="status">{t("providers.loading")}</p>}{resource.error && <p className="form-error" role="alert">{t("providers.loadError")}</p>}
        {resource.data?.length === 0 && <p>{t("settings.providers.empty")}</p>}
        <ul className="providers-list">{resource.data?.map((entry, index) => <li className="provider-row" key={"id" in entry ? entry.id : entry.name}>
          <div className="provider-header"><div className="provider-info"><strong>{entry.name}</strong><span className="provider-model">{entry.modelName}{"dimensions" in entry ? ` · ${entry.dimensions}` : entry.streaming ? ` · ${t("providers.streaming")}` : ""}</span></div>
            <div className="knowledge-toolbar">{((kind === "language" && page === 0 && index === 0) || ("defaultProvider" in entry && entry.defaultProvider)) && <span className="provider-default">{t("providers.default")}</span>}<IconButton icon={testing === `${kind}:${"id" in entry ? entry.id : entry.name}` && current?.busy ? LoaderCircle : PlugZap} label={t("providerAdmin.test")} disabled={busy || !entry.hasApiKey} onClick={() => void testConnection(kind, entry)} /><IconButton icon={Copy} label={t("providerAdmin.clone")} disabled={busy} onClick={() => clone(kind, entry)} /><IconButton icon={Pencil} label={t("providerAdmin.edit")} disabled={busy} onClick={() => open(kind, entry)} /><IconButton icon={Trash2} label={t("providerAdmin.delete")} disabled={busy} onClick={() => open(kind, entry, true)} /></div></div>
          <p className="provider-endpoint"><code>{entry.baseUrl}</code></p>
          {!entry.hasApiKey && <p className="provider-test-result">{t("providerAdmin.missingKey")}</p>}
          {tests?.client === client && tests.results[`${kind}:${"id" in entry ? entry.id : entry.name}`] && (() => {
            const result = tests.results[`${kind}:${"id" in entry ? entry.id : entry.name}`];
            return <p className={`provider-test-result ${result.connected ? "is-connected" : "is-failed"}`} role="status">{t(result.connected ? "providerAdmin.testSuccess" : "providerAdmin.testFailure")}{result.latencyMs > 0 ? ` · ${result.latencyMs} ms` : ""}</p>;
          })()}
          {testing === `${kind}:${"id" in entry ? entry.id : entry.name}` && current?.busy && <p className="provider-test-result" role="status">{t("providerAdmin.testing")}</p>}
        </li>)}</ul>
        {(page > 0 || resource.data?.length === 20) && <div className="archive-toolbar">
          <IconButton icon={ChevronLeft} label={t("skills.previous")} disabled={busy || resource.loading || page === 0} onClick={() => setPage(page - 1)} /><span>{page + 1}</span>
          <IconButton icon={ChevronRight} label={t("skills.next")} disabled={busy || resource.loading || resource.data?.length !== 20} onClick={() => setPage(page + 1)} />
        </div>}
      </section>;
    })}
    {active && !active.remove && <ProviderEditor selection={active} busy={busy} error={current?.error ?? null} onDismiss={() => setSelection(null)} onSave={data => void mutate(data)} />}
    {active?.remove && <Modal title={t("providerAdmin.delete")} description={active.entry?.name ?? ""} onDismiss={() => setSelection(null)} dismissDisabled={busy}>
      <p>{t("providerAdmin.deleteConfirm")}</p>{current?.error && <p className="form-error" role="alert">{current.error}</p>}
      <div className="modal-actions"><Button disabled={busy} onClick={() => setSelection(null)}>{t("common.cancel")}</Button><Button variant="danger" disabled={busy} onClick={() => void mutate()}>{t("providerAdmin.delete")}</Button></div>
    </Modal>}
  </div>;
}
