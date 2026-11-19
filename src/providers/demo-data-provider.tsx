"use client";

import { createContext, useContext, useEffect, useReducer, type ReactNode } from "react";
import { createDemoState, demoReducer, getActiveSession, getGeneratingRun } from "@/lib/demo-workspace";
import { demoAgents } from "@/mocks/agents";
import { demoSessions } from "@/mocks/sessions";
import { demoExecution, getDemoReplyStages } from "@/mocks/conversations";
import type { AgentInput } from "@/lib/ui-models";

function useDemoState() {
  const [state, dispatch] = useReducer(demoReducer, undefined, () => createDemoState(demoAgents, demoSessions));
  const run = getGeneratingRun(state);
  const runSessionId = run?.sessionId;
  const runTurnId = run?.turn.id;
  const runAgentId = run?.agentId;
  const runStep = run?.turn.demoStep;

  useEffect(() => {
    if (!runSessionId || !runTurnId || !runAgentId) return;
    const timer = window.setTimeout(() => dispatch({
      type: "tick", sessionId: runSessionId, turnId: runTurnId,
      replies: getDemoReplyStages(runAgentId),
    }), 1200);
    return () => window.clearTimeout(timer);
  }, [runSessionId, runTurnId, runAgentId, runStep]);

  const activeSession = getActiveSession(state);
  return {
    agents: state.agents,
    agentSessionCounts: Object.fromEntries(state.agents.map((agent) => [agent.id, state.sessions.filter((item) => item.agentId === agent.id).length])),
    createAgent: (value: AgentInput) => dispatch({ type: "create-agent", value }),
    updateAgent: (id: string, value: AgentInput) => dispatch({ type: "update-agent", id, value }),
    deleteAgent: (id: string) => dispatch({ type: "delete-agent", id }),
    activeAgent: state.agents.find((agent) => agent.id === state.activeAgentId),
    sessions: state.sessions.filter((session) => session.agentId === state.activeAgentId),
    activeSession,
    selectedTurn: activeSession?.turns.find((turn) => turn.id === activeSession.selectedTurnId),
    generating: Boolean(run),
    selectAgent: (id: string) => dispatch({ type: "select-agent", id }),
    selectSession: (id: string) => dispatch({ type: "select-session", id }),
    deleteSession: (id: string) => dispatch({ type: "delete-session", id }),
    newSession: () => dispatch({ type: "new-session" }),
    setDraft: (value: string) => dispatch({ type: "draft", value }),
    send: () => dispatch({ type: "send", execution: demoExecution }),
    stop: () => dispatch({ type: "stop" }),
    selectExecution: (turnId: string) => dispatch({ type: "select-execution", turnId }),
  };
}

const DemoDataContext = createContext<ReturnType<typeof useDemoState> | null>(null);

export function DemoDataProvider({ children }: { children: ReactNode }) {
  const value = useDemoState();
  return <DemoDataContext.Provider value={value}>{children}</DemoDataContext.Provider>;
}

export function useDemoData() {
  const value = useContext(DemoDataContext);
  if (!value) throw new Error("Demo data requires DemoDataProvider.");
  return value;
}
