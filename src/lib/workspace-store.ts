import { BackendClient, BackendClientError } from "./backend-client.ts";
import type { BackendConnectionStore } from "./backend-connection-store.ts";
import type { BackendAgentsStore } from "./backend-agents-store.ts";
import { backendActivity } from "./backend-activity.ts";
import { BackendSessionsClient, type BackendSession, type SessionWriteInput } from "./backend-sessions.ts";
import type { ConversationRecord } from "./workspace-conversation.ts";
import { loadSessionHistory } from "./session-history.ts";
import { chatError } from "./chat-errors.ts";
import { connectSessionStream, type StreamSocketFactory } from "./backend-session-stream.ts";
import { type StreamEvent, finishSessionStream, newSessionStream, retrievedSources, parseSessionInput, streamAnswer, updateSessionStream } from "./session-stream.ts";

export type WorkspaceSnapshot = {
  epoch: number; status: "unavailable" | "loading" | "ready" | "error";
  agentId: string | null; sessionId: string | null; sessions: BackendSession[];
  records: Record<string, ConversationRecord>; waiting: boolean; cancelling: boolean; cancellingSessionIds: string[];
  mutation: "start" | "update" | "fork" | "delete" | null;
  error: BackendClientError | null; uncertain: boolean;
  notice: "writeUnknown" | "savedReadFailed" | "missing" | null;
  historyLoading: boolean;
};
const initial: WorkspaceSnapshot = { epoch: 0, status: "unavailable", agentId: null, sessionId: null,
  sessions: [], records: {}, waiting: false, cancelling: false, cancellingSessionIds: [], mutation: null, error: null, uncertain: false, notice: null, historyLoading: false };
const keyOf = (agentId: string, sessionId: string) => `${agentId}/${sessionId}`;
const errorOf = (cause: unknown) => cause instanceof BackendClientError ? cause :
  new BackendClientError("invalid-response", "Invalid Workspace response.", { cause });
const missing = (error: BackendClientError) => error.code === "http" && error.status === 404 ||
  error.code === "remote" && error.serverCode === "NOT_FOUND";
const unknown = (error: BackendClientError) => ["network", "timeout", "cancelled", "invalid-response"].includes(error.code) ||
  (error.code === "http" && (error.status ?? 0) >= 500);

