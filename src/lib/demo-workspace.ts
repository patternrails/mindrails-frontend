import type { Agent, AgentInput, ConversationTurn, Execution, Session } from "./ui-models";

export type DemoState = {
  agents: Agent[];
  sessions: Session[];
  activeAgentId: string;
  activeSessionByAgent: Record<string, string>;
  nextId: number;
};

export type DemoAction =
  | { type: "create-agent"; value: AgentInput }
  | { type: "update-agent"; id: string; value: AgentInput }
  | { type: "delete-agent"; id: string }
  | { type: "select-agent"; id: string }
  | { type: "select-session"; id: string }
  | { type: "delete-session"; id: string }
  | { type: "new-session" }
  | { type: "draft"; value: string }
  | { type: "send"; execution: Execution }
  | { type: "tick"; sessionId: string; turnId: string; replies: string[] }
  | { type: "stop" }
  | { type: "select-execution"; turnId: string };

export function normalizeAgentInput(value: AgentInput): AgentInput | null {
  const name = value.name.trim();
  if (!name) return null;
  return { name, description: value.description.trim(), goal: value.goal.trim(), systemMessage: value.systemMessage.trim() };
}

export function createDemoState(agents: Agent[], sessions: Session[]): DemoState {
  return {
    agents, sessions, activeAgentId: agents[0]?.id ?? "",
    activeSessionByAgent: Object.fromEntries(agents.map((agent) => [
      agent.id, sessions.find((session) => session.agentId === agent.id)?.id ?? "",
    ])),
    nextId: 1,
  };
}

export function getActiveSession(state: DemoState) {
  return state.sessions.find((session) =>
    session.agentId === state.activeAgentId &&
    session.id === state.activeSessionByAgent[state.activeAgentId]);
}

export function getGeneratingRun(state: DemoState) {
  for (const session of state.sessions) {
    const turn = session.turns.find((item) => item.status === "generating");
    if (turn) return { sessionId: session.id, agentId: session.agentId, turn };
  }
  return undefined;
}

function updateSession(state: DemoState, id: string, update: (session: Session) => Session): DemoState {
  return { ...state, sessions: state.sessions.map((session) => session.id === id ? update(session) : session) };
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  const session = getActiveSession(state);
  const generating = getGeneratingRun(state);

  switch (action.type) {
    case "create-agent": {
      const value = normalizeAgentInput(action.value);
      if (!value) return state;
      const id = `local-agent-${state.nextId}`;
      return {
        ...state, nextId: state.nextId + 1,
        agents: [...state.agents, { id, ...value }],
        activeAgentId: state.activeAgentId || id,
        activeSessionByAgent: { ...state.activeSessionByAgent, [id]: "" },
      };
    }
    case "update-agent": {
      const value = normalizeAgentInput(action.value);
      if (!value || !state.agents.some((agent) => agent.id === action.id)) return state;
      return { ...state, agents: state.agents.map((agent) => agent.id === action.id ? { id: agent.id, ...value } : agent) };
    }
    case "delete-agent": {
      if (!state.agents.some((agent) => agent.id === action.id)) return state;
      const agents = state.agents.filter((agent) => agent.id !== action.id);
      const activeSessionByAgent = { ...state.activeSessionByAgent };
      delete activeSessionByAgent[action.id];
      return {
        ...state, agents, activeSessionByAgent,
        activeAgentId: state.activeAgentId === action.id ? agents[0]?.id ?? "" : state.activeAgentId,
        sessions: state.sessions.filter((item) => item.agentId !== action.id),
      };
    }
    case "select-agent":
      if (generating || !state.agents.some((agent) => agent.id === action.id)) return state;
      return { ...state, activeAgentId: action.id };
    case "select-session": {
      const target = state.sessions.find((item) => item.id === action.id && item.agentId === state.activeAgentId);
      if (generating || !target) return state;
      return { ...state, activeSessionByAgent: { ...state.activeSessionByAgent, [state.activeAgentId]: target.id } };
    }
    case "delete-session": {
      const target = state.sessions.find((item) => item.id === action.id);
      if (!target) return state;
      const siblings = state.sessions.filter((item) => item.agentId === target.agentId);
      const index = siblings.findIndex((item) => item.id === target.id);
      const replacement = siblings[index + 1] ?? siblings[index - 1];
      return {
        ...state,
        sessions: state.sessions.filter((item) => item.id !== target.id),
        activeSessionByAgent: state.activeSessionByAgent[target.agentId] === target.id
          ? { ...state.activeSessionByAgent, [target.agentId]: replacement?.id ?? "" }
          : state.activeSessionByAgent,
      };
    }
    case "new-session": {
      if (generating || !state.agents.some((agent) => agent.id === state.activeAgentId)) return state;
      const id = `local-session-${state.nextId}`;
      return {
        ...state, nextId: state.nextId + 1,
        activeSessionByAgent: { ...state.activeSessionByAgent, [state.activeAgentId]: id },
        sessions: [{ id, agentId: state.activeAgentId, title: "New session", titleKey: "newSession", draft: "", turns: [], selectedTurnId: null }, ...state.sessions],
      };
    }
    case "draft":
      if (!session || generating) return state;
      return updateSession(state, session.id, (current) => ({ ...current, draft: action.value }));
    case "send": {
      const text = session?.draft.trim();
      if (!session || !text || generating) return state;
      const id = `local-turn-${state.nextId}`;
      const turn: ConversationTurn = {
        id, user: text, assistant: "", status: "generating", demoStep: 0,
        execution: {
          thinking: action.execution.thinking,
          tools: action.execution.tools.map((tool, index) => ({ ...tool, id: `${id}-tool-${index}` })),
        },
      };
      return updateSession({ ...state, nextId: state.nextId + 1 }, session.id, (current) => ({
        ...current, draft: "", selectedTurnId: id,
        title: current.turns.length === 0 ? text.split("\n")[0].slice(0, 40) : current.title,
        titleKey: current.turns.length === 0 ? undefined : current.titleKey,
        turns: [...current.turns, turn],
      }));
    }
    case "tick":
      if (!state.sessions.some((item) => item.id === action.sessionId)) return state;
      return updateSession(state, action.sessionId, (current) => ({
        ...current,
        turns: current.turns.map((turn) => {
          // A queued timer must never resume a stopped or already completed turn.
          if (turn.id !== action.turnId || turn.status !== "generating" || action.replies.length === 0) return turn;
          const step = turn.demoStep + 1;
          const completed = step >= action.replies.length;
          return {
            ...turn, demoStep: step, assistant: action.replies[Math.min(step - 1, action.replies.length - 1)],
            status: completed ? "completed" : "generating",
            execution: { ...turn.execution, tools: turn.execution.tools.map((tool) => ({
              ...tool, status: step === 1 ? "running" : "completed",
            })) },
          };
        }),
      }));
    case "stop":
      if (!generating) return state;
      return updateSession(state, generating.sessionId, (current) => ({
        ...current, turns: current.turns.map((turn) => turn.id !== generating.turn.id ? turn : ({
          ...turn, status: "stopped",
          execution: { ...turn.execution, tools: turn.execution.tools.map((tool) =>
            tool.status === "pending" || tool.status === "running" ? { ...tool, status: "stopped" } : tool) },
        })),
      }));
    case "select-execution":
      if (!session?.turns.some((turn) => turn.id === action.turnId)) return state;
      return updateSession(state, session.id, (current) => ({ ...current, selectedTurnId: action.turnId }));
  }
}
