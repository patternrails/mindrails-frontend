"use client";

import { Brain, ChevronDown, LoaderCircle, Wrench } from "lucide-react";
import type { SessionStream, StreamMessage, StreamTool } from "@/lib/session-stream";
import { streamIntermediateMessages, streamTerminal } from "@/lib/session-stream";
import { toolDisplayName, toolArgumentsPreview, toolPreview, toolRounds } from "@/lib/tool-presentation";
import { useI18n } from "@/i18n/use-i18n";
import { StatusBadge } from "./status-badge";
import { useEffect, useRef, useState } from "react";

function StreamingThinking({ message, live, first }: { message: StreamMessage; live: boolean; first: boolean }) {
  const { t } = useI18n(), ref = useRef<HTMLDivElement>(null);
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? first;
  useEffect(() => { if (open && live && ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [message.thinking, open, live]);
  return <details className="stream-thinking" open={open}>
    <summary onClick={event => { event.preventDefault(); setChoice(!open); }}><ChevronDown size={12} aria-hidden="true" />{t("details.thinking")}</summary>
    <div ref={ref} className="stream-thinking-text">{message.thinking}</div>
  </details>;
}

function ThinkingCard({ messages, phase }: { messages: StreamMessage[]; phase: SessionStream["phase"] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const live = !streamTerminal(phase);
  const status = phase === "thinking" || phase === "stopped" || phase === "failed" || phase === "unconfirmed" ? phase : "completed";
  return <details className="activity-panel thinking-card" open={open}>
    <summary onClick={event => { event.preventDefault(); setOpen(!open); }}><ChevronDown size={14} aria-hidden="true" /><Brain size={13} aria-hidden="true" />
      <span className={status === "thinking" ? "activity-working-text" : undefined}>{t("details.thinking")}</span>
      <StatusBadge status={status} />
    </summary>
    <div className="thinking-items">{messages.map((message, index) => <StreamingThinking key={message.id} message={message} live={live && index === 0} first={index === 0} />)}</div>
  </details>;
}

export const streamPhaseLabels = {
  queued: "stream.queued", connecting: "stream.connecting", starting: "stream.starting", thinking: "stream.thinking", answering: "stream.answering",
  working: "stream.working", cancelling: "stream.cancelling", completed: "status.completed", stopped: "status.stopped",
  failed: "status.failed", unconfirmed: "status.unconfirmed",
} as const;

function StreamToolCard({ tool, first }: { tool: StreamTool; first: boolean }) {
  const { t } = useI18n();
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? first;
  const name = toolDisplayName(tool.name) || t("stream.tool");
  const argumentsText = toolArgumentsPreview(tool);
  const result = ["write", "write_file", "edit", "edit_file"].includes(tool.name) ? null : tool.result;
  return <details className="stream-tool-row" open={open}>
    <summary onClick={event => { event.preventDefault(); setChoice(!open); }}>
      <ChevronDown size={12} aria-hidden="true" /><span title={tool.name}>{name}</span><StatusBadge status={tool.status} />
    </summary>
    <div className="tool-payload">
      {argumentsText && <><h4>{t("tool.arguments")}</h4><pre>{argumentsText}</pre></>}
      {!argumentsText && ["preparing", "pending"].includes(tool.status) && <p>{t("stream.preparing")}</p>}
      {result !== null && result !== "" && <><h4>{t("tool.result")}</h4><pre>{toolPreview(result)}</pre></>}
      {tool.error && <><h4>{t("tool.error")}</h4><p className="tool-error">{toolPreview(tool.error)}</p></>}
      {tool.durationMs !== null && <p>{t("stream.duration", { count: tool.durationMs })}</p>}
    </div>
  </details>;
}

type ToolRound = ReturnType<typeof toolRounds>[number];

function ToolRoundSummary({ group, panel = false }: { group: ToolRound; panel?: boolean }) {
  const { t } = useI18n();
  const working = panel && (group.status === "preparing" || group.status === "running");
  return <><ChevronDown size={panel ? 14 : 12} aria-hidden="true" />{panel && <Wrench size={13} aria-hidden="true" />}
      <span className={working ? "activity-working-text" : undefined}>{t(panel ? "stream.toolRound" : "stream.round", { round: group.round })}</span><span className="count-badge">{group.tools.length}</span>
      <span className={`tool-round-latest${working ? " activity-working-text" : ""}`} title={group.active?.name ?? group.tools[0]?.name}>{toolDisplayName(group.active?.name ?? group.tools[0]?.name ?? "")}</span>
      <StatusBadge status={group.status} />
  </>;
}

function ToolRoundCard({ group, first }: { group: ToolRound; first: boolean }) {
  const { t } = useI18n();
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? first;
  return <details className="tool-round" open={open}>
    <summary onClick={event => { event.preventDefault(); setChoice(!open); }}><ToolRoundSummary group={group} /></summary>
    <div className="tool-round-items" aria-label={t("stream.toolCount", { count: group.tools.length })}>
      {group.tools.map((tool,index) => <StreamToolCard key={tool.id} tool={tool} first={index === 0} />)}
    </div>
  </details>;
}

function ToolExecutionCard({ groups }: { groups: ToolRound[] }) {
  return <details className="activity-panel tool-execution-card">
    <summary><ToolRoundSummary group={groups[0]} panel /></summary>
    <div className="tool-execution-rounds">{groups.map((group, index) => <ToolRoundCard key={group.round} group={group} first={index === 0} />)}</div>
  </details>;
}

export function StreamActivity({ stream }: { stream: SessionStream }) {
  const { t } = useI18n();
  const live = !streamTerminal(stream.phase);
  const thinking = stream.messages.filter(message => message.thinking).sort((a, b) => b.round - a.round);
  const groups = toolRounds(stream.tools);
  const intermediate = streamIntermediateMessages(stream);
  return <div className="stream-activity">
    {live && <div className="stream-status" role="status" aria-live="polite"><LoaderCircle size={13} className="spinning" aria-hidden="true" />
      <span>{t(streamPhaseLabels[stream.phase])}</span>
    </div>}
    {!!thinking.length && <ThinkingCard messages={thinking} phase={stream.phase} />}
    {!!groups.length && <ToolExecutionCard groups={groups} />}
    {!!intermediate.length && <section className="thinking-response" aria-label={t("stream.thinkingResponse")}>
      <h3>{t("stream.thinkingResponse")}</h3>
      {intermediate.map(message => <p key={message.id}><em>{message.answer}</em></p>)}
    </section>}
  </div>;
}