export function createWorkspaceStore(connection: BackendConnectionStore, agents: BackendAgentsStore,
  options: { chatTimeoutMs?: number; now?: () => number; uuid?: () => string; socketFactory?: StreamSocketFactory; cancelTimeoutMs?: number; connectTimeoutMs?: number } = {}) {
  let state = initial, client: BackendClient | null = null, baseUrl: string | null = null;
  let revision = -1, version = 0, selection: { agentId: string | null; sessions: Record<string, string> } = { agentId: null, sessions: {} };
  let readController: AbortController | null = null, operation: AbortController | null = null;
  let activityToken: symbol | null = null;
  type ChatRun = { key: string; turnId: string; controller: AbortController; detached?: boolean; cancel?: () => void; cancelling: boolean };
  const runs = new Map<string, ChatRun>();
  const observedRunning = new Set<string>();
  let operationConfirmed = false;
  let historyController: AbortController | null = null;
  const loadedHistory = new Set<string>();
  let unsubscribers: (() => void)[] = [], lastAgents: unknown = null;
  let recovery = false;
  let subscription: ReturnType<typeof connectSessionStream> | null = null;
  let subscriptionKey: string | null = null;
  let subscriptionController: AbortController | null = null;
  const activity = backendActivity(connection), listeners = new Set<() => void>();
  const now = options.now ?? Date.now, uuid = options.uuid ?? (() => crypto.randomUUID());
  function publish(patch: Partial<WorkspaceSnapshot>) {
    state = { ...state, ...patch }; syncStream(); listeners.forEach((listener) => listener());
  }
  function saveRecord(key: string, record: ConversationRecord) {
    publish({ records: { ...state.records, [key]: record } });
  }
  async function loadHistory(sessionId: string) {
    const session=state.sessions.find(s => s.id === sessionId);
    if (!client || !session) return;
    const key=keyOf(session.parentAgentId, sessionId);
    if(loadedHistory.has(key)) return;
    const c=client, epoch=state.epoch;
    historyController?.abort(); const controller=new AbortController();historyController=controller;
    publish({historyLoading:true});
    try {
      const turns=await loadSessionHistory(c,session,controller.signal);
      if(!same(c,epoch)||historyController!==controller||controller.signal.aborted) return;
      const current=state.records[key] ?? {draft:"",turns:[]};
      const merged = new Map(current.turns.map(turn => [turn.id, turn]));
      for (const turn of turns) {
        const local = merged.get(turn.id);
        if (local && ["completed", "stopped", "failed"].includes(local.status) && !["completed", "stopped", "failed"].includes(turn.status)) continue;
        if (!local || !runs.has(key) || ["completed", "stopped", "failed"].includes(turn.status)) {
          merged.set(turn.id, { ...local, ...turn });
          if (runs.get(key)?.detached && runs.get(key)?.turnId === turn.id && ["completed", "stopped", "failed"].includes(turn.status)) {
            runs.delete(key);
          }
        }
      }
      saveRecord(key, { ...current, turns: [...merged.values()].sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt)) });
      publishRuns();
      loadedHistory.add(key);
    }catch(cause){if(same(c,epoch)&&!controller.signal.aborted)publish({error:errorOf(cause)});}
    finally{if(historyController===controller){historyController=null;publish({historyLoading:false});}}
  }
  function forget(agentId: string, sessionId: string) {
    const records = { ...state.records }; delete records[keyOf(agentId, sessionId)];
    loadedHistory.delete(keyOf(agentId,sessionId));
    if (selection.sessions[agentId] === sessionId) delete selection.sessions[agentId];
    publish({ records });
  }
  function release() { const token = activityToken; activityToken = null; if (token) activity.release(token); }
  function canOperate() { return !!client && !state.historyLoading && !state.mutation && !activity.busy() && !agents.getSnapshot().mutation; }
  function canNavigate() { return !!client && !state.mutation && !agents.getSnapshot().mutation; }
  function canChat(key: string) {
    return canNavigate() && !state.historyLoading && !runs.has(key) && !state.records[key]?.turns.some(turn => turn.status === "waiting") && !activity.busy();
  }
  function publishRuns() {
    const active = new Set([...runs.keys(), ...Object.entries(state.records)
      .filter(([, record]) => record.turns.some(turn => turn.status === "waiting")).map(([key]) => key)]);
    for (const key of [...observedRunning]) if (!active.has(key)) { observedRunning.delete(key); activity.finished(key); }
    for (const key of active) if (!observedRunning.has(key)) { observedRunning.add(key); activity.started(key, key.split("/")[0]); }
    const cancellingSessionIds = Object.entries(state.records).filter(([, record]) =>
      record.turns.some(turn => turn.status === "waiting" && turn.stream?.phase === "cancelling")).map(([key]) => key.split("/")[1]);
    publish({ waiting: runs.size > 0 || Object.values(state.records).some(record => record.turns.some(turn => turn.status === "waiting")),
      cancelling: cancellingSessionIds.length > 0, cancellingSessionIds });
  }
  function syncStream() {
    const session = client && state.sessions.find(item => item.id === state.sessionId);
    const key = session ? keyOf(session.parentAgentId, session.id) : null;
    if (key === subscriptionKey) return;
    const previousKey = subscriptionKey;
    if (previousKey) {
      const run = runs.get(previousKey);
      if (run) run.detached = true;
    }
    subscriptionKey = key;
    const previous = subscription; subscription = null;
    subscriptionController?.abort(); subscriptionController = null; previous?.close();
    if (previousKey) loadedHistory.delete(previousKey);
    if (!session || !client) return;
    const c = client, epoch = state.epoch;
    subscriptionController = new AbortController();
    const opened = connectSessionStream({ baseUrl: c.BASE_URL, agentId: session.parentAgentId, sessionId: session.id,
      signal: subscriptionController.signal, socketFactory: options.socketFactory, uuid, connectTimeoutMs: options.connectTimeoutMs,
      onEvent: event => { if (same(c, epoch) && subscriptionKey === key) onStreamEvent(key!, event); } });
    subscription = opened;
    void opened.ready.catch(cause => {
      if (same(c, epoch) && subscription === opened && !subscriptionController?.signal.aborted)
        publish({ error: errorOf(cause) });
    });
  }
  function onStreamEvent(key: string, event: StreamEvent) {
    const current = state.records[key];
    if (!current || !event.requestId) return;
    const turns = [...current.turns];
    const input = event.type === "message.enqueued" ? parseSessionInput(event.data)
      : event.type === "run.started" && event.data.input != null ? parseSessionInput(event.data.input) : null;
    if (input && !turns.some(turn => turn.id === event.requestId)) {
      const session = state.sessions.find(item => keyOf(item.parentAgentId, item.id) === key);
      turns.push({ id: event.requestId, user: input.message, communication: input.source ?? undefined,
        assistant: null, status: "waiting", sentAt: input.submittedAt, receivedAt: null, elapsedMs: null,
        responseCount: null, error: null, modelName: session?.provider.modelName ?? "", providerName: session?.provider.name ?? "",
        stream: { ...newSessionStream(), phase: event.type === "message.enqueued" ? "queued" : "working" } });
    }
    saveRecord(key, { ...current, turns: turns.map(turn => {
      if (turn.id !== event.requestId || ["completed", "stopped", "failed"].includes(turn.status)) return turn;
      const previous = turn.stream ?? newSessionStream();
      const stream = updateSessionStream(turn.status === "unconfirmed" ? { ...previous, phase: "working" } : previous, event);
      const sources = event.type === "retrieval.completed" ? [...new Map([...(turn.sources ?? []), ...retrievedSources(event)].map(source => [source.sourceId, source])).values()] : turn.sources;
      const feedback = ["thinking.delta", "answer.delta", "model.response.completed", "tool.arguments.delta", "tool.started", "tool.completed", "tool.failed", "retrieval.completed", "run.completed", "run.failed"].includes(event.type);
      const status = event.type === "run.completed" ? "completed" : event.type === "run.cancelled" ? "stopped" : event.type === "run.failed" ? "failed" : "waiting";
      return { ...turn, status, stream, assistant: streamAnswer(stream), sources, usage: stream.usage ?? turn.usage,
        executedTools: stream.tools.filter(tool => tool.executed).map(tool => tool.name), error: null,
        ...(status === "completed" ? { receivedAt: event.timestamp } : {}),
        ...(status === "failed" ? { error: chatError(new BackendClientError("remote",
          (event.data.error as { message: string }).message, { requestId: turn.id,
            serverCode: (event.data.error as { code: string }).code,
            reason: (event.data.error as { reason?: string }).reason,
            detail: (event.data.error as { detail?: string }).detail }), turn.id) } : {}),
        ...(feedback ? { firstFeedbackAt: turn.firstFeedbackAt ?? event.timestamp, lastFeedbackAt: event.timestamp } : {}) };
    }) });
    if (["run.completed", "run.cancelled", "run.failed"].includes(event.type) && runs.get(key)?.detached && runs.get(key)?.turnId === event.requestId) {
      runs.delete(key);
    }
    publishRuns();
  }
  function same(c: BackendClient, epoch: number) { return client === c && epoch === state.epoch; }
  function finishChat(run: ChatRun, status: "completed" | "failed" | "unconfirmed" | "stopped", lines?: string[], error?: BackendClientError, sources?: import("./backend-sessions.ts").ChatSource[]) {
    const { key, turnId } = run, record = state.records[key];
    if (!record) return;
    const ended = now();
    saveRecord(key, { ...record, turns: record.turns.map((t) => t.id !== turnId ? t : { ...t, status,
      assistant: status === "completed" ? lines?.join("\n") ?? t.assistant ?? "" : t.stream ? t.assistant : null,
      sources: sources ?? t.sources ?? [],
      ...(t.stream ? { stream: finishSessionStream(t.stream, status) } : {}),
      receivedAt: status === "completed" ? new Date(ended).toISOString() : null,
      firstFeedbackAt: t.firstFeedbackAt ?? (status === "completed" ? new Date(ended).toISOString() : undefined),
      lastFeedbackAt: status === "completed" ? new Date(ended).toISOString() : t.lastFeedbackAt,
      elapsedMs: Math.max(0, ended - Date.parse(t.sentAt)), responseCount: status === "completed" ? lines?.length ?? 1 : null,
      error: error ? chatError(error, turnId) : null }) });
  }
  async function loadSessions(agentId: string, preferred?: string, preserveError = false): Promise<boolean> {
    if (!client) return false;
    const c = client, epoch = state.epoch, requestVersion = ++version;
    readController?.abort(); const controller = new AbortController(); readController = controller;
    publish({ status: "loading", ...(preserveError ? {} : { error: null }) });
    try {
      const sessions = await new BackendSessionsClient(c).list(agentId, controller.signal, recovery ? 180_000 : undefined);
      if (!same(c, epoch) || version !== requestVersion || state.agentId !== agentId) return false;
      const records = { ...state.records }, ids = sessions.map((s) => s.id);
      for (const session of sessions) {
        const key = keyOf(agentId, session.id);
        records[key] ??= { draft: "", turns: [] };
      }
      for (const key of Object.keys(records)) if (key.startsWith(`${agentId}/`) && !ids.includes(key.split("/")[1])) delete records[key];
      const remembered = preferred && ids.includes(preferred) ? preferred : selection.sessions[agentId];
      const sessionId = ids.includes(remembered) ? remembered :
        [...sessions].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]?.id ?? null;
      if (sessionId) selection.sessions[agentId] = sessionId; else delete selection.sessions[agentId];
      publish({ status: "ready", sessions, sessionId, records });
      if (sessionId) await loadHistory(sessionId);
      return true;
    } catch (cause) {
      if (!same(c, epoch) || version !== requestVersion) return false;
      const error = errorOf(cause);
      publish({ status: "error", error });
      if (missing(error)) { publish({ notice: "missing", sessions: [], sessionId: null }); void agents.refresh(); }
      return false;
    } finally { if (readController === controller) readController = null; }
  }
  function selectAgent(agentId: string) {
    if (!canNavigate() || agents.getSnapshot().status !== "ready" || !agents.getSnapshot().agents.some((a) => a.id === agentId)) return;
    if (state.agentId === agentId && state.status === "ready") return;
    selection.agentId = agentId;
    publish({ agentId, sessionId: null, sessions: [], error: null, uncertain: false, notice: null });
    void loadSessions(agentId);
  }
  async function openSession(agentId: string, sessionId?: string): Promise<boolean> {
    if (!canNavigate() || agents.getSnapshot().status !== "ready" || !agents.getSnapshot().agents.some(a => a.id === agentId)) return false;
    if (state.agentId === agentId && state.status === "ready") {
      if (!sessionId) return true;
      if (!state.sessions.some(s => s.id === sessionId)) {
        const loaded = await loadSessions(agentId, sessionId);
        return loaded && state.agentId === agentId && state.sessionId === sessionId;
      }
      selection.sessions[agentId] = sessionId;
      publish({ sessionId, error: null, uncertain: false, notice: null });
      await loadHistory(sessionId);
      return state.agentId === agentId && state.sessionId === sessionId;
    }
    selection.agentId = agentId;
    publish({ agentId, sessionId: null, sessions: [], error: null, uncertain: false, notice: null });
    const loaded = await loadSessions(agentId, sessionId);
    return loaded && (!sessionId || state.sessionId === sessionId);
  }
  function syncAgents() {
    const a = agents.getSnapshot();
    if (!client || a.status !== "ready" || a.mutation || a.paused || a.agents === lastAgents || state.mutation) return;
    lastAgents = a.agents;
    const ids = a.agents.map((a) => a.id), records = { ...state.records };
    for (const key of Object.keys(records)) if (!ids.includes(key.split("/")[0])) delete records[key];
    for (const id of Object.keys(selection.sessions)) if (!ids.includes(id)) delete selection.sessions[id];
    publish({ records });
    if (state.agentId && ids.includes(state.agentId)) return;
    const id = selection.agentId && ids.includes(selection.agentId) ? selection.agentId : ids[0];
    if (id) selectAgent(id);
    else { selection.agentId = null; publish({ agentId: null, sessionId: null, sessions: [], status: "ready" }); }
  }
  function syncConnection() {
    const s = connection.getSnapshot();
    const c = s.initialized && s.status === "connected" && !s.reloading ? s.client : null;
    if (c === client && revision === s.resourceRevision) return;
    if (runs.size) {
      for (const run of runs.values()) finishChat(run, "unconfirmed", undefined, new BackendClientError("cancelled", "Connection changed."));
      recovery = true; activity.markUncertain();
    }
    const interrupted = state.mutation;
    client = c; revision = s.resourceRevision; version++;
    readController?.abort(); readController = null; operation?.abort(); operation = null;
    for (const run of runs.values()) run.controller.abort();
    runs.clear();
    for (const key of observedRunning) activity.finished(key);
    observedRunning.clear();
    loadedHistory.clear(); historyController?.abort(); historyController=null;
    publish({ ...initial, epoch: state.epoch + 1,
      notice: interrupted ? operationConfirmed ? "savedReadFailed" : "writeUnknown" : null });
    operationConfirmed = false;
    release(); lastAgents = null;
    if (c) {
      if (baseUrl !== c.BASE_URL) recovery = false;
      baseUrl = c.BASE_URL;
      selection = {agentId:null,sessions:{}};
      syncAgents();
    }
  }
  async function mutate(kind: NonNullable<WorkspaceSnapshot["mutation"]>, input?: string | SessionWriteInput): Promise<boolean> {
    if (!canOperate() || !state.agentId || state.status !== "ready" ||
      (kind !== "start" && !state.sessionId)) return false;
    if (kind !== "start" && (runs.has(keyOf(state.agentId, state.sessionId!)) || state.records[keyOf(state.agentId, state.sessionId!)]?.turns.some(turn => turn.status === "waiting"))) return false;
    const c = client!, epoch = state.epoch, agentId = state.agentId, sessionId = state.sessionId;
    const controller = new AbortController(), api = new BackendSessionsClient(c);
    readController?.abort(); version++;
    operation = controller;
    operationConfirmed = false;
    publish({ mutation: kind, error: null, uncertain: false, notice: null });
    activityToken = activity.acquire();
    if (!activityToken) { operation = null; publish({ mutation: null }); return false; }
    let confirmed = false;
    try {
      let target = sessionId;
      if (kind === "start") target = await api.start(agentId, input as string, controller.signal);
      else if (kind === "fork") target = await api.fork(agentId, sessionId!, controller.signal);
      else if (kind === "update") await api.update(agentId, sessionId!, input as SessionWriteInput, controller.signal);
      else await api.delete(agentId, sessionId!, controller.signal);
      confirmed = true;
      if (!same(c, epoch)) return false;
      operationConfirmed = true;
      if (kind === "delete") forget(agentId, sessionId!);
      if (kind === "delete") publish({ sessions: state.sessions.filter((s) => s.id !== sessionId), sessionId: null });
      const loaded = await loadSessions(agentId, kind === "delete" ? undefined : target!);
      if (!same(c, epoch)) return false;
      if (!loaded) publish({ notice: "savedReadFailed" });
      return true;
    } catch (cause) {
      if (!same(c, epoch)) return false;
      const error = errorOf(cause);
      if (!confirmed && unknown(error)) { recovery = true; activity.markUncertain(); }
      publish({ error, uncertain: !confirmed && unknown(error), notice: confirmed ? "savedReadFailed" : null });
      if (missing(error)) { forget(agentId, sessionId!); publish({ notice: "missing" }); await loadSessions(agentId); }
      return kind === "delete" && missing(error);
    } finally {
      if (same(c, epoch) && operation === controller) {
        operation = null; publish({ mutation: null }); release(); lastAgents = null; syncAgents();
      }
    }
  }
  async function send(assetVersionIds: string[] = [], names: string[] = [], onAccepted?: () => void): Promise<boolean> {
    const session = state.sessions.find((s) => s.id === state.sessionId);
    const key = state.agentId && state.sessionId ? keyOf(state.agentId, state.sessionId) : null;
    const record = key ? state.records[key] : null;
    if (!key || !canChat(key) || state.status !== "ready" || !session || !record || (!record.draft.trim() && !assetVersionIds.length)) return false;
    const message = record!.draft.trim() ? record!.draft : "请分析这些附件，并引用对应来源。";
    const c = client!, epoch = state.epoch, controller = new AbortController();
    const turnId = uuid(), run: ChatRun = { key, turnId, controller, cancelling: false };
    let accepted = false;
    const accept = () => { if (!accepted) { accepted = true; onAccepted?.(); } };
    runs.set(key, run);

    publishRuns();
    publish({ error: null, uncertain: false, notice: null });
    saveRecord(key!, { ...record, draft: "", turns: record.turns.concat({ id: turnId, user: message, attachments: assetVersionIds.map((versionId, i) => ({ versionId, name: names[i] ?? versionId })), assistant: null,
      status: "waiting", sentAt: new Date(now()).toISOString(), receivedAt: null, elapsedMs: null, responseCount: null,
      error: null, modelName: session.provider.modelName, providerName: session.provider.name,
      stream: newSessionStream() }) });
    if (!session.name) {
      const text=message.trim().replace(/\s+/g," "), points=Array.from(text);
      publish({sessions:state.sessions.map(s=>s.id===session.id?{...s,name:points.slice(0,80).join("")+(points.length>80?"…":"")}:s)});
    }
    try {
      if (!subscription || subscription.isClosed()) { subscriptionKey = null; syncStream(); }
      const streamRun = subscription!.chat({ requestId: turnId, message, assetVersionIds, signal: controller.signal,
        idleTimeoutMs: options.chatTimeoutMs, cancelTimeoutMs: options.cancelTimeoutMs,
        onEvent(event) { if (event.type === "chat.accepted" || event.type === "run.started") accept(); } });
      run.cancel = streamRun.cancel;
      const outcome = await streamRun.result;
      if (!same(c, epoch) || runs.get(key) !== run) return false;
      finishChat(run, outcome.status, undefined, outcome.error);
      return outcome.status === "completed";
    } catch (cause) {
      if (!same(c, epoch) || runs.get(key) !== run) return false;
      const error = errorOf(cause), uncertain = unknown(error);
      if (run.detached && error.code === "cancelled") return false;
      recovery = uncertain;
      if (uncertain) activity.markUncertain();
      finishChat(run, uncertain ? "unconfirmed" : "failed", undefined, error);
      if (missing(error)) {
        forget(session.parentAgentId, session.id);
        if (state.sessionId === session.id) publish({ status: "error", notice: "missing" });
      }
      return false;
    } finally {
      if (same(c, epoch) && runs.get(key) === run && !run.detached) {
        runs.delete(key); publishRuns();
        if (!runs.size) {
          if (!state.mutation && state.agentId === session.parentAgentId && state.status === "ready" && !state.historyLoading) void loadSessions(state.agentId, state.sessionId ?? undefined, true);
        }
      }
    }
  }
  return {
    getSnapshot: () => state, getServerSnapshot: () => initial,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start() { if (unsubscribers.length) return; unsubscribers = [connection.subscribe(syncConnection), agents.subscribe(syncAgents)]; syncConnection(); },
    stop() {
      unsubscribers.forEach((u) => u()); unsubscribers = [];
      for (const run of runs.values()) {
        finishChat(run, "unconfirmed", undefined, new BackendClientError("cancelled", "Page closed."));
        run.controller.abort();

      }
      runs.clear();
      for (const key of observedRunning) activity.finished(key);
      observedRunning.clear();
      historyController?.abort(); historyController=null; loadedHistory.clear();
      client = null; revision = -1; version++; readController?.abort(); operation?.abort(); operation = null;
      publish({ ...initial, epoch: state.epoch + 1 }); release();
    },
    selectAgent, openSession,
    selectSession(id: string) {
      if (!canNavigate() || state.status !== "ready" || !state.agentId || !state.sessions.some((s) => s.id === id)) return;
      selection.sessions[state.agentId] = id; publish({ sessionId: id, error: null, uncertain: false, notice: null });
      void loadHistory(id);
    },
    setDraft(draft: string) {
      if (!state.agentId || !state.sessionId || !canChat(keyOf(state.agentId, state.sessionId)) || state.status !== "ready") return;
      const key = keyOf(state.agentId, state.sessionId), record = state.records[key];
      if (record) saveRecord(key, { ...record, draft });
    },
    refresh: () => canOperate() && state.agentId ? loadSessions(state.agentId) : Promise.resolve(false),
    startSession: (providerId: string) => mutate("start", providerId),
    updateSession: (input: SessionWriteInput) => mutate("update", input),
    forkSession: () => mutate("fork"), deleteSession: () => mutate("delete"), send,
    cancelChat() {
      const run = state.agentId && state.sessionId ? runs.get(keyOf(state.agentId, state.sessionId)) : undefined;
      if (!run || run.detached) {
        const key = state.agentId && state.sessionId ? keyOf(state.agentId, state.sessionId) : null;
        const record = key ? state.records[key] : null;
        if (!record || !record.turns.some(turn => turn.status === "waiting")) return;
        saveRecord(key!, { ...record, turns: record.turns.map(turn => turn.status === "waiting" && turn.stream
          ? { ...turn, stream: { ...turn.stream, phase: "cancelling" } } : turn) });
        subscription?.stop(); publishRuns(); return;
      }
      if (run.cancelling || !run.cancel) return;
      const { key, turnId } = run, record = state.records[key];
      run.cancelling = true;
      saveRecord(key, { ...record, turns: record.turns.map(t => t.id === turnId && t.stream ? { ...t, stream: { ...t.stream, phase: "cancelling" } } : t) });
      publishRuns(); run.cancel();
    },
    clearError: () => publish({ error: null, uncertain: false }),

  };
}
export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>;
