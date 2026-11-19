import { BackendClient, BackendClientError } from "./backend-client.ts";
import { isTimestamp, isUuid, parseChatSources, type ChatSource } from "./backend-sessions.ts";
import { parseProviderPage, type ModelProvider } from "./backend-providers.ts";
import { parseTokenUsage, type TokenUsage } from "./session-summary.ts";

export const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const invalid = () => new BackendClientError("invalid-response", "Invalid Task response.");
export type TaskWrite = { name: string | null; providerId: string; instructions: string; cronjob: string | null; skillIds: readonly string[] };
export type BackendTask = Omit<TaskWrite, "providerId"> & { id: string; ownerId: string; parentAgentId: string; provider: ModelProvider; createdAt: string; updatedAt: string; local?: boolean };
export type TaskStatus = "STARTING" | "RUNNING" | "CANCELLING" | "COMPLETED" | "FAILED" | "CANCELLED" | "SKIPPED";
export type ActiveTaskExecution = { executionId: string; status: "STARTING" | "RUNNING" | "CANCELLING" };
export type TaskReply = { executionId: string; lines: string[]; sources: ChatSource[]; usage: TokenUsage | null; executedTools: string[] };
export type TaskExecution = {
  id: string; ownerId: string; agentId: string; taskId: string; requestId: string; status: TaskStatus;
  createdAt: string; startedAt: string | null; finishedAt: string | null; durationMs: number | null;
  parameters: Record<string, unknown>; trigger: { type: string; scheduledAt?: string | null };
  taskSnapshot: { instructions: string; name: string | null; providerName: string | null; modelName: string | null; cronjob: string | null };
  records: { sequence: number; timestamp: string; type: string; data: unknown }[];
  usage: TokenUsage | null; toolExecutions: { id: string | null; name: string; arguments: string | null; result: string | null; failed: boolean; durationMs: number | null }[];
  result: TaskReply | null; error: { code: string; message: string } | null;
};
export const taskRunning = (status: string) => ["STARTING", "RUNNING", "CANCELLING"].includes(status);
export function taskWrite(task: BackendTask, patch: Partial<TaskWrite> = {}): TaskWrite {
  return { name: task.name, providerId: task.provider.id, instructions: task.instructions, cronjob: task.cronjob, skillIds: task.skillIds, ...patch };
}
export function parseTask(value: unknown, agentId: string): BackendTask {
  if (!object(value) || !isUuid(value.id) || !isUuid(value.ownerId) || value.parentAgentId !== agentId || !isUuid(agentId) ||
    !(value.name === null || typeof value.name === "string") || typeof value.instructions !== "string" ||
    !(value.cronjob === null || typeof value.cronjob === "string") || !Array.isArray(value.skillIds) || !value.skillIds.every(isUuid) ||
    !isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt)) throw invalid();
  const provider = parseProviderPage([value.provider])[0];
  if (!isUuid(provider.id)) throw invalid();
  return { id: value.id, ownerId: value.ownerId, parentAgentId: agentId, name: value.name, provider, instructions: value.instructions,
    cronjob: value.cronjob, skillIds: value.skillIds, createdAt: value.createdAt, updatedAt: value.updatedAt };
}
export function parseTaskReply(value: unknown): TaskReply {
  if (!object(value) || !isUuid(value.executionId) || !Array.isArray(value.lines) || !value.lines.every(line => typeof line === "string") ||
    !Array.isArray(value.executedTools) || !value.executedTools.every(tool => typeof tool === "string")) throw invalid();
  return { executionId: value.executionId, lines: value.lines, sources: parseChatSources(value.sources), usage: parseTokenUsage(value.usage), executedTools: value.executedTools };
}
export function parseActiveTask(value: unknown): ActiveTaskExecution | null {
  if (!object(value) || !("activeExecution" in value)) throw invalid();
  const active = value.activeExecution;
  if (active === null) return null;
  if (!object(active) || !isUuid(active.executionId) || !taskRunning(String(active.status))) throw invalid();
  return { executionId: active.executionId, status: active.status as ActiveTaskExecution["status"] };
}
export function parseTaskExecution(value: unknown, agentId: string, taskId: string): TaskExecution {
  if (!object(value) || !isUuid(value.id) || !isUuid(value.ownerId) || value.agentId !== agentId || value.taskId !== taskId || !isUuid(value.requestId) ||
    !["STARTING", "RUNNING", "CANCELLING", "COMPLETED", "FAILED", "CANCELLED", "SKIPPED"].includes(String(value.status)) ||
    !isTimestamp(value.createdAt) || !(value.startedAt === null || isTimestamp(value.startedAt)) || !(value.finishedAt === null || isTimestamp(value.finishedAt)) ||
    !(value.durationMs === null || typeof value.durationMs === "number" && value.durationMs >= 0) || !object(value.parameters) || !object(value.trigger) || typeof value.trigger.type !== "string" ||
    !object(value.taskSnapshot) || typeof value.taskSnapshot.instructions !== "string" || !Array.isArray(value.records) || !Array.isArray(value.toolExecutions) ||
    !(value.error === null || object(value.error) && typeof value.error.code === "string" && typeof value.error.message === "string")) throw invalid();
  for (const record of value.records) if (!object(record) || !Number.isSafeInteger(record.sequence) || Number(record.sequence) < 1 || !isTimestamp(record.timestamp) || typeof record.type !== "string") throw invalid();
  for (const tool of value.toolExecutions) if (!object(tool) || typeof tool.name !== "string" || typeof tool.failed !== "boolean" || !(tool.result === null || typeof tool.result === "string")) throw invalid();
  const result = value.result === null ? null : parseTaskReply(value.result);
  if (result && result.executionId !== value.id) throw invalid();
  return { ...value, result, usage: parseTokenUsage(value.usage) } as TaskExecution;
}
export class BackendTasksClient {
  private client: BackendClient;
  constructor(client: BackendClient) { this.client = client; }
  private path(agent: string, task?: string) {
    if (!isUuid(agent) || task !== undefined && !isUuid(task)) throw new BackendClientError("invalid-request", "Invalid Task identity.");
    return `api/agent/${agent}/tasks${task ? `/${task}` : ""}`;
  }
  async list(agent: string, signal: AbortSignal) {
    const tasks: BackendTask[] = [], seen = new Set<string>();
    for (let page = 0; ; page++) {
      const values = await this.client.request(`${this.path(agent)}?page=${page}&size=100`, { signal, reportTimeout: false });
      if (!Array.isArray(values) || values.length > 100) throw invalid();
      for (const value of values) { const task = parseTask(value, agent); if (seen.has(task.id)) throw invalid(); seen.add(task.id); tasks.push(task); }
      if (values.length < 100) return tasks;
    }
  }
  async get(agent: string, task: string, signal: AbortSignal) {
    const result = parseTask(await this.client.request(this.path(agent, task), { signal, reportTimeout: false }), agent);
    if (result.id !== task) throw invalid(); return result;
  }
  private validate(input: TaskWrite) {
    if (!isUuid(input.providerId) || !input.instructions.trim() || input.instructions.length > 100000 ||
      !(input.name === null || typeof input.name === "string" && input.name.length <= 160) ||
      !(input.cronjob === null || typeof input.cronjob === "string" && input.cronjob.length <= 255) || !input.skillIds.every(isUuid))
      throw new BackendClientError("invalid-request", "Invalid Task configuration.");
  }
  async create(agent: string, input: TaskWrite, signal: AbortSignal) {
    this.validate(input);
    const id = await this.client.request(this.path(agent), { method: "POST", json: input, signal, reportTimeout: false });
    if (!isUuid(id)) throw invalid(); return id;
  }
  async update(agent: string, task: string, input: TaskWrite, signal: AbortSignal) {
    this.validate(input); await this.client.request(this.path(agent, task), { method: "PUT", json: input, signal, reportTimeout: false });
  }
  async delete(agent: string, task: string, signal: AbortSignal) {
    await this.client.request(this.path(agent, task), { method: "DELETE", signal, reportTimeout: false });
  }
  async active(agent: string, task: string, signal: AbortSignal) {
    return parseActiveTask(await this.client.request(`${this.path(agent, task)}/executions/active`, { signal, reportTimeout: false }));
  }
  async executions(agent: string, task: string, signal: AbortSignal) {
    const values = await this.client.request(`${this.path(agent, task)}/executions?page=0&size=20`, { signal, reportTimeout: false });
    if (!Array.isArray(values) || values.length > 20) throw invalid();
    return values.map(value => parseTaskExecution(value, agent, task));
  }
  async execution(agent: string, task: string, id: string, signal: AbortSignal) {
    if (!isUuid(id)) throw invalid();
    const result = parseTaskExecution(await this.client.request(`${this.path(agent, task)}/executions/${id}`, { signal, reportTimeout: false }), agent, task);
    if (result.id !== id) throw invalid(); return result;
  }
  async cancel(agent: string, task: string, id: string, signal: AbortSignal) {
    if (!isUuid(id)) throw invalid();
    await this.client.request(`${this.path(agent, task)}/executions/${id}/cancel`, { method: "POST", signal, reportTimeout: false });
  }
}
