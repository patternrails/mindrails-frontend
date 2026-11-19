import type { BackendConnectionStore } from "./backend-connection-store.ts";

/** Frontend activity observations; running sessions do not lock unrelated operations. */
const activities = new WeakMap<BackendConnectionStore, ReturnType<typeof createActivity>>();
function createActivity() {
  let owner: symbol | null = null;
  let uncertain = false;
  const running = new Map<string, string>();
  const listeners = new Set<() => void>();
  return {
    busy: () => owner !== null,
    runningAgentIds: () => [...new Set(running.values())],
    agentRunning: (id: string) => [...running.values()].includes(id),
    started: (key: string, agentId: string) => { running.set(key, agentId); listeners.forEach(listener => listener()); },
    finished: (key: string) => { running.delete(key); listeners.forEach(listener => listener()); },
    markUncertain: () => { uncertain = true; },
    readTimeout: () => uncertain ? 180_000 : undefined,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    acquire: () => {
      if (owner) return null;
      const token = Symbol(); owner = token; listeners.forEach((listener) => listener()); return token;
    },
    release: (token: symbol) => {
      if (owner !== token) return;
      owner = null; listeners.forEach((listener) => listener());
    },
  };
}
export function backendActivity(connection: BackendConnectionStore) {
  let activity = activities.get(connection);
  if (!activity) { activity = createActivity(); activities.set(connection, activity); }
  return activity;
}
