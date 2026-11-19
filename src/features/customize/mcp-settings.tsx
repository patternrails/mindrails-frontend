"use client";
import { useEffect, useRef, useState } from "react";
import { Pencil, PlugZap, Plus, Power, RefreshCw, Trash2, Wrench } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/i18n/use-i18n";
import { BackendClient, BackendClientError } from "@/lib/backend-client";
import { importMcp, mcpPath, parseMcpConfig, parseMcpPage, parseMcpServer, parseMcpStatus, parseMcpTools, type McpServer, type McpTools } from "@/lib/backend-mcp";
import { useArchiveRequest } from "@/features/settings/use-archive-request";

const example = JSON.stringify({ mcpServers: { "my-server": { type: "http", url: "http://127.0.0.1:8765/mcp" } } }, null, 2);
export function McpSettings() {
  const { t } = useI18n();
  const resource = useArchiveRequest("api/mcp/servers?size=100", parseMcpPage);
  const { client } = resource;
  const lifetime = useRef<{ client: BackendClient | null; controller: AbortController; busy: boolean } | null>(null);
  useEffect(() => {
    // Strict Mode replays setup/cleanup; a replay must get a live controller.
    const run = { client, controller: new AbortController(), busy: false };
    lifetime.current = run;
    return () => run.controller.abort();
  }, [client]);
  const [editor, setEditor] = useState<{ client: BackendClient; server?: McpServer; text: string } | null>(null);
  const [replace, setReplace] = useState(false);
  const [deleting, setDeleting] = useState<{ client: BackendClient; server: McpServer } | null>(null);
  const [operation, setOperation] = useState<{ client: BackendClient; busy?: boolean; message?: string; error?: string } | null>(null);
  const [catalog, setCatalog] = useState<{ client: BackendClient; id: string; tools: McpTools } | null>(null);
  const activeEditor = editor?.client === client ? editor : null;
  const activeDelete = deleting?.client === client ? deleting : null;
  const activeOperation = operation?.client === client ? operation : null;
  const busy = !!activeOperation?.busy;
  function errorMessage(cause: unknown) {
    if (cause instanceof BackendClientError) {
      if (cause.status === 409) return t("mcp.conflict");
      if (cause.status === 400) return t("mcp.invalid");
      if (cause.code === "timeout") return t("mcp.uncertain");
      if (cause.code === "invalid-request") return t("mcp.invalid");
    }
    return t("mcp.error");
  }
  async function perform(action: (client: BackendClient, signal: AbortSignal) => Promise<string | void>) {
    const run = lifetime.current;
    if (!client || busy || !run || run.client !== client || run.busy) return;
    run.busy = true;
    const signal = run.controller.signal;
    setOperation({ client, busy: true });
    try {
      const message = await action(client, signal);
      if (signal.aborted) return;
      setOperation({ client, message: message || t("mcp.saved") }); resource.retry();
    } catch (cause) {
      if (!signal.aborted) setOperation({ client, error: errorMessage(cause) });
    } finally {
      run.busy = false;
    }
  }
  const servers = resource.data?.items;
  return <div className="mcp-settings">
    <div className="archive-toolbar">
      <IconButton icon={Plus} label={t("mcp.import")} variant="primary" disabled={!client || busy} onClick={() => { if (client) { setReplace(false); setEditor({ client, text: example }); } }} />
      <IconButton icon={RefreshCw} label={t("archive.refresh")} disabled={!client || busy || resource.loading} onClick={resource.retry} />
    </div>
    {!client && <p role="status">{t("mcp.notConnected")}</p>}
    {resource.loading && <p role="status">{t("mcp.loading")}</p>}
    {resource.error && <p className="form-error" role="alert">{t("mcp.error")}</p>}
    {activeOperation?.error && <p className="form-error" role="alert">{activeOperation.error}</p>}
    {activeOperation?.message && <p role="status">{activeOperation.message}</p>}
    {servers && <ul className="mcp-list">{servers.length === 0 && <li>{t("mcp.empty")}</li>}
      {servers.map(server => <li key={server.id}>
        <div className="mcp-server-heading"><strong>{server.name}</strong><span>{server.transport} · {t(`mcp.status.${server.status.state}`)} · {t("mcp.toolCount", { count: server.toolCount })}</span></div>
        {server.status.message && <p className="form-error">{server.status.message}</p>}
        {server.stale && server.toolCount > 0 && <p className="local-note">{t("mcp.stale")}</p>}
        <div className="mcp-actions">
          <IconButton icon={Pencil} label={t("mcp.edit")} disabled={busy} onClick={() => { if (client) setEditor({ client, server, text: JSON.stringify(server.config, null, 2) }); }} />
          <IconButton icon={Power} label={t(server.enabled ? "mcp.disable" : "mcp.enable")} disabled={busy} onClick={() => void perform(async (c, signal) => { parseMcpServer(await c.request(mcpPath(server.id), { method: "PUT", json: { version: server.version, enabled: !server.enabled }, signal, reportTimeout: false })); })} />
          <IconButton icon={PlugZap} label={t("mcp.test")} disabled={busy || !server.enabled} onClick={() => void perform(async (c, signal) => { const result = parseMcpStatus(await c.request(`${mcpPath(server.id)}/test`, { method: "POST", signal, timeoutMs: 25000, reportTimeout: false })); return result.state === "READY" ? t("mcp.connected") : result.message || t("mcp.error"); })} />
          <IconButton icon={RefreshCw} label={t("mcp.refreshTools")} disabled={busy || !server.enabled} onClick={() => void perform(async (c, signal) => { const status = parseMcpStatus(await c.request(`${mcpPath(server.id)}/refresh-tools`, { method: "POST", signal, timeoutMs: 35000, reportTimeout: false })); if (status.state !== "READY") return status.message || t("mcp.error"); setCatalog({ client: c, id: server.id, tools: parseMcpTools(await c.request(`${mcpPath(server.id)}/tools`, { signal, reportTimeout: false })) }); return t("mcp.refreshed"); })} />
          <IconButton icon={Wrench} label={t("mcp.tools")} disabled={busy} onClick={() => void perform(async (c, signal) => { const tools = parseMcpTools(await c.request(`${mcpPath(server.id)}/tools`, { signal, reportTimeout: false })); if (!signal.aborted) setCatalog({ client: c, id: server.id, tools }); return t("mcp.tools"); })} />
          <IconButton icon={Trash2} label={t("mcp.delete")} variant="danger" disabled={busy} onClick={() => { if (client) setDeleting({ client, server }); }} />
        </div>
        {catalog?.client === client && catalog.id === server.id && <div className="mcp-tools">
          {catalog.tools.stale && <p>{t("mcp.stale")}</p>}
          {catalog.tools.items.length === 0 && <p>{t("mcp.noTools")}</p>}
          {catalog.tools.items.map(tool => <details key={tool.name}><summary>{tool.name}</summary><p>{tool.description}</p><code>{tool.modelName}</code><pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre></details>)}
          <Button variant="ghost" onClick={() => setCatalog(null)}>{t("mcp.hideTools")}</Button>
        </div>}
      </li>)}
    </ul>}
    {activeEditor && <Modal title={t(activeEditor.server ? "mcp.edit" : "mcp.import")} description={t("mcp.editorDescription")} onDismiss={() => setEditor(null)} dismissDisabled={busy}>
      <form className="agent-form" onSubmit={event => { event.preventDefault(); void perform(async (c, signal) => {
        const config = parseMcpConfig(activeEditor.text);
        if (activeEditor.server) parseMcpServer(await c.request(mcpPath(activeEditor.server.id), { method: "PUT", json: { version: activeEditor.server.version, config }, signal, reportTimeout: false }));
        else {
          const result = await importMcp(c, config, signal, replace ? servers : undefined);
          if (!signal.aborted) setEditor(null);
          return [t("mcp.saved"), ...result.warnings].join(" · ");
        }
        if (!signal.aborted) { setEditor(null); setCatalog(null); }
      }); }}>
        {!activeEditor.server && <><label>{t("mcp.upload")}<input type="file" accept=".json,application/json" disabled={busy} onChange={event => {
          const file = event.target.files?.[0]; if (!file) return;
          if (file.size > 1048576) { if (client) setOperation({ client, error: t("mcp.invalid") }); return; }
          const signal = lifetime.current?.controller.signal;
          void file.text().then(text => { if (signal && !signal.aborted) setEditor(previous => previous === activeEditor ? { ...previous, text } : previous); })
            .catch(() => { if (client && signal && !signal.aborted) setOperation({ client, error: t("mcp.invalid") }); });
        }} /></label><label className="mcp-checkbox"><input type="checkbox" checked={replace} disabled={busy || !servers} onChange={e => setReplace(e.target.checked)} />{t("mcp.replace")}</label></>}
        <label>{t("mcp.json")}<textarea className="mcp-json" spellCheck={false} rows={15} value={activeEditor.text} disabled={busy} onChange={e => setEditor({ ...activeEditor, text: e.target.value })} /></label>
        {activeEditor.server?.hasSecrets && <p className="local-note">{t("mcp.secretHint")}</p>}
        <p className="local-note">{t("mcp.environmentHint")}</p>
        {activeOperation?.error && <p className="form-error" role="alert">{activeOperation.error}</p>}
        <div className="form-actions"><Button disabled={busy} onClick={() => setEditor(null)}>{t("common.cancel")}</Button><Button variant="primary" type="submit" disabled={busy}>{t("mcp.save")}</Button></div>
      </form>
    </Modal>}
    {activeDelete && <Modal title={t("mcp.delete")} description={t("mcp.deleteDescription", { name: activeDelete.server.name })} onDismiss={() => setDeleting(null)} dismissDisabled={busy}>
      {activeOperation?.error && <p className="form-error" role="alert">{activeOperation.error}</p>}
      <div className="modal-actions"><Button disabled={busy} onClick={() => setDeleting(null)}>{t("common.cancel")}</Button><Button variant="danger" disabled={busy} onClick={() => void perform(async (c, signal) => { await c.request(`${mcpPath(activeDelete.server.id)}?version=${activeDelete.server.version}`, { method: "DELETE", signal, reportTimeout: false }); if (!signal.aborted) { setDeleting(null); setCatalog(null); } })}>{t("mcp.delete")}</Button></div>
    </Modal>}
  </div>;
}
