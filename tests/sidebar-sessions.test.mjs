import test from "node:test";
import assert from "node:assert/strict";
import { orderedAgents, moveAgent, recentSessions, sessionActivity, sessionCompletions, unreadSessions, readAgentSessions } from "../src/lib/sidebar-sessions.ts";

test("agent order survives additions and drag works in both directions", () => {
  const agents = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(orderedAgents(agents, ["b", "a", "deleted"]).map(a => a.id), ["b", "a", "c"]);
  assert.deepEqual(moveAgent(["a", "b", "c"], "a", "b"), ["b", "a", "c"]);
  assert.deepEqual(moveAgent(["a", "b", "c"], "c", "a"), ["c", "a", "b"]);
  assert.deepEqual(moveAgent(["a", "b"], "unknown", "b"), ["a", "b"]);
});
test("recents combine server timestamps with local activity without mutating agent creation order", () => {
  const sessions = [{ id: "a", createdAt: "2026-10-19T01:00:00Z", updatedAt: "2026-10-19T01:00:00Z" }, { id: "b", createdAt: "2026-10-19T02:00:00Z", updatedAt: "2026-10-19T02:00:00Z" }];
  assert.deepEqual(recentSessions(sessions, {}).map(s => s.id), ["b", "a"]);
  assert.deepEqual(recentSessions(sessions, { a: Date.parse("2026-10-19T03:00:00Z") }).map(s => s.id), ["a", "b"]);
  assert.deepEqual(sessions.map(s => s.id), ["a", "b"]);
});

test("reading history, drafting and sending keep Recents stable until feedback arrives", () => {
  const sessions = [
    { id: "a", createdAt: "2026-10-19T01:00:00Z", updatedAt: "2026-10-19T01:00:00Z" },
    { id: "b", createdAt: "2026-10-19T02:00:00Z", updatedAt: "2026-10-19T02:00:00Z" },
  ];
  const oldReply = { sentAt: "2026-10-19T01:00:00Z", receivedAt: "2026-10-19T02:30:00Z" };
  const waiting = { sentAt: "2026-10-19T03:00:00Z", receivedAt: null };
  const records = { "agent/a": { draft: "draft", turns: [oldReply, waiting] } };
  const activity = sessionActivity(records, {});
  assert.deepEqual(recentSessions(sessions, activity).map(s => s.id), ["b", "a"]);
  assert.deepEqual(activity, {});
  waiting.firstFeedbackAt = "2026-10-19T03:00:01Z";
  const streamed = sessionActivity(records, activity);
  assert.deepEqual(recentSessions(sessions, streamed).map(s => s.id), ["a", "b"]);
  // A stopped stream retains its feedback time even with no completed response.
  waiting.status = "stopped";
  assert.deepEqual(sessionActivity(records, streamed), streamed);
  assert.deepEqual(activity, {});
});

test("live replies advance persisted feedback while restoring history never changes it", () => {
  const saved = { a: Date.parse("2026-10-19T03:00:00Z") };
  const records = { "agent/a": { draft: "", turns: [{ receivedAt: "2026-10-19T01:00:00Z" }] } };
  assert.deepEqual(sessionActivity(records, saved), saved);
  records["agent/a"].turns.push({ receivedAt: "2026-10-19T04:00:00Z" });
  assert.deepEqual(sessionActivity(records, saved), saved);
  records["agent/a"].turns.push({ receivedAt: "2026-10-19T04:00:00Z", firstFeedbackAt: "2026-10-19T04:00:00Z" });
  assert.equal(sessionActivity(records, saved).a, Date.parse("2026-10-19T04:00:00Z"));
});

test("only completed live results become unread, and viewing a session clears its indicator", () => {
  const records = {
    "agent/history": { turns: [{ id: "old", status: "completed" }] },
    "agent/running": { turns: [{ id: "pending", status: "waiting", lastFeedbackAt: "now" }] },
    "agent/stopped": { turns: [{ id: "partial", status: "stopped", lastFeedbackAt: "now" }] },
    "agent/failed": { turns: [{ id: "error", status: "failed", lastFeedbackAt: "now" }] },
    "agent/done": { turns: [{ id: "first", status: "completed", lastFeedbackAt: "now" }] },
  };
  const completed = sessionCompletions(records, { saved: "saved-turn" });
  assert.deepEqual(completed, { saved: "saved-turn", done: "first" });
  assert.deepEqual([...unreadSessions(completed, { saved: "saved-turn" }, null)], ["done"]);
  assert.deepEqual([...unreadSessions(completed, {}, "done")], ["saved"]);
  const read = { done: "first", saved: "saved-turn" };
  assert.equal(unreadSessions(completed, read, null).size, 0);
  records["agent/done"].turns.push({ id: "second", status: "completed", lastFeedbackAt: "later" });
  assert.deepEqual([...unreadSessions(sessionCompletions(records, completed), read, null)], ["done"]);
  assert.equal(completed.done, "first");
});

test("read all covers hidden sessions only within its agent and survives preference serialization", () => {
  const sessions = Array.from({ length: 8 }, (_, i) => ({ id: `session-${i}`, parentAgentId: i < 7 ? "agent" : "other" }));
  const completed = Object.fromEntries(sessions.map(session => [session.id, `turn-${session.id}`]));
  const original = {};
  const read = readAgentSessions(sessions, "agent", completed, original);
  assert.equal(Object.keys(read).length, 7);
  assert.deepEqual(original, {});
  const restored = JSON.parse(JSON.stringify({ completed, read }));
  assert.deepEqual([...unreadSessions(restored.completed, restored.read, null)], ["session-7"]);
});

test("concurrent streams promote once per turn and never compete on later feedback", () => {
  const a = { firstFeedbackAt: "2026-10-19T03:00:00Z", lastFeedbackAt: "2026-10-19T03:00:00Z" };
  const b = { firstFeedbackAt: "2026-10-19T03:00:01Z", lastFeedbackAt: "2026-10-19T03:00:01Z" };
  const records = { "agent/a": { turns: [a] }, "agent/b": { turns: [b] } };
  const sessions = ["a", "b"].map(id => ({ id, createdAt: "2026-10-19T01:00:00Z", updatedAt: "2026-10-19T01:00:00Z" }));
  const saved = sessionActivity(records, {});
  for (const turn of [a, b, a, b]) {
    turn.lastFeedbackAt = "2026-10-19T04:00:00Z";
    assert.deepEqual(sessionActivity(records, saved), saved);
    assert.deepEqual(recentSessions(sessions, sessionActivity(records, saved)).map(s => s.id), ["b", "a"]);
  }
  records["agent/a"].turns.push({ firstFeedbackAt: "2026-10-19T05:00:00Z" });
  assert.deepEqual(recentSessions(sessions, sessionActivity(records, saved)).map(s => s.id), ["a", "b"]);
});
