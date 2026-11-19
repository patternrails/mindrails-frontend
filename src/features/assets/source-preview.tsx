"use client";
import { useEffect, useState } from "react";
import { useBackendConnection } from "@/providers/backend-connection-provider";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/use-i18n";
import { downloadSource, isSourceUrl } from "@/lib/backend-assets";
import { sourceDownloadUrl, sourceLocation, sourceLocationLabel } from "@/lib/source-presentation";
import type { ChatSource } from "@/lib/backend-sessions";

function SourceContent({ source }: { source: ChatSource }) {
  const { client } = useBackendConnection(), { t } = useI18n();
  const [content, setContent] = useState<{ text: string; location: string; version?: number } | null>(null), [error, setError] = useState(false);
  const asset = source.url?.match(/^\/api\/asset-storage\/versions\/([0-9a-f-]+)\/extractions\//i);
  const assetVersion = asset?.[1];
  const excerptOnly = !source.url || source.url.startsWith("/api/asset-storage/") && source.url.endsWith("/download");
  useEffect(() => {
    if (!client || excerptOnly || !source.url || !isSourceUrl(source.url)) return;
    const controller = new AbortController(), url = source.url;
    const path = assetVersion ? url : url.replace(/\/download$/, "/chunks");
    void client.request(path, { signal: controller.signal }).then(value => {
      if (controller.signal.aborted) return;
      if (assetVersion) { const data = value as { block?: { text: string; location: string }; version?: { number: number } }; if (!data.block || typeof data.block.text !== "string") throw new Error("Invalid source"); setContent({ ...data.block, version: data.version?.number }); }
      else { if (!Array.isArray(value)) throw new Error("Invalid source"); const block = value.find(item => item.id === source.sourceId); if (block) setContent(block); else setContent({ text: source.excerpt, location: source.title }); }
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [client, source, assetVersion, excerptOnly]);
  const displayed = content ?? (excerptOnly || !client ? { text: source.excerpt, location: sourceLocation(source).location } : null);
  return <>
    {source.truncated && <p className="local-note">{t("stream.truncated")}</p>}
    {error && <p role="alert">{t("assets.failed")}</p>}{!displayed && !error && <p role="status">{t("assets.loading")}</p>}
    {displayed && <div className="knowledge-preview"><h3>{displayed.version !== undefined ? `v${displayed.version} · ` : ""}{displayed.location}</h3><pre>{displayed.text}</pre></div>}
  </>;
}

export function SourcePreview({ source, sources = [source], onDismiss }: { source: ChatSource; sources?: ChatSource[]; onDismiss: () => void }) {
  const { client } = useBackendConnection(), { t } = useI18n();
  const [selected, setSelected] = useState(source), [downloadError, setDownloadError] = useState(false);
  const download = sourceDownloadUrl(selected);
  return <Modal title={t("assets.preview")} description={sourceLocation(source).title} onDismiss={onDismiss}>
    {sources.length > 1 && <nav className="source-locations source-location-picker" aria-label={t("references.locations")}>{sources.map(item => <button type="button" className="source-location" key={`${item.sourceId}:${item.title}`} title={item.title} aria-pressed={selected === item} onClick={() => setSelected(item)}>{sourceLocationLabel(item)}</button>)}</nav>}
    <SourceContent key={`${selected.url}:${selected.sourceId}:${selected.title}`} source={selected} />
    {downloadError && <p role="alert">{t("assets.failed")}</p>}
    {download && client && <Button onClick={() => { const controller = new AbortController(); setDownloadError(false); void downloadSource(client, download, sourceLocation(source).title, controller.signal).catch(() => setDownloadError(true)); }}>{t("knowledge.download")}</Button>}
  </Modal>;
}
