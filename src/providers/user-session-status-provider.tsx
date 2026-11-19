"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useBackendConnectionStore } from "./backend-connection-provider";
import { createUserSessionStatusStore, type UserSessionStatusStore } from "@/lib/user-session-status-store";

const Context = createContext<UserSessionStatusStore | null>(null);
export function UserSessionStatusProvider({ children }: { children: ReactNode }) {
  const connection = useBackendConnectionStore();
  const [store] = useState(() => createUserSessionStatusStore(connection));
  useEffect(() => { store.start(); return () => store.stop(); }, [store]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useUserSessionStatuses() {
  const store = useContext(Context);
  if (!store) throw new Error("User status provider is required");
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
