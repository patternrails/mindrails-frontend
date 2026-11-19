import { authorizedFetch, authState, clearAuth, refreshSession } from "./auth-session.ts";
import { backendEndpoint, normalizeBackendUrl } from "./backend-url.ts";

/** Only display explicit JSON error fields; proxies may return entire HTML pages. */
export function backendErrorDetail(body: string): string | undefined {
  try {
    const value = JSON.parse(body) as Record<string, unknown> | null;
    if (!value || typeof value !== "object") return undefined;
    const detail = typeof value.message === "string" ? value.message : typeof value.detail === "string" ? value.detail : undefined;
    return detail?.trim().slice(0, 2000) || undefined;
  } catch { return undefined; }
}

export type BackendErrorCode = "invalid-url" | "invalid-request" | "http" | "remote" | "network" |
  "timeout" | "cancelled" | "invalid-response" | "not-ready" | "configuration" | "busy";

export class BackendClientError extends Error {
  readonly code: BackendErrorCode;
  readonly status?: number;
  readonly serverCode?: string;
  readonly reason?: string;
  readonly detail?: string;
  readonly requestId?: string;

  constructor(code: BackendErrorCode, message: string, options?: {
    status?: number; cause?: unknown; serverCode?: string; reason?: string; detail?: string; requestId?: string;
  }) {
    super(message, { cause: options?.cause });
    this.name = "BackendClientError";
    this.code = code;
    this.status = options?.status;
    this.serverCode = options?.serverCode;
    this.reason = options?.reason;
    this.detail = options?.detail;
    this.requestId = options?.requestId;
  }
}

export type BackendClientOptions = {
  fetch?: typeof fetch;
  timeoutMs?: number;
  onConnectionError?: (error: BackendClientError) => void;
};

export type BackendRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";
  json?: unknown;
  body?: FormData;
  responseType?: "json" | "text" | "blob" | "download";
  headers?: HeadersInit;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** A long synchronous operation timing out does not prove a connection failure. */
  reportTimeout?: boolean;
  /** Opt in only for endpoints that establish scoped HttpOnly navigation cookies. */
  credentials?: "omit" | "include";
};

/** One immutable destination; dispose permanently invalidates retained references. */
export class BackendClient {
  readonly BASE_URL: string;
  private readonly lifetime = new AbortController();
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly onConnectionError?: BackendClientOptions["onConnectionError"];

  readonly resourceScope: string;

  constructor(baseUrl: string, options: BackendClientOptions = {}) {
    try { this.BASE_URL = normalizeBackendUrl(baseUrl); }
    catch (cause) { throw new BackendClientError("invalid-url", "Invalid backend URL.", { cause }); }
    this.resourceScope = `${this.BASE_URL}:${authState(this.BASE_URL)?.session?.user.id ?? "anonymous"}`;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.onConnectionError = options.onConnectionError;
  }

  dispose() { this.lifetime.abort(); }

  async health(options: Pick<BackendRequestOptions, "signal" | "timeoutMs"> = {}): Promise<void> {
    await this.execute("api/health", options, true);
  }

  /** JSON success bodies are typed by the caller; empty success bodies return undefined. */
  async request<T = unknown>(path: string, options: BackendRequestOptions = {}): Promise<T | undefined> {
    return await this.execute(path, options, false) as T | undefined;
  }

