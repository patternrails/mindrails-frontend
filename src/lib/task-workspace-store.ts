import { BackendClient, BackendClientError } from "./backend-client.ts";
import type { BackendConnectionStore } from "./backend-connection-store.ts";
import type { BackendAgentsStore } from "./backend-agents-store.ts";
import type { ModelProvider } from "./backend-providers.ts";
import { backendActivity } from "./backend-activity.ts";
import { BackendTasksClient, taskWrite, type ActiveTaskExecution, type BackendTask, type TaskExecution } from "./backend-tasks.ts";
import { openTaskStream, taskExecutionStream, updateTaskStream } from "./task-stream.ts";
import type { StreamSocketFactory } from "./backend-session-stream.ts";
import { finishSessionStream, newSessionStream, type SessionStream } from "./session-stream.ts";

export type TaskEditor = { instructions: string; cronjob: string };
type Activity = Omit<ActiveTaskExecution, "executionId"> & { executionId: string | null };
export type TaskWorkspaceSnapshot = {
  epoch: number; status: "unavailable" | "loading" | "ready" | "error"; tasks: BackendTask[]; activeTaskId: string | null;
  editors: Record<string, TaskEditor>; active: Record<string, Activity | null>; checked: Record<string, boolean>;
  executions: Record<string, TaskExecution[]>; details: Record<string, TaskExecution>; streams: Record<string, SessionStream>;
  selectedExecutions: Record<string, string>; loadingExecution: string | null;
  mutation: string | null; error: BackendClientError | null; uncertain: boolean; notice: "saved" | "savedReadFailed" | "checkStatus" | null;
};
const initial: TaskWorkspaceSnapshot = { epoch: 0, status: "unavailable", tasks: [], activeTaskId: null, editors: {}, active: {}, checked: {}, executions: {}, details: {}, streams: {},
  selectedExecutions: {}, loadingExecution: null, mutation: null, error: null, uncertain: false, notice: null };
