import { BackendClient, BackendClientError } from "./backend-client.ts";
import type { BackendConnectionStore } from "./backend-connection-store.ts";
import { BackendAgentsClient, type BackendAgent, type AgentWriteInput } from "./backend-agents.ts";
import { backendActivity } from "./backend-activity.ts";

export type AgentMutation = "create" | "update" | "delete";
export type AgentMutationResult = { ok: true; id: string } |
  { ok: false; error: BackendClientError; uncertain: boolean };
export type BackendAgentsSnapshot = Readonly<{
  epoch: number;
  paused: boolean;
  runningAgentIds: readonly string[];
  status: "unavailable" | "loading" | "ready" | "error";
  agents: readonly BackendAgent[];
  listError: BackendClientError | null;
  selectedId: string | null;
  detail: BackendAgent | null;
  detailStatus: "idle" | "loading" | "ready" | "error";
  detailError: BackendClientError | null;
  mutation: AgentMutation | null;
  mutationError: BackendClientError | null;
  uncertain: boolean;
  interruptedWrite: "confirmed" | "unknown" | null;
  feedback: Readonly<{ kind: "created" | "updated" | "deleted" | "missing"; name: string }> | null;
}>;
const initialSnapshot: BackendAgentsSnapshot = {
  epoch: 0, paused: false, runningAgentIds: [], status: "unavailable", agents: [], listError: null, selectedId: null, detail: null,
  detailStatus: "idle", detailError: null, mutation: null, mutationError: null,
  uncertain: false, interruptedWrite: null, feedback: null,
};
const errorOf = (cause: unknown) => cause instanceof BackendClientError ? cause :
  new BackendClientError("invalid-response", "Unable to load Agent data.", { cause });
const missing = (error: BackendClientError) => error.code === "http" && error.status === 404;

