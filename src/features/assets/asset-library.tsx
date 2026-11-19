"use client";
import { useEffect, useRef, useState } from "react";
import { Upload, Trash2, Download, Eye, RefreshCw } from "lucide-react";
import { useArchiveRequest } from "@/features/settings/use-archive-request";
import { parseAssetList, assetReady, assetFailed, assetFailureReason, assetErrorMessage, downloadAsset, type AssetView } from "@/lib/backend-assets";
import { pasteClipboardFiles } from "@/lib/clipboard-paste";
import { BackendClientError } from "@/lib/backend-client";
import { previewableFilename } from "@/lib/file-preview";
import { FileViewLink } from "@/components/content/file-view-link";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/i18n/use-i18n";
import { useAssetUploads } from "./use-asset-uploads";
import { AssetFileIcon, AssetUploads } from "./asset-uploads";

export function AssetLibrary() {
  const { t } = useI18n(), [page, setPage] = useState(0);
  const list = useArchiveRequest(`api/asset-storage?page=${page}&size=20`, parseAssetList);
  const uploads = useAssetUploads(), picker = useRef<HTMLInputElement>(null);
  const [deleting, setDeleting] = useState<AssetView | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [preview, setPreview] = useState<{ title: string; blocks: { id: string; text: string; location: string }[] } | null>(null);
  const life = useRef<AbortController | null>(null), addFiles = useRef(uploads.add);
  useEffect(() => { addFiles.current = uploads.add; });
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => { void pasteClipboardFiles(event, files => addFiles.current(files)); };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);
  useEffect(() => { const c = new AbortController(); life.current = c; return () => c.abort(); }, [list.client]);
  const reloadAssets = list.retry;
  const completed = uploads.uploads.filter(item => item.asset && assetReady(item.asset)).map(item => item.id).join(",");
  useEffect(() => { if (completed) reloadAssets(); }, [completed, reloadAssets]);
  const processing = uploads.pending || list.data?.some(item => !assetReady(item) && !assetFailed(item));
  useEffect(() => { if (!processing) return; const id = setInterval(list.retry, 15000); return () => clearInterval(id); }, [processing, list.retry]);
  async function remove() {
    if (!deleting || !list.client || !life.current) return;
    const signal = life.current.signal; setBusy(true); setError("");
    try { await list.client.request(`api/asset-storage/${deleting.asset.id}`, { method: "DELETE", signal }); if (!signal.aborted) { setDeleting(null); list.retry(); } }
    catch (cause) { if (!signal.aborted) setError(`${t(cause instanceof BackendClientError && cause.status === 409 ? "assets.referenced" : "assets.failed")}: ${assetErrorMessage(cause)}`); }
    finally { if (!signal.aborted) setBusy(false); }
  }
  return <section className="asset-library" onDragOver={event => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }} onDrop={event => { if (!event.dataTransfer.files.length) return; event.preventDefault(); uploads.add(Array.from(event.dataTransfer.files)); }}>
    <div className="section-heading"><div><h2>{t("assets.title")}</h2><p>{t("assets.description")}</p></div><div className="mcp-actions"><Button onClick={() => picker.current?.click()}><Upload size={15} />{t("assets.upload")}</Button><Button onClick={list.retry}><RefreshCw size={14} />{t("assets.refresh")}</Button></div></div>
    <input type="file" multiple hidden ref={picker} onChange={event => { uploads.add(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
    {!!uploads.uploads.length && <AssetUploads items={uploads.uploads} onRemove={uploads.remove} onRetry={uploads.retry} />}
    <div className="asset-drop-hint" tabIndex={0}>{t("assets.dropHint")}</div>
    {error && <p role="alert" className="form-error">{error}</p>}{list.error && <p role="alert">{t("assets.failed")}: {assetErrorMessage(list.error)}</p>}
    {list.loading && <p role="status">{t("assets.loading")}</p>}
    {list.data?.map(item => <article className="asset-library-row" key={item.asset.id}>
      <AssetFileIcon filename={item.version.filename} /><div className="asset-library-details"><strong>{item.asset.title}</strong><span>{item.version.filename} · {(item.version.bytes / 1024).toFixed(1)} KB · v{item.version.number} · {t(assetFailed(item) ? "assets.failed" : assetReady(item) ? "assets.ready" : "assets.processing")}{item.inKnowledgeBase ? ` · ${t("assets.indexed")}` : ""}</span>{assetFailed(item) && <span role="alert">{assetFailureReason(item)}</span>}</div>
      <div className="mcp-actions">{previewableFilename(item.version.filename) ? <FileViewLink href={`/api/asset-storage/versions/${item.version.id}/download`} filename={item.version.filename} /> : <button type="button" className="icon-button" disabled={item.version.state !== "READY"} aria-label={t("assets.preview")} onClick={() => { const signal = life.current?.signal; if (list.client && signal) void list.client.request<{ id: string; text: string; location: string }[]>(`api/asset-storage/versions/${item.version.id}/blocks`, { signal }).then(blocks => { if (!signal.aborted && blocks) setPreview({ title: item.version.filename, blocks }); }).catch(cause => { if (!signal.aborted) setError(`${t("assets.failed")}: ${assetErrorMessage(cause)}`); }); }}><Eye size={16} /></button>}
        <button type="button" className="icon-button" aria-label={t("knowledge.download")} onClick={() => { if (list.client && life.current) void downloadAsset(list.client, item.version.id, item.version.filename, life.current.signal).catch(cause => setError(`${t("assets.failed")}: ${assetErrorMessage(cause)}`)); }}><Download size={16} /></button>
        <button type="button" className="icon-button" aria-label={t("assets.delete")} onClick={() => { setDeleting(item); setError(""); }}><Trash2 size={16} /></button></div>
    </article>)}
    {list.data?.length === 0 && <p>{t("assets.empty")}</p>}
    <div className="archive-toolbar"><Button disabled={page === 0} onClick={() => setPage(n => n - 1)}>{t("skills.previous")}</Button><span>{page + 1}</span><Button disabled={(list.data?.length ?? 0) < 20} onClick={() => setPage(n => n + 1)}>{t("skills.next")}</Button></div>
    {deleting && <Modal title={t("assets.delete")} description={deleting.version.filename} dismissDisabled={busy} onDismiss={() => setDeleting(null)}><p>{t("assets.deleteConfirm")}</p>{error && <p role="alert" className="form-error">{error}</p>}<div className="modal-actions"><Button disabled={busy} onClick={() => setDeleting(null)}>{t("knowledge.cancel")}</Button><Button variant="danger" disabled={busy} onClick={() => void remove()}>{t("assets.delete")}</Button></div></Modal>}
    {preview && <Modal title={t("assets.preview")} description={preview.title} onDismiss={() => setPreview(null)}><div className="knowledge-preview">{preview.blocks.map(block => <section key={block.id}><h3>{block.location}</h3><pre>{block.text}</pre></section>)}<p>{t("assets.previewLimit")}</p></div></Modal>}
  </section>;
}
