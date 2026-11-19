"use client";
import { useCallback, useEffect, useState } from "react";
import { BackendClient, BackendClientError } from "@/lib/backend-client";
import { useBackendConnection } from "@/providers/backend-connection-provider";

type Result<T> = { client: BackendClient; key: string; data?: T; error?: BackendClientError };
export function useArchiveRequest<T>(path: string | null, parse: (value: unknown) => T, refreshKey?: string) {
  const { client } = useBackendConnection();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result<T> | null>(null);
  // Path and feedback changes share one request effect, including on first mount.
  const key = `${path}:${attempt}:${refreshKey ?? ""}`;
  useEffect(() => {
    if (!client || !path) return;
    const controller = new AbortController();
    // Let cleanup cancel a superseded effect before sending its request.
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      void client.request(path, { signal: controller.signal, reportTimeout: false }).then(value => parse(value)).then(data => {
        if (!controller.signal.aborted) setResult({ client, key, data });
      }).catch(cause => {
        if (!controller.signal.aborted) setResult({ client, key, error: cause instanceof BackendClientError ? cause : new BackendClientError("invalid-response", "Invalid archive response.") });
      });
    });
    return () => controller.abort();
  }, [client, path, parse, key]);
  const current = result?.client === client && result?.key === key ? result : null;
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  const previousData = result?.client === client && path && result.key.startsWith(`${path}:`) ? result.data : undefined;
  return { client, data: current?.data, previousData, error: current?.error, loading: !!client && !!path && !current, retry };
}
