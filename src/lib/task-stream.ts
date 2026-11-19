import { websocketTicket } from "./auth-session.ts";
import { BackendClientError } from "./backend-client.ts";
import { backendEndpoint } from "./backend-url.ts";
import { isTimestamp, isUuid } from "./backend-sessions.ts";
import { object, parseActiveTask, parseTaskReply, type TaskExecution } from "./backend-tasks.ts";
import type { StreamSocket, StreamSocketFactory } from "./backend-session-stream.ts";
import { finishSessionStream, newSessionStream, updateSessionStream, type SessionStream, type StreamEvent } from "./session-stream.ts";
import { historyMessageView } from "./history-messages.ts";

export type TaskEvent = { version: 1; type: string; agentId: string; taskId: string; executionId: string | null;
  requestId: string | null; seq: number; timestamp: string; data: unknown };
const invalid = () => new BackendClientError("invalid-response", "Invalid Task execution event.");
export function parseTaskEvent(raw: string): TaskEvent {
  let event: unknown; try { event = JSON.parse(raw); } catch { throw invalid(); }
  if (!object(event) || event.version !== 1 || !isUuid(event.agentId) || !isUuid(event.taskId) || typeof event.type !== "string" ||
    !(event.executionId === null || isUuid(event.executionId)) || !(event.requestId === null || isUuid(event.requestId)) ||
    !Number.isSafeInteger(event.seq) || Number(event.seq) < 1 || !isTimestamp(event.timestamp)) throw invalid();
  if (event.type === "connection.ready") parseActiveTask(event.data);
  else if (event.type === "retrieval.completed") { if (!Array.isArray(event.data)) throw invalid(); }
  else if (!object(event.data)) throw invalid();
  if (["answer.delta", "thinking.delta"].includes(event.type)) {
    const d = event.data as Record<string, unknown>;
    if (typeof d.text !== "string" || !isUuid(d.messageId) || !Number.isSafeInteger(d.round) || Number(d.round) < 1) throw invalid();
  }
  if (event.type.startsWith("execution.") && !isUuid(event.executionId)) throw invalid();
  if (event.type === "execution.completed") { if (parseTaskReply(event.data).executionId !== event.executionId) throw invalid(); }
  if (["command.error", "execution.failed", "execution.cancelled"].includes(event.type)) {
    const d = event.data as Record<string, unknown>; if (typeof d.code !== "string" || typeof d.message !== "string") throw invalid();
  }
  return event as TaskEvent;
}
const args = (value: unknown): Record<string, unknown> | null => {
  try { const parsed = typeof value === "string" ? JSON.parse(value) : value; return object(parsed) ? parsed : null; } catch { return null; }
};
/** Share only the existing presentation model; the transport and resource identity remain Task-specific. */
export function updateTaskStream(previous: SessionStream, event: TaskEvent): SessionStream {
  if (["completed", "stopped", "failed"].includes(previous.phase)) return previous;
  const d = object(event.data) ? event.data : {};
  const normalized: StreamEvent = { ...event, sessionId: event.taskId, data: d };
  if (event.type === "execution.accepted") normalized.type = "chat.accepted";
  else if (event.type === "execution.started") normalized.type = "run.started";
  else if (event.type === "execution.cancelling") normalized.type = "run.cancelling";
  else if (event.type === "execution.cancelled") normalized.type = "run.cancelled";
  else if (event.type === "execution.failed") { normalized.type = "run.failed"; normalized.data = { error: d }; }
  else if (event.type === "execution.completed") {
    const reply = parseTaskReply(d);
    normalized.type = "run.completed"; normalized.data = { answer: reply.lines.join("\n"), finalMessageId: previous.messages.at(-1)?.id ?? event.executionId, usage: reply.usage };
  } else if (event.type === "model.response.completed") {
    if (!isUuid(d.messageId) || !Number.isSafeInteger(d.round)) throw invalid();
    let messages: unknown; try { messages = JSON.parse(String(d.message)); } catch { throw invalid(); }
    const message = Array.isArray(messages) ? messages.find(m => object(m) && m.type === "AI") : null;
    if (!object(message)) throw invalid();
    const view = historyMessageView({ ...message, type: "AI" });
    const calls = Array.isArray(message.toolExecutionRequests) ? message.toolExecutionRequests : [];
    normalized.data = { ...d, toolCalls: calls.filter(object).map((call, i) => ({ toolCallId: String(call.id ?? `${d.round}:${i}`), toolName: String(call.name ?? ""), arguments: args(call.arguments) })) };
    // Argument deltas use an index before the provider assigns a real tool call ID.
    const pendingIds = new Set(calls.map((_, index) => `${d.round}:${index}`));
    const reconciled = { ...previous, tools: previous.tools.filter(tool => tool.round !== d.round || tool.executed || !pendingIds.has(tool.id)) };
    const stream = updateSessionStream(reconciled, normalized);
    return { ...stream, messages: stream.messages.map(m => m.id === d.messageId ? { ...m, answer: view.text || m.answer, thinking: view.thinking || m.thinking } : m) };
  } else if (event.type.startsWith("tool.")) {
    const prior = previous.tools.findLast(t => t.id === (d.id ?? d.toolCallId)) ?? previous.tools.findLast(t => t.name === (d.name ?? d.toolName));
    const round = typeof d.round === "number" ? d.round : prior?.round ?? previous.messages.at(-1)?.round ?? 1;
    const toolCallId = String(d.toolCallId ?? d.id ?? prior?.id ?? `${round}:${d.index ?? d.toolName ?? "tool"}`);
    const toolName = String(d.toolName ?? d.name ?? prior?.name ?? "");
    normalized.data = { ...d, round, toolCallId, toolName };
    if (event.type === "tool.started") normalized.data.arguments = args(d.arguments);
    if (event.type === "tool.failed") normalized.data.error = { message: String(d.result ?? "Tool failed"), code: "TOOL_FAILED" };
    if (event.type === "tool.arguments.delta") normalized.data.text = String(d.text ?? "");
  }
  return updateSessionStream(previous, normalized);
}
export function taskExecutionStream(execution: TaskExecution): SessionStream {
  let stream = { ...newSessionStream(), phase: "working" as SessionStream["phase"] };
  let round = 1;
  for (const entry of execution.records) {
    if (entry.type === "model.requested" && object(entry.data) && typeof entry.data.round === "number") round = entry.data.round;
    if (entry.type === "answer.partial" || entry.type === "thinking.partial") {
      const last = stream.messages.findLast(message => message.round === round);
      const field = entry.type === "answer.partial" ? "answer" : "thinking";
      if (typeof entry.data === "string") {
        const message = last ?? { id: `${execution.id}:${round}`, round, answer: "", thinking: "" };
        stream = { ...stream, messages: [...stream.messages.filter(m => m.id !== message.id), { ...message, [field]: entry.data }] };
      }
      continue;
    }
    stream = updateTaskStream(stream, { version: 1, type: entry.type, agentId: execution.agentId, taskId: execution.taskId,
      executionId: execution.id, requestId: execution.requestId, seq: entry.sequence, timestamp: entry.timestamp, data: entry.data });
  }
  const phase = execution.status === "COMPLETED" ? "completed" : execution.status === "FAILED" ? "failed" :
    execution.status === "CANCELLED" || execution.status === "SKIPPED" ? "stopped" : execution.status === "CANCELLING" ? "cancelling" : "working";
  return finishSessionStream(stream, phase);
}

