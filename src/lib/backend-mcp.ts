import { BackendClient, BackendClientError } from "./backend-client.ts";
import { isUuid, isTimestamp } from "./backend-sessions.ts";

export type McpStatus = { state: "UNKNOWN" | "CONNECTING" | "READY" | "ERROR" | "DISABLED"; errorCode: string | null; message: string | null };
export type McpServer = { id: string; ownerId: string; name: string; transport: "stdio" | "streamable-http" | "sse"; config: Record<string, unknown>; enabled: boolean; version: number; createdAt: string; updatedAt: string; status: McpStatus; toolCount: number; discoveredAt: string | null; stale: boolean; hasSecrets: boolean };
export type McpPage = { items: McpServer[]; total: number; page: number; size: number; hasNext: boolean };
export type McpTools = { configVersion: number; discoveredAt: string | null; stale: boolean; items: { name: string; modelName: string; description?: string; inputSchema?: Record<string, unknown>; [key: string]: unknown }[] };
const invalid = () => new BackendClientError("invalid-response", "Invalid MCP response.");
const object = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid(); return value as Record<string, unknown>; };
const count = (value: unknown): number => { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw invalid(); return value; };
const text = (value: unknown): string => { if (typeof value !== "string") throw invalid(); return value; };
const boolean = (value: unknown): boolean => { if (typeof value !== "boolean") throw invalid(); return value; };
const nullableText = (value: unknown) => value === null ? null : text(value);
const time = (value: unknown) => { if (!isTimestamp(value)) throw invalid(); return value; };
export function parseMcpStatus(value: unknown): McpStatus {
  const o = object(value);
  if (!["UNKNOWN", "CONNECTING", "READY", "ERROR", "DISABLED"].includes(text(o.state))) throw invalid();
  return { state: o.state as McpStatus["state"], errorCode: nullableText(o.errorCode), message: nullableText(o.message) };
}
export function parseMcpServer(value: unknown): McpServer {
  const o = object(value);
  if (!isUuid(o.id) || !isUuid(o.ownerId) || !["stdio", "streamable-http", "sse"].includes(text(o.transport))) throw invalid();
  return { id: o.id, ownerId: o.ownerId as string, name: text(o.name), transport: o.transport as McpServer["transport"], config: object(o.config), enabled: boolean(o.enabled), version: count(o.version), createdAt: time(o.createdAt), updatedAt: time(o.updatedAt), status: parseMcpStatus(o.status), toolCount: count(o.toolCount), discoveredAt: o.discoveredAt === null ? null : time(o.discoveredAt), stale: boolean(o.stale), hasSecrets: boolean(o.hasSecrets) };
}
export function parseMcpPage(value: unknown): McpPage {
  const o = object(value); if (!Array.isArray(o.items)) throw invalid();
  const result = { items: o.items.map(parseMcpServer), total: count(o.total), page: count(o.page), size: count(o.size), hasNext: boolean(o.hasNext) };
  if (result.size < 1 || result.size > 100 || result.items.length > result.size || new Set(result.items.map(s => s.id)).size !== result.items.length || result.hasNext !== ((result.page + 1) * result.size < result.total)) throw invalid();
  return result;
}
export function parseMcpTools(value: unknown): McpTools {
  const o = object(value); if (!Array.isArray(o.items)) throw invalid();
  return { configVersion: count(o.configVersion), discoveredAt: o.discoveredAt === null ? null : time(o.discoveredAt), stale: boolean(o.stale), items: o.items.map(value => {
    const t = object(value);
    return { ...t, name: text(t.name), modelName: text(t.modelName), ...(t.description === undefined ? {} : { description: text(t.description) }), ...(t.inputSchema === undefined ? {} : { inputSchema: object(t.inputSchema) }) };
  }) };
}
export function mcpPath(id: string) {
  if (!isUuid(id)) throw new BackendClientError("invalid-request", "Invalid MCP server identity.");
  return `api/mcp/servers/${id}`;
}
export function parseMcpConfig(text: string): Record<string, unknown> {
  if (new TextEncoder().encode(text).length > 1048576) throw new BackendClientError("invalid-request", "MCP config exceeds 1 MiB.");
  try { return object(JSON.parse(text)); } catch { throw new BackendClientError("invalid-request", "Invalid MCP configuration JSON."); }
}
export async function importMcp(client: BackendClient, config: unknown, signal: AbortSignal, current?: McpServer[]) {
  const result = object(await client.request("api/mcp/servers/import", { method: "POST", json: { config, mode: current ? "UPSERT" : "CREATE_ONLY", ...(current ? { expectedVersions: Object.fromEntries(current.map(s => [s.name, s.version])) } : {}) }, signal, reportTimeout: false }));
  if (!Array.isArray(result.items) || !Array.isArray(result.warnings) || !result.warnings.every(w => typeof w === "string")) throw invalid();
  return { items: result.items.map(parseMcpServer), warnings: result.warnings as string[] };
}
