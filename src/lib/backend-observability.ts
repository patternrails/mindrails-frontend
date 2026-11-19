import { BackendClient, BackendClientError } from "./backend-client.ts";

export type Totals = { runs: number; succeededRuns: number; failedRuns: number; cancelledRuns: number; runningRuns: number; interruptedRuns: number; modelCalls: number; functionCalls: number; mcpToolCalls: number; inputTokens: number | null; outputTokens: number | null; totalTokens: number | null; inputKnownCalls: number; outputKnownCalls: number; usageKnownCalls: number };
export type SessionMetrics = { sessionId: string; collectionEnabled: boolean; lastPersistedAt: string | null; summary: Totals };
export type MetricsOverview = { from: string; to: string; timeZone: "UTC"; collectionEnabled: boolean; lastPersistedAt: string | null; summary: Totals; trend: { day: string; totals: Totals }[]; models: { modelName: string; totals: Totals }[]; capabilities: { functionCalls: number; mcpToolCalls: number | null; skillLoads: number | null; skillExecutions: null }; health: Record<string, number> };
export type HistorySummary = { id: string; agentId: string | null; sessionId: string; providerId: string | null; transport: "SYNC" | "STREAM"; status: "COMPLETED" | "FAILED" | "CANCELLED"; startedAt: string; finishedAt: string | null; totalTokens: number | null; finishReason: string | null };
export type HistoryPage = { items: HistorySummary[]; total: number; visibleTotal: number; limit: number; page: number; size: number; hasNext: boolean; recordingEnabled: boolean };
export type HistoryMessage = Record<string, unknown> & { type: string };
export type HistoryDetail = Omit<HistorySummary, "totalTokens" | "finishReason"> & { metadata: Record<string, unknown>; ownerId: string | null; memoryId: string; requestId: string | null; invocationId: string | null; schemaVersion: number; messages: HistoryMessage[] };
const bad = () => new BackendClientError("invalid-response", "Invalid archive response.");
const object = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== "object" || Array.isArray(v)) throw bad(); return v as Record<string, unknown>; };
const number = (v: unknown): number => { if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw bad(); return v; };
const nullableNumber = (v: unknown) => v === null ? null : number(v);
const text = (v: unknown): string => { if (typeof v !== "string") throw bad(); return v; };
const bool = (v: unknown): boolean => { if (typeof v !== "boolean") throw bad(); return v; };
const array = (v: unknown): unknown[] => { if (!Array.isArray(v)) throw bad(); return v; };
export const isArchiveId = (v: string) => /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(v);
const id = (v: unknown): string => { const s = text(v); if (!isArchiveId(s)) throw bad(); return s; };
const nullableId = (v: unknown) => v === null ? null : id(v);
const time = (v: unknown): string => { const s = text(v); if (!/^\d{4}-\d\d-\d\dT/.test(s) || !Number.isFinite(Date.parse(s))) throw bad(); return s; };
function totals(v: unknown): Totals {
  const o = object(v);
  const value = { runs: number(o.runs), succeededRuns: number(o.succeededRuns), failedRuns: number(o.failedRuns), cancelledRuns: number(o.cancelledRuns), runningRuns: number(o.runningRuns), interruptedRuns: number(o.interruptedRuns), modelCalls: number(o.modelCalls), functionCalls: number(o.functionCalls), mcpToolCalls: o.mcpToolCalls === undefined ? 0 : number(o.mcpToolCalls), inputTokens: nullableNumber(o.inputTokens), outputTokens: nullableNumber(o.outputTokens), totalTokens: nullableNumber(o.totalTokens), inputKnownCalls: number(o.inputKnownCalls), outputKnownCalls: number(o.outputKnownCalls), usageKnownCalls: number(o.usageKnownCalls) };
  if (value.inputKnownCalls > value.modelCalls || value.outputKnownCalls > value.modelCalls || value.usageKnownCalls > value.modelCalls) throw bad();
  return value;
}
export function parseMetrics(v: unknown): MetricsOverview {
  const o = object(v); if (o.timeZone !== "UTC") throw bad();
  const from = time(o.from), to = time(o.to); if (Date.parse(from) >= Date.parse(to)) throw bad();
  const trend = array(o.trend).map(v => { const p = object(v); const day = text(p.day); if (!/^\d{4}-\d\d-\d\d$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day) throw bad(); return { day, totals: totals(p.totals) }; });
  if (trend.length > 91 || trend.some((p, i) => i > 0 && p.day <= trend[i - 1].day)) throw bad();
  const models = array(o.models).map(v => { const m = object(v); return { modelName: text(m.modelName), totals: totals(m.totals) }; });
  if (models.length > 10) throw bad();
  const c = object(o.capabilities); if (c.skillExecutions !== null) throw bad();
  const health = Object.fromEntries(Object.entries(object(o.health)).map(([key, value]) => [key, number(value)]));
  return { from, to, timeZone: "UTC", collectionEnabled: bool(o.collectionEnabled), lastPersistedAt: o.lastPersistedAt === null ? null : time(o.lastPersistedAt), summary: totals(o.summary), trend, models, capabilities: { functionCalls: number(c.functionCalls), mcpToolCalls: nullableNumber(c.mcpToolCalls), skillLoads: nullableNumber(c.skillLoads), skillExecutions: null }, health };
}
export function parseSessionMetrics(v: unknown, expectedSessionId?: string): SessionMetrics {
  const o = object(v);
  const sessionId = id(o.sessionId);
  if (expectedSessionId !== undefined && sessionId !== expectedSessionId) throw bad();
  return { sessionId, collectionEnabled: bool(o.collectionEnabled), lastPersistedAt: o.lastPersistedAt === null ? null : time(o.lastPersistedAt), summary: totals(o.summary) };
}
function summaryFields(v: unknown) {
  const o = object(v);
  if (!["COMPLETED", "FAILED", "CANCELLED"].includes(text(o.status)) || !["SYNC", "STREAM"].includes(text(o.transport))) throw bad();
  return { id: id(o.id), agentId: nullableId(o.agentId), sessionId: id(o.sessionId), providerId: nullableId(o.providerId), transport: o.transport as HistorySummary["transport"], status: o.status as HistorySummary["status"], startedAt: time(o.startedAt), finishedAt: o.finishedAt === null ? null : time(o.finishedAt) };
}
export function parseHistoryPage(v: unknown): HistoryPage {
  const o = object(v); const items = array(o.items).map(value => {
    const item = object(value);
    return { ...summaryFields(item), totalTokens: item.totalTokens == null ? null : number(item.totalTokens), finishReason: item.finishReason == null ? null : text(item.finishReason) };
  });
  const result = { items, total: number(o.total), visibleTotal: number(o.visibleTotal), limit: number(o.limit), page: number(o.page), size: number(o.size), hasNext: bool(o.hasNext), recordingEnabled: bool(o.recordingEnabled) };
  if (result.limit !== 1000 || result.size < 1 || result.size > 100 || result.page * result.size >= 1000 || items.length > result.size || result.visibleTotal !== Math.min(result.total, result.limit) || new Set(items.map(i => i.id)).size !== items.length || result.hasNext !== ((result.page + 1) * result.size < result.visibleTotal)) throw bad();
  return result;
}
export function parseHistoryDetail(v: unknown): HistoryDetail {
  const o = object(v);
  const messages = array(o.messages).map(value => { const m = object(value); return { ...m, type: text(m.type) }; });
  return { ...summaryFields(o), metadata: object(o.metadata), ownerId: nullableId(o.ownerId), memoryId: id(o.memoryId), requestId: nullableId(o.requestId), invocationId: nullableId(o.invocationId), schemaVersion: number(o.schemaVersion), messages };
}
export type HistoryPreviewMessage = { index: number; type: string; text: string; thinking: string; toolCalls: { name: string; arguments: string }[]; truncated: boolean };
export type HistoryPreview = { id: string; agentId: string | null; sessionId: string | null; providerId: string | null; status: HistorySummary["status"]; startedAt: string; finishedAt: string | null; messages: HistoryPreviewMessage[]; partial: { answer: string; thinking: string; truncated: boolean } };
export function parseHistoryPreview(value: unknown): HistoryPreview {
  const o = object(value);
  if (!["COMPLETED", "FAILED", "CANCELLED"].includes(text(o.status))) throw bad();
  const partial = object(o.partial);
  const messages = array(o.messages).map((value, index) => {
    const m = object(value);
    if (number(m.index) !== index) throw bad();
    const toolCalls = array(m.toolCalls).map(value => { const tool = object(value); return { name: text(tool.name), arguments: text(tool.arguments) }; });
    return { index, type: text(m.type), text: text(m.text), thinking: text(m.thinking), toolCalls, truncated: bool(m.truncated) };
  });
  return { id: id(o.id), agentId: nullableId(o.agentId), sessionId: nullableId(o.sessionId), providerId: nullableId(o.providerId), status: o.status as HistorySummary["status"], startedAt: time(o.startedAt), finishedAt: o.finishedAt === null ? null : time(o.finishedAt), messages, partial: { answer: text(partial.answer), thinking: text(partial.thinking), truncated: bool(partial.truncated) } };
}
export function parseHistoryMetadata(value: unknown, expectedId: string): Record<string, unknown> {
  const o = object(value);
  if (id(o.id) !== expectedId) throw bad();
  return object(o.metadata);
}
export function parseHistoryOriginalMessage(value: unknown, expectedId: string, expectedIndex: number): HistoryMessage {
  const o = object(value);
  if (id(o.id) !== expectedId || number(o.index) !== expectedIndex) throw bad();
  const message = object(o.message);
  return { ...message, type: text(message.type) };
}
export async function deleteHistory(client: BackendClient, recordId: string, signal: AbortSignal) {
  if (!isArchiveId(recordId)) throw new BackendClientError("invalid-request", "Invalid archive ID.");
  const result = await client.request(`api/history/${recordId}`, { method: "DELETE", signal, reportTimeout: false });
  if (result !== undefined) throw bad();
}
