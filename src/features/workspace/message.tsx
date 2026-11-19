"use client";

import { useState } from "react";
import { SourcePreview } from "@/features/assets/source-preview";
import type { ChatSource } from "@/lib/backend-sessions";
import { AssetFileIcon } from "@/features/assets/asset-uploads";
import { Markdown } from "@/components/content/markdown";
import { ChatSources } from "@/features/knowledge/chat-sources";
import type { ChatTurn } from "@/lib/workspace-conversation";
import { StatusBadge } from "./status-badge";
import { useWorkspace } from "@/providers/workspace-provider";
import { useI18n } from "@/i18n/use-i18n";
import { StreamActivity } from "./stream-activity";
import { ChatFailureCard } from "./chat-failure-card";
import { GeneratedImageCard } from "./generated-image-card";
import type { SessionDeliverable } from "@/lib/session-deliverables";
import type { roundMetrics } from "@/lib/session-summary";
export function Message({ turn, agentName, index, images = [], metrics }: { turn: ChatTurn; agentName: string; index: number; images?: SessionDeliverable[]; metrics?: ReturnType<typeof roundMetrics> }) {
  const { t, locale } = useI18n(), w = useWorkspace();
  const [source, setSource] = useState<ChatSource | null>(null);
  const failed = turn.status === "failed" || turn.status === "unconfirmed";
  const date = (value: string) => <time dateTime={value}>{new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en")}</time>;
  return <article className="conversation-turn" aria-label={t("workspace.turn", { count: index + 1 })}>
    <div className="user-message"><div className="message-meta"><span className="message-author">{turn.communication ? <button type="button" onClick={() => void w.openSession(turn.communication!.sourceAgentId, turn.communication!.sourceSessionId)} title={turn.communication.sourceSessionId}>{t("workspace.fromSession", { id: turn.communication.sourceSessionId.slice(0, 8) })}</button> : t("workspace.you")}</span>{date(turn.sentAt)}</div><p>{turn.user}</p>{!!turn.attachments?.length && <div className="asset-uploads">{turn.attachments.map(item => <span className="asset-upload" key={item.versionId}><AssetFileIcon filename={item.name} />{item.name}</span>)}</div>}</div>
    <div className="assistant-message"><div className="message-meta"><span className="message-author">{agentName}</span>{turn.receivedAt && date(turn.receivedAt)}</div>
      {turn.stream && <StreamActivity stream={turn.stream} />}
      {turn.assistant?.trim() ? <Markdown sources={turn.sources} onSource={setSource}>{turn.assistant}</Markdown> :
        !failed && !(turn.stream && turn.status === "waiting") && <p className="message-pending">{t(turn.status === "completed" ? "rest.emptyReply" : turn.status === "stopped" ? "workspace.stoppedNotice" : turn.status === "waiting" ? "rest.waitingReply" : turn.status === "unconfirmed" ? "rest.unknown" : "rest.failedReply")}</p>}
      {turn.assistant?.trim() && turn.status === "stopped" && <p className="message-pending stream-incomplete">{t("workspace.stoppedNotice")}</p>}
      {failed && <ChatFailureCard turn={turn} canRestore={w.canSend} onRestore={() => w.setDraft(turn.user)} />}
    </div>
    {!!turn.sources?.length && <ChatSources sources={turn.sources} />}
    {source && <SourcePreview source={source} onDismiss={() => setSource(null)} />}
    {turn.status !== "waiting" && images.length > 0 && <div className="generated-images" aria-label={t("imageCard.title")}>{images.map(file => <GeneratedImageCard key={file.id} file={file} />)}</div>}
    <div className="execution-summary">{!(turn.stream && turn.status === "waiting") && <StatusBadge status={turn.status} />}
      <span>{turn.modelName}</span>{turn.elapsedMs !== null && <span>{t("rest.elapsed", { seconds: (turn.elapsedMs / 1000).toFixed(1) })}</span>}
      {metrics && <dl className="round-metrics" aria-label={t("roundMetrics.title")}>
        <div><dt>{t("roundMetrics.wait")}</dt><dd>{metrics.waitMs == null ? "—" : `${(metrics.waitMs / 1000).toFixed(1)} s`}</dd></div>
        <div><dt>{t("roundMetrics.tokens")}</dt><dd>{metrics.tokens?.toLocaleString(locale) ?? "—"}</dd></div>
        <div><dt>{t("roundMetrics.allTokens")}</dt><dd>{metrics.allTokens?.toLocaleString(locale) ?? "—"}</dd></div>
      </dl>}
    </div>
  </article>;
}