  /** XHR provides real upload byte progress; shares the client's disposal lifetime. */
  async upload(path: string, body: FormData, options: { signal: AbortSignal; onProgress: (fraction: number) => void; method?: "POST" | "PUT" }): Promise<unknown> {
    const url = backendEndpoint(this.BASE_URL, path);
    const send = () => new Promise<unknown>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const signals = [this.lifetime.signal, options.signal];
      const cleanup = () => signals.forEach(signal => signal.removeEventListener("abort", cancel));
      const fail = (error: BackendClientError) => { cleanup(); reject(error); };
      const cancel = () => xhr.abort();
      if (signals.some(signal => signal.aborted)) { reject(new BackendClientError("cancelled", "Upload cancelled.")); return; }
      xhr.open(options.method ?? "POST", url); xhr.timeout = 120_000; xhr.withCredentials = false;
      const session = authState(this.BASE_URL)?.session;
      if (session) xhr.setRequestHeader("Authorization", `Bearer ${session.accessToken}`);
      xhr.upload.onprogress = event => { if (event.lengthComputable) options.onProgress(event.loaded / event.total); };
      xhr.onabort = () => fail(new BackendClientError("cancelled", "Upload cancelled."));
      xhr.ontimeout = () => fail(new BackendClientError("timeout", "Upload timed out."));
      xhr.onerror = () => fail(new BackendClientError("network", "Upload failed."));
      xhr.onload = () => {
        cleanup();
        if (xhr.status < 200 || xhr.status >= 300) { const detail = backendErrorDetail(xhr.responseText); reject(new BackendClientError("http", `Upload returned HTTP ${xhr.status}.${detail ? ` ${detail}` : ""}`, { status: xhr.status })); return; }
        try { options.onProgress(1); resolve(JSON.parse(xhr.responseText)); }
        catch { reject(new BackendClientError("invalid-response", "Invalid upload response.")); }
      };
      signals.forEach(signal => signal.addEventListener("abort", cancel, { once: true }));
      xhr.send(body);
    });
    const previous = authState(this.BASE_URL)?.session;
    try { return await send(); }
    catch (error) {
      if (!(error instanceof BackendClientError) || error.status !== 401) throw error;
      const latest = authState(this.BASE_URL)?.session;
      if (!latest || latest.accessToken === previous?.accessToken) await refreshSession(this.BASE_URL, this.fetcher);
      if (previous && authState(this.BASE_URL)?.session?.user.id !== previous.user.id)
        throw new BackendClientError("cancelled", "Login session changed; upload was not retried.");
      try { return await send(); } catch (retryError) {
        if (retryError instanceof BackendClientError && retryError.status === 401) clearAuth(this.BASE_URL);
        throw retryError;
      }
    }
  }

  private async execute(path: string, options: BackendRequestOptions, health: boolean): Promise<unknown> {
    let url: string;
    let headers: Headers;
    let body: BodyInit | undefined;
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    try {
      url = backendEndpoint(this.BASE_URL, path);
      headers = new Headers(options.headers);
      if (options.body !== undefined) {
        if (options.json !== undefined || !options.method || options.method === "GET" || options.method === "HEAD") throw new Error("Invalid multipart request");
        body = options.body;
      }
      if (options.json !== undefined) {
        if (!options.method || options.method === "GET" || options.method === "HEAD") {
          throw new Error("JSON bodies require a write method.");
        }
        body = JSON.stringify(options.json);
        headers.set("Content-Type", "application/json");
      }
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
        throw new Error("Timeout must be a positive timer duration.");
      }
    } catch (cause) {
      throw new BackendClientError("invalid-request", "Invalid backend request options.", { cause });
    }

    const controller = new AbortController();
    const signals = [this.lifetime.signal, options.signal].filter((signal): signal is AbortSignal => !!signal);
    const cancel = () => controller.abort(new BackendClientError("cancelled", "Backend request cancelled."));
    signals.forEach((signal) => signal.addEventListener("abort", cancel, { once: true }));
    if (signals.some((signal) => signal.aborted)) cancel();
    const timeout = setTimeout(() => controller.abort(
      new BackendClientError("timeout", "Backend request timed out.")), timeoutMs);

    // Race the entire operation, including body consumption, against cancellation.
    // The identity checks in the store also guard transports that ignore AbortSignal.
    let onAbort: () => void = () => {};
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener("abort", onAbort, { once: true });
      if (controller.signal.aborted) onAbort();
    });
    try {
      const perform = async () => {
        controller.signal.throwIfAborted();
        const send: typeof fetch = health ? this.fetcher : (target, init) => authorizedFetch(this.BASE_URL, String(target), init ?? {}, this.fetcher);
        const response = await send(url, {
          method: options.method ?? "GET", headers, body, signal: controller.signal,
          cache: "no-store", credentials: options.credentials ?? "omit", redirect: "error",
        });
        controller.signal.throwIfAborted();
        if (health ? response.status !== 200 : !response.ok) {
          const detail = health ? undefined : backendErrorDetail(await response.text());
          throw new BackendClientError("http", `Backend returned HTTP ${response.status}.${detail ? ` ${detail}` : ""}`, { status: response.status });
        }
        if (health) return undefined;
        if (options.responseType === "blob" || options.responseType === "download") {
          const blob = await response.blob();
          return options.responseType === "blob" ? blob : { blob, disposition: response.headers.get("Content-Disposition") };
        }
        const text = await response.text();
        controller.signal.throwIfAborted();
        if (options.responseType === "text") return text;
        if (!text.trim()) return undefined;
        try { return JSON.parse(text) as unknown; }
        catch (cause) { throw new BackendClientError("invalid-response", "Backend returned invalid JSON.", { cause }); }
      };
      return await Promise.race([aborted, perform()]);
    } catch (cause) {
      const error = controller.signal.aborted ? controller.signal.reason as BackendClientError :
        cause instanceof BackendClientError ? cause :
          new BackendClientError("network", "Unable to reach the backend.", { cause });
      if (!health && (error.code === "network" || (error.code === "timeout" && options.reportTimeout !== false))) this.onConnectionError?.(error);
      throw error;
    } finally {
      clearTimeout(timeout);
      signals.forEach((signal) => signal.removeEventListener("abort", cancel));
      controller.signal.removeEventListener("abort", onAbort);
    }
  }
}
