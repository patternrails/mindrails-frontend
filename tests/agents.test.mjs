import assert from "node:assert/strict";
import test from "node:test";
import { createDemoState, demoReducer, getActiveSession, getGeneratingRun } from "../src/lib/demo-workspace.ts";

const input = { name: "  Research assistant  ", description: "", goal: "  Summarize sources  ", systemMessage: "" };
function initialState() {
  return createDemoState(
    [{ id: "a", name: "A", description: "", goal: "", systemMessage: "" }, { id: "b", name: "B", description: "", goal: "", systemMessage: "" }],
    [{ id: "session-a", agentId: "a", title: "A", draft: "Draft A", turns: [], selectedTurnId: null },
      { id: "session-b", agentId: "b", title: "B", draft: "Draft B", turns: [], selectedTurnId: null }],
  );
}

test("blank names cannot create or overwrite an agent; optional fields may be empty", () => {
  const state = initialState();
  const blank = { ...input, name: " \n\t " };
  assert.equal(demoReducer(state, { type: "create-agent", value: blank }), state);
  assert.equal(demoReducer(state, { type: "update-agent", id: "a", value: blank }), state);
  assert.equal(demoReducer(state, { type: "update-agent", id: "unknown", value: input }), state);
  const created = demoReducer(state, { type: "create-agent", value: input });
  assert.equal(created.agents[2].name, "Research assistant");
  assert.equal(created.agents[2].description, "");
  assert.equal(created.agents[2].goal, "Summarize sources");
  assert.equal(created.activeAgentId, "a");
  assert.equal(state.agents.length, 2);
});

test("editing an active agent preserves identity, selected session, and draft", () => {
  const state = initialState();
  const edited = demoReducer(state, { type: "update-agent", id: "a", value: input });
  assert.equal(edited.agents[0].id, "a");
  assert.equal(edited.agents[0].name, "Research assistant");
  assert.equal(edited.activeAgentId, "a");
  assert.equal(getActiveSession(edited).id, "session-a");
  assert.equal(getActiveSession(edited).draft, "Draft A");
  assert.equal(state.agents[0].name, "A");
});

test("deleting the current agent removes its sessions and restores the next agent’s draft", () => {
  const state = initialState();
  const deleted = demoReducer(state, { type: "delete-agent", id: "a" });
  assert.equal(deleted.activeAgentId, "b");
  assert.equal(getActiveSession(deleted).draft, "Draft B");
  assert.equal(deleted.sessions.some((session) => session.agentId === "a"), false);
  assert.equal(Object.hasOwn(deleted.activeSessionByAgent, "a"), false);
  assert.equal(state.sessions.length, 2);
  const otherDeleted = demoReducer(state, { type: "delete-agent", id: "b" });
  assert.equal(otherDeleted.activeAgentId, "a");
  assert.equal(getActiveSession(otherDeleted).draft, "Draft A");
  assert.equal(demoReducer(otherDeleted, { type: "delete-agent", id: "unknown" }), otherDeleted);
});

test("deleting all agents leaves a recoverable empty workspace and IDs are never reused", () => {
  let state = demoReducer(initialState(), { type: "create-agent", value: input });
  const firstId = state.agents.at(-1).id;
  for (const agent of state.agents) state = demoReducer(state, { type: "delete-agent", id: agent.id });
  assert.equal(state.activeAgentId, "");
  assert.equal(getActiveSession(state), undefined);
  assert.deepEqual(state.sessions, []);
  assert.deepEqual(state.activeSessionByAgent, {});
  assert.equal(demoReducer(state, { type: "new-session" }), state);
  state = demoReducer(state, { type: "create-agent", value: input });
  assert.notEqual(state.agents[0].id, firstId);
  assert.equal(state.activeAgentId, state.agents[0].id);
  assert.equal(getActiveSession(state), undefined);
  state = demoReducer(state, { type: "new-session" });
  assert.equal(getActiveSession(state).agentId, state.agents[0].id);
});

test("deleting an agent with an active response cancels the run; queued ticks cannot recreate it", () => {
  const running = demoReducer(initialState(), { type: "send", execution: { thinking: "Demo", tools: [] } });
  const pending = getGeneratingRun(running);
  const deleted = demoReducer(running, { type: "delete-agent", id: "a" });
  assert.equal(getGeneratingRun(deleted), undefined);
  assert.equal(demoReducer(deleted, { type: "tick", sessionId: pending.sessionId, turnId: pending.turn.id, replies: ["Late update"] }), deleted);
  const unrelatedDeleted = demoReducer(running, { type: "delete-agent", id: "b" });
  assert.equal(getGeneratingRun(unrelatedDeleted).turn.id, pending.turn.id);
});
