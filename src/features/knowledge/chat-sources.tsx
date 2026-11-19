"use client";
import { useEffect, useRef, useState } from "react";
import { BookOpen, Brain, ChevronDown, FileText } from "lucide-react";
import type { ChatSource } from "@/lib/backend-sessions";
import { useBackendConnection } from "@/providers/backend-connection-provider";
import { downloadSource } from "@/lib/backend-assets";
import { SourcePreview } from "@/features/assets/source-preview";
import { groupChatSources, sourceDownloadUrl, sourceLocationLabel, type SourceGroup } from "@/lib/source-presentation";
import { useI18n } from "@/i18n/use-i18n";

function SourceCard({ group, download, open }: { group: SourceGroup; download: () => void; open: () => void }) {
  const { t } = useI18n(), { client } = useBackendConnection();
  const source = group.sources[0];
  const asset = source.url?.startsWith("/api/asset-storage/"), knowledge = !!source.url, Icon = asset ? FileText : knowledge ? BookOpen : Brain;
  return <section className="source-card">
    <div className="source-heading"><Icon size={15} aria-hidden="true" /><strong title={group.title}>{group.title}</strong><span>{t(asset ? "assets.sourceFile" : knowledge ? "references.knowledge" : "references.memory")}</span></div>
    <div className="source-locations" aria-label={t("references.locations")}>{group.sources.map(item => <span className="source-location" key={`${item.sourceId}:${item.title}`} title={item.title}>{sourceLocationLabel(item)}</span>)}</div>
    <div className="source-actions">
      <button type="button" className="text-button" onClick={open}>{t("assets.preview")}</button>
      {source.url && <button className="text-button" type="button" disabled={!client} onClick={download}>{t("knowledge.download")}</button>}
      <details><summary>{t("references.details")}</summary><dl><dt>{t("knowledge.title")}</dt><dd>{group.title}</dd>{group.sources.map(item => <div key={`${item.sourceId}:${item.title}`}><dt>{item.title}</dt><dd>ID: {item.sourceId}</dd></div>)}</dl></details>
    </div>
  </section>;
}
export function ChatSources({ sources }: { sources: ChatSource[] }) {
  const { client } = useBackendConnection(), { t } = useI18n();
  const groups = groupChatSources(sources);
  const [preview, setPreview] = useState<SourceGroup | null>(null);
  const [error, setError] = useState(false), controller = useRef<AbortController | null>(null);
  useEffect(() => { const current = new AbortController(); controller.current = current; return () => current.abort(); }, [client]);
  return <details className="activity-panel chat-sources"><summary><ChevronDown size={14} aria-hidden="true" /><BookOpen size={13} aria-hidden="true" />{t("knowledge.references")} <span className="count-badge">{groups.length}</span></summary>
    {error && <p role="alert">{t("knowledge.error")}</p>}{groups.map(group => <SourceCard key={group.key} group={group} open={() => setPreview(group)} download={() => {
      const signal = controller.current?.signal, source = group.sources[0], url = sourceDownloadUrl(source);
      if (!client || !url || !signal) return;
      setError(false);
      void downloadSource(client, url, group.title, signal).catch(() => { if (!signal.aborted) setError(true); });
    }} />)}
    {preview && <SourcePreview source={preview.sources[0]} sources={preview.sources} onDismiss={() => setPreview(null)} />}
  </details>;
}
