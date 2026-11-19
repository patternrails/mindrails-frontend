import { isSourceUrl } from "./source-urls.ts";
import { BackendClient, BackendClientError } from "./backend-client.ts";
import { parseProviderPage, type ModelProvider } from "./backend-providers.ts";

export const isUuid = (value: unknown): value is string => typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const isTimestamp = (value: unknown): value is string => typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const nullableId = (value: unknown) => value === null || isUuid(value);
const invalid = () => new BackendClientError("invalid-response", "Invalid Session response.");
export type SessionWriteInput = {
  name?: string | null; providerId: string; systemMessage: string | null;
  memoryId: string | null;
};
export type BackendSession = Omit<SessionWriteInput, "providerId"> & {
  id: string; ownerId: string; name: string | null; parentAgentId: string; provider: ModelProvider;
  skillIds: readonly string[] | null; createdAt: string; updatedAt: string;
};
export function parseBackendSession(value: unknown, agentId: string): BackendSession {
  if (!value || typeof value !== "object") throw invalid();
  const s = value as Record<string, unknown>;
  if (!(s.name === undefined || s.name === null || typeof s.name === "string" && s.name.length <= 160)) throw invalid();
  if (!isUuid(s.id) || !isUuid(s.ownerId) || s.parentAgentId !== agentId || !isUuid(agentId) ||
    !(s.systemMessage === null || typeof s.systemMessage === "string") ||
    !(s.skillIds === null || (Array.isArray(s.skillIds) && s.skillIds.every(isUuid))) ||
    !nullableId(s.memoryId) ||
    !isTimestamp(s.createdAt) || !isTimestamp(s.updatedAt)) throw invalid();
  const provider = parseProviderPage([s.provider])[0];
  if (!isUuid(provider.id)) throw invalid();
  return { id: s.id, ownerId: s.ownerId, name: s.name as string | null ?? null, parentAgentId: agentId, provider, systemMessage: s.systemMessage,
    skillIds: s.skillIds as string[] | null, memoryId: s.memoryId as string | null,
    createdAt: s.createdAt, updatedAt: s.updatedAt };
}
export function sessionWrite(session: BackendSession, providerId: string, systemMessage: string | null, name = session.name): SessionWriteInput {
  return { name, providerId, systemMessage, memoryId: session.memoryId };
}
export class BackendSessionsClient {
  private client: BackendClient;
  constructor(client: BackendClient) { this.client = client; }
  private path(agentId: string, sessionId?: string) {
    if (!isUuid(agentId) || (sessionId !== undefined && !isUuid(sessionId)))
      throw new BackendClientError("invalid-request", "Invalid Session identity.");
    return `api/agent/${agentId}/sessions${sessionId === undefined ? "" : `/${sessionId}`}`;
  }
  async list(agentId: string, signal: AbortSignal, timeoutMs?: number) {
    const result: BackendSession[] = [], seen = new Set<string>();
    for (let page = 0; ; page++) {
      const value = await this.client.request(`${this.path(agentId)}?page=${page}&size=100`, { signal, timeoutMs, reportTimeout: false });
      if (!Array.isArray(value) || value.length > 100) throw invalid();
      for (const entry of value) {
        const session = parseBackendSession(entry, agentId);
        if (seen.has(session.id)) throw invalid();
        seen.add(session.id); result.push(session);
      }
      if (value.length < 100) return result;
    }
  }
  async start(agentId: string, providerId: string, signal: AbortSignal) {
    if (!isUuid(providerId)) throw new BackendClientError("invalid-request", "Invalid provider.");
    const id = await this.client.request(this.path(agentId), { method: "POST", json: { providerId }, signal, reportTimeout: false });
    if (!isUuid(id)) throw invalid();
    return id;
  }
  async update(agentId: string, sessionId: string, input: SessionWriteInput, signal: AbortSignal) {
    if (!(input.name === undefined || input.name === null || typeof input.name === "string" && input.name.length <= 160)) throw new BackendClientError("invalid-request", "Invalid Session name.");
    if (!isUuid(input.providerId) || !(input.systemMessage === null || typeof input.systemMessage === "string") ||
      !nullableId(input.memoryId))
      throw new BackendClientError("invalid-request", "Invalid Session configuration.");
    await this.client.request(this.path(agentId, sessionId), { method: "PUT", json: { ...(input.name === undefined ? {} : { name: input.name }), providerId: input.providerId, systemMessage: input.systemMessage, memoryId: input.memoryId }, signal, reportTimeout: false });
  }
  async fork(agentId: string, sessionId: string, signal: AbortSignal) {
    const id = await this.client.request(`${this.path(agentId, sessionId)}/fork`, { method: "POST", signal, timeoutMs: 120_000, reportTimeout: false });
    if (!isUuid(id)) throw invalid();
    return id;
  }
  async delete(agentId: string, sessionId: string, signal: AbortSignal) {
    await this.client.request(this.path(agentId, sessionId), { method: "DELETE", signal, reportTimeout: false });
  }

}

export type ChatSource = { sourceId: string; title: string; excerpt: string; url: string | null; truncated?: boolean };
export function parseChatSources(value: unknown): ChatSource[] {
  if (!Array.isArray(value) || value.length > 100) throw invalid();
  return value.map(source => {
    if (!source || typeof source !== "object" || typeof source.sourceId !== "string" || typeof source.title !== "string" || typeof source.excerpt !== "string" ||
        !(source.url === null || typeof source.url === "string" && isSourceUrl(source.url)) ||
        !(source.truncated === undefined || typeof source.truncated === "boolean")) throw invalid();
    return { sourceId: source.sourceId, title: source.title, excerpt: source.excerpt, url: source.url,
      ...(source.truncated === undefined ? {} : { truncated: source.truncated }) };
  });
}
