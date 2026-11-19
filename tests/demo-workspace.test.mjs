import assert from "node:assert/strict";
import test from "node:test";
import { createDemoState, demoReducer, getActiveSession, getGeneratingRun } from "../src/lib/demo-workspace.ts";

const execution = {
  thinking: "Sample summary",
  tools: [{ id: "sample", name: "sample_tool", status: "pending", arguments: {}, result: "Sample result" }],
};
const replies = ["First part", "Second part", "Complete reply"];

function initialState() {
  return createDemoState(
    [{ id: "a", name: "Agent A", description: "" }, { id: "b", name: "Agent B", description: "" }],
    [
      { id: "session-a", agentId: "a", title: "A", draft: "", turns: [], selectedTurnId: null },
      { id: "session-b", agentId: "b", title: "B", draft: "", turns: [], selectedTurnId: null },
    ],
  );
}

function send(state, text = "Hello") {
  return demoReducer(demoReducer(state, { type: "draft", value: text }), { type: "send", execution });
}

function tick(state, target = getGeneratingRun(state)) {
  return demoReducer(state, { type: "tick", sessionId: target.sessionId, turnId: target.turn.id, replies });
}

test("blank messages and rapid duplicate sends cannot create extra turns", () => {
  const initial = initialState();
  const snapshot = structuredClone(initial);
  const blank = demoReducer(initial, { type: "draft", value: " \n\t " });
  assert.equal(demoReducer(blank, { type: "send", execution }), blank);
  const sent = send(initial, "  First line\nSecond line  ");
  const session = getActiveSession(sent);
  assert.equal(session.turns[0].user, "First line\nSecond line");
  assert.equal(session.title, "First line");
  assert.equal(session.draft, "");
  assert.equal(session.selectedTurnId, session.turns[0].id);
  assert.equal(demoReducer(sent, { type: "send", execution }), sent);
  assert.equal(demoReducer(sent, { type: "new-session" }), sent);
  assert.equal(demoReducer(sent, { type: "select-agent", id: "b" }), sent);
  assert.equal(demoReducer(sent, { type: "select-session", id: "session-b" }), sent);
  assert.deepEqual(initial, snapshot);
  assert.equal(execution.tools[0].id, "sample");
  assert.equal(execution.tools[0].status, "pending");
});

test("stop keeps received text and late timer ticks never resume the turn", () => {
  const first = tick(send(initialState()));
  const pendingRun = getGeneratingRun(first);
  const stopped = demoReducer(first, { type: "stop" });
  const turn = getActiveSession(stopped).turns[0];
  assert.equal(turn.assistant, "First part");
  assert.equal(turn.status, "stopped");
  assert.equal(turn.execution.tools[0].status, "stopped");
  assert.equal(getGeneratingRun(stopped), undefined);
  assert.deepEqual(tick(stopped, pendingRun), stopped);
  const restarted = send(stopped, "Try again");
  assert.equal(getActiveSession(restarted).turns.length, 2);
  assert.notEqual(getActiveSession(restarted).turns[1].id, turn.id);
  assert.equal(getActiveSession(restarted).turns[0].status, "stopped");
});

test("stopping after the sample tool finishes retains its result", () => {
  const progressed = tick(tick(send(initialState())));
  const stopped = demoReducer(progressed, { type: "stop" });
  assert.equal(getActiveSession(stopped).turns[0].execution.tools[0].status, "completed");
  assert.equal(getActiveSession(stopped).turns[0].execution.tools[0].result, "Sample result");
});

test("completion is terminal and an unrelated timer cannot change a conversation", () => {
  const sent = send(initialState());
  const target = getGeneratingRun(sent);
  const completed = tick(tick(tick(sent)));
  assert.equal(getGeneratingRun(completed), undefined);
  assert.equal(getActiveSession(completed).turns[0].assistant, "Complete reply");
  assert.equal(getActiveSession(completed).turns[0].status, "completed");
  assert.deepEqual(tick(completed, target), completed);
  assert.deepEqual(demoReducer(sent, { type: "tick", sessionId: "session-b", turnId: target.turn.id, replies }), sent);
});

