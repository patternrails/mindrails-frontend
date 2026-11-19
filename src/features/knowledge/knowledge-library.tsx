"use client";

import { AssetLibrary } from "@/features/assets/asset-library";
import { UploadRing } from "@/features/assets/asset-uploads";
import { useEffect, useRef, useState } from "react";
import { ManagementPage } from "@/components/shell/management-page";
import { SectionTabs } from "@/components/ui/section-tabs";
import { Download, Eye, FilePlus2, Files, Pencil, Plus, RefreshCw, Replace, RotateCw, Settings2, Trash2, Upload, Users } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { KnowledgeAssignments } from "./knowledge-assignments";
import { KnowledgeCreateDialog, KnowledgeSourceDialog } from "./knowledge-dialogs";
import { useI18n } from "@/i18n/use-i18n";
import { useArchiveRequest } from "@/features/settings/use-archive-request";
import { BackendClient, BackendClientError } from "@/lib/backend-client";
import { parseKnowledgePage, parseKnowledgeConfig, parseKnowledgeDetail, parseDocumentPage, parseKnowledgeBase,
  parseHits, parseChunks, knowledgePath, downloadKnowledge, type KnowledgeHit, type KnowledgeChunk, type DocumentItem } from "@/lib/backend-knowledge";

const parseAssetConfig = (value: unknown) => value as { enabled: boolean };

