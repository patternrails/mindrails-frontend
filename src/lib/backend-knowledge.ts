import { downloadFilename } from "./download-filename.ts";
export { downloadFilename } from "./download-filename.ts";
import { BackendClientError, type BackendClient } from "./backend-client.ts";
import { isUuid } from "./backend-sessions.ts";
export type KnowledgeProfile = { provider: string; modelName: string; fingerprint: string; dimensions: number; collection: string; generation: string; chunkChars: number; overlap: number };
export type KnowledgeBase = { id: string; ownerId: string; name: string; description: string; state: string; profile: KnowledgeProfile; pendingProfile: KnowledgeProfile | null; version: number };
export type KnowledgeDoc = { id: string; knowledgeBaseId: string; key: string; title: string; tags: string[]; state: string; sourceType: string; sourceAgentId: string | null; sourceSessionId: string | null; activeVersionId: string | null; pendingVersionId: string | null; version: number };
export type KnowledgeRevision = { id: string; filename: string; mediaType: string; bytes: number; state: string; error: string | null; chunkCount: number; processedChunks: number; profile: KnowledgeProfile; storageKey: string; createdAt: string };
export type DocumentItem = { document: KnowledgeDoc; revision: KnowledgeRevision };
export type KnowledgePage<T> = { items: T[]; total: number; page: number; size: number; hasNext: boolean };
export type KnowledgeHit = { chunkId: string; documentId: string; title: string; text: string; location: string; score: number; url: string };
export type KnowledgeChunk = { id: string; text: string; location: string; index: number };
export type KnowledgeDetail = { base: KnowledgeBase; documents: number; readyDocuments: number; originalBytes: number; chunks: number; estimatedVectorBytes: number; references: Binding[] };
export type Binding = { agentId: string; knowledgeBaseIds: string[]; agentVersion: number };
export type KnowledgeConfig = { defaultEmbeddingProvider: string; enabled: boolean; providers: { name: string; modelName: string; dimensions: number }[] };
const invalid = () => new BackendClientError("invalid-response", "Invalid knowledge response.");
const object = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid(); return value as Record<string, unknown>; };
const text = (value: unknown): string => { if (typeof value !== "string") throw invalid(); return value; };
const number = (value: unknown): number => { if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw invalid(); return value; };
const id = (value: unknown): string => { if (!isUuid(value)) throw invalid(); return value; };
const optionalId = (value: unknown) => value === null ? null : id(value);
export function parseKnowledgeProfile(value: unknown): KnowledgeProfile {
  const v = object(value); return { provider: text(v.provider), modelName: typeof v.modelName === "string" ? v.modelName : text(v.provider), fingerprint: text(v.fingerprint), dimensions: number(v.dimensions), collection: text(v.collection), generation: id(v.generation), chunkChars: number(v.chunkChars), overlap: number(v.overlap) };
}
export function parseKnowledgeBase(value: unknown): KnowledgeBase {
  const v = object(value); return { id: id(v.id), ownerId: id(v.ownerId), name: text(v.name), description: text(v.description), state: text(v.state), profile: parseKnowledgeProfile(v.profile), pendingProfile: v.pendingProfile === null ? null : parseKnowledgeProfile(v.pendingProfile), version: number(v.version) };
}
export function parseKnowledgeDoc(value: unknown): KnowledgeDoc {
  const v = object(value); if (!Array.isArray(v.tags) || !v.tags.every(tag => typeof tag === "string")) throw invalid();
  return { id: id(v.id), knowledgeBaseId: id(v.knowledgeBaseId), key: text(v.key), title: text(v.title), tags: v.tags, state: text(v.state), sourceType: text(v.sourceType), sourceAgentId: optionalId(v.sourceAgentId), sourceSessionId: optionalId(v.sourceSessionId), activeVersionId: optionalId(v.activeVersionId), pendingVersionId: optionalId(v.pendingVersionId), version: number(v.version) };
}
export function parseRevision(value: unknown): KnowledgeRevision {
  const v = object(value); return { id: id(v.id), filename: text(v.filename), mediaType: text(v.mediaType), bytes: number(v.bytes), state: text(v.state), error: v.error === null ? null : text(v.error), chunkCount: number(v.chunkCount), processedChunks: number(v.processedChunks), profile: parseKnowledgeProfile(v.profile), storageKey: text(v.storageKey), createdAt: text(v.createdAt) };
}
function page<T>(value: unknown, parse: (value: unknown) => T): KnowledgePage<T> {
  const v = object(value); if (!Array.isArray(v.items) || v.items.length > 100 || typeof v.hasNext !== "boolean") throw invalid();
  return { items: v.items.map(parse), total: number(v.total), page: number(v.page), size: number(v.size), hasNext: v.hasNext };
}
export const parseKnowledgePage = (value: unknown) => page(value, parseKnowledgeBase);
export const parseDocumentPage = (value: unknown) => page(value, (item): DocumentItem => { const v = object(item); return { document: parseKnowledgeDoc(v.document), revision: parseRevision(v.revision) }; });
export function parseBinding(value: unknown): Binding {
  const v = object(value); if (!Array.isArray(v.knowledgeBaseIds)) throw invalid();
  return { agentId: id(v.agentId), knowledgeBaseIds: v.knowledgeBaseIds.map(id), agentVersion: number(v.agentVersion) };
}
export type KnowledgeAssignment = { agentId: string; name: string; assigned: boolean; agentVersion: number };
export const parseAssignmentPage = (value: unknown) => page(value, (item): KnowledgeAssignment => {
  const v = object(item); if (typeof v.assigned !== "boolean") throw invalid();
  return { agentId: id(v.agentId), name: text(v.name), assigned: v.assigned, agentVersion: number(v.agentVersion) };
});
export function parseKnowledgeDetail(value: unknown): KnowledgeDetail {
  const v = object(value); if (!Array.isArray(v.references)) throw invalid();
  return { base: parseKnowledgeBase(v.base), documents: number(v.documents), readyDocuments: number(v.readyDocuments), originalBytes: number(v.originalBytes), chunks: number(v.chunks), estimatedVectorBytes: number(v.estimatedVectorBytes), references: v.references.map(parseBinding) };
}
export function parseKnowledgeConfig(value: unknown): KnowledgeConfig {
  const v = object(value); if (typeof v.enabled !== "boolean" || !Array.isArray(v.providers)) throw invalid();
  return { defaultEmbeddingProvider: typeof v.defaultEmbeddingProvider === "string" ? v.defaultEmbeddingProvider : "qwen-default", enabled: v.enabled, providers: v.providers.map(value => { const p = object(value); return { name: text(p.name), modelName: text(p.modelName), dimensions: number(p.dimensions) }; }) };
}
export function parseHits(value: unknown): KnowledgeHit[] {
  if (!Array.isArray(value) || value.length > 100) throw invalid();
  return value.map(value => { const v = object(value); if (typeof v.score !== "number" || !Number.isFinite(v.score)) throw invalid();
    return { chunkId: id(v.chunkId), documentId: id(v.documentId), title: text(v.title), text: text(v.text), location: text(v.location), score: v.score, url: text(v.url) }; });
}
export function parseChunks(value: unknown): KnowledgeChunk[] { if (!Array.isArray(value)) throw invalid(); return value.map(value => { const v = object(value); return { id: id(v.id), text: text(v.text), location: text(v.location), index: number(v.index) }; }); }
export function knowledgePath(kb: string, document?: string) {
  if (!isUuid(kb) || document !== undefined && !isUuid(document)) throw new BackendClientError("invalid-request", "Invalid knowledge identity.");
  return `api/knowledge-bases/${kb}${document === undefined ? "" : `/documents/${document}`}`;
}
export async function downloadKnowledge(client: BackendClient, kb: string, document: string, filename: string, signal: AbortSignal) {
  const result = await client.request<{ blob: Blob; disposition: string | null }>(`${knowledgePath(kb, document)}/download`, { signal, responseType: "download", timeoutMs: 30_000, reportTimeout: false });
  signal.throwIfAborted(); if (!(result?.blob instanceof Blob)) throw invalid();
  const url = URL.createObjectURL(result.blob), link = window.document.createElement("a"); link.href = url; link.download = downloadFilename(result.disposition, filename); link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
