import type { BackendConnectionSnapshot, ConnectionStatus } from "./backend-connection-store.ts";

export function connectionDisplayStatus(state: Pick<BackendConnectionSnapshot, "initialized" | "status">): ConnectionStatus {
  return state.initialized ? state.status : "checking";
}
