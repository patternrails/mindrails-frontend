"use client";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { useI18n } from "@/i18n/use-i18n";
import { parseMetrics, type MetricsOverview } from "@/lib/backend-observability";
import { ArchiveNotice } from "./archive-common";
import { useArchiveRequest } from "./use-archive-request";

function Trend({ points, metric, title, unit }: { points: MetricsOverview["trend"]; metric: "totalTokens" | "runs"; title: string; unit: string }) {
  const { t } = useI18n(); const values = points.map(p => p.totals[metric]);
  const max = Math.max(1, ...values.filter((n): n is number => n !== null));
  const x = (index: number) => 65 + index * 610 / Math.max(1, points.length - 1);
  const y = (value: number) => 155 - value / max * 110;
  const paths: string[] = []; let path = "";
  values.forEach((value, i) => { if (value === null) { if (path) paths.push(path); path = ""; } else path += `${path ? " L" : "M"}${x(i)},${y(value)}`; });
  if (path) paths.push(path);
  return <figure className="metrics-chart"><figcaption>{title}</figcaption>
    <svg viewBox="0 0 730 205" role="img" aria-label={`${title} · ${unit} · UTC`}>
      <title>{title}</title><desc>{t("metrics.chartDescription")}</desc>
      <text x="12" y="18">{unit}</text><text x="12" y="48">{max.toLocaleString()}</text><text x="42" y="159">0</text>
      <path d="M65,40 V155 H675" className="chart-axis" />
      {paths.map((p, i) => <path key={i} d={p} className="chart-line" />)}
      {values.map((value, i) => value !== null && <circle key={i} cx={x(i)} cy={y(value)} r="2.5" className="chart-point"><title>{points[i].day}: {value} {unit}</title></circle>)}
      {[0, Math.floor(points.length / 2), points.length - 1].filter((n, i, all) => n >= 0 && all.indexOf(n) === i).map(i => <text key={i} x={x(i)} y="177" textAnchor="middle">{points[i]?.day.slice(5)}</text>)}
      <text x="365" y="198" textAnchor="middle">{t("metrics.dateAxis")}</text>
    </svg>
    <details><summary>{t("metrics.data")}</summary><div className="archive-table-wrap"><table><thead><tr><th>{t("metrics.dateAxis")}</th><th>{unit}</th></tr></thead><tbody>{points.map(p => <tr key={p.day}><td>{p.day}</td><td>{p.totals[metric]?.toLocaleString() ?? t("archive.unknown")}</td></tr>)}</tbody></table></div></details>
  </figure>;
}
export function MetricsSettings() {
  const { t, locale } = useI18n(); const [days, setDays] = useState(7);
  const [range, setRange] = useState(() => new Date().toISOString());
  const from = new Date(Date.parse(range) - days * 86400000).toISOString();
  const resource = useArchiveRequest(`api/metrics/overview?${new URLSearchParams({ from, to: range })}`, parseMetrics);
  const data = resource.data; const format = (n: number | null) => n === null ? t("archive.unknown") : n.toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
  return <div className="archive-settings">
    <div className="archive-toolbar"><label>{t("metrics.range")} <select className="agent-select" value={days} onChange={e => { setDays(Number(e.target.value)); setRange(new Date().toISOString()); }}>
      {[7, 30, 90].map(n => <option key={n} value={n}>{t("metrics.days", { count: n })}</option>)}</select></label>
      <IconButton icon={RefreshCw} label={t("archive.refresh")} disabled={!resource.client || resource.loading} onClick={() => { setRange(new Date().toISOString()); resource.retry(); }} /></div>
    <ArchiveNotice connected={!!resource.client} loading={resource.loading} error={resource.error} retry={resource.retry} />
    {data && <>
      {!data.collectionEnabled && <p className="archive-notice" role="status">{t("metrics.disabled")}</p>}
      <p className="settings-intro">{t("metrics.source")} · {data.from.slice(0, 10)} — {data.to.slice(0, 10)}</p>
      <dl className="metrics-summary">{([["metrics.runs", data.summary.runs], ["metrics.calls", data.summary.modelCalls], ["metrics.tokens", data.summary.totalTokens], ["metrics.functions", data.summary.functionCalls]] as const).map(([label, value]) => <div key={String(label)}><dt>{t(label)}</dt><dd>{format(value)}</dd></div>)}</dl>
      <p className="settings-intro">{t("metrics.coverage", { known: data.summary.usageKnownCalls, total: data.summary.modelCalls })} · {t("metrics.states", { success: data.summary.succeededRuns, failed: data.summary.failedRuns, cancelled: data.summary.cancelledRuns, running: data.summary.runningRuns })}</p>
      <p className="local-note">{t("metrics.partial")}</p>
      {data.summary.runs === 0 ? <p role="status">{t("metrics.empty")}</p> : <>
        <div className="metrics-charts"><Trend points={data.trend} metric="totalTokens" title={t("metrics.tokenTrend")} unit={t("metrics.tokens")} /><Trend points={data.trend} metric="runs" title={t("metrics.runTrend")} unit={t("metrics.runs")} /></div>
        <h3>{t("metrics.models")}</h3><ul className="model-usage-list">{data.models.map(m => <li key={m.modelName}><span>{m.modelName}</span><div className="model-bar"><span style={{ width: `${100 * m.totals.modelCalls / Math.max(1, ...data.models.map(v => v.totals.modelCalls))}%` }} /></div><span>{format(m.totals.modelCalls)} · {format(m.totals.totalTokens)} {t("metrics.tokens")}</span></li>)}</ul>
      </>}
      <div className="archive-capabilities"><span>MCP · {data.capabilities.mcpToolCalls === null ? t("metrics.notIntegrated") : format(data.capabilities.mcpToolCalls)}</span><span>{t("skills.loads")} · {data.capabilities.skillLoads === null ? t("metrics.notIntegrated") : format(data.capabilities.skillLoads)}</span><span>{t("metrics.inputOutput", { input: format(data.summary.inputTokens), output: format(data.summary.outputTokens) })}</span></div>
      <p className="local-note">{t("metrics.health", { pending: data.health.pendingRuns ?? 0, failures: data.health.writeFailures ?? 0, dropped: data.health.droppedRuns ?? 0 })}</p>
      <p className="local-note">{t("metrics.updated")} {data.lastPersistedAt ? new Date(data.lastPersistedAt).toLocaleString(locale) : t("archive.unknown")}</p>
    </>}
  </div>;
}
