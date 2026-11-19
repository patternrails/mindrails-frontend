import type { ChatSource } from "./backend-sessions.ts";

/** Keep the full backend identity in source details; display a readable label in cards. */
export function friendlySourceTitle(title: string): string {
  const key = title.trim();
  const citation = key.split(" · ");
  if (/^K\d+$/.test(citation[0]) && citation.length >= 2) return `${citation[0]} · ${friendlySourceTitle(citation[1])}`;
  if (!/^(?:[\w-]+\.){2,}[\w-]+$/.test(key)) return key;
  const words = key.split(".").at(-1)!.replace(/[-_]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
export function sourceExcerpt(text: string, limit = 280): { text: string; truncated: boolean } {
  const compact = text.trim().replace(/^\[K\d+\][^\n]*\n+/, "").replace(/\s+/g, " ");
  const points = Array.from(compact);
  return { text: points.length > limit ? points.slice(0, limit).join("").trimEnd() + "…" : compact, truncated: points.length > limit };
}

export function sourceLocation(source: ChatSource): { label: string; title: string; location: string } {
  const parts = source.title.split(" · ");
  if (/^[FK]\d+$/.test(parts[0]) && parts.length >= 2) {
    return { label: parts[0], title: parts[1], location: parts.slice(2).join(" · ") };
  }
  return { label: "", title: friendlySourceTitle(source.title), location: "" };
}

export function sourceLocationLabel(source: ChatSource): string {
  const { label, location } = sourceLocation(source);
  const position = location.split(" / ").at(-1);
  return [label && `[${label}]`, position].filter(Boolean).join(" · ") || friendlySourceTitle(source.title);
}

export function sourceDownloadUrl(source: ChatSource): string | null {
  if (!source.url) return null;
  const asset = source.url.match(/^(\/api\/asset-storage\/versions\/[^/]+)\//);
  return asset ? `${asset[1]}/download` : source.url.replace(/\/(?:chunks|download)$/, "/download");
}

export type SourceGroup = { key: string; title: string; sources: ChatSource[] };

/** Group by immutable document identity, never by filename or citation label. */
export function groupChatSources(sources: ChatSource[]): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();
  for (const source of sources) {
    const asset = source.url?.match(/^(\/api\/asset-storage\/versions\/[^/]+)\/(?:download|extractions\/[^/]+\/blocks\/[^/]+)$/);
    const knowledge = source.url?.match(/^(\/api\/knowledge-bases\/[^/]+\/documents\/[^/]+(?:\/versions\/[^/]+)?)\/(?:download|chunks)$/);
    const key = asset?.[1] ?? knowledge?.[1] ?? JSON.stringify([source.url, source.sourceId]);
    let group = groups.get(key);
    if (!group) {
      group = { key, title: sourceLocation(source).title, sources: [] };
      groups.set(key, group);
    }
    if (!group.sources.some(item => item.sourceId === source.sourceId && item.url === source.url && item.title === source.title)) {
      group.sources.push(source);
    }
  }
  return Array.from(groups.values());
}
