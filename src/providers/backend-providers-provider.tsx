"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createBackendProvidersStore, type BackendProvidersStore } from "@/lib/backend-providers-store";
import { useBackendConnectionStore } from "@/providers/backend-connection-provider";

const BackendProvidersContext = createContext<BackendProvidersStore | null>(null);

export function BackendProvidersProvider({ children }: { children: ReactNode }) {
  const connection = useBackendConnectionStore();
  const [store] = useState(() => createBackendProvidersStore(connection));
  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);
  return <BackendProvidersContext.Provider value={store}>{children}</BackendProvidersContext.Provider>;
}

export function useBackendProviders() {
  const store = useContext(BackendProvidersContext);
  if (!store) throw new Error("Backend providers require BackendProvidersProvider.");
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return { ...state, retry: store.retry };
}