test("agents remember their sessions, drafts and selected execution independently", () => {
  let state = demoReducer(initialState(), { type: "draft", value: "Draft A" });
  state = demoReducer(state, { type: "new-session" });
  const newA = getActiveSession(state);
  assert.equal(newA.turns.length, 0);
  assert.equal(newA.selectedTurnId, null);
  assert.equal(newA.titleKey, "newSession");
  state = demoReducer(state, { type: "draft", value: "New draft A" });
  state = demoReducer(state, { type: "select-agent", id: "b" });
  state = demoReducer(state, { type: "draft", value: "Draft B" });
  state = demoReducer(state, { type: "select-agent", id: "a" });
  assert.equal(getActiveSession(state).id, newA.id);
  assert.equal(getActiveSession(state).draft, "New draft A");
  state = demoReducer(state, { type: "select-session", id: "session-a" });
  assert.equal(getActiveSession(state).draft, "Draft A");
  state = tick(tick(tick(send(state))));
  assert.equal(getActiveSession(state).titleKey, undefined);
  const firstTurn = getActiveSession(state).turns[0].id;
  state = tick(tick(tick(send(state, "Second turn"))));
  state = demoReducer(state, { type: "select-execution", turnId: firstTurn });
  state = demoReducer(state, { type: "select-agent", id: "b" });
  assert.equal(getActiveSession(state).draft, "Draft B");
  state = demoReducer(state, { type: "new-session" });
  assert.notEqual(getActiveSession(state).id, newA.id);
  state = demoReducer(state, { type: "select-agent", id: "a" });
  assert.equal(getActiveSession(state).selectedTurnId, firstTurn);
  assert.equal(demoReducer(state, { type: "select-agent", id: "unknown" }), state);
  assert.equal(demoReducer(state, { type: "select-session", id: "session-b" }), state);
  assert.equal(demoReducer(state, { type: "select-execution", turnId: "unknown" }), state);
});

test("a generated empty-session title is localizable; user-derived titles remain literal", () => {
  const empty = demoReducer(initialState(), { type: "new-session" });
  assert.equal(getActiveSession(empty).titleKey, "newSession");
  const sent = send(empty, "New session");
  assert.equal(getActiveSession(sent).title, "New session");
  assert.equal(getActiveSession(sent).titleKey, undefined);
});

test("deleting the current session selects the next sibling, or the previous one at the end", () => {
  const initial = initialState();
  const first = initial.sessions[0];
  const second = { ...first, id: "session-a2", draft: "Second draft" };
  const third = { ...first, id: "session-a3", draft: "Third draft" };
  const state = { ...initial, sessions: [first, initial.sessions[1], second, third] };
  const snapshot = structuredClone(state);
  const middle = demoReducer(state, { type: "select-session", id: second.id });
  const next = demoReducer(middle, { type: "delete-session", id: second.id });
  assert.equal(getActiveSession(next), third);
  const last = demoReducer(state, { type: "select-session", id: third.id });
  const previous = demoReducer(last, { type: "delete-session", id: third.id });
  assert.equal(getActiveSession(previous), second);
  assert.equal(previous.activeSessionByAgent.b, "session-b");
  assert.equal(previous.sessions.find((session) => session.id === "session-b"), initial.sessions[1]);
  assert.deepEqual(state, snapshot);
});

test("deleting an inactive session preserves the current session and its draft", () => {
  const state = demoReducer(demoReducer(initialState(), { type: "draft", value: "Original draft" }), { type: "new-session" });
  const current = getActiveSession(state);
  const deleted = demoReducer(state, { type: "delete-session", id: "session-a" });
  assert.equal(getActiveSession(deleted), current);
  assert.equal(deleted.sessions.some((session) => session.id === "session-a"), false);
  assert.equal(deleted.nextId, state.nextId);
  assert.equal(demoReducer(deleted, { type: "delete-session", id: "session-a" }), deleted);
  assert.equal(demoReducer(deleted, { type: "delete-session", id: "missing" }), deleted);
});

test("deleting the last session leaves an empty workspace that can create a fresh session", () => {
  const initial = initialState();
  const state = demoReducer(initial, { type: "delete-session", id: "session-a" });
  assert.equal(getActiveSession(state), undefined);
  assert.equal(state.activeSessionByAgent.a, "");
  assert.equal(state.activeAgentId, "a");
  assert.equal(state.activeSessionByAgent.b, "session-b");
  const created = demoReducer(state, { type: "new-session" });
  assert.equal(getActiveSession(created).agentId, "a");
  assert.equal(getActiveSession(created).draft, "");
  assert.equal(getActiveSession(created).selectedTurnId, null);
  assert.deepEqual(getActiveSession(created).turns, []);
});

test("deleting a generating session ends its run and late ticks cannot restore it", () => {
  const initial = demoReducer(initialState(), { type: "new-session" });
  const generating = tick(send(initial));
  const run = getGeneratingRun(generating);
  const deleted = demoReducer(generating, { type: "delete-session", id: run.sessionId });
  assert.equal(getGeneratingRun(deleted), undefined);
  assert.equal(getActiveSession(deleted).id, "session-a");
  assert.equal(deleted.sessions.some((session) => session.id === run.sessionId), false);
  assert.equal(tick(deleted, run), deleted);
  const fresh = send(deleted, "A new response");
  assert.notEqual(getGeneratingRun(fresh).turn.id, run.turn.id);
});

test("deleting another session leaves the generating run and other agents intact", () => {
  const generating = send(demoReducer(initialState(), { type: "new-session" }));
  const run = getGeneratingRun(generating);
  const deleted = demoReducer(generating, { type: "delete-session", id: "session-a" });
  assert.equal(getActiveSession(deleted), getActiveSession(generating));
  assert.deepEqual(getGeneratingRun(deleted), run);
  assert.equal(tick(deleted, run).sessions.find((session) => session.id === run.sessionId).turns[0].assistant, "First part");
  assert.equal(deleted.activeSessionByAgent.b, "session-b");
});
