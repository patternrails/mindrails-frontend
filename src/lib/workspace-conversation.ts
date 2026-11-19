import type { TokenUsage } from "./session-summary.ts";
import type { SessionStream } from "./session-stream.ts";
import type { ChatSource } from "./backend-sessions.ts";
import type { ChatError } from "./chat-errors.ts";

export type ChatStatus = "waiting" | "completed" | "failed" | "unconfirmed" | "stopped";
export type ChatTurn = {
  communication?: import("./session-stream.ts").CommunicationSource;
  /** Fixed when this turn first receives feedback, so streams only promote Recents once. */
  firstFeedbackAt?: string;
  /** Live feedback time; intentionally absent on restored history. */
  lastFeedbackAt?: string;
  /** Older requests exist beyond the history page limit; their usage is unknown here. */
  priorUsageUnknown?: boolean;
  usage?: TokenUsage | null; executedTools?: string[];
  stream?: SessionStream; sources?: ChatSource[]; attachments?: { versionId: string; name: string }[];
  id: string; user: string; assistant: string | null; status: ChatStatus;
  sentAt: string; receivedAt: string | null; elapsedMs: number | null;
  responseCount: number | null; error: ChatError | null;
  modelName: string; providerName: string;
};
/** Transient UI state. Conversation history belongs to the backend. */
export type ConversationRecord = { draft: string; turns: ChatTurn[] };
