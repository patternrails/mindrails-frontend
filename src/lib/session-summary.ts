import { BackendClientError } from "./backend-client.ts";
import type { ChatTurn } from "./workspace-conversation.ts";
import { toolDisplayName } from "./tool-presentation.ts";

export type TokenUsage = { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null };
export function roundMetrics(turns: readonly ChatTurn[], index: number) {
  const total = (turn: ChatTurn) => turn.usage?.totalTokens ?? (turn.usage?.inputTokens != null && turn.usage.outputTokens != null
    ? turn.usage.inputTokens + turn.usage.outputTokens : null);
  const previous = turns.slice(0, index + 1).map(total);
  return { waitMs: turns[index]?.elapsedMs ?? null, tokens: turns[index] ? total(turns[index]) : null,
    allTokens: !turns.slice(0, index + 1).some(turn => turn.priorUsageUnknown) && previous.length && previous.every(n => n !== null) ? previous.reduce<number>((sum, n) => sum + n!, 0) : null };
}
export function parseTokenUsage(value: unknown): TokenUsage | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new BackendClientError("invalid-response", "Invalid token usage.");
  const usage = value as Record<string, unknown>;
  const count = (value: unknown) => {
    if (value == null) return null;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new BackendClientError("invalid-response", "Invalid token usage.");
    return value;
  };
  return { inputTokens: count(usage.inputTokens), outputTokens: count(usage.outputTokens), totalTokens: count(usage.totalTokens) };
}

/** Count executed calls, not streamed argument fragments or tools merely requested by the model. */
export function sessionToolCounts(turns: ChatTurn[]) {
  const counts = new Map<string, number>();
  for (const turn of turns) {
    const names = turn.stream ? turn.stream.tools.filter(tool => tool.executed || ["running", "completed", "failed"].includes(tool.status)).map(tool => tool.name)
      : turn.executedTools ?? [];
    for (const name of names) if (name) {
      const label = toolDisplayName(name);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
}