export function createBackendAgentsStore(connection: BackendConnectionStore) {
  let snapshot = initialSnapshot;
  let unsubscribe: (() => void) | null = null;
  let unsubscribeActivity: (() => void) | null = null;
  const activity = backendActivity(connection);
  let activeClient: BackendClient | null = null;
  let revision = -1;
  let listVersion = 0;
  let detailVersion = 0;
  let listController: AbortController | null = null;
  let detailController: AbortController | null = null;
  let writeController: AbortController | null = null;
  let writeConfirmed = false;
  const listeners = new Set<() => void>();

  function publish(patch: Partial<BackendAgentsSnapshot>) {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  }
  function cancelReads() {
    listVersion++; detailVersion++;
    listController?.abort(); detailController?.abort();
    listController = null; detailController = null;
  }
  function current(client: BackendClient, epoch: number) {
    return client === activeClient && epoch === snapshot.epoch;
  }
  function forget(id: string) {
    publish({ agents: snapshot.agents.filter((agent) => agent.id !== id),
      ...(snapshot.selectedId === id ? { selectedId: null, detail: null, detailStatus: "idle" as const, detailError: null } : {}) });
  }
  function remember(agent: BackendAgent) {
    const exists = snapshot.agents.some((item) => item.id === agent.id);
    const agents = exists ? snapshot.agents.map((item) => item.id === agent.id ? agent : item) : snapshot.agents.concat(agent);
    publish({ agents });
  }

  async function loadList(): Promise<boolean> {
    if (!activeClient || activity.busy()) return false;
    const client = activeClient, epoch = snapshot.epoch;
    listController?.abort();
    const version = ++listVersion;
    const controller = new AbortController();
    listController = controller;
    publish({ status: "loading", listError: null });
    try {
      const agents = await new BackendAgentsClient(client).list(controller.signal, activity.readTimeout());
      if (!current(client, epoch) || version !== listVersion) return false;
      listController = null;
      const selectedId = agents.some((agent) => agent.id === snapshot.selectedId) ? snapshot.selectedId : agents[0]?.id ?? null;
      if (selectedId !== snapshot.selectedId) {
        detailVersion++; detailController?.abort(); detailController = null;
      }
      publish({ status: "ready", agents, selectedId, ...(selectedId !== snapshot.selectedId ?
        { detail: null, detailStatus: "idle" as const, detailError: null } : {}) });
      return true;
    } catch (cause) {
      if (!current(client, epoch) || version !== listVersion) return false;
      listController = null;
      publish({ status: "error", listError: errorOf(cause) });
      return false;
    }
  }

  async function loadDetail(id: string): Promise<BackendAgent | null> {
    if (!activeClient || activity.busy()) return null;
    const client = activeClient, epoch = snapshot.epoch;
    detailController?.abort();
    const version = ++detailVersion;
    const controller = new AbortController();
    detailController = controller;
    publish({ selectedId: id, detail: null, detailStatus: "loading", detailError: null });
    try {
      const agent = await new BackendAgentsClient(client).get(id, controller.signal, activity.readTimeout());
      if (!current(client, epoch) || version !== detailVersion) return null;
      detailController = null;
      remember(agent);
      publish({ detail: agent, detailStatus: "ready" });
      return agent;
    } catch (cause) {
      if (!current(client, epoch) || version !== detailVersion) return null;
      detailController = null;
      const error = errorOf(cause);
      if (missing(error)) {
        forget(id);
        publish({ feedback: { kind: "missing", name: "" } });
        if (!snapshot.mutation) void loadList();
      } else publish({ detailStatus: "error", detailError: error });
      return null;
    }
  }

  async function mutate(kind: AgentMutation, id: string | null, input?: AgentWriteInput): Promise<AgentMutationResult> {
    if (!activeClient || snapshot.mutation || activity.busy() || id && activity.agentRunning(id)) return { ok: false, uncertain: false,
      error: new BackendClientError(snapshot.mutation || activity.busy() || id && activity.agentRunning(id) ? "busy" : "not-ready", "Agent operation unavailable.") };
    const client = activeClient, epoch = snapshot.epoch;
    const api = new BackendAgentsClient(client);
    const controller = new AbortController();
    writeController = controller;
    writeConfirmed = false;
    let confirmed = false;
    cancelReads();
    publish({ mutation: kind, mutationError: null, uncertain: false, feedback: null,
      status: snapshot.status === "loading" ? "ready" : snapshot.status,
      ...(snapshot.detailStatus === "loading" ? { detailStatus: "idle" as const } : {}) });
    const stillCurrent = () => current(client, epoch) && writeController === controller;
    const cancelled = (): AgentMutationResult => ({ ok: false, uncertain: !confirmed,
      error: new BackendClientError("cancelled", "Agent operation cancelled.") });
    try {
      let targetId = id;
      if (kind === "create") targetId = await api.create(input!, controller.signal);
      else if (kind === "update") await api.update(id!, input!, controller.signal);
      else await api.delete(id!, controller.signal);
      confirmed = true;
      if (!stillCurrent()) return cancelled();
      writeConfirmed = true;
      const name = input?.name.trim() ?? snapshot.agents.find((agent) => agent.id === targetId)?.name ?? "";
      publish({ feedback: { kind: kind === "create" ? "created" : kind === "update" ? "updated" : "deleted", name } });
      if (kind === "delete") {
        forget(targetId!);
        await loadList();
      } else {
        // The write is already confirmed. Failed reads must never turn it into a retryable write failure.
        await loadDetail(targetId!);
        if (stillCurrent()) await loadList();
      }
      return { ok: true, id: targetId! };
    } catch (cause) {
      if (!stillCurrent()) return cancelled();
      const error = errorOf(cause);
      if (id && missing(error)) {
        forget(id);
        publish({ feedback: { kind: "missing", name: "" } });
        await loadList();
        if (kind === "delete") return { ok: true, id };
      }
      if (!stillCurrent()) return cancelled();
      const uncertain = ["network", "timeout", "cancelled", "invalid-response"].includes(error.code) ||
        (error.code === "http" && (error.status ?? 0) >= 500);
      publish({ mutationError: error, uncertain });
      return { ok: false, error, uncertain };
    } finally {
      if (stillCurrent()) { writeController = null; writeConfirmed = false; publish({ mutation: null }); }
    }
  }

  function reset(interruptedWrite: BackendAgentsSnapshot["interruptedWrite"] = null) {
    cancelReads();
    writeController?.abort(); writeController = null; writeConfirmed = false;
    publish({ ...initialSnapshot, epoch: snapshot.epoch + 1, interruptedWrite });
  }
  function syncConnection() {
    const state = connection.getSnapshot();
    const client = state.initialized && state.status === "connected" && !state.reloading ? state.client : null;
    if (client === activeClient && state.resourceRevision === revision) return;
    const interrupted = state.status === "disconnected" && writeController ?
      writeConfirmed ? "confirmed" : "unknown" : null;
    activeClient = client; revision = state.resourceRevision;
    reset(interrupted);
    if (client) void loadList();
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initialSnapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start: () => {
      if (unsubscribe) return;
      unsubscribe = connection.subscribe(syncConnection);
      unsubscribeActivity = activity.subscribe(() => {
        const paused = activity.busy(), wasPaused = snapshot.paused;
        if (paused) cancelReads();
        publish({ paused, runningAgentIds: activity.runningAgentIds(),
          ...(paused && snapshot.status === "loading" ? { status: "ready" as const } : {}),
          ...(paused && snapshot.detailStatus === "loading" ? { detailStatus: "idle" as const } : {}) });
        if (wasPaused && !paused && activeClient && !snapshot.mutation) void loadList();
      });
      syncConnection();
    },
    stop: () => {
      unsubscribeActivity?.(); unsubscribeActivity = null;
      unsubscribe?.(); unsubscribe = null; activeClient = null; revision = -1; reset();
    },
    isCurrent: (epoch: number) => epoch === snapshot.epoch,
    refresh: () => {
      if (snapshot.mutation || activity.busy()) return Promise.resolve(false);
      detailVersion++; detailController?.abort(); detailController = null;
      publish({ detail: null, detailStatus: "idle", detailError: null });
      return loadList();
    },
    select: (id: string) => snapshot.mutation || activity.busy() ? Promise.resolve(null) : loadDetail(id),
    clearMutationError: () => publish({ mutationError: null, uncertain: false }),
    create: (input: AgentWriteInput) => mutate("create", null, input),
    update: (id: string, input: AgentWriteInput) => mutate("update", id, input),
    remove: (id: string) => mutate("delete", id),
  };
}

export type BackendAgentsStore = ReturnType<typeof createBackendAgentsStore>;
