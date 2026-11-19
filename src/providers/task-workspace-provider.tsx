"use client";
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createTaskWorkspaceStore, type TaskWorkspaceStore } from "@/lib/task-workspace-store";
import { useBackendConnectionStore } from "./backend-connection-provider";
import { useBackendAgentsStore } from "./backend-agents-provider";
const Context = createContext<TaskWorkspaceStore | null>(null);
export function TaskWorkspaceProvider({ children }: { children: ReactNode }) {
  const connection = useBackendConnectionStore(), agents = useBackendAgentsStore();
  const [store] = useState(() => createTaskWorkspaceStore(connection, agents));
  useEffect(() => {
    store.start();
    let messages: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      messages = new BroadcastChannel("mindrails.tasks.v1");
      store.setNotify(() => messages?.postMessage({ baseUrl: connection.getSnapshot().client?.BASE_URL }));
      messages.onmessage = event => { if (event.data?.baseUrl === connection.getSnapshot().client?.BASE_URL) void store.refresh(); };
    }
    const refresh = () => { if (document.visibilityState === "visible") void store.refresh(); };
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { store.setNotify(); messages?.close(); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); store.stop(); };
  }, [store, connection]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useTasks() {
  const store = useContext(Context); if (!store) throw new Error("Task workspace requires TaskWorkspaceProvider.");
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const activeTask = state.tasks.find(task => task.id === state.activeTaskId) ?? null;
  return { ...state, activeTask, refresh: store.refresh, startDraft: store.startDraft, save: store.save, remove: store.remove,
    execute: store.execute, cancel: store.cancel, selectTask: store.selectTask, closeWorkspace: store.closeWorkspace,
    edit: store.edit, selectExecution: store.selectExecution, clearError: store.clearError };
}