export const normalizedCron = (value: string) => value.trim().replace(/\s+/g, " ") || null;
export function taskDirty(task: BackendTask, editor: TaskEditor) { return !!task.local || task.instructions !== editor.instructions || task.cronjob !== normalizedCron(editor.cronjob); }
const errorOf = (cause: unknown) => cause instanceof BackendClientError ? cause : new BackendClientError("invalid-response", "Invalid Task response.", { cause });
const unknownWrite = (error: BackendClientError) => ["network", "timeout", "cancelled", "invalid-response"].includes(error.code) || (error.status ?? 0) >= 500;
export function createTaskWorkspaceStore(connection: BackendConnectionStore, agents: BackendAgentsStore,
  options: { now?: () => number; uuid?: () => string; pollMs?: number; socketFactory?: StreamSocketFactory; notify?: () => void } = {}) {
  let state = initial, client: BackendClient | null = null, revision = -1, agentSignature = "uninitialized", listVersion = 0, listAt = 0;
  let unsubscribers: (() => void)[] = [], timer: ReturnType<typeof setInterval> | undefined, polling = false;
  let lease: symbol | null = null, notify = options.notify, refreshRequested = false, resetting = false;
  const listeners = new Set<() => void>(), controllers = new Set<AbortController>();
  const activity = backendActivity(connection), activeVersions = new Map<string, number>();
  const now = options.now ?? Date.now, uuid = options.uuid ?? (() => crypto.randomUUID());
  type Run = { controller: AbortController; requestId: string; executionId: string | null; cancel?: () => void; cancelRequested: boolean; stream: SessionStream };
  const runs = new Map<string, Run>();
  const uncertainDrafts = new Map<string, Set<string>>();
  let pendingCreation: { baseUrl: string; id: string } | null = null;
  function unconfirmed(baseUrl: string) {
    let ids = uncertainDrafts.get(baseUrl);
    if (!ids) { ids = new Set(); uncertainDrafts.set(baseUrl, ids); }
    return ids;
  }
  const drafts = new Map<string, Pick<TaskWorkspaceSnapshot, "tasks" | "editors" | "activeTaskId">>();
  const publish = (patch: Partial<TaskWorkspaceSnapshot>) => { state = { ...state, ...patch }; listeners.forEach(listener => listener()); };
  const controller = () => { const c = new AbortController(); controllers.add(c); return c; };
  const current = (c: BackendClient, epoch: number) => c === client && state.epoch === epoch;
  const find = (id: string) => state.tasks.find(task => task.id === id);
  function remember(task: BackendTask, priorId = task.id) {
    const old = find(priorId), editor = state.editors[priorId], dirty = old && editor && taskDirty(old, editor);
    const editors = { ...state.editors }; delete editors[priorId];
    editors[task.id] = dirty ? editor : { instructions: task.instructions, cronjob: task.cronjob ?? "" };
    publish({ tasks: state.tasks.some(t => t.id === priorId) ? state.tasks.map(t => t.id === priorId ? task : t) : [...state.tasks, task], editors,
      activeTaskId: state.activeTaskId === priorId ? task.id : state.activeTaskId });
  }
  function setActive(id: string, active: Activity | null) {
    activeVersions.set(id, (activeVersions.get(id) ?? 0) + 1);
    if (active) activity.started(`task:${id}`, find(id)?.parentAgentId ?? ""); else activity.finished(`task:${id}`);
    const old = state.active[id];
    if (state.checked[id] && old?.executionId === active?.executionId && old?.status === active?.status) return;
    publish({ active: { ...state.active, [id]: active }, checked: { ...state.checked, [id]: true },
      ...(active?.executionId && old?.executionId !== active.executionId ? { selectedExecutions: { ...state.selectedExecutions, [id]: active.executionId } } : {}) });
  }
  async function refreshList() {
    if (!client || state.mutation) return false;
    if (agents.getSnapshot().status !== "ready") { refreshRequested = true; return false; }
    refreshRequested = false;
    const c = client, epoch = state.epoch, version = ++listVersion, abort = controller(), api = new BackendTasksClient(c);
    const ids = agents.getSnapshot().agents.map(a => a.id); listAt = now();
    if (!state.tasks.length) publish({ status: "loading" });
    try {
      const results = await Promise.allSettled(ids.map(id => api.list(id, abort.signal)));
      if (!current(c, epoch) || version !== listVersion || abort.signal.aborted) return false;
      const tasks: BackendTask[] = state.tasks.filter(t => t.local && ids.includes(t.parentAgentId));
      results.forEach((result, index) => tasks.push(...(result.status === "fulfilled" ? result.value : state.tasks.filter(t => !t.local && t.parentAgentId === ids[index]))));
      const editors = { ...state.editors };
      for (const task of tasks) {
        const old = find(task.id), editor = editors[task.id];
        if (!old || !editor || !taskDirty(old, editor)) editors[task.id] = { instructions: task.instructions, cronjob: task.cronjob ?? "" };
      }
      const idsNow = new Set(tasks.map(t => t.id));
      for (const id of Object.keys(editors)) if (!idsNow.has(id)) { delete editors[id]; activity.finished(`task:${id}`); }
      const failed = results.find(r => r.status === "rejected");
      publish({ tasks, editors, status: failed ? "error" : "ready", ...(failed?.status === "rejected" ? { error: errorOf(failed.reason) } : {}),
        activeTaskId: state.activeTaskId && idsNow.has(state.activeTaskId) ? state.activeTaskId : null });
      return !failed;
    } finally { controllers.delete(abort); }
  }
  async function refreshTask(id: string, details = true) {
    const task = find(id); if (!client || !task || task.local) return;
    const c = client, epoch = state.epoch, abort = controller(), api = new BackendTasksClient(c);
    try {
      const executions = await api.executions(task.parentAgentId, id, abort.signal);
      if (!current(c, epoch) || abort.signal.aborted) return;
      const chosen = state.selectedExecutions[id];
      const selected = chosen && executions.some(e => e.id === chosen) ? chosen : state.active[id]?.executionId ?? executions[0]?.id;
      publish({ executions: { ...state.executions, [id]: executions }, ...(selected ? { selectedExecutions: { ...state.selectedExecutions, [id]: selected } } : {}) });
      if (details && selected && (!runs.has(id) || state.selectedExecutions[id] !== runs.get(id)?.executionId)) await loadExecution(id, selected);
    } catch (cause) { if (current(c, epoch) && !abort.signal.aborted) publish({ error: errorOf(cause) }); }
    finally { controllers.delete(abort); }
  }
  async function loadExecution(taskId: string, id: string) {
    const task = find(taskId); if (!client || !task || task.local) return;
    const c = client, epoch = state.epoch, abort = controller();
    if (!state.details[id]) publish({ loadingExecution: id });
    try {
      const execution = await new BackendTasksClient(c).execution(task.parentAgentId, task.id, id, abort.signal);
      if (!current(c, epoch) || abort.signal.aborted) return;
      const stream = taskExecutionStream(execution);
      publish({ details: { ...state.details, [id]: execution }, ...(!runs.has(taskId) || runs.get(taskId)?.executionId !== id ? { streams: { ...state.streams, [id]: stream } } : {}) });
    } catch (cause) { if (current(c, epoch) && !abort.signal.aborted) publish({ error: errorOf(cause) }); }
    finally { controllers.delete(abort); if (current(c, epoch) && state.loadingExecution === id) publish({ loadingExecution: null }); }
  }
  async function refreshActive() {
    if (!client || polling) return;
    polling = true; const c = client, epoch = state.epoch, abort = controller(), api = new BackendTasksClient(c);
    try {
      const tasks = state.tasks.filter(t => !t.local);
      // Bound simultaneous requests; activity checks never fetch full execution records.
      for (let offset = 0; offset < tasks.length; offset += 6) {
        if (!current(c, epoch) || abort.signal.aborted) return;
        await Promise.all(tasks.slice(offset, offset + 6).map(async task => {
          const seen = activeVersions.get(task.id), old = state.active[task.id];
          try {
            const active = await api.active(task.parentAgentId, task.id, abort.signal);
            if (!current(c, epoch) || abort.signal.aborted || seen !== activeVersions.get(task.id) || runs.has(task.id)) return;
            setActive(task.id, active);
            if (old?.executionId !== active?.executionId || task.id === state.activeTaskId || old?.status !== active?.status) await refreshTask(task.id, task.id === state.activeTaskId);
          } catch (cause) {
            if (current(c, epoch) && !abort.signal.aborted) publish({ error: errorOf(cause) });
          }
        }));
      }
    } finally { controllers.delete(abort); polling = false; }
  }
  async function refresh() {
    const result = await refreshList(); await refreshActive();
    if (result && client && !state.tasks.some(t => t.local && unconfirmed(client!.resourceScope).has(t.id))) publish({ uncertain: false, error: null });
    return result;
  }
  function reset(next: BackendClient | null) {
    resetting = true;
    try {
      if (pendingCreation) unconfirmed(pendingCreation.baseUrl).add(pendingCreation.id);
      if (client) drafts.set(client.resourceScope, { tasks: state.tasks.filter(t => t.local), editors: state.editors, activeTaskId: state.activeTaskId });
      for (const id of Object.keys(state.active)) activity.finished(`task:${id}`);
      controllers.forEach(c => c.abort()); controllers.clear(); runs.forEach(run => run.controller.abort()); runs.clear();
      if (lease) activity.release(lease); lease = null;
      client = next; listVersion++; agentSignature = "uninitialized"; activeVersions.clear(); listAt = 0;
      const saved = next ? drafts.get(next.resourceScope) : null;
      publish({ ...initial, epoch: state.epoch + 1, status: next ? "loading" : "unavailable", ...(saved ?? {}), uncertain: !!next && !!saved?.tasks.some(task => unconfirmed(next.resourceScope).has(task.id)) });
    } finally { resetting = false; }
  }
  function sync() {
    if (resetting) return;
    const connectionState = connection.getSnapshot();
    const next = connectionState.initialized && connectionState.status === "connected" && !connectionState.reloading ? connectionState.client : null;
    if (next !== client || revision !== connectionState.resourceRevision) { revision = connectionState.resourceRevision; reset(next); }
    const agentState = agents.getSnapshot(), signature = agentState.status === "ready" ? agentState.agents.map(a => a.id).join(",") : "";
    if (client && agentState.status === "ready" && (signature !== agentSignature || refreshRequested)) { refreshRequested = false; agentSignature = signature; void refresh(); }
  }
  function startDraft(agentId: string, provider: ModelProvider) {
    if (!client || state.mutation || !agents.getSnapshot().agents.some(a => a.id === agentId)) return null;
    const id = uuid(), at = new Date(now()).toISOString();
    remember({ id, ownerId: agents.getSnapshot().agents.find(a => a.id === agentId)!.ownerId, parentAgentId: agentId, provider, name: null, instructions: "", cronjob: null, skillIds: [], createdAt: at, updatedAt: at, local: true });
    publish({ activeTaskId: id, error: null, notice: null }); return id;
  }
  async function save(id: string, metadata?: { name: string | null; provider: ModelProvider; skillIds?: readonly string[] }) {
    const task = find(id), editor = state.editors[id];
    if (!client || !task || !editor || state.mutation || state.uncertain || agents.getSnapshot().mutation) return false;
    if (metadata && task.local) { remember({ ...task, ...metadata }); return true; }
    if (!metadata && !editor.instructions.trim()) return false;
    const token = activity.acquire(); if (!token) return false; lease = token;
    const c = client, epoch = state.epoch, abort = controller(), api = new BackendTasksClient(c); let confirmed = false;
    listVersion++; publish({ mutation: id, error: null, notice: null });
    try {
      const base = metadata ? await api.get(task.parentAgentId, id, abort.signal) : task;
      if (!current(c, epoch)) return false;
      const input = taskWrite(base, metadata ? { name: metadata.name, providerId: metadata.provider.id, ...(metadata.skillIds ? { skillIds: metadata.skillIds } : {}) }
        : { instructions: editor.instructions, cronjob: normalizedCron(editor.cronjob) });
      if (task.local) pendingCreation = { baseUrl: c.resourceScope, id };
      const target = task.local ? await api.create(task.parentAgentId, input, abort.signal) : (await api.update(task.parentAgentId, id, input, abort.signal), id);
      confirmed = true;
      if (task.local) {
        unconfirmed(c.resourceScope).delete(id);
        pendingCreation = null;
        if (!current(c, epoch)) {
          const cached = drafts.get(c.resourceScope);
          if (cached) drafts.set(c.resourceScope, { ...cached, tasks: cached.tasks.filter(t => t.id !== id), activeTaskId: cached.activeTaskId === id ? target : cached.activeTaskId });
        }
      }
      if (!current(c, epoch)) return false;
      const saved: BackendTask = { ...base, ...input, id: target, provider: metadata?.provider ?? task.provider, local: false, updatedAt: new Date(now()).toISOString() };
      remember(saved, id);
      // Only the submitted editor is clean; typing while awaiting Save stays dirty.
      if (!metadata && state.editors[target]?.instructions === editor.instructions && normalizedCron(state.editors[target]?.cronjob ?? "") === normalizedCron(editor.cronjob))
        publish({ editors: { ...state.editors, [target]: { instructions: input.instructions, cronjob: input.cronjob ?? "" } } });
      publish({ notice: "saved", uncertain: false }); notify?.();
      try { remember(await api.get(task.parentAgentId, target, abort.signal)); }
      catch { if (current(c, epoch)) publish({ notice: "savedReadFailed" }); }
      if (current(c, epoch)) { setActive(target, state.active[target] ?? null); void refreshActive(); }
      return true;
    } catch (cause) {
      if (task.local && pendingCreation?.id === id && unknownWrite(errorOf(cause))) unconfirmed(c.resourceScope).add(id);
      if (current(c, epoch) && !abort.signal.aborted) publish({ error: errorOf(cause), uncertain: !confirmed && unknownWrite(errorOf(cause)) });
      return confirmed;
    } finally {
      if (pendingCreation?.id === id) pendingCreation = null;
      controllers.delete(abort);
      if (current(c, epoch)) publish({ mutation: null });
      if (lease === token) { lease = null; activity.release(token); }
    }
  }
  async function remove(id: string) {
    const task = find(id); if (!task || state.mutation || state.active[id] || agents.getSnapshot().mutation) return false;
    if (task.local) {
      if (client) unconfirmed(client.resourceScope).delete(id);
      const tasks = state.tasks.filter(t => t.id !== id);
      publish({ tasks, activeTaskId: state.activeTaskId === id ? null : state.activeTaskId, uncertain: !!client && tasks.some(t => t.local && unconfirmed(client!.resourceScope).has(t.id)) });
      return true;
    }
    if (!client) return false;
    const c = client, epoch = state.epoch, abort = controller(); publish({ mutation: id, error: null }); listVersion++;
    try {
      await new BackendTasksClient(c).delete(task.parentAgentId, id, abort.signal);
      if (!current(c, epoch)) return false;
      publish({ tasks: state.tasks.filter(t => t.id !== id), activeTaskId: state.activeTaskId === id ? null : state.activeTaskId }); notify?.(); return true;
    } catch (cause) { if (current(c, epoch)) publish({ error: errorOf(cause), uncertain: unknownWrite(errorOf(cause)) }); return false; }
    finally { controllers.delete(abort); if (current(c, epoch)) publish({ mutation: null }); }
  }
  async function execute(id: string) {
    const task = find(id), editor = state.editors[id];
    if (!client || !task || !editor || task.local || taskDirty(task, editor) || !state.checked[id] || state.active[id] || runs.has(id) || state.mutation || state.uncertain || agents.getSnapshot().mutation) return false;
    const c = client, epoch = state.epoch, abort = controller();
    const run: Run = { controller: abort, requestId: uuid(), executionId: null, cancelRequested: false, stream: newSessionStream() };
    runs.set(id, run); setActive(id, { executionId: null, status: "STARTING" }); publish({ error: null, notice: null });
    try {
      const stream = openTaskStream({ baseUrl: c.BASE_URL, agentId: task.parentAgentId, taskId: id, requestId: run.requestId,
        signal: abort.signal, uuid, socketFactory: options.socketFactory,
        onBusy: active => { if (current(c, epoch)) setActive(id, active); },
        onEvent: event => {
          if (!current(c, epoch) || runs.get(id) !== run) return;
          if (event.executionId && !run.executionId) { run.executionId = event.executionId; publish({ selectedExecutions: { ...state.selectedExecutions, [id]: event.executionId } }); void refreshTask(id, false); notify?.(); }
          run.stream = updateTaskStream(run.stream, event);
          if (run.executionId) publish({ streams: { ...state.streams, [run.executionId]: run.stream } });
          if (["execution.accepted", "execution.started", "execution.cancelling"].includes(event.type))
            setActive(id, { executionId: run.executionId, status: event.type === "execution.cancelling" || run.cancelRequested ? "CANCELLING" : event.type === "execution.started" ? "RUNNING" : "STARTING" });
          if (run.cancelRequested) run.cancel?.();
          if (["execution.completed", "execution.failed", "execution.cancelled"].includes(event.type)) setActive(id, null);
        } });
      run.cancel = stream.cancel; await stream.result; return true;
    } catch (cause) {
      if (current(c, epoch) && !abort.signal.aborted) {
        if (run.executionId) publish({ streams: { ...state.streams, [run.executionId]: finishSessionStream(run.stream, "unconfirmed") } });
        publish({ error: errorOf(cause), notice: "checkStatus" });
      }
      return false;
    } finally {
      controllers.delete(abort);
      if (runs.get(id) === run) runs.delete(id);
      if (current(c, epoch)) { await refreshActive(); await refreshTask(id); notify?.(); }
    }
  }
  async function cancel(id: string) {
    const task = find(id), active = state.active[id]; if (!client || !task || !active || active.status === "CANCELLING") return false;
    const c = client, epoch = state.epoch, abort = controller(), run = runs.get(id);
    setActive(id, { ...active, status: "CANCELLING" });
    if (run) { run.cancelRequested = true; run.cancel?.(); controllers.delete(abort); notify?.(); return true; }
    try {
      if (!active.executionId) return false;
      await new BackendTasksClient(c).cancel(task.parentAgentId, id, active.executionId, abort.signal); notify?.(); return true;
    } catch (cause) { if (current(c, epoch)) publish({ error: errorOf(cause) }); return false; }
    finally { controllers.delete(abort); if (current(c, epoch)) void refreshActive(); }
  }
  return {
    getSnapshot: () => state, getServerSnapshot: () => initial,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start: () => { if (unsubscribers.length) return; unsubscribers = [connection.subscribe(sync), agents.subscribe(sync)]; sync();
      if (options.pollMs !== 0) timer = setInterval(() => { if (!client || (typeof document !== "undefined" && document.visibilityState !== "visible")) return; if (now() - listAt > 60000) void refreshList(); void refreshActive(); }, options.pollMs ?? 15000); },
    stop: () => { unsubscribers.forEach(u => u()); unsubscribers = []; clearInterval(timer); reset(null); revision = -1; },
    setNotify: (listener?: () => void) => { notify = listener; },
    refresh, refreshActive, startDraft, save, remove, execute, cancel,
    selectTask: (id: string) => { if (!find(id) || state.mutation) return false; publish({ activeTaskId: id, error: null, notice: null }); void refreshActive(); void refreshTask(id); return true; },
    closeWorkspace: () => publish({ activeTaskId: null }),
    edit: (id: string, patch: Partial<TaskEditor>) => { const editor = state.editors[id]; if (editor) publish({ editors: { ...state.editors, [id]: { ...editor, ...patch } }, notice: null }); },
    selectExecution: (task: string, execution: string) => { publish({ selectedExecutions: { ...state.selectedExecutions, [task]: execution } }); void loadExecution(task, execution); },
    clearError: () => publish({ error: null, notice: null }),
  };
}
export type TaskWorkspaceStore = ReturnType<typeof createTaskWorkspaceStore>;