/** No automatic retry, resubmission, or cancellation on disconnect: Task owns its execution. */
export function openTaskStream(options: {
  baseUrl: string; agentId: string; taskId: string; requestId: string; signal: AbortSignal;
  onEvent: (event: TaskEvent) => void; onBusy: (active: ReturnType<typeof parseActiveTask>) => void;
  socketFactory?: StreamSocketFactory; uuid?: () => string; timeoutMs?: number;
}): { result: Promise<void>; cancel: () => void } {
  let cancel = () => {};
  const result = new Promise<void>((resolve, reject) => {
    let socket: StreamSocket | undefined, settled = false, sent = false, seq = 0, executionId: string | null = null, cancelId: string | null = null;
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => { clearTimeout(timer); options.signal.removeEventListener("abort", aborted); if (socket) {
      socket.removeEventListener("message", received); socket.removeEventListener("close", closed); socket.removeEventListener("error", closed); socket.close();
    } };
    const finish = (error?: BackendClientError) => { if (settled) return; settled = true; cleanup(); if (error) reject(error); else resolve(); };
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => finish(new BackendClientError("timeout", "Task stream timed out; check execution status.")), options.timeoutMs ?? 120000); };
    const aborted = () => finish(new BackendClientError("cancelled", "Task stream detached."));
    const closed = () => finish(new BackendClientError("network", "Task connection interrupted; the execution may continue."));
    const send = (type: string, requestId: string, data: unknown) => socket!.send(JSON.stringify({ version: 1, type, requestId, data }));
    function received(message: MessageEvent) {
      if (settled) return;
      try {
        if (typeof message.data !== "string") throw invalid();
        const event = parseTaskEvent(message.data);
        if (event.agentId !== options.agentId || event.taskId !== options.taskId) throw invalid();
        if (event.seq <= seq) return; if (event.seq !== seq + 1) throw invalid(); seq = event.seq; arm();
        if (event.type === "connection.ready" && !sent) {
          const active = parseActiveTask(event.data);
          if (active) { options.onBusy(active); finish(); return; }
          sent = true; send("execute", options.requestId, { parameters: {} }); return;
        }
        if (!sent || event.requestId !== options.requestId && event.requestId !== cancelId) return;
        if (event.type === "command.error") {
          const d = event.data as Record<string, unknown>;
          if (event.requestId === options.requestId) finish(new BackendClientError("remote", String(d.message), { serverCode: String(d.code) }));
          return;
        }
        if (event.requestId === cancelId) return;
        if (event.executionId) { if (executionId && executionId !== event.executionId) throw invalid(); executionId = event.executionId; }
        options.onEvent(event);
        if (["execution.completed", "execution.cancelled", "execution.failed"].includes(event.type)) finish();
      } catch (cause) { finish(cause instanceof BackendClientError ? cause : invalid()); }
    }
    cancel = () => {
      if (settled || cancelId || !executionId) return;
      try { cancelId = (options.uuid ?? (() => crypto.randomUUID()))(); send("cancel", cancelId, { executionId }); }
      catch { closed(); }
    };
    void (async () => { try {
      if (!isUuid(options.agentId) || !isUuid(options.taskId) || !isUuid(options.requestId)) throw invalid();
      if (options.signal.aborted) { aborted(); return; }
      const url = new URL(backendEndpoint(options.baseUrl, `api/agent/${options.agentId}/tasks/${options.taskId}/stream`)); url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      if (!options.socketFactory) {
        const path = url.pathname.slice(new URL(options.baseUrl).pathname.replace(/\/$/, "").length);
        url.searchParams.set("ticket", await websocketTicket(options.baseUrl, path, options.signal));
        options.signal.throwIfAborted();
      }
      socket = (options.socketFactory ?? (url => new WebSocket(url)))(url.href);
      socket.addEventListener("message", received); socket.addEventListener("close", closed); socket.addEventListener("error", closed);
      options.signal.addEventListener("abort", aborted, { once: true }); arm();
    } catch (cause) { finish(cause instanceof BackendClientError ? cause : invalid()); } })();
  });
  return { result, cancel: () => cancel() };
}
