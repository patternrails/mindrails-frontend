import type { HistoryMessage } from "./backend-observability.ts";

const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown) => typeof value === "string" ? value : "";

/** Interpret archived native message JSON for display without discarding the original payload. */
export function historyMessageView(message: HistoryMessage) {
  const content = Array.isArray(message.contents) ? message.contents : [];
  const body = text(message.text) || content.map(value => {
    const part = object(value);
    return part?.type === "TEXT" ? text(part.text) : "";
  }).filter(Boolean).join("\n");
  const toolCalls = (Array.isArray(message.toolExecutionRequests) ? message.toolExecutionRequests : []).map(value => {
    const tool = object(value);
    return { name: text(tool?.name), arguments: typeof tool?.arguments === "string" ? tool.arguments : JSON.stringify(tool?.arguments ?? null, null, 2) };
  });
  return { text: body, thinking: text(message.thinking), toolCalls };
}

export function historyUsage(metadata: Record<string, unknown>) {
  const usage = object(metadata.usage);
  const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
  return { input: count(usage?.inputTokens), output: count(usage?.outputTokens), total: count(usage?.totalTokens) };
}

export function historyPartial(metadata: Record<string, unknown>) {
  const partial = object(metadata.partial);
  return { answer: text(partial?.answer), thinking: text(partial?.thinking) };
}
