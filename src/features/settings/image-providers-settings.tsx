"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Pencil, Trash2, RefreshCw, PlugZap, ImagePlus, LoaderCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/i18n/use-i18n";
import { useWorkspace } from "@/providers/workspace-provider";
import { BackendClientError, type BackendClient } from "@/lib/backend-client";
import { parseImageProvider, parseImageProviders, type ImageProvider } from "@/lib/image-providers";
import { useArchiveRequest } from "./use-archive-request";
import { useQuickSetupProviderRevision } from "./provider-quick-setup";

const root = "api/image-generation-provider";
type Selection = { client: BackendClient; entry?: ImageProvider; remove?: boolean };

function ImageProviderEditor({ selection, busy, error, onSave, onDismiss }: {
  selection: Selection; busy: boolean; error?: string; onSave: (data: Record<string, unknown>) => void; onDismiss: () => void;
}) {
  const { t } = useI18n(), p = selection.entry;
  const [name, setName] = useState(p?.name ?? "");
  const [vendor, setVendor] = useState(p?.providerName ?? "openai");
  const [url, setUrl] = useState(p?.url ?? "https://api.openai.com/v1/images/generations");
  const [model, setModel] = useState(p?.model ?? "gpt-image-2.5-flare");
  const [key, setKey] = useState("");
  const [size, setSize] = useState(p?.size ?? "1024x1024");
  const [timeout, setTimeoutValue] = useState(String(p?.timeoutMillis ?? 180000));
  const [extend, setExtend] = useState(p?.promptExtend ?? true);
  const [enabled, setEnabled] = useState(p?.enabled ?? true);
  const [isDefault, setDefault] = useState(p?.defaultProvider ?? false);
  return <Modal title={t(p ? "providerAdmin.edit" : "providerAdmin.create")} description={t("imageProviders.title")} onDismiss={onDismiss} dismissDisabled={busy}>
    <form className="agent-form provider-form" onSubmit={event => { event.preventDefault(); onSave({ name: name.trim(), providerName: vendor, url: url.trim(),
      model: model.trim(), apiKey: key.trim() || null, size, timeoutMillis: Number(timeout), promptExtend: extend, enabled, defaultProvider: isDefault }); }}>
      <label>{t("providerAdmin.name")}<input required maxLength={100} value={name} disabled={busy} onChange={e => setName(e.target.value)} /></label>
      <label>{t("imageProviders.vendor")}<select className="agent-select" value={vendor} disabled={busy} onChange={e => {
        const value = e.target.value as "qwen" | "openai"; setVendor(value);
        if (!p) { setModel(value === "qwen" ? "qwen-image-3.0-pro" : "gpt-image-2.5-flare"); setUrl(value === "qwen" ? "" : "https://api.openai.com/v1/images/generations"); }
      }}><option value="openai">OpenAI</option><option value="qwen">Qwen</option></select></label>
      <label>{t("providers.endpoint")}<input type="url" required maxLength={2048} value={url} disabled={busy}
        placeholder={vendor === "qwen" ? "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/images/generations" : "https://api.openai.com/v1/images/generations"} onChange={e => setUrl(e.target.value)} /><small>{t("imageProviders.endpointHint")}</small></label>
      <label>{t("rest.model")}<input required maxLength={255} value={model} disabled={busy} onChange={e => setModel(e.target.value)} /></label>
      <label>{t("providerAdmin.apiKey")}<input type="password" autoComplete="new-password" required={!p?.hasApiKey} maxLength={4096} value={key} disabled={busy} placeholder={p?.hasApiKey ? t("providerAdmin.keepKey") : "sk-…"} onChange={e => setKey(e.target.value)} /></label>
      <label>{t("imageProviders.size")}<select className="agent-select" value={size} disabled={busy} onChange={e => setSize(e.target.value)}>{["1024x1024", "1024x1536", "1536x1024", "2048x2048"].map(s => <option key={s}>{s}</option>)}</select></label>
      <label>{t("providerAdmin.timeout")}<input type="number" required min={1000} max={300000} value={timeout} disabled={busy} onChange={e => setTimeoutValue(e.target.value)} /></label>
      {vendor === "qwen" && <label className="mcp-checkbox"><input type="checkbox" checked={extend} disabled={busy} onChange={e => setExtend(e.target.checked)} />{t("imageProviders.promptExtend")}</label>}
      <label className="mcp-checkbox"><input type="checkbox" checked={enabled} disabled={busy} onChange={e => setEnabled(e.target.checked)} />{t("providers.enabled")}</label>
      <label className="mcp-checkbox"><input type="checkbox" checked={isDefault} disabled={busy} onChange={e => setDefault(e.target.checked)} />{t("imageProviders.makeDefault")}</label>
      <p className="local-note">{t("imageProviders.testHint")}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><Button disabled={busy} onClick={onDismiss}>{t("common.cancel")}</Button><Button type="submit" variant="primary" disabled={busy}>{t(busy ? "imageProviders.saving" : "imageProviders.saveTest")}</Button></div>
    </form>
  </Modal>;
}

