"use client";

import { useCallback, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { useArchiveRequest } from "@/features/settings/use-archive-request";
import { ArchiveNotice } from "@/features/settings/archive-common";
import { parseSessionMetrics } from "@/lib/backend-observability";
import { useI18n } from "@/i18n/use-i18n";

export function SessionMetrics({ sessionId, running, feedback }: { sessionId: string; running: boolean; feedback?: string }) {
  const { t, locale } = useI18n();
  const parse = useCallback((value: unknown) => parseSessionMetrics(value, sessionId), [sessionId]);
  const resource = useArchiveRequest(`api/metrics/sessions/${sessionId}`, parse, JSON.stringify([running, feedback]));
  const refresh = resource.retry;
  useEffect(() => {
    if (!resource.client || (!running && !feedback)) return;
    // Metrics persist asynchronously. Keep refreshing briefly after a turn ends, too.
    const timer = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 15000);
    const settle = running ? undefined : setTimeout(() => clearInterval(timer), 20000);
    return () => { clearInterval(timer); clearTimeout(settle); };
  }, [sessionId, resource.client, running, feedback, refresh]);
  const data = resource.data ?? resource.previousData;
  const summary = data?.summary;
  const number = (value: number | null | undefined) => value == null ? t("archive.unknown") : value.toLocaleString(locale);
  const partial = summary && [summary.inputKnownCalls, summary.outputKnownCalls, summary.usageKnownCalls].some(known => known < summary.modelCalls);
  const rows = summary ? [
    [t("sessionDetails.requests"), number(summary.runs)],
    [t("metrics.calls"), number(summary.modelCalls)],
    [t("sessionDetails.tokensTotal"), number(summary.totalTokens)],
    [t("sessionDetails.tokensInput"), number(summary.inputTokens)],
    [t("sessionDetails.tokensOutput"), number(summary.outputTokens)],
  ] : [];
  return <details className="agent-resource-details">
    <summary>{t("sessionDetails.metrics")}</summary>
    <div className="session-metrics-toolbar"><p className="session-details-empty">{t("sessionDetails.metricsScope")}</p>
      <IconButton icon={RefreshCw} label={t("archive.refresh")} variant="ghost" disabled={!resource.client || resource.loading} onClick={refresh} />
    </div>
    <ArchiveNotice connected={!!resource.client} loading={resource.loading && !data} error={resource.error} retry={refresh} />
    {summary && <dl className="agent-details">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
    {partial && <p className="session-details-empty">{t("metrics.coverage", { known: number(summary.usageKnownCalls), total: number(summary.modelCalls) })}<br />{t("metrics.partial")}</p>}
    {data && !data.collectionEnabled && <p className="session-details-empty">{t("metrics.disabled")}</p>}
  </details>;
}
