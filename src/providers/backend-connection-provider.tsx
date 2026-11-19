"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createBackendConnectionStore, type BackendConnectionStore } from "@/lib/backend-connection-store";

const BackendConnectionContext = createContext<BackendConnectionStore | null>(null);
export function BackendConnectionProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createBackendConnectionStore());
  useEffect(() => { void store.initialize(); return () => store.stop(); }, [store]);
  return <BackendConnectionContext.Provider value={store}>{children}</BackendConnectionContext.Provider>;
}
export function useBackendConnectionStore() {
  const store = useContext(BackendConnectionContext);
  if (!store) throw new Error("Backend connections require BackendConnectionProvider.");
  return store;
}
export function useBackendConnection() {
  const store = useBackendConnectionStore();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return { ...state, recheck: store.recheck, reload: store.reload };
}
