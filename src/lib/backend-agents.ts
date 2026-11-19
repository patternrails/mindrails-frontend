import { BackendClient, BackendClientError } from "./backend-client.ts";

export type AgentWriteInput = Readonly<{
  name: string;
  description: string | null;
  goal: string | null;
  systemMessage: string | null;
}>;
export type BackendAgent = AgentWriteInput & Readonly<{
  id: string;
  ownerId: string;
  sessions: readonly Readonly<{ id: string; parentAgentId: string }>[];
  skillIds: readonly string[];
  connectionIds: readonly string[];
  memoryId: string | null;
  knowledgeBaseIds: readonly string[];
  createdAt: string;
  updatedAt: string;
}>;

const uuid = (value: unknown): value is string => typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const nullableText = (value: unknown): value is string | null => value === null || typeof value === "string";
const nullableId = (value: unknown): value is string | null => value === null || uuid(value);
const timestamp = (value: unknown): value is string => typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const ids = (value: unknown): value is string[] => Array.isArray(value) && value.every(uuid);
const invalidResponse = () => new BackendClientError("invalid-response", "Invalid Agent response.");

export function parseBackendAgent(value: unknown): BackendAgent {
  if (!value || typeof value !== "object") throw invalidResponse();
  const a = value as Record<string, unknown>;
  if (!uuid(a.id) || !uuid(a.ownerId) || typeof a.name !== "string" || !a.name.trim() ||
    !nullableText(a.description) || !nullableText(a.goal) || !nullableText(a.systemMessage) ||
    !ids(a.skillIds) || !ids(a.connectionIds) || !nullableId(a.memoryId) || !ids(a.knowledgeBaseIds) ||
    !timestamp(a.createdAt) || !timestamp(a.updatedAt) || !Array.isArray(a.sessions)) throw invalidResponse();
  const sessions = a.sessions.map((value: unknown) => {
    if (!value || typeof value !== "object") throw invalidResponse();
    const s = value as Record<string, unknown>;
    if (!uuid(s.id) || s.parentAgentId !== a.id) throw invalidResponse();
    return { id: s.id, parentAgentId: s.parentAgentId as string };
  });
  if (new Set(sessions.map((session) => session.id)).size !== sessions.length) throw invalidResponse();
  return { id: a.id, ownerId: a.ownerId, name: a.name, description: a.description, goal: a.goal,
    systemMessage: a.systemMessage, sessions, skillIds: a.skillIds,
    connectionIds: a.connectionIds, memoryId: a.memoryId, knowledgeBaseIds: a.knowledgeBaseIds,
    createdAt: a.createdAt, updatedAt: a.updatedAt };
}

/** PUT replaces all editable fields; never send a partial edit or readonly metadata. */
export function normalizeAgentWrite(input: AgentWriteInput): AgentWriteInput {
  if (typeof input.name !== "string" || !input.name.trim() ||
    !nullableText(input.description) || !nullableText(input.goal) || !nullableText(input.systemMessage)) {
    throw new BackendClientError("invalid-request", "Invalid Agent configuration.");
  }
  const text = (value: string | null) => value?.trim() ? value : null;
  return { name: input.name.trim(), description: text(input.description), goal: text(input.goal),
    systemMessage: text(input.systemMessage) };
}

export class BackendAgentsClient {
  private readonly client: BackendClient;
  constructor(client: BackendClient) { this.client = client; }

  private path(id: string) {
    if (!uuid(id)) throw new BackendClientError("invalid-request", "Invalid Agent ID.");
    return `api/agent/${id}`;
  }

  async list(signal: AbortSignal, timeoutMs?: number): Promise<BackendAgent[]> {
    const result: BackendAgent[] = [];
    const seen = new Set<string>();
    for (let page = 0; ; page++) {
      const value = await this.client.request(`api/agent?page=${page}&size=100`, { signal, timeoutMs, ...(timeoutMs ? { reportTimeout: false } : {}) });
      if (!Array.isArray(value) || value.length > 100) throw invalidResponse();
      for (const entry of value) {
        const agent = parseBackendAgent(entry);
        if (seen.has(agent.id)) throw invalidResponse();
        seen.add(agent.id);
        result.push(agent);
      }
      if (value.length < 100) return result;
    }
  }

  async get(id: string, signal: AbortSignal, timeoutMs?: number): Promise<BackendAgent> {
    const agent = parseBackendAgent(await this.client.request(this.path(id), { signal, timeoutMs, ...(timeoutMs ? { reportTimeout: false } : {}) }));
    if (agent.id !== id) throw invalidResponse();
    return agent;
  }

  async create(input: AgentWriteInput, signal: AbortSignal): Promise<string> {
    const id = await this.client.request("api/agent", { method: "POST", json: normalizeAgentWrite(input), signal });
    if (!uuid(id)) throw invalidResponse();
    return id;
  }

  async update(id: string, input: AgentWriteInput, signal: AbortSignal): Promise<void> {
    await this.client.request(this.path(id), { method: "PUT", json: normalizeAgentWrite(input), signal });
  }

  async delete(id: string, signal: AbortSignal): Promise<void> {
    await this.client.request(this.path(id), { method: "DELETE", signal });
  }
}
