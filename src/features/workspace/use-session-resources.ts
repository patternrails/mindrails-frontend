"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useArchiveRequest } from "@/features/settings/use-archive-request";
import { parseSessionAttachments } from "@/lib/backend-assets";
import { parseSessionDeliverables } from "@/lib/session-deliverables";
import { BackendClientError, type BackendClient } from "@/lib/backend-client";

export function useSessionResources({ sessionId, attachmentsEnabled, deliverablesEnabled, running, feedback }: {
  sessionId?: string; attachmentsEnabled: boolean; deliverablesEnabled: boolean; running: boolean; feedback: string;
}) {
  const parseDeliverables = useCallback((value: unknown) => parseSessionDeliverables(value, sessionId), [sessionId]);
  const attachments = useArchiveRequest(sessionId && attachmentsEnabled ? `api/asset-storage/sessions/${sessionId}/attachments` : null, parseSessionAttachments, feedback);
  const deliverables = useArchiveRequest(sessionId && deliverablesEnabled ? `api/asset-storage/sessions/${sessionId}/deliverables` : null, parseDeliverables, feedback);
  const client = attachments.client;
  const controller = useRef<AbortController | null>(null);
  const [mutation, setMutation] = useState<{ client: BackendClient; sessionId: string; key: string | null; error?: string } | null>(null);
  useEffect(() => () => { controller.current?.abort(); }, [client, sessionId]);
  const refreshAttachments = attachments.retry, refreshDeliverables = deliverables.retry;
  useEffect(() => {
    if (!sessionId || !running) return;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (attachmentsEnabled) refreshAttachments();
      if (deliverablesEnabled) refreshDeliverables();
    }, 15000);
    return () => clearInterval(timer);
  }, [sessionId, attachmentsEnabled, deliverablesEnabled, running, refreshAttachments, refreshDeliverables]);
  const current = mutation?.client === client && mutation?.sessionId === sessionId ? mutation : null;
  async function remove(kind: "attachments" | "deliverables", id: string) {
    if (!client || !sessionId || current?.key) return;
    controller.current?.abort();
    const operation = new AbortController(); controller.current = operation;
    setMutation({ client, sessionId, key: `${kind}:${id}` });
    try {
      await client.request(`api/asset-storage/sessions/${sessionId}/${kind}/${id}`, { method: "DELETE", signal: operation.signal });
      if (!operation.signal.aborted) {
        (kind === "attachments" ? refreshAttachments : refreshDeliverables)();
        setMutation({ client, sessionId, key: null });
      }
    } catch (cause) {
      if (operation.signal.aborted) return;
      if (cause instanceof BackendClientError && cause.status === 404) {
        (kind === "attachments" ? refreshAttachments : refreshDeliverables)();
        setMutation({ client, sessionId, key: null });
      } else setMutation({ client, sessionId, key: null, error: cause instanceof Error ? cause.message : "File operation failed." });
    }
  }
  const files = useMemo(() => [...(deliverables.data ?? deliverables.previousData ?? [])]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.path.localeCompare(b.path)), [deliverables.data, deliverables.previousData]);
  return { client, attachments: attachments.data ?? attachments.previousData ?? [], deliverables: files,
    attachmentsEnabled, deliverablesEnabled, attachmentsLoading: attachments.loading, deliverablesLoading: deliverables.loading,
    attachmentsError: attachments.error?.message, deliverablesError: deliverables.error?.message,
    mutationError: current?.error, deleting: current?.key, remove,
    refreshAttachments, refreshDeliverables };
}
export type SessionResources = ReturnType<typeof useSessionResources>;
