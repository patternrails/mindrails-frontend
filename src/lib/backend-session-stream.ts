import { websocketTicket } from "./auth-session.ts";
import { BackendClientError } from "./backend-client.ts";
import { backendEndpoint } from "./backend-url.ts";
import { isUuid } from "./backend-sessions.ts";
import { parseStreamEvent, type StreamEvent } from "./session-stream.ts";

export type StreamSocket = Pick<WebSocket, "readyState" | "send" | "close" | "addEventListener" | "removeEventListener">;
export type StreamSocketFactory = (url: string) => StreamSocket;
export type StreamOutcome = { status: "completed" | "stopped" | "failed"; error?: BackendClientError };
type ChatOptions = { requestId: string; message: string; assetVersionIds?: string[]; signal: AbortSignal;
  onEvent?: (event: StreamEvent) => void; idleTimeoutMs?: number; cancelTimeoutMs?: number };
type ConnectionOptions = { baseUrl: string; agentId: string; sessionId: string; signal: AbortSignal;
  onEvent?: (event: StreamEvent) => void; socketFactory?: StreamSocketFactory; uuid?: () => string; connectTimeoutMs?: number };

/** One subscription per selected Session. Only an explicit cancel sends a stop command. */
export function connectSessionStream(options: ConnectionOptions) {
  const { agentId, sessionId, signal } = options;
  let socket: StreamSocket | undefined, ready = false, closed = false, seq = 0;
  let connectTimer: ReturnType<typeof setTimeout> | undefined;
  let resolveReady: () => void, rejectReady: (error: BackendClientError) => void;
  const readyPromise = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  void readyPromise.catch(() => {});
  const runs = new Map<string, { start: () => void; event: (event: StreamEvent) => void; fail: (error: BackendClientError) => void }>();
  const error = (code: "network" | "timeout" | "cancelled" | "invalid-response", text: string) => new BackendClientError(code, text);
  const remoteError = (event: StreamEvent) => new BackendClientError("remote", event.data.message as string, {
    requestId: event.requestId ?? undefined, serverCode: event.data.code as string,
    ...(typeof event.data.reason === "string" ? { reason: event.data.reason } : {}),
    ...(typeof event.data.detail === "string" ? { detail: event.data.detail } : {}),
  });
  function close(cause = error("cancelled", "Session subscription closed.")) {
    if (closed) return;
    closed = true;
    clearTimeout(connectTimer); signal.removeEventListener("abort", aborted);
    socket?.removeEventListener("message", received); socket?.removeEventListener("error", failed); socket?.removeEventListener("close", interrupted);
    for (const run of [...runs.values()]) run.fail(cause);
    rejectReady(cause); socket?.close();
  }
  const aborted = () => close();
  const failed = () => close(error("network", "Unable to connect to the streaming service."));
  const interrupted = () => close(error("network", "Streaming connection interrupted."));
  function send(type: "chat" | "cancel", requestId: string, data: Record<string, unknown>) {
    socket!.send(JSON.stringify({ version: 1, type, requestId, data }));
  }
  function received(message: MessageEvent) {
    if (closed) return;
    try {
      if (typeof message.data !== "string") throw error("invalid-response", "Expected a text streaming event.");
      const event = parseStreamEvent(message.data);
      if (event.agentId !== agentId || event.sessionId !== sessionId) return;
      if (event.seq <= seq) return;
      if (event.seq !== seq + 1) throw error("invalid-response", "Streaming events are missing.");
      seq = event.seq;
      if (event.type === "command.error" && event.requestId === null) { close(remoteError(event)); return; }
      if (event.type === "connection.ready") {
        if (!ready) { ready = true; clearTimeout(connectTimer); resolveReady(); for (const run of [...runs.values()]) run.start(); }
        return;
      }
      options.onEvent?.(event);
      for (const run of [...runs.values()]) run.event(event);
    } catch (cause) { close(cause instanceof BackendClientError ? cause : error("invalid-response", "Invalid streaming response.")); }
  }
  function chat(input: ChatOptions) {
    let settled = false, sent = false, cancelId: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resolve: (value: StreamOutcome) => void, reject: (error: BackendClientError) => void;
    const result = new Promise<StreamOutcome>((yes, no) => { resolve = yes; reject = no; });
    function finish(outcome: StreamOutcome | BackendClientError) {
      if (settled) return;
      settled = true; clearTimeout(timer); input.signal.removeEventListener("abort", detached); if (runs.get(input.requestId) === run) runs.delete(input.requestId);
      if (outcome instanceof BackendClientError) reject(outcome); else resolve(outcome);
    }
    const detached = () => finish(error("cancelled", "Chat observation closed."));
    const arm = (ms: number) => { clearTimeout(timer); timer = setTimeout(() => finish(error("timeout", "Streaming response timed out.")), ms); };
    const run = {
      fail: (cause: BackendClientError) => finish(cause),
      start() {
        if (sent || settled) return;
        if (!isUuid(input.requestId) || !input.message.trim()) { finish(new BackendClientError("invalid-request", "Invalid streaming chat.")); return; }
        sent = true; arm(input.idleTimeoutMs ?? 180_000);
        try { send("chat", input.requestId, { message: input.message, ...(input.assetVersionIds?.length ? { assetVersionIds: input.assetVersionIds } : {}) }); }
        catch { finish(error("network", "Unable to send chat.")); }
      },
      event(event: StreamEvent) {
        if (settled || !sent || (event.requestId !== input.requestId && event.requestId !== cancelId)) return;
        if (event.requestId === null) return;
        if (event.type === "command.error") {
          if (event.requestId === input.requestId) finish({ status: "failed", error: remoteError(event) });
          return;
        }
        if (event.requestId === cancelId && !["run.cancelling", "run.cancelled"].includes(event.type)) return;
        if (!cancelId) arm(input.idleTimeoutMs ?? 180_000);
        input.onEvent?.(event);
        if (event.type === "run.completed") finish({ status: "completed" });
        else if (event.type === "run.cancelled") finish({ status: "stopped" });
        else if (event.type === "run.failed") finish({ status: "failed", error: remoteError({ ...event, data: event.data.error as Record<string, unknown> }) });
      },
    };
    if (closed || input.signal.aborted) detached();
    else if (runs.has(input.requestId)) finish(new BackendClientError("invalid-request", "Request ID is already pending."));
    else {
      runs.set(input.requestId, run); input.signal.addEventListener("abort", detached, { once: true });
      if (ready) run.start();
    }
    return { result, cancel() {
      if (settled || cancelId) return;
      if (!sent) { finish({ status: "stopped" }); return; }
      cancelId = (options.uuid ?? (() => crypto.randomUUID()))(); arm(input.cancelTimeoutMs ?? 15_000);
      try { send("cancel", cancelId, {}); } catch { finish(error("network", "Unable to send stop command.")); }
    } };
  }
  void (async () => {
    try {
      if (!isUuid(agentId) || !isUuid(sessionId)) throw new BackendClientError("invalid-request", "Invalid Session subscription.");
      if (signal.aborted) { close(); return; }
      signal.addEventListener("abort", aborted, { once: true });
      connectTimer = setTimeout(() => close(error("timeout", "Session connection timed out.")), options.connectTimeoutMs ?? 10_000);
      const url = new URL(backendEndpoint(options.baseUrl, `api/agent/${agentId}/sessions/${sessionId}/stream`));
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      if (!options.socketFactory) {
        const path = url.pathname.slice(new URL(options.baseUrl).pathname.replace(/\/$/, "").length);
        url.searchParams.set("ticket", await websocketTicket(options.baseUrl, path, signal));
      }
      if (closed) return;
      socket = (options.socketFactory ?? (address => new WebSocket(address)))(url.href);
      socket.addEventListener("message", received); socket.addEventListener("error", failed); socket.addEventListener("close", interrupted);
    } catch (cause) { close(cause instanceof BackendClientError ? cause : error("network", "Unable to open Session connection.")); }
  })();
  return { ready: readyPromise, chat, stop() {
    const stop = () => {
      if (closed) return;
      try { send("cancel", (options.uuid ?? (() => crypto.randomUUID()))(), {}); }
      catch { close(error("network", "Unable to send stop command.")); }
    };
    if (ready) stop(); else void readyPromise.then(stop).catch(() => {});
  }, close: () => close(), isClosed: () => closed };
}

/** Convenience for callers that only need to observe one message. */
export function openSessionStream(options: ConnectionOptions & ChatOptions) {
  const connection = connectSessionStream({ ...options, onEvent: undefined }), run = connection.chat(options);
  return { result: run.result.finally(() => connection.close()), cancel: run.cancel };
}
