import { parseTokenUsage, type TokenUsage } from "./session-summary.ts";
import { BackendClientError } from "./backend-client.ts";
import { isTimestamp, isUuid, parseChatSources, type ChatSource } from "./backend-sessions.ts";

export type StreamPhase = "queued" | "connecting" | "starting" | "thinking" | "answering" | "working" | "cancelling" | "completed" | "stopped" | "failed" | "unconfirmed";
export type StreamMessage = { id: string; round: number; thinking: string; answer: string };
export type StreamTool = {
  id: string; round: number; name: string; executed?: boolean; startedOrder?: number;
  status: "preparing" | "pending" | "running" | "completed" | "failed" | "stopped" | "unconfirmed";
  argumentText: string; arguments: Record<string, unknown> | null; argumentsOmitted: boolean;
  result: string | null; error: string | null; durationMs: number | null; truncated: boolean;
};
export type SessionStream = {
  usage?: TokenUsage | null;
  phase: StreamPhase; messages: StreamMessage[]; tools: StreamTool[];
  finalMessageId: string | null; error: string | null;
};
export type StreamEvent = {
  version: 1; type: string; agentId: string; sessionId: string; requestId: string | null;
  seq: number; timestamp: string; data: Record<string, unknown>;
};
export type CommunicationSource = { sourceSessionId: string; sourceAgentId: string; sourceRunId: string;
  inReplyTo: string | null; sentAt: string; hops: number };
