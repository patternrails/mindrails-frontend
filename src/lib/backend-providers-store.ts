import { BackendClient, BackendClientError } from "./backend-client.ts";
import type { BackendConnectionStore } from "./backend-connection-store.ts";
import { loadBackendProviders, type ModelProvider } from "./backend-providers.ts";

export type BackendProvidersSnapshot = Readonly<{
  status: "unavailable" | "loading" | "ready" | "error";
  providers: readonly ModelProvider[];
  defaultProvider: ModelProvider | null;
  error: BackendClientError | null;
}>;
const initialSnapshot: BackendProvidersSnapshot = {
  status: "unavailable", providers: [], defaultProvider: null, error: null,
};

/** Subscribe synchronously to connection changes; never leave old resources visible until an effect runs. */
export function createBackendProvidersStore(connection: BackendConnectionStore) {
  let snapshot = initialSnapshot;
  let unsubscribe: (() => void) | null = null;
  let activeClient: BackendClient | null = null;
  let activeRevision = -1;
  let controller: AbortController | null = null;
  let requestVersion = 0;
  const listeners = new Set<() => void>();

  function publish(next: BackendProvidersSnapshot) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  function cancel() {
    requestVersion++;
    controller?.abort();
    controller = null;
  }

  async function load(client: BackendClient) {
    cancel();
    const version = requestVersion;
    const request = new AbortController();
    controller = request;
    publish({ status: "loading", providers: [], defaultProvider: null, error: null });
    try {
      const providers = await loadBackendProviders(client, request.signal);
      if (version !== requestVersion || client !== activeClient) return;
      controller = null;
      publish({ status: "ready", providers, defaultProvider: providers[0] ?? null, error: null });
    } catch (cause) {
      if (version !== requestVersion || client !== activeClient) return;
      controller = null;
      const error = cause instanceof BackendClientError ? cause :
        new BackendClientError("invalid-response", "Unable to load providers.", { cause });
      publish({ status: "error", providers: [], defaultProvider: null, error });
    }
  }

  function syncConnection() {
    const state = connection.getSnapshot();
    const client = state.initialized && state.status === "connected" && !state.reloading ? state.client : null;
    if (client === activeClient && state.resourceRevision === activeRevision) return;
    activeClient = client;
    activeRevision = state.resourceRevision;
    if (client) void load(client);
    else { cancel(); publish(initialSnapshot); }
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initialSnapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start: () => {
      if (unsubscribe) return;
      unsubscribe = connection.subscribe(syncConnection);
      syncConnection();
    },
    stop: () => {
      unsubscribe?.();
      unsubscribe = null;
      activeClient = null;
      activeRevision = -1;
      cancel();
      publish(initialSnapshot);
    },
    retry: (force = false) => {
      if (unsubscribe && activeClient && (force || snapshot.status !== "loading")) void load(activeClient);
    },
  };
}

export type BackendProvidersStore = ReturnType<typeof createBackendProvidersStore>;
