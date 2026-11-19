"use client";

import { Tooltip } from "@/components/ui/tooltip";
import { useI18n } from "@/i18n/use-i18n";
import { useBackendConnection } from "@/providers/backend-connection-provider";
import { connectionDisplayStatus } from "@/lib/backend-presentation";
import { RefreshCw } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { useWorkspace } from "@/providers/workspace-provider";

export function ConnectionStatus({ collapsed }: { collapsed: boolean }) {
  const { t } = useI18n();
  const connection = useBackendConnection();
  const workspace = useWorkspace();
  const status = connectionDisplayStatus(connection);
  const label = t(`backend.status.${status}`);
  const tooltip = t("backend.connectionTooltip", { status: label, address: connection.config?.BASE_URL ?? t("backend.noAddress") });
  return <div className="connection-status-row"><Tooltip label={tooltip}>
    <div className="connection-status" tabIndex={0} aria-label={tooltip} role="status" aria-live="polite" aria-atomic="true">
      <span className="status-dot" data-status={status} aria-hidden="true" />
      <span className={collapsed ? "sr-only" : "sidebar-label"}>{label}</span>
    </div>
  </Tooltip><IconButton icon={RefreshCw} label={t("backend.recheck")} disabled={status === "checking" || workspace.busy}
    onClick={() => void connection.recheck()} /></div>;
}
