import { backendEndpoint, normalizeBackendUrl } from "./backend-url.ts";

export type UserRole = "SystemAdmin" | "Normal";
export type UserProfile = { id: string; loginId: string; name: string; email: string; bio: string;
  avatarUrl: string; language: "en" | "zh"; role: UserRole; configuredAdmin: boolean; createdAt: string };
type Session = { accessToken: string; accessExpiresAt: string; user: UserProfile };
type State = { session: Session | null; revision: number };
const states = new Map<string, State>();
const listeners = new Set<() => void>();
const refreshing = new Map<string, Promise<Session>>();
const loggingIn = new Map<string, Promise<Session>>();
const epochs = new Map<string, number>();
const key = (base: string) => normalizeBackendUrl(base);
export const subscribeAuth = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const authState = (base: string): State | undefined => states.get(key(base));
function publish(base: string, session: Session | null) {
  const k = key(base); states.set(k, { session, revision: (states.get(k)?.revision ?? 0) + 1 }); listeners.forEach(fn => fn());
}
export function clearAuth(base: string) {
  const k = key(base); epochs.set(k, (epochs.get(k) ?? 0) + 1); publish(k, null);
}
function accept(base: string, value: unknown): Session {
  const s = value as Session;
  if (!s || !/^[A-Za-z0-9_-]{43}$/.test(s.accessToken) || !Number.isFinite(Date.parse(s.accessExpiresAt)) || !s.user?.id ||
      !["SystemAdmin", "Normal"].includes(s.user.role) || !["en", "zh"].includes(s.user.language)) throw new Error("Invalid login response");
  // Refresh tokens are held exclusively in the backend's HttpOnly cookie.
  const session = { accessToken: s.accessToken, accessExpiresAt: s.accessExpiresAt, user: s.user };
  const k = key(base);
  if (states.get(k)?.session?.user.id !== session.user.id) epochs.set(k, (epochs.get(k) ?? 0) + 1);
  publish(base, session); return session;
}
export function updateAuthUser(base: string, user: UserProfile) {
  const s = authState(base)?.session; if (s && s.user.id === user.id) publish(base, { ...s, user });
}
async function withAuthLock<T>(base: string, action: () => Promise<T>): Promise<T> {
  // Cookies are shared by tabs. Serialize rotations and logout across all tabs on this origin.
  return typeof navigator !== "undefined" && navigator.locks
    ? navigator.locks.request(`mindrails-auth:${key(base)}`, action) : action();
}
async function authCall(base: string, path: string, body: unknown, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(backendEndpoint(base, `api/auth/${path}`), { method: "POST", credentials: "include", cache: "no-store",
    redirect: "error", headers: { "Content-Type": "application/json", "X-MindRails-Auth": "1" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    let message = `Authentication returned HTTP ${response.status}`;
    try { const data = await response.json(); if (typeof data.message === "string") message = data.message.slice(0, 500); } catch { /* Keep safe fallback. */ }
    const error = Object.assign(new Error(message), { status: response.status }); throw error;
  }
  return response.status === 204 ? undefined : response.json();
}
export function loginSession(base: string, loginId: string, password: string, fetcher: typeof fetch = fetch): Promise<Session> {
  const k = key(base), existing = loggingIn.get(k); if (existing) return existing;
  const restoring = refreshing.get(k);
  const operation = (async () => {
    try {
      // A first-time backend connection may still be checking its old refresh cookie.
      if (restoring) await restoring.catch(() => {});
      clearAuth(k); const epoch = epochs.get(k);
      const value = await withAuthLock(k, () => authCall(k, "login", { loginId, password }, fetcher));
      if (epochs.get(k) !== epoch) throw new Error("Login was cancelled");
      return accept(k, value);
    } finally { loggingIn.delete(k); }
  })();
  loggingIn.set(k, operation); return operation;
}
export function refreshSession(base: string, fetcher: typeof fetch = fetch): Promise<Session> {
  const k = key(base), login = loggingIn.get(k); if (login) return login;
  const pending = refreshing.get(k); if (pending) return pending;
  const epoch = epochs.get(k);
  const operation: Promise<Session> = (async () => {
    try {
      const value = await withAuthLock(k, () => authCall(k, "refresh", {}, fetcher));
      if (epochs.get(k) !== epoch) throw new Error("Login session changed");
      return accept(k, value);
    } catch (e) {
      if (epochs.get(k) === epoch && e instanceof Error && "status" in e && (e.status === 401 || e.status === 403)) clearAuth(k);
      throw e;
    } finally { refreshing.delete(k); }
  })();
  refreshing.set(k, operation); return operation;
}
export async function logoutSession(base: string) {
  clearAuth(base);
  try {
    const login = loggingIn.get(key(base)); if (login) await login.catch(() => {});
    clearAuth(base);
    await withAuthLock(base, () => authCall(base, "logout", {}, fetch));
  } finally { clearAuth(base); }
}
/** Retry only a rejected authentication check. Concurrent 401s share a single rotation. */
export async function authorizedFetch(base: string, url: string, init: RequestInit, fetcher: typeof fetch): Promise<Response> {
  const before = authState(base)?.session;
  const epoch = epochs.get(key(base));
  const send = (token?: string) => {
    const headers = new Headers(init.headers); if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetcher(url, { ...init, headers });
  };
  const response = await send(before?.accessToken);
  if (epochs.get(key(base)) !== epoch && response.status !== 401) throw new DOMException("Login session changed", "AbortError");
  if (epochs.get(key(base)) !== epoch || response.status !== 401 || (typeof window === "undefined" && !before)) return response;
  const latest = authState(base)?.session;
  let session: Session;
  try { session = latest && latest.accessToken !== before?.accessToken ? latest : await refreshSession(base, fetcher); }
  catch (e) { if (e instanceof Error && "status" in e && (e.status === 401 || e.status === 403)) return response; throw e; }
  if (before && session.user.id !== before.user.id) return response;
  init.signal?.throwIfAborted();
  const retried = await send(session.accessToken);
  if (retried.status === 401) clearAuth(base);
  return retried;
}
export async function websocketTicket(base: string, path: string, signal: AbortSignal): Promise<string> {
  const response = await authorizedFetch(base, backendEndpoint(base, "api/auth/ws-ticket"), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }), credentials: "omit", signal,
  }, fetch);
  if (!response.ok) throw new Error(`WebSocket authentication returned HTTP ${response.status}`);
  const value = await response.json();
  if (!/^[A-Za-z0-9_-]{43}$/.test(value.ticket)) throw new Error("Invalid WebSocket ticket");
  return value.ticket;
}
