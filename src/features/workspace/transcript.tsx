"use client";

import { useEffect, useRef } from "react";
import { MessageSquare } from "lucide-react";
import type { BackendSession } from "@/lib/backend-sessions";
import type { ConversationRecord } from "@/lib/workspace-conversation";
import { Message } from "./message";
import { useI18n } from "@/i18n/use-i18n";
import { imagesByTurn } from "@/lib/turn-images";
import { roundMetrics } from "@/lib/session-summary";
import type { SessionDeliverable } from "@/lib/session-deliverables";
export function Transcript({ session, record, agentName, images = [] }: { session: BackendSession; record: ConversationRecord; agentName: string; images?: SessionDeliverable[] }) {
  const { t } = useI18n(), ref = useRef<HTMLDivElement>(null), followLatest = useRef(true);
  const previous = useRef(session.id), latest = record.turns.at(-1);
  const previousCount = useRef(record.turns.length);
  const groupedImages = imagesByTurn(record.turns, images);
  useEffect(() => {
    const container = ref.current;
    if (container && record.turns.length === 0) {
      container.scrollTop = 0; followLatest.current = true;
    } else if (container && (previous.current !== session.id || followLatest.current ||
      (latest?.status === "waiting" && record.turns.length > previousCount.current))) {
      container.scrollTop = container.scrollHeight; followLatest.current = true;
    }
    previous.current = session.id;
    previousCount.current = record.turns.length;
  }, [session.id, record.turns.length, latest?.assistant, latest?.status, latest?.stream, images.length]);
  return <div className="transcript" ref={ref} role="region" aria-label={t("workspace.conversation")} tabIndex={0}
    onScroll={(event) => { const c = event.currentTarget; followLatest.current = c.scrollHeight - c.scrollTop - c.clientHeight < 80; }}>
    {record.turns.length === 0 ? <div className="conversation-empty"><MessageSquare size={28} aria-hidden="true" />
      <h2>{t("workspace.start")}</h2><p>{t("rest.firstMessage", { name: agentName })}</p></div> :
      record.turns.map((turn, index) => <Message key={turn.id} turn={turn} index={index} agentName={agentName}
        images={groupedImages.get(turn.id)} metrics={roundMetrics(record.turns, index)} />)}
  </div>;
}