export type SessionInputEvent = { requestId: string; message: string; submittedAt: string; source: CommunicationSource | null };
export function parseCommunicationSource(value: unknown): CommunicationSource {
  if (!object(value) || !isUuid(value.sourceSessionId) || !isUuid(value.sourceAgentId) || !isUuid(value.sourceRunId) ||
    !(value.inReplyTo == null || isUuid(value.inReplyTo)) || !isTimestamp(value.sentAt) || !positive(value.hops)) throw invalid();
  return value as CommunicationSource;
}
export function parseSessionInput(value: unknown): SessionInputEvent {
  if (!object(value) || !isUuid(value.requestId) || typeof value.message !== "string" || !isTimestamp(value.submittedAt)) throw invalid();
  if (value.source != null) parseCommunicationSource(value.source);
  return value as SessionInputEvent;
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const positive = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;
const nullableText = (v: unknown) => v === null || typeof v === "string";
const invalid = () => new BackendClientError("invalid-response", "Invalid streaming event.");
export const newSessionStream = (): SessionStream => ({ phase: "connecting", messages: [], tools: [], finalMessageId: null, error: null });
export const streamTerminal = (phase: StreamPhase) => ["completed", "stopped", "failed", "unconfirmed"].includes(phase);

/** Validate the envelope and every payload used by the UI; ignore future event types. */
export function parseStreamEvent(raw: string): StreamEvent {
  let v: unknown;
  try { v = JSON.parse(raw); } catch { throw invalid(); }
  if (!object(v) || v.version !== 1 || typeof v.type !== "string" || !isUuid(v.agentId) || !isUuid(v.sessionId) ||
    !(v.requestId === null || isUuid(v.requestId)) || !positive(v.seq) || !isTimestamp(v.timestamp) || !object(v.data)) throw invalid();
  const d = v.data, type = v.type;
  if (type === "message.enqueued" || type === "run.started" && d.input != null) {
    const input = parseSessionInput(type === "message.enqueued" ? d : d.input);
    if (input.requestId !== v.requestId) throw invalid();
  }
  // Some providers emit a name-only tool fragment before its argument text.
  if (type === "tool.arguments.delta" && d.text === null) d.text = "";
  if (["thinking.delta", "answer.delta", "model.response.completed"].includes(type) && (!positive(d.round) || !isUuid(d.messageId))) throw invalid();
  if (["thinking.delta", "answer.delta", "tool.arguments.delta"].includes(type) && typeof d.text !== "string") throw invalid();
  if (["tool.arguments.delta", "tool.started", "tool.completed", "tool.failed"].includes(type)) {
    if (!positive(d.round) || typeof d.toolCallId !== "string" || !d.toolCallId || !nullableText(d.toolName)) throw invalid();
  }
  if (type === "model.response.completed" && (!Array.isArray(d.toolCalls) || !d.toolCalls.every(call => object(call) &&
    typeof call.toolCallId === "string" && !!call.toolCallId && typeof call.toolName === "string" && (call.arguments === null || object(call.arguments))))) throw invalid();
  if (type === "tool.started" && !(d.arguments === null || object(d.arguments))) throw invalid();
  if (type === "tool.completed" && (!nullableText(d.result) || !(d.durationMs === null || typeof d.durationMs === "number" && Number.isFinite(d.durationMs) && d.durationMs >= 0))) throw invalid();
  if (type === "retrieval.completed") parseChatSources(d.sources);
  if (type === "run.completed" && (typeof d.answer !== "string" || !isUuid(d.finalMessageId))) throw invalid();
  if (type === "run.completed") parseTokenUsage(d.usage);
  if (type === "command.error" && (typeof d.code !== "string" || typeof d.message !== "string")) throw invalid();
  if (["run.failed", "tool.failed"].includes(type) && (!object(d.error) || typeof d.error.code !== "string" || typeof d.error.message !== "string")) throw invalid();
  if (["run.failed", "tool.failed"].includes(type)) {
    const error = d.error as Record<string, unknown>;
    for (const field of ["reason", "detail"]) {
      if (error[field] != null && typeof error[field] !== "string") throw invalid();
    }
  }
  return v as StreamEvent;
}

export function finishSessionStream(stream: SessionStream, phase: StreamPhase): SessionStream {
  return { ...stream, phase, tools: stream.tools.map(tool => ["preparing", "pending", "running"].includes(tool.status) ?
    { ...tool, status: phase === "stopped" ? "stopped" : "unconfirmed" } : tool) };
}

export function updateSessionStream(previous: SessionStream, event: StreamEvent): SessionStream {
  if (streamTerminal(previous.phase)) return previous;
  const s = { ...previous, messages: [...previous.messages], tools: [...previous.tools] }, d = event.data;
  function message(id = d.messageId as string, round = d.round as number) {
    const index = s.messages.findIndex(m => m.id === id);
    const m = index < 0 ? { id, round, thinking: "", answer: "" } : { ...s.messages[index] };
    if (index < 0) s.messages.push(m); else s.messages[index] = m;
    return m;
  }
  function tool(data = d) {
    const index = s.tools.findIndex(t => t.id === data.toolCallId && t.round === d.round);
    const t: StreamTool = index < 0 ? { id: data.toolCallId as string, round: d.round as number, name: "", status: "preparing",
      argumentText: "", arguments: null, argumentsOmitted: false, result: null, error: null, durationMs: null, truncated: false } : { ...s.tools[index] };
    if (typeof data.toolName === "string" && data.toolName) t.name = data.toolName;
    if (data.arguments != null || data.argumentsOmitted === true) { t.arguments = data.arguments as Record<string, unknown> | null; t.argumentsOmitted = data.argumentsOmitted === true; }
    if (index < 0) s.tools.push(t); else s.tools[index] = t;
    return t;
  }
  switch (event.type) {
    case "message.enqueued": if (["connecting", "starting"].includes(s.phase)) s.phase = "queued"; break;
    case "chat.accepted": if (s.phase === "connecting") s.phase = "starting"; break;
    case "run.started": if (["queued", "connecting", "starting"].includes(s.phase)) s.phase = "working"; break;
    case "thinking.delta": message().thinking += d.text; s.phase = "thinking"; break;
    case "answer.delta": message().answer += d.text; s.phase = "answering"; break;
    case "tool.arguments.delta": tool().argumentText += d.text; s.phase = "working"; break;
    case "model.response.completed":
      message();
      for (const call of d.toolCalls as Record<string, unknown>[]) { const t = tool(call); if (t.status === "preparing") t.status = "pending"; }
      s.phase = "working";
      break;
    case "tool.started": Object.assign(tool(), { status: "running", executed: true, startedOrder: event.seq }); s.phase = "working"; break;
    case "tool.completed": Object.assign(tool(), { status: "completed", executed: true, result: d.result, durationMs: d.durationMs, truncated: d.truncated === true }); s.phase = "working"; break;
    case "tool.failed": Object.assign(tool(), { status: "failed", executed: true, error: (d.error as { message: string }).message }); s.phase = "working"; break;
    case "run.cancelling": s.phase = "cancelling"; break;
    case "run.completed": {
      const finalId = d.finalMessageId as string;
      message(finalId, s.messages.find(m => m.id === finalId)?.round ?? Math.max(1, ...s.messages.map(m => m.round))).answer = d.answer as string;
      s.finalMessageId = finalId;
      s.usage = parseTokenUsage(d.usage);
      return finishSessionStream(s, "completed");
    }
    case "run.cancelled": return finishSessionStream(s, "stopped");
    case "run.failed": s.error = (d.error as { message: string }).message; return finishSessionStream(s, "failed");
  }
  if (previous.phase === "cancelling" || s.phase === "cancelling") s.phase = "cancelling";
  else if (s.tools.some(t => t.status === "running")) s.phase = "working";
  return s;
}

function streamAnswerMessage(stream: SessionStream): StreamMessage | undefined {
  const message = stream.finalMessageId ? stream.messages.find(m => m.id === stream.finalMessageId) : stream.messages.at(-1);
  if (!stream.finalMessageId && !streamTerminal(stream.phase) && message && stream.tools.some(tool => tool.round === message.round)) return undefined;
  return message;
}

export function streamIntermediateMessages(stream: SessionStream): StreamMessage[] {
  const displayedId = streamAnswerMessage(stream)?.id;
  return stream.messages.filter(message => message.id !== displayedId && message.answer.trim());
}

export function streamAnswer(stream: SessionStream): string | null {
  return streamAnswerMessage(stream)?.answer || null;
}

export function retrievedSources(event: StreamEvent): ChatSource[] { return parseChatSources(event.data.sources); }
