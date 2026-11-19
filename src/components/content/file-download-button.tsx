"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useBackendConnection } from "@/providers/backend-connection-provider";
import { useI18n } from "@/i18n/use-i18n";
import { backendDownloadPath, downloadBackendFile } from "@/lib/backend-download";

export function FileDownloadButton({ href, filename, children, className, label }: {
  href: string; filename: string; children: ReactNode; className?: string; label?: string;
}) {
  const { client } = useBackendConnection(), { t } = useI18n();
  const operation = useRef<AbortController | null>(null);
  const [state, setState] = useState<{ href: string; client: typeof client; controller: AbortController; busy: boolean; failed: boolean } | null>(null);
  useEffect(() => () => { operation.current?.abort(); operation.current = null; }, [client, href]);
  const path = backendDownloadPath(client?.BASE_URL, href);
  const current = state?.href === href && state.client === client && !state.controller.signal.aborted ? state : null;
  return <>
    <button type="button" className={className} aria-label={label} title={label} disabled={!client || !path || current?.busy}
      aria-busy={current?.busy || undefined} onClick={() => {
        if (!client || !path || operation.current) return;
        const controller = new AbortController(); operation.current = controller;
        setState({ href, client, controller, busy: true, failed: false });
        void downloadBackendFile(client, path, filename, controller.signal).then(() => {
          if (!controller.signal.aborted) setState({ href, client, controller, busy: false, failed: false });
        }).catch(() => {
          if (!controller.signal.aborted) setState({ href, client, controller, busy: false, failed: true });
        }).finally(() => { if (operation.current === controller) operation.current = null; });
      }}>{children}</button>
    {current?.failed && <span className="file-download-error" role="alert">{t("assets.downloadFailed")}</span>}
  </>;
}
