"use client";

import { CircleCheck, CircleX, LoaderCircle, Pause, Clock3 } from "lucide-react";
import type { RunStatus, ToolStatus } from "@/lib/ui-models";
import type { ChatStatus } from "@/lib/workspace-conversation";
import { useI18n } from "@/i18n/use-i18n";

export function StatusBadge({ status }: { status: RunStatus | ToolStatus | ChatStatus | "preparing" | "thinking" }) {
  const { t } = useI18n();
  const active = status === "thinking" || status === "generating" || status === "running" || status === "waiting";
  const Icon = active ? LoaderCircle :
    status === "completed" ? CircleCheck : status === "failed" ? CircleX :
    status === "stopped" ? Pause : Clock3;
  return <span className={`run-status status-${status}`}>
    <Icon size={12} className={active ? "spinning" : undefined} aria-hidden="true" />
    {t(`status.${status}`)}
  </span>;
}
