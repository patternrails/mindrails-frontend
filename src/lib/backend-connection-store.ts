import { authState, subscribeAuth } from "./auth-session.ts";
import { BackendClient, BackendClientError, type BackendClientOptions } from "./backend-client.ts";
import { parseBackendConfig, type BackendConfig } from "./backend-config.ts";
import { readBackendConfig } from "./backend-config-api.ts";

export { parseBackendConfig, type BackendConfig } from "./backend-config.ts";
export type ConnectionStatus = "not-configured" | "checking" | "connected" | "disconnected";
export type ConnectionResult = { ok: true } | { ok: false; error: BackendClientError };
export type BackendConnectionSnapshot = Readonly<{
  initialized: boolean; config: BackendConfig | null; status: ConnectionStatus;
  client: BackendClient | null; error: BackendClientError | null; lastCheckedAt: number | null;
  resourceRevision: number; reloading: boolean;
}>;
type StoreOptions = Pick<BackendClientOptions, "fetch" | "timeoutMs"> & {
  now?: () => number; readConfig?: () => BackendConfig | null | Promise<BackendConfig | null>;
};
const initial: BackendConnectionSnapshot = {
  initialized: false, config: null, status: "not-configured", client: null, error: null,
  lastCheckedAt: null, resourceRevision: 0, reloading: false,
};
const success: ConnectionResult = { ok: true };
const cancelled = (): ConnectionResult => ({ ok: false, error: new BackendClientError("cancelled", "Connection check cancelled.") });

/** The server's deployment file is the only source of the backend address. */
export function createBackendConnectionStore(options: StoreOptions = {}) {
  let state = initial, activeClient: BackendClient | null = null;
  let check: AbortController | null = null, loadVersion = 0, checkVersion = 0;
  let initialization: Promise<ConnectionResult> | null = null;
  const listeners = new Set<() => void>();
  let unsubscribeAuth: (() => void) | null = null;
  let actor: string | null = null;
  function makeClient(base: string) {
    const client = new BackendClient(base, { fetch: options.fetch, timeoutMs: options.timeoutMs,
      onConnectionError: error => {
        if (activeClient !== client) return;
        cancelCheck(); publish({ status: "disconnected", error });
      } });
    return client;
  }
  function identityChanged() {
    if (!state.config) return;
    const next = authState(state.config.BASE_URL)?.session?.user.id ?? null;
    if (next === actor) return;
    actor = next;
    cancelCheck(); activeClient?.dispose(); activeClient = makeClient(state.config.BASE_URL);
    publish({ resourceRevision: state.resourceRevision + 1 });
    if (state.status === "checking") void recheck();
  }
  const now = options.now ?? Date.now;
  function publish(patch: Partial<BackendConnectionSnapshot>) {
    state = { ...state, ...patch };
    state = { ...state, client: state.status === "connected" && !state.reloading ? activeClient : null };
    listeners.forEach(listener => listener());
  }
  function cancelCheck() { checkVersion++; check?.abort(); check = null; }
  async function recheck(): Promise<ConnectionResult> {
    if (!activeClient) return reload();
    cancelCheck();
    const version = checkVersion, client = activeClient, controller = new AbortController();
    check = controller; publish({ status: "checking", error: null });
    try {
      await client.health({ signal: controller.signal });
      if (version !== checkVersion || client !== activeClient) return cancelled();
      check = null; publish({ status: "connected", lastCheckedAt: now() }); return success;
    } catch (cause) {
      if (version !== checkVersion || client !== activeClient) return cancelled();
      check = null;
      const error = cause as BackendClientError;
      publish({ status: "disconnected", error, lastCheckedAt: now() }); return { ok: false, error };
    }
  }
  async function reload(): Promise<ConnectionResult> {
    unsubscribeAuth ??= subscribeAuth(identityChanged);
    const version = ++loadVersion;
    cancelCheck(); activeClient?.dispose(); activeClient = null;
    publish({ config: null, status: "checking", error: null, lastCheckedAt: null,
      reloading: true, resourceRevision: state.resourceRevision + 1 });
    try {
      const pending = (options.readConfig ?? readBackendConfig)();
      const input = pending instanceof Promise ? await pending : pending;
      if (version !== loadVersion) return cancelled();
      const config = parseBackendConfig(JSON.stringify(input));
      if (!config) throw new Error("Backend configuration is missing or invalid.");
      const client = makeClient(config.BASE_URL);
      actor = authState(config.BASE_URL)?.session?.user.id ?? null;
      activeClient = client;
      publish({ initialized: true, config, reloading: false });
      return recheck();
    } catch (cause) {
      if (version !== loadVersion) return cancelled();
      const error = new BackendClientError("configuration", "Unable to read backend configuration.", { cause });
      publish({ initialized: true, status: "disconnected", error, reloading: false });
      return { ok: false, error };
    }
  }
  return {
    getSnapshot: () => state, getServerSnapshot: () => initial,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    initialize: () => {
      unsubscribeAuth ??= subscribeAuth(identityChanged);
      if (state.initialized) return Promise.resolve(success);
      if (initialization) return initialization;
      const operation = reload(); initialization = operation;
      void operation.finally(() => { if (initialization === operation) initialization = null; });
      return operation;
    },
    recheck, reload,
    stop: () => {
      unsubscribeAuth?.(); unsubscribeAuth = null; actor = null;
      loadVersion++; initialization = null; cancelCheck(); activeClient?.dispose(); activeClient = null;
      publish(initial);
    },
  };
}
export type BackendConnectionStore = ReturnType<typeof createBackendConnectionStore>;
