"use client";

import type { ToolCall as ToolCallModel } from "@/lib/ui-models";
import { StatusBadge } from "@/features/workspace/status-badge";
import { useI18n } from "@/i18n/use-i18n";
import { toolDisplayName } from "@/lib/tool-presentation";

export function ToolCall({ tool }: { tool: ToolCallModel }) {
  const { t } = useI18n();
  const name = toolDisplayName(tool.name);
  return (
    <section className="tool-call" aria-label={t("tool.label", { name })}>
      <header className="tool-heading"><h3 title={tool.name}>{name}</h3><StatusBadge status={tool.status} /></header>
      {tool.durationMs !== undefined && (tool.status === "completed" || tool.status === "failed") &&
        <p className="tool-duration">{t("tool.duration", { count: tool.durationMs })}</p>}
      <details className="tool-payload">
        <summary>{t("tool.payload")}</summary>
        {name !== tool.name && <><h4>{t("tool.name")}</h4><pre>{tool.name}</pre></>}
        <h4>{t("tool.arguments")}</h4><pre>{JSON.stringify(tool.arguments, null, 2)}</pre>
        {tool.status === "failed" ? (
          <><h4>{t("tool.error")}</h4><p className="tool-error">{tool.error ?? t("tool.failed")}</p></>
        ) : tool.status === "completed" ? (
          <><h4>{t("tool.result")}</h4><p>{tool.result ?? t("tool.completed")}</p></>
        ) : <p>{t(tool.status === "stopped" ? "tool.stopped" : "tool.waiting")}</p>}
      </details>
    </section>
  );
}
