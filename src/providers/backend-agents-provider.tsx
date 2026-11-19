"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createBackendAgentsStore, type BackendAgentsStore } from "@/lib/backend-agents-store";
import { useBackendConnectionStore } from "@/providers/backend-connection-provider";

const BackendAgentsContext = createContext<BackendAgentsStore | null>(null);

export function BackendAgentsProvider({ children }: { children: ReactNode }) {
  const connection = useBackendConnectionStore();
  const [store] = useState(() => createBackendAgentsStore(connection));
  useEffect(() => { store.start(); return () => store.stop(); }, [store]);
  return <BackendAgentsContext.Provider value={store}>{children}</BackendAgentsContext.Provider>;
}

export function useBackendAgents() {
  const store = useBackendAgentsStore();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return { ...state, refresh: store.refresh, select: store.select, create: store.create,
    update: store.update, remove: store.remove, isCurrent: store.isCurrent, clearMutationError: store.clearMutationError };
}

export function useBackendAgentsStore() {
  const store = useContext(BackendAgentsContext);
  if (!store) throw new Error("Backend Agents require BackendAgentsProvider.");
  return store;
}