export function KnowledgeLibrary() {
  const { t } = useI18n();
  const [tab, setTab] = useState("knowledge"), [basePage, setBasePage] = useState(0), [docPage, setDocPage] = useState(0);
  const config = useArchiveRequest("api/knowledge-bases/config", parseKnowledgeConfig);
  const assetConfig = useArchiveRequest("api/asset-storage/config", parseAssetConfig);
  const bases = useArchiveRequest(config.data?.enabled ? `api/knowledge-bases?page=${basePage}&size=20` : null, parseKnowledgePage);
  const { client } = config;
  const [selection, setSelection] = useState<{ client: BackendClient; id: string } | null>(null);
  const selected = selection?.client === client ? selection.id : bases.data?.items[0]?.id ?? null;
  const detail = useArchiveRequest(selected ? knowledgePath(selected) : null, parseKnowledgeDetail);
  const documents = useArchiveRequest(selected ? `${knowledgePath(selected)}/documents?page=${docPage}&size=20` : null, parseDocumentPage);
  const base = detail.data?.base;
  const [provider, setProvider] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null), [query, setQuery] = useState("");
  const [composer, setComposer] = useState<{ client: BackendClient; kb: string | null; kind: "create" | "file" | "text" | "details" | "assign" } | null>(null);
  const [hits, setHits] = useState<{ client: BackendClient; kb: string; items: KnowledgeHit[] } | null>(null);
  const [preview, setPreview] = useState<{ client: BackendClient; kb: string; title: string; chunks: KnowledgeChunk[] } | null>(null);
  const [operation, setOperation] = useState<{ client: BackendClient; kb: string | null; busy?: boolean; error?: string; message?: string } | null>(null);
  const [dialog, setDialog] = useState<{ client: BackendClient; kb: string; kind: "delete-base" | "delete-doc" | "edit-base" | "edit-doc" | "replace" | "rebuild"; item?: DocumentItem } | null>(null);
  const [editTitle, setEditTitle] = useState(""), [editDescription, setEditDescription] = useState(""), [editTags, setEditTags] = useState("");
  const [chunkSize, setChunkSize] = useState(1200), [overlap, setOverlap] = useState(160);
  const life = useRef<{ client: BackendClient | null; kb: string | null; controller: AbortController; busy: boolean } | null>(null);
  useEffect(() => { const run = { client, kb: selected, controller: new AbortController(), busy: false }; life.current = run; return () => run.controller.abort(); }, [client, selected]);
  const currentOperation = operation?.client === client && operation?.kb === selected ? operation : null;
  const busy = !!currentOperation?.busy;
  const currentDialog = dialog?.client === client && dialog.kb === selected ? dialog : null;
  const currentComposer = composer?.client === client && (composer.kind === "create" || composer.kb === selected) ? composer : null;
  const processing = base?.state === "REBUILDING" || base?.state === "DELETING" || documents.data?.items.some(item => !["READY", "FAILED"].includes(item.document.state));
  useEffect(() => { if (!processing) return; const timer = setInterval(() => { documents.retry(); detail.retry(); bases.retry(); }, 15000); return () => clearInterval(timer); }, [processing, documents, detail, bases]);
  function refresh() { bases.retry(); detail.retry(); documents.retry(); }
  function error(cause: unknown) {
    const summary = cause instanceof BackendClientError && cause.status === 409 ? t(currentComposer?.kind === "file" || currentComposer?.kind === "text" ? "knowledge.sourceConflict" : "knowledge.conflict") : cause instanceof BackendClientError && cause.code === "timeout" ? t("knowledge.uncertain") : t("knowledge.error");
    return `${summary}: ${cause instanceof Error ? cause.message : String(cause)}`;
  }
  async function perform(action: (client: BackendClient, signal: AbortSignal) => Promise<void>, message = t("knowledge.saved")) {
    const run = life.current; if (!client || !run || run.client !== client || run.kb !== selected || run.busy) return;
    run.busy = true; setOperation({ client, kb: selected, busy: true });
    try { await action(client, run.controller.signal); if (!run.controller.signal.aborted) { setOperation({ client, kb: selected, message }); refresh(); } }
    catch (cause) { if (!run.controller.signal.aborted) setOperation({ client, kb: selected, error: error(cause) }); }
    finally { run.busy = false; }
  }
  const parseTags = (value: string) => value.split(",").map(tag => tag.trim()).filter(Boolean);
  function selectBase(id: string) {
    if (client) setSelection({ client, id });
    setDocPage(0); setOperation(null); setPreview(null);
  }
  function compose(kind: NonNullable<typeof composer>["kind"], id = selected) {
    if (!client || busy) return;
    if (id) selectBase(id);
    setOperation(null); setComposer({ client, kb: id, kind });
  }
  const selectableBases = [...(bases.data?.items ?? [])];
  if (base && !selectableBases.some(item => item.id === base.id)) selectableBases.push(base);
  const selectedBox = <label className="form-field knowledge-selection">{t("knowledge.select")}<select className="agent-select" value={selected ?? ""} disabled={busy || !selectableBases.length}
    onChange={e => selectBase(e.target.value)}>
    {!selectableBases.length && <option value="">{t("knowledge.empty")}</option>}{selectableBases.map(base => <option key={base.id} value={base.id}>{base.name}</option>)}
  </select></label>;
  const pager = (page: number, hasNext: boolean, change: (page: number) => void) => <div className="archive-toolbar"><Button disabled={busy || page === 0} onClick={() => change(page - 1)}>{t("skills.previous")}</Button><span>{page + 1}</span><Button disabled={busy || !hasNext} onClick={() => change(page + 1)}>{t("skills.next")}</Button></div>;
  const open = (kind: NonNullable<typeof dialog>["kind"], item?: DocumentItem) => {
    if (!client || !selected) return; setComposer(null); setOperation(null); setEditTitle(item?.document.title ?? base?.name ?? ""); setEditDescription(base?.description ?? ""); setEditTags(item?.document.tags.join(", ") ?? "");
    setProvider(base?.profile.provider ?? ""); setChunkSize(base?.profile.chunkChars ?? 1200); setOverlap(base?.profile.overlap ?? 160); setFile(null); setDialog({ client, kb: selected, kind, item });
  };
  return <ManagementPage title={t("nav.library")} description={t("library.description")}>
    {!client && <p role="status">{t("knowledge.notConnected")}</p>}
    {config.data && !config.data.enabled && <p role="status">{t("knowledge.disabled")}</p>}
    {(config.error || bases.error || detail.error || documents.error) && <p className="form-error" role="alert">{t("knowledge.error")}</p>}
    {currentOperation?.error && <p className="form-error" role="alert">{currentOperation.error}</p>}{currentOperation?.message && <p role="status">{currentOperation.message}</p>}
    {config.data?.enabled && <>
      <SectionTabs label={t("nav.library")} value={tab} onValueChange={value => { if (!busy) { if (client && selected) setSelection({ client, id: selected }); setOperation(null); setTab(value); } }} items={[
        ...(assetConfig.data?.enabled ? [{ id: "assets", label: t("assets.title"), content: <AssetLibrary /> }] : []),
        { id: "knowledge", label: t("library.knowledge.label"), content: <>
          <div className="knowledge-section">
            <div className="section-heading"><div><h2>{t("library.knowledge.label")} <span className="count-badge">{bases.data?.total ?? 0}</span></h2><p>{t("knowledge.listHint")}</p></div>
              <div className="knowledge-toolbar"><IconButton icon={RefreshCw} label={t("archive.refresh")} disabled={busy} onClick={refresh} /><IconButton icon={Plus} label={t("knowledge.create")} variant="primary" disabled={busy || !client} onClick={() => compose("create")} /></div>
            </div>
            {bases.loading && <p role="status">{t("knowledge.loading")}</p>}
            {bases.data && <ul className="mcp-list knowledge-base-list">
              {bases.data.items.length === 0 && <li className="knowledge-empty">{t("knowledge.emptyHint")}</li>}
              {bases.data.items.map(item => <li key={item.id}>
                <div className="mcp-server-heading"><strong>{item.name}</strong><span className="agent-status" data-status={item.state}>{item.state}</span></div>
                {item.description && <p className="knowledge-description">{item.description}</p>}
                <p className="knowledge-base-meta">{item.profile.provider} · {item.profile.modelName}</p>
                <div className="mcp-actions"><IconButton icon={Files} label={t("knowledge.viewSources")} disabled={busy} onClick={() => { selectBase(item.id); setTab("sources"); }} /><IconButton icon={Users} label={t("knowledge.assign")} disabled={busy || item.state === "DELETING"} onClick={() => compose("assign", item.id)} /><IconButton icon={Settings2} label={t("knowledge.manage")} variant="ghost" disabled={busy} onClick={() => compose("details", item.id)} /></div>
              </li>)}
            </ul>}
            {bases.data && pager(basePage, bases.data.hasNext, page => { setBasePage(page); setSelection(null); setDocPage(0); })}
          </div>
        </> },
        { id: "sources", label: t("library.sources.label"), content: <>
          <div className="knowledge-sources-toolbar">{selectedBox}<div className="knowledge-toolbar">
            <IconButton icon={Upload} label={t("knowledge.file")} variant="primary" disabled={busy || base?.state !== "ACTIVE"} onClick={() => compose("file")} />
            <IconButton icon={FilePlus2} label={t("knowledge.text")} disabled={busy || base?.state !== "ACTIVE"} onClick={() => compose("text")} />
            <IconButton icon={RefreshCw} label={t("archive.refresh")} disabled={busy || !selected} onClick={refresh} />
          </div></div>
          {documents.loading && <p role="status">{t("knowledge.loadingSources")}</p>}
          {documents.data && <ul className="mcp-list knowledge-source-list">{documents.data?.items.length === 0 && <li className="knowledge-empty">{t("knowledge.noSources")}</li>}{documents.data?.items.map(item => <li key={item.document.id}><div className="mcp-server-heading"><strong>{item.document.title}</strong><span>{item.document.state} · {item.revision.processedChunks}/{item.revision.chunkCount}</span></div>
            <p>{item.revision.filename} · {item.revision.mediaType} · {item.revision.bytes} B · {item.document.sourceType}</p><p className="local-note">{item.document.key} · {item.revision.createdAt}</p>
            {item.revision.error && <p role="alert" className="form-error">{item.revision.error}{item.document.activeVersionId && ` · ${t("knowledge.previousReady")}`}</p>}
            <details><summary>{t("knowledge.storage")}</summary><p>{item.document.id}</p><p>{item.revision.storageKey}</p><p>{item.revision.profile.collection}</p><p>{item.document.sourceAgentId} / {item.document.sourceSessionId}</p></details>
            <div className="mcp-actions">
              <IconButton icon={Eye} label={t("knowledge.preview")} disabled={busy || !item.revision.chunkCount && !item.document.activeVersionId} onClick={() => void perform(async (c, signal) => { const chunks = parseChunks(await c.request(`${knowledgePath(selected!, item.document.id)}/chunks`, { signal })); if (!signal.aborted) setPreview({ client: c, kb: selected!, title: item.document.title, chunks }); })} />
              <IconButton icon={Download} label={t("knowledge.download")} disabled={busy || item.document.state === "DELETING"} onClick={() => void perform((c, signal) => downloadKnowledge(c, selected!, item.document.id, item.revision.filename, signal))} />
              <IconButton icon={Pencil} label={t("knowledge.edit")} disabled={busy} onClick={() => open("edit-doc", item)} /><IconButton icon={Replace} label={t("knowledge.replace")} disabled={busy} onClick={() => open("replace", item)} />
              <IconButton icon={RotateCw} label={t("knowledge.retry")} disabled={busy} onClick={() => void perform(async (c, signal) => { await c.request(`${knowledgePath(selected!, item.document.id)}/reindex?version=${item.document.version}`, { method: "POST", signal }); }, t("knowledge.submitted"))} />
              <IconButton icon={Trash2} label={t("knowledge.delete")} disabled={busy} onClick={() => open("delete-doc", item)} />
            </div></li>)}</ul>}
          {documents.data && pager(docPage, documents.data.hasNext, setDocPage)}
        </> },
        { id: "retrieval", label: t("library.retrieval.label"), content: <div className="knowledge-retrieval knowledge-form">
          {selectedBox}<form className="agent-form" onSubmit={e => { e.preventDefault(); if (selected) void perform(async (c, signal) => { const items = parseHits(await c.request(`${knowledgePath(selected)}/search?query=${encodeURIComponent(query)}`, { signal, timeoutMs: 60000, reportTimeout: false })); if (!signal.aborted) setHits({ client: c, kb: selected, items }); }); }}>
            <label className="form-field">{t("knowledge.query")}<textarea className="agent-textarea" required placeholder={t("knowledge.queryPlaceholder")} maxLength={10000} value={query} onChange={e => setQuery(e.target.value)} /></label><Button type="submit" variant="primary" disabled={busy || !selected || !query.trim()}>{t("knowledge.search")}</Button>
          </form>{hits?.client === client && hits.kb === selected && <div>{hits.items.length === 0 && <p>{t("knowledge.noHits")}</p>}{hits.items.map(hit => <article className="knowledge-card" key={hit.chunkId}><h3>{hit.title}</h3><p>{hit.location} · {hit.score.toFixed(4)}</p><pre>{hit.text}</pre><Button disabled={busy} onClick={() => void perform((c, signal) => downloadKnowledge(c, selected!, hit.documentId, hit.title, signal))}>{t("knowledge.download")}</Button></article>)}</div>}
        </div> },
      ]} />
    </>}
    {currentComposer?.kind === "create" && config.data && <KnowledgeCreateDialog config={config.data} busy={busy} error={currentOperation?.error} onDismiss={() => setComposer(null)} onSubmit={draft => void perform(async (c, signal) => {
      const created = parseKnowledgeBase(await c.request("api/knowledge-bases", { method: "POST", signal, json: draft }));
      if (!signal.aborted) { setSelection({ client: c, id: created.id }); setBasePage(0); setDocPage(0); setComposer(null); }
    })} />}
    {uploadProgress !== null && <div className="asset-library-progress" role="status"><UploadRing progress={uploadProgress} />{t(uploadProgress < 1 ? "assets.uploading" : "assets.processing")}</div>}
    {(currentComposer?.kind === "file" || currentComposer?.kind === "text") && base && <KnowledgeSourceDialog baseName={base.name} mode={currentComposer.kind} busy={busy} error={currentOperation?.error} onDismiss={() => setComposer(null)} onSubmit={draft => void perform(async (c, signal) => {
      const path = knowledgePath(base.id);
      if (currentComposer.kind === "text") await c.request(`${path}/documents/text`, { method: "POST", signal, json: { key: draft.key, title: draft.title, tags: draft.tags, content: draft.content } });
      else {
        if (!draft.file) return;
        const body = new FormData(); body.set("key", draft.key); body.set("title", draft.title); body.set("file", draft.file);
        for (const tag of draft.tags) body.append("tags", tag);
        setUploadProgress(0);
        try { await c.upload(`${path}/documents`, body, { signal, onProgress: setUploadProgress }); } finally { setUploadProgress(null); }
      }
      if (!signal.aborted) { setComposer(null); setDocPage(0); }
    }, t("knowledge.submitted"))} />}
    {currentComposer?.kind === "assign" && selected && <KnowledgeAssignments key={selected} knowledgeBaseId={selected} name={base?.name ?? ""} onDismiss={() => { setComposer(null); refresh(); }} />}
    {currentComposer?.kind === "details" && <Modal title={base?.name ?? t("knowledge.manage")} description={base?.description ?? ""} onDismiss={() => setComposer(null)} dismissDisabled={busy}>
      {detail.loading && <p role="status">{t("knowledge.loading")}</p>}
      {detail.error && <p className="form-error" role="alert">{t("knowledge.error")}</p>}
      {currentOperation?.error && <p className="form-error" role="alert">{currentOperation.error}</p>}
      {detail.data && <div className="knowledge-base-details">
            <dl className="agent-details">{[[t("knowledge.state"), base?.state], [t("knowledge.documents"), detail.data.documents], [t("knowledge.ready"), detail.data.readyDocuments], [t("knowledge.bytes"), detail.data.originalBytes], [t("knowledge.chunks"), detail.data.chunks], [t("knowledge.vectorEstimate"), detail.data.estimatedVectorBytes], [t("knowledge.embedding"), `${base?.profile.provider} · ${base?.profile.modelName}`], [t("knowledge.dimensions"), base?.profile.dimensions], [t("knowledge.chunkSize"), base?.profile.chunkChars], [t("knowledge.overlap"), base?.profile.overlap]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            <details><summary>{t("knowledge.storage")}</summary><p><code>{base?.id}</code></p><p><code>{base?.profile.collection}</code></p><p><code>{base?.profile.fingerprint}</code></p><p>{t("knowledge.references")}: {detail.data.references.length}</p><ul>{detail.data.references.map(ref => <li key={ref.agentId}><a href="/agents">{ref.agentId}</a></li>)}</ul></details>
            <div className="mcp-actions"><Button disabled={busy || base?.state !== "ACTIVE"} onClick={() => open("edit-base")}>{t("knowledge.edit")}</Button><Button disabled={busy || base?.state !== "ACTIVE"} onClick={() => open("rebuild")}>{t("knowledge.rebuild")}</Button>{base?.state === "REBUILDING" && <Button disabled={busy} onClick={() => void perform(async (c, signal) => { await c.request(`${knowledgePath(base.id)}/reindex?version=${base.version}`, { method: "DELETE", signal }); })}>{t("knowledge.cancelRebuild")}</Button>}<Button disabled={busy || !!detail.data.references.length} onClick={() => open("delete-base")}>{t("knowledge.delete")}</Button></div>
          </div>}
    </Modal>}
    {preview?.client === client && preview.kb === selected && <Modal title={preview.title} description={t("knowledge.preview")} onDismiss={() => setPreview(null)}><div className="knowledge-preview">{preview.chunks.slice(0,200).map(chunk => <section key={chunk.id}><h3>{chunk.index + 1} · {chunk.location}</h3><pre>{chunk.text}</pre></section>)}{preview.chunks.length > 200 && <p>{t("knowledge.previewLimit")}</p>}</div></Modal>}
    {currentDialog && base && <Modal title={t(`knowledge.${currentDialog.kind === "delete-base" || currentDialog.kind === "delete-doc" ? "delete" : currentDialog.kind === "rebuild" ? "rebuild" : currentDialog.kind === "replace" ? "replace" : "edit"}`)} description={base.name} dismissDisabled={busy} onDismiss={() => setDialog(null)}>
      {currentOperation?.error && <p className="form-error" role="alert">{currentOperation.error}</p>}
      <form className="agent-form knowledge-form" onSubmit={e => { e.preventDefault(); void perform(async (c, signal) => {
        const kind = currentDialog.kind, item = currentDialog.item;
        if (kind === "delete-base") { await c.request(`${knowledgePath(base.id)}?version=${base.version}`, { method: "DELETE", signal }); if (!signal.aborted) { setSelection(null); setDocPage(0); } }
        else if (kind === "delete-doc" && item) await c.request(`${knowledgePath(base.id, item.document.id)}?version=${item.document.version}`, { method: "DELETE", signal });
        else if (kind === "edit-base") await c.request(knowledgePath(base.id), { method: "PUT", signal, json: { name: editTitle, description: editDescription, version: base.version } });
        else if (kind === "edit-doc" && item) await c.request(knowledgePath(base.id, item.document.id), { method: "PATCH", signal, json: { title: editTitle, tags: parseTags(editTags), version: item.document.version } });
        else if (kind === "rebuild") await c.request(`${knowledgePath(base.id)}/reindex`, { method: "POST", signal, json: { embeddingProvider: provider || base.profile.provider, chunkChars: chunkSize, overlap, version: base.version } });
        else if (kind === "replace" && item && file) { const body = new FormData(); body.set("file", file); await c.request(`${knowledgePath(base.id, item.document.id)}/content?version=${item.document.version}`, { method: "PUT", signal, body, timeoutMs: 60000, reportTimeout: false }); }
        if (!signal.aborted) setDialog(null);
      }); }}>
        {currentDialog.kind.startsWith("delete") && <p>{t("knowledge.deleteConfirm")}</p>}
        {currentDialog.kind.startsWith("edit") && <><label className="form-field">{t("knowledge.title")}<input className="agent-input" required maxLength={160} value={editTitle} onChange={e => setEditTitle(e.target.value)} /></label>{currentDialog.kind === "edit-base" ? <label className="form-field">{t("knowledge.description")}<textarea className="agent-textarea" value={editDescription} onChange={e => setEditDescription(e.target.value)} /></label> : <label className="form-field">{t("knowledge.tags")}<input className="agent-input" value={editTags} onChange={e => setEditTags(e.target.value)} /></label>}</>}
        {currentDialog.kind === "replace" && <label className="form-field">{t("knowledge.file")}<input type="file" required accept=".txt,.md,.html,.htm,.pdf,.docx,.pptx" onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>}
        {currentDialog.kind === "rebuild" && <><p>{t("knowledge.rebuildHint")}</p><label className="form-field">{t("knowledge.embedding")}<select className="agent-select" value={provider} onChange={e => setProvider(e.target.value)}>{config.data?.providers.map(provider => <option key={provider.name} value={provider.name}>{provider.name}</option>)}</select></label><label className="form-field">{t("knowledge.chunkSize")}<input type="number" min={256} max={6000} value={chunkSize} onChange={e => setChunkSize(Number(e.target.value))} /></label><label className="form-field">{t("knowledge.overlap")}<input type="number" min={0} max={Math.max(0, chunkSize - 1)} value={overlap} onChange={e => setOverlap(Number(e.target.value))} /></label></>}
        <div className="mcp-actions"><Button type="button" disabled={busy} onClick={() => setDialog(null)}>{t("knowledge.cancel")}</Button><Button type="submit" variant="primary" disabled={busy}>{t("knowledge.confirm")}</Button></div>
      </form>
    </Modal>}
  </ManagementPage>;
}
