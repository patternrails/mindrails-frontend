import type { BackendConnectionStore } from "./backend-connection-store.ts";
import { authState, subscribeAuth, websocketTicket } from "./auth-session.ts";
import { backendEndpoint } from "./backend-url.ts";
import { isUuid } from "./backend-sessions.ts";
import type { StreamSocket, StreamSocketFactory } from "./backend-session-stream.ts";

export type UserSessionStatus = { agentId: string; sessionId: string; revision: number; state: "idle" | "running" | "doomed";
  activeRequestId: string | null; queuedCount: number; lastFinished: { requestId: string; outcome: "completed" | "failed" | "cancelled" } | null };
type Snapshot = { scope: string; synced: boolean; sessions: Record<string, UserSessionStatus>; newResults: Record<string, string> };
const initial: Snapshot = { scope: "", synced: false, sessions: {}, newResults: {} };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const invalid = () => new Error("Invalid user status event");
export function parseUserSessionStatus(v: unknown): UserSessionStatus {
  if (!object(v) || !isUuid(v.agentId) || !isUuid(v.sessionId) || !Number.isSafeInteger(v.revision) || Number(v.revision) < 1 ||
    !["idle", "running", "doomed"].includes(String(v.state)) || !(v.activeRequestId === null || isUuid(v.activeRequestId)) ||
    !Number.isSafeInteger(v.queuedCount) || Number(v.queuedCount) < 0) throw invalid();
  const f = v.lastFinished;
  if (f !== null && (!object(f) || !isUuid(f.requestId) || !["completed", "failed", "cancelled"].includes(String(f.outcome)))) throw invalid();
  return { agentId: v.agentId, sessionId: v.sessionId, revision: v.revision as number, state: v.state as UserSessionStatus["state"],
    activeRequestId: v.activeRequestId, queuedCount: v.queuedCount as number,
    lastFinished: f === null ? null : { requestId: f.requestId as string, outcome: f.outcome as "completed" | "failed" | "cancelled" } };
}

/** Independent read-only projection: never submits chat or touches conversation records. */
export function createUserSessionStatusStore(connection: BackendConnectionStore, options: {
  socketFactory?: StreamSocketFactory; ticket?: typeof websocketTicket; retryDelays?: number[]; snapshotTimeoutMs?: number;
} = {}) {
  let state = initial, desired = "", generation = 0, retries = 0;
  let subscriptions: (() => void)[] = [], stopAttempt = () => {};
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: Snapshot) => { state = next; listeners.forEach(fn => fn()); };
  function dispose() { generation++; clearTimeout(retryTimer); stopAttempt(); stopAttempt = () => {}; }
  function connect(base: string) {
    const attempt = ++generation, controller = new AbortController();
    let socket: StreamSocket | undefined, timer: ReturnType<typeof setTimeout> | undefined, gotSnapshot = false;
    const cleanup = () => {
      clearTimeout(timer); controller.abort();
      socket?.removeEventListener("message", received); socket?.removeEventListener("error", interrupted); socket?.removeEventListener("close", interrupted);
      socket?.close();
    };
    stopAttempt = cleanup;
    function interrupted() {
      if (attempt !== generation) return;
      generation++; cleanup(); publish({ ...state, synced: false });
      if (generation !== attempt + 1 || !desired) return;
      const delays = options.retryDelays ?? [1000, 2000, 5000, 10000, 30000];
      retryTimer = setTimeout(() => connect(base), delays[Math.min(retries++, delays.length - 1)] ?? 30000);
    }
    function received(message: MessageEvent) {
      if (attempt !== generation) return;
      try {
        if (typeof message.data !== "string") throw invalid();
        const event: unknown = JSON.parse(message.data);
        if (!object(event) || event.version !== 1 || !object(event.data)) throw invalid();
        const data = event.data;
        if (event.type === "user.status.snapshot") {
          if (gotSnapshot || !Array.isArray(data.sessions)) throw invalid();
          const sessions: Record<string, UserSessionStatus> = {};
          for (const entry of data.sessions) { const parsed = parseUserSessionStatus(entry); if (sessions[parsed.sessionId]) throw invalid(); sessions[parsed.sessionId] = parsed; }
          gotSnapshot = true; retries = 0; clearTimeout(timer);
          publish({ ...state, synced: true, sessions });
        } else if (event.type === "user.session.status") {
          if (!gotSnapshot) throw invalid();
          const next = parseUserSessionStatus(data), previous = state.sessions[next.sessionId];
          if (previous && previous.revision >= next.revision) return;
          const finished = next.lastFinished;
          const newResults = finished?.outcome === "completed" && finished.requestId !== previous?.lastFinished?.requestId
            ? { ...state.newResults, [next.sessionId]: finished.requestId } : state.newResults;
          publish({ ...state, sessions: { ...state.sessions, [next.sessionId]: next }, newResults });
        } else if (event.type === "user.session.removed") {
          if (!gotSnapshot || !isUuid(data.sessionId) || !isUuid(data.agentId)) throw invalid();
          const sessions = { ...state.sessions }, newResults = { ...state.newResults };
          delete sessions[data.sessionId]; delete newResults[data.sessionId]; publish({ ...state, sessions, newResults });
        }
      } catch { interrupted(); }
    }
    void (async () => {
      try {
        timer = setTimeout(interrupted, options.snapshotTimeoutMs ?? 10000);
        const ticket = await (options.ticket ?? websocketTicket)(base, "/api/user/status/stream", controller.signal);
        if (attempt !== generation) return;
        const url = new URL(backendEndpoint(base, "api/user/status/stream"));
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:"; url.searchParams.set("ticket", ticket);
        socket = (options.socketFactory ?? (address => new WebSocket(address)))(url.href);
        socket.addEventListener("message", received); socket.addEventListener("error", interrupted); socket.addEventListener("close", interrupted);
      } catch { interrupted(); }
    })();
  }
  function sync() {
    const client = connection.getSnapshot().client;
    const owner = client && authState(client.BASE_URL)?.session?.user.id;
    const key = client && owner ? `${client.BASE_URL}|${owner}` : "";
    if (key === desired) return;
    desired = key; dispose(); retries = 0; publish({ ...initial, scope: key });
    if (key && client) connect(client.BASE_URL);
  }
  return {
    getSnapshot: () => state, getServerSnapshot: () => initial,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start() { if (subscriptions.length) return; subscriptions = [connection.subscribe(sync), subscribeAuth(sync)]; sync(); },
    stop() { subscriptions.forEach(fn => fn()); subscriptions = []; desired = ""; dispose(); publish(initial); },
  };
}
export type UserSessionStatusStore = ReturnType<typeof createUserSessionStatusStore>;
