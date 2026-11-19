import type { BackendClient } from "./backend-client.ts";
import { BackendClientError } from "./backend-client.ts";
import { parseHistoryPage, parseHistoryDetail, type HistoryDetail } from "./backend-observability.ts";
import { historyMessageView, historyPartial, historyUsage } from "./history-messages.ts";
import { isUuid, parseChatSources } from "./backend-sessions.ts";
import type { BackendSession } from "./backend-sessions.ts";
import type { ChatTurn } from "./workspace-conversation.ts";
import { newSessionStream, parseCommunicationSource, type StreamTool } from "./session-stream.ts";
import { archivedChatError } from "./chat-errors.ts";

export function archivedTurn(record: HistoryDetail, session: BackendSession): ChatTurn {
  const partial = historyPartial(record.metadata), stream = newSessionStream();
  const messages = record.messages.map(message => ({ raw: message, view: historyMessageView(message) }));
  const user = typeof record.metadata.input === "string" ? record.metadata.input : messages.find(m => m.raw.type === "USER")?.view.text ?? "";
  const communication = record.metadata.communication == null ? undefined : parseCommunicationSource(record.metadata.communication);
  const attachments = Array.isArray(record.metadata.attachments) ? record.metadata.attachments.flatMap(value => {
    if (!value || typeof value !== "object" || !isUuid(value.versionId) || typeof value.name !== "string") return [];
    return [{ versionId: value.versionId, name: value.name }];
  }) : [];
  let round = 0;
  for (const { raw, view } of messages) {
    if (raw.type === "AI") {
      round++;
      stream.messages.push({ id: `${record.id}:${round}`, round, thinking: view.thinking, answer: view.text });
      for (const [index, request] of (Array.isArray(raw.toolExecutionRequests) ? raw.toolExecutionRequests : []).entries()) {
        if (!request || typeof request !== "object" || Array.isArray(request)) continue;
        const r = request as Record<string, unknown>;
        let args: Record<string, unknown> | null = null;
        try { const value = typeof r.arguments === "string" ? JSON.parse(r.arguments) : r.arguments; if (value && typeof value === "object" && !Array.isArray(value)) args = value; } catch { /* Keep the original argument text. */ }
        stream.tools.push({ id: String(r.id ?? `${record.id}:${round}:${index}`), round, name: String(r.name ?? ""), status: "unconfirmed", arguments: args,
          argumentText: typeof r.arguments === "string" ? r.arguments : "", argumentsOmitted: false, result: null, error: null, durationMs: null, truncated: false });
      }
    } else if (raw.type === "TOOL_EXECUTION_RESULT") {
      const tool = stream.tools.find(t => t.id === raw.id) ?? stream.tools.findLast(t => t.name === raw.toolName && t.status === "unconfirmed");
      if (tool) { tool.status = raw.isError === true ? "failed" : "completed"; tool.executed = true; tool.result = raw.isError === true ? null : view.text; tool.error = raw.isError === true ? view.text : null; }
    }
  }
  const result = record.metadata.result;
  const assistant = record.status === "COMPLETED" ? typeof result === "string" ? result : Array.isArray(result) ? result.filter(v => typeof v === "string").join("\n") : stream.messages.at(-1)?.answer ?? "" : partial.answer || stream.messages.findLast(m => m.answer)?.answer || null;
  if (partial.answer || partial.thinking) stream.messages.push({ id: `${record.id}:partial`, round: ++round, answer: partial.answer, thinking: partial.thinking });
  const status = record.status === "COMPLETED" ? "completed" : record.status === "CANCELLED" ? "stopped" : "failed";
  stream.phase = status; stream.finalMessageId = stream.messages.findLast(m => m.answer)?.id ?? stream.messages.at(-1)?.id ?? null;
  stream.tools = stream.tools.map(t => t.status === "unconfirmed" && status === "stopped" ? { ...t, status: "stopped" as StreamTool["status"] } : t);
  const usage = historyUsage(record.metadata);
  const sources = Array.isArray(record.metadata.sources) ? parseChatSources(record.metadata.sources) : [];
  return { sources, communication, ...(attachments.length ? { attachments } : {}),
    usage: { inputTokens: usage.input, outputTokens: usage.output, totalTokens: usage.total },
    executedTools: stream.tools.filter(tool => tool.executed).map(tool => tool.name), id: record.requestId ?? record.id, user, assistant, status, sentAt: record.startedAt, receivedAt: status === "completed" ? record.finishedAt : null,
    elapsedMs: record.finishedAt ? Math.max(0, Date.parse(record.finishedAt) - Date.parse(record.startedAt)) : null, responseCount: status === "completed" ? 1 : null,
    modelName: session.provider.modelName, providerName: session.provider.name,
    error: status === "failed" ? archivedChatError(record.metadata.error, record.requestId ?? record.id) : null,
    ...(record.transport === "STREAM" || stream.tools.length ? { stream } : {}) };
}

export async function loadSessionHistory(client: BackendClient, session: BackendSession, signal: AbortSignal): Promise<ChatTurn[]> {
  const summaries = [];
  let priorUsageUnknown = false;
  for (let page = 0; page < 10; page++) {
    const batch = parseHistoryPage(await client.request(`api/history?agentId=${session.parentAgentId}&sessionId=${session.id}&page=${page}&size=100`, { signal, reportTimeout: false }));
    priorUsageUnknown ||= batch.total > batch.visibleTotal;
    summaries.push(...batch.items); if (!batch.hasNext) break;
  }
  const turns: ChatTurn[] = [];
  // Bound concurrent detail reads so long sessions do not flood the backend.
  for (let index = 0; index < summaries.length; index += 8) {
    turns.push(...await Promise.all(summaries.slice(index, index + 8).map(async summary => {
      const detail = parseHistoryDetail(await client.request(`api/history/${summary.id}`, { signal, reportTimeout: false }));
      if (detail.id !== summary.id || detail.sessionId !== session.id || detail.agentId !== session.parentAgentId) throw new BackendClientError("invalid-response", "History identity mismatch.");
      return archivedTurn(detail, session);
    })));
  }
  turns.sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt));
  if (priorUsageUnknown && turns.length) turns[0].priorUsageUnknown = true;
  return turns;
}
