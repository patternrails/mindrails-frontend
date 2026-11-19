"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createWorkspaceStore, type WorkspaceStore } from "@/lib/workspace-store";
import { useBackendConnectionStore } from "@/providers/backend-connection-provider";
import { useBackendAgents, useBackendAgentsStore } from "@/providers/backend-agents-provider";

const WorkspaceContext = createContext<WorkspaceStore | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const connection = useBackendConnectionStore(), agents = useBackendAgentsStore();
  const [store] = useState(() => createWorkspaceStore(connection, agents));
  useEffect(() => { store.start(); return () => store.stop(); }, [store]);
  return <WorkspaceContext.Provider value={store}>{children}</WorkspaceContext.Provider>;
}
export function useWorkspace() {
  const store = useContext(WorkspaceContext);
  if (!store) throw new Error("Workspace requires WorkspaceProvider.");
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const agents = useBackendAgents();
  const activeAgent = agents.agents.find((a) => a.id === state.agentId) ?? null;
  const activeSession = state.sessions.find((s) => s.id === state.sessionId) ?? null;
  const record = activeSession ? state.records[`${activeSession.parentAgentId}/${activeSession.id}`] : null;
  const busy = state.historyLoading || state.mutation !== null || agents.mutation !== null;
  const activeWaiting = state.waiting && !!record?.turns.some(turn => turn.status === "waiting");
  const activeCancelling = !!activeSession && state.cancellingSessionIds.includes(activeSession.id);
  return { ...state, agents: agents.agents, agentsStatus: agents.status, activeAgent, activeSession, record, busy, activeWaiting, activeCancelling,
    canSend: !state.historyLoading && !state.mutation && !agents.mutation && !activeWaiting && state.status === "ready" && agents.status === "ready" && !!activeSession,
    canStop: activeWaiting && !!activeSession && !activeCancelling,
    selectAgent: store.selectAgent, openSession: store.openSession, selectSession: store.selectSession, setDraft: store.setDraft,
    refresh: store.refresh, refreshAgents: agents.refresh, startSession: store.startSession, updateSession: store.updateSession,
    forkSession: store.forkSession, deleteSession: store.deleteSession, send: store.send, cancelChat: store.cancelChat,
    clearError: store.clearError };
}
