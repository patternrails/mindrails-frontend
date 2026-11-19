import type { BackendSession } from "./backend-sessions.ts";
import type { ConversationRecord } from "./workspace-conversation.ts";

/** Only completed live turns create unread results; restored history is already read. */
export function sessionCompletions(records: Record<string, ConversationRecord>, saved: Record<string, string>) {
  const completed = { ...saved };
  for (const [identity, record] of Object.entries(records)) {
    const turn = record.turns.findLast(turn => turn.status === "completed" && !!turn.lastFeedbackAt);
    if (turn) completed[identity.split("/")[1]] = turn.id;
  }
  return completed;
}

export function unreadSessions(completed: Record<string, string>, read: Record<string, string>, viewing: string | null) {
  return new Set(Object.keys(completed).filter(id => id !== viewing && completed[id] !== read[id]));
}

export function readAgentSessions(sessions: readonly BackendSession[], agentId: string, completed: Record<string, string>, read: Record<string, string>) {
  const next = { ...read };
  for (const session of sessions) if (session.parentAgentId === agentId && completed[session.id]) next[session.id] = completed[session.id];
  return next;
}

/** Promote once per live turn; subsequent feedback and restored history leave the order stable. */
export function sessionActivity(records: Record<string, ConversationRecord>, saved: Record<string, number>) {
  const activity = { ...saved };
  for (const [identity, record] of Object.entries(records)) {
    const id = identity.split("/")[1];
    for (const turn of record.turns) {
      const time = turn.firstFeedbackAt ? Date.parse(turn.firstFeedbackAt) : NaN;
      if (Number.isFinite(time) && time > (activity[id] ?? 0)) activity[id] = time;
    }
  }
  return activity;
}

export function orderedAgents<T extends { id: string }>(agents: readonly T[], order: readonly string[]): T[] {
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...agents].sort((a, b) => (rank.get(a.id) ?? order.length) - (rank.get(b.id) ?? order.length));
}
export function moveAgent(order: readonly string[], source: string, target: string) {
  if (!order.includes(source) || !order.includes(target) || source === target) return [...order];
  const next = order.filter(id => id !== source); next.splice(order.indexOf(target), 0, source); return next;
}
export function recentSessions(sessions: readonly BackendSession[], activity: Record<string, number>) {
  const time = (session: BackendSession) => Math.max(Date.parse(session.updatedAt), Date.parse(session.createdAt), activity[session.id] ?? 0);
  return [...sessions].sort((a, b) => time(b) - time(a) || b.id.localeCompare(a.id));
}
