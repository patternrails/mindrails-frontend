import type { BackendClientError } from "./backend-client.ts";

export type ChatError = {
  code: string; status: number | null; message?: string;
  reason?: string; detail?: string; requestId?: string;
};

export function chatError(error: BackendClientError, requestId: string): ChatError {
  return { code: error.serverCode ?? error.code, status: error.status ?? null, message: error.message,
    ...(error.reason ? { reason: error.reason } : {}), ...(error.detail ? { detail: error.detail } : {}),
    requestId: error.requestId ?? requestId };
}

/** Older archives have only code/message; malformed optional diagnostics do not hide the turn. */
export function archivedChatError(value: unknown, requestId: string): ChatError | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const error = value as Record<string, unknown>;
  if (typeof error.code !== "string" || typeof error.message !== "string") return null;
  return { code: error.code, status: null, message: error.message, requestId,
    ...(typeof error.reason === "string" ? { reason: error.reason } : {}),
    ...(typeof error.detail === "string" ? { detail: error.detail } : {}) };
}

export function chatErrorKind(error: ChatError | null, status: string) {
  if (status === "unconfirmed") return "unconfirmed";
  switch (error?.reason) {
    case "TLS_HANDSHAKE_FAILED": return "tls";
    case "REQUEST_TIMEOUT": return "timeout";
    case "HOST_NOT_FOUND": case "CONNECTION_FAILED": return "connection";
    default: return "generic";
  }
}