export function ImageProvidersSettings() {
  const { t, locale } = useI18n(), workspace = useWorkspace();
  const setupRevision = useQuickSetupProviderRevision();
  const [page, setPage] = useState(0);
  const resource = useArchiveRequest(`${root}?page=${page}&size=20`, parseImageProviders, setupRevision), client = resource.client;
  const [selection, setSelection] = useState<Selection | null>(null);
  const [generationTest, setGenerationTest] = useState<Selection | null>(null);
  const [operation, setOperation] = useState<{ client: BackendClient; key?: string; error?: string; notice?: string } | null>(null);
  const pending = useRef(false), controller = useRef<AbortController | null>(null);
  useEffect(() => { const c = new AbortController(); controller.current = c; pending.current = false; return () => c.abort(); }, [client]);
  const active = selection?.client === client ? selection : null;
  const current = operation?.client === client ? operation : null, busy = workspace.busy || !!current?.key;
  async function execute(action: "save" | "delete" | "test" | "generate", entry?: ImageProvider, data?: Record<string, unknown>) {
    const signal = controller.current?.signal;
    if (!client || !signal || pending.current || busy) return;
    pending.current = true; setOperation({ client, key: `${action}:${entry?.id ?? "new"}` });
    const testing = action === "test" || action === "generate";
    try {
      const result = await client.request(`${root}${entry ? `/${entry.id}${testing ? action === "generate" ? "/test?generateImage=true" : "/test" : ""}` : ""}`, {
        method: action === "delete" ? "DELETE" : action === "save" && entry ? "PUT" : "POST", json: data,
        signal, timeoutMs: (action === "generate" ? entry?.timeoutMillis ?? 180000 : 15000) + 5000, reportTimeout: false,
      });
      if (signal.aborted) return;
      const saved = action === "save" ? parseImageProvider(result) : null;
      setSelection(null); setGenerationTest(null); resource.retry();
      setOperation({ client, notice: saved ? t(saved.testSuccess ? "imageProviders.savedReady" : "imageProviders.savedFailed") : undefined });
    } catch (error) {
      if (!signal.aborted) { resource.retry(); setOperation({ client, error: t(error instanceof BackendClientError && error.status === 400 ? "providerAdmin.invalid" : error instanceof BackendClientError && error.status === 409 ? "providerAdmin.conflict" : "providerAdmin.error") }); }
    } finally { if (controller.current?.signal === signal) pending.current = false; }
  }
  const open = (entry?: ImageProvider, remove = false) => { if (client) { setOperation(null); setSelection({ client, entry, remove }); } };
  return <section className="provider-section image-provider-section"><div className="section-heading"><h3>{t("imageProviders.title")}</h3><div className="knowledge-toolbar">
    <IconButton icon={RefreshCw} label={t("archive.refresh")} disabled={!client || busy || resource.loading} onClick={resource.retry} />
    <IconButton icon={Plus} label={t("providerAdmin.create")} disabled={!client || busy} onClick={() => open()} /></div></div>
    <p className="local-note">{t("imageProviders.description")}</p>
    {resource.loading && <p role="status">{t("providers.loading")}</p>}
    {resource.error && <p role="alert" className="form-error">{t("providers.loadError")}</p>}
    {current?.notice && <p role="status">{current.notice}</p>}
    {current?.error && !active && generationTest?.client !== client && <p role="alert" className="form-error">{current.error}</p>}
    {resource.data?.length === 0 && <p>{t("settings.providers.empty")}</p>}
    <ul className="providers-list">{resource.data?.map(entry => <li className="provider-row" key={entry.id}>
      <div className="provider-header"><div className="provider-info"><strong>{entry.name}</strong><span className="provider-model">{entry.providerName} · {entry.model} · {entry.size}</span></div>
        <div className="knowledge-toolbar">{entry.defaultProvider && <span className="provider-default">{t("providers.default")}</span>}
          <IconButton icon={current?.key === `test:${entry.id}` ? LoaderCircle : PlugZap} label={t("providerAdmin.test")} disabled={busy} onClick={() => void execute("test", entry)} />
          <IconButton icon={current?.key === `generate:${entry.id}` ? LoaderCircle : ImagePlus} label={t("imageProviders.testGeneration")} disabled={busy}
            onClick={() => { if (client) { setOperation(null); setGenerationTest({ client, entry }); } }} />
          <IconButton icon={Pencil} label={t("providerAdmin.edit")} disabled={busy} onClick={() => open(entry)} />
          <IconButton icon={Trash2} label={t("providerAdmin.delete")} disabled={busy} onClick={() => open(entry, true)} /></div></div>
      <p className="provider-endpoint"><code>{entry.url}</code></p>
      <p className={`provider-test-result ${entry.enabled && entry.testSuccess ? "is-connected" : "is-failed"}`}>{t(!entry.enabled ? "imageProviders.disabled" : !entry.tested ? "imageProviders.untested" : entry.testSuccess ? "imageProviders.available" : "imageProviders.unavailable")}
        {entry.testLatencyMs !== null && ` · ${entry.testLatencyMs} ms`}{entry.testedAt && ` · ${new Date(entry.testedAt).toLocaleString(locale === "zh" ? "zh-CN" : "en")}`}</p>
      {entry.testMessage && <small>{entry.testMessage}</small>}
    </li>)}</ul>
    {(page > 0 || resource.data?.length === 20) && <div className="archive-toolbar"><IconButton icon={ChevronLeft} label={t("skills.previous")} disabled={busy || page === 0 || resource.loading} onClick={() => setPage(page - 1)} /><span>{page + 1}</span><IconButton icon={ChevronRight} label={t("skills.next")} disabled={busy || resource.data?.length !== 20 || resource.loading} onClick={() => setPage(page + 1)} /></div>}
    {active && !active.remove && <ImageProviderEditor selection={active} busy={busy} error={current?.error} onSave={data => void execute("save", active.entry, data)} onDismiss={() => setSelection(null)} />}
    {generationTest?.client === client && generationTest?.entry && <Modal title={t("imageProviders.testGeneration")}
      description={generationTest.entry.name} onDismiss={() => setGenerationTest(null)} dismissDisabled={busy}>
      <p>{t("imageProviders.generationHint")}</p>
      {current?.error && <p className="form-error" role="alert">{current.error}</p>}
      <div className="modal-actions">
        <Button disabled={busy} onClick={() => setGenerationTest(null)}>{t("common.cancel")}</Button>
        <Button variant="primary" disabled={busy} onClick={() => void execute("generate", generationTest.entry)}>{t("imageProviders.testGeneration")}</Button>
      </div>
    </Modal>}
    {active?.remove && <Modal title={t("providerAdmin.delete")} description={active.entry?.name ?? ""} onDismiss={() => setSelection(null)} dismissDisabled={busy}><p>{t("imageProviders.deleteConfirm")}</p>
      {current?.error && <p className="form-error" role="alert">{current.error}</p>}<div className="modal-actions"><Button disabled={busy} onClick={() => setSelection(null)}>{t("common.cancel")}</Button><Button variant="danger" disabled={busy} onClick={() => void execute("delete", active.entry)}>{t("providerAdmin.delete")}</Button></div></Modal>}
  </section>;
}
