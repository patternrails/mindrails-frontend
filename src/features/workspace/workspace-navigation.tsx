"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Plus, Pencil, Copy, Trash2, Eye, GripVertical, ChevronDown, LoaderCircle, CheckCheck, ListTodo, CircleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Tooltip } from "@/components/ui/tooltip";
import { useTasks } from "@/providers/task-workspace-provider";
import { TaskDialog } from "./task-dialog";
import { TaskFeedback } from "./task-feedback";
import type { BackendTask } from "@/lib/backend-tasks";
import { useWorkspace } from "@/providers/workspace-provider";
import { useBackendAgents } from "@/providers/backend-agents-provider";
import { useI18n } from "@/i18n/use-i18n";
import { SidebarAgentDialog, type SidebarAgentDialog as AgentDialog } from "@/features/agents/sidebar-agent-dialog";
import { orderedAgents, moveAgent, recentSessions } from "@/lib/sidebar-sessions";
import type { useSidebarSessions } from "./use-sidebar-sessions";
import { SessionDialog } from "./session-dialog";
import { WorkspaceFeedback } from "./workspace-feedback";
import type { BackendSession } from "@/lib/backend-sessions";
import type { BackendAgent } from "@/lib/backend-agents";

type Dialog = { epoch: number; agentId: string; type: "create" | "edit" | "delete" | "fork"; sessionId?: string; taskId?: string } | null;
type Resource = { kind: "session"; item: BackendSession } | { kind: "task"; item: BackendTask };
function Action({ label, children, disabled, onClick }: { label: string; children: ReactNode; disabled?: boolean; onClick: () => void }) {
  return <Tooltip label={label}><button type="button" className="sidebar-action" aria-label={label} disabled={disabled} onClick={onClick}>{children}</button></Tooltip>;
}
export function WorkspaceNavigation({ index }: { index: ReturnType<typeof useSidebarSessions> }) {
  const w = useWorkspace(), a = useBackendAgents(), tasks = useTasks(), { t } = useI18n();
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null), [agentDialog, setAgentDialog] = useState<AgentDialog | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [recentsCollapsed, setRecentsCollapsed] = useState(false);
  const [moreRecents, setMoreRecents] = useState(0), [capacity, setCapacity] = useState(5);
  const recentList = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const list = recentList.current; if (!list) return;
    const observer = new ResizeObserver(() => setCapacity(Math.max(1, Math.floor(list.clientHeight / 44))));
    observer.observe(list); return () => observer.disconnect();
  }, []);
  const live = dialog?.epoch === w.epoch && dialog.agentId === w.agentId && (!dialog.sessionId || dialog.sessionId === w.sessionId) && (!dialog.taskId || dialog.taskId === tasks.activeTaskId) ? dialog : null;
  const blocked = w.busy || !!tasks.mutation || w.status === "unavailable" || w.agentsStatus !== "ready";
  const navigationBlocked = tasks.mutation !== null || w.mutation !== null || a.mutation !== null || w.status === "unavailable" || w.agentsStatus !== "ready";
  const agents = orderedAgents(w.agents, index.order);
  const recents: Resource[] = [...recentSessions(index.sessions, index.activity).map((item): Resource => ({ kind: "session", item })), ...tasks.tasks.map((item): Resource => ({ kind: "task", item }))];
  const recentTime = (entry: Resource) => Math.max(Date.parse(entry.item.updatedAt), Date.parse(entry.item.createdAt),
    entry.kind === "session" ? index.activity[entry.item.id] ?? 0 : Date.parse(tasks.executions[entry.item.id]?.[0]?.createdAt ?? "") || 0);
  recents.sort((a, b) => recentTime(b) - recentTime(a));
  const title = (session: BackendSession) => session.name?.trim() || t("workspace.newSession");
  async function selectSession(agentId: string, sessionId?: string) {
    if (await w.openSession(agentId, sessionId)) { tasks.closeWorkspace(); router.push("/workspace"); }
  }
  async function open(type: NonNullable<Dialog>["type"], agentId: string, sessionId?: string) {
    w.clearError();
    if (await w.openSession(agentId, sessionId)) setDialog({ type, epoch: w.epoch, agentId, sessionId });
  }
  function openAgent(type: AgentDialog["type"], agent?: BackendAgent) {
    a.clearMutationError();
    if (agent && (type === "edit" || type === "view")) void a.select(agent.id);
    setAgentDialog({ type, epoch: a.epoch, agent });
  }
  function sessionRow(session: BackendSession) {
    const agent = agents.find(agent => agent.id === session.parentAgentId);
    const running = index.running.has(session.id), unread = index.unread.has(session.id);
    const runtime = index.runtime[session.id];
    const failed = runtime?.state === "doomed" || runtime?.lastFinished?.outcome === "failed";
    const statusLabel = runtime ? runtime.state === "running" ? t("sidebar.queued", { count: runtime.queuedCount })
      : t(runtime.state === "doomed" || failed ? "status.failed" : runtime.lastFinished?.outcome === "cancelled" ? "status.stopped" : runtime.lastFinished ? "status.completed" : "sidebar.idle") : "";
    return <li className="sidebar-session" key={session.id}>
      <button type="button" className="sidebar-session-link" disabled={navigationBlocked} aria-current={!tasks.activeTaskId && w.sessionId === session.id ? "true" : undefined}
        title={`${title(session)}${agent ? ` · ${agent.name}` : ""}${statusLabel ? ` · ${statusLabel}` : ""}`} onClick={() => void selectSession(session.parentAgentId, session.id)}>
        {running ? <LoaderCircle size={14} className="sidebar-session-indicator spinning" role="img" aria-label={t("sidebar.working")} /> :
          failed ? <CircleAlert size={14} className="sidebar-session-indicator" role="img" aria-label={t("status.failed")} /> :
          unread ? <span className="sidebar-session-indicator sidebar-session-unread" role="img" aria-label={t("sidebar.unread")} /> : null}
        <span className="sidebar-session-label"><span className="sidebar-session-name">{title(session)}</span></span>
      </button>
      <div className="sidebar-hover-actions">
        <Action label={t("rest.edit")} disabled={blocked || running} onClick={() => void open("edit", session.parentAgentId, session.id)}><Pencil size={14} /></Action>
        <Action label={t("rest.fork")} disabled={blocked || running} onClick={() => void open("fork", session.parentAgentId, session.id)}><Copy size={14} /></Action>
        <Action label={t("workspace.deleteSession")} disabled={blocked || running} onClick={() => void open("delete", session.parentAgentId, session.id)}><Trash2 size={14} /></Action>
      </div>
    </li>;
  }
  async function selectTask(task: BackendTask, type?: "edit" | "delete") {
    if (!await w.openSession(task.parentAgentId)) return;
    tasks.selectTask(task.id);
    if (type) { tasks.clearError(); setDialog({ type, epoch: w.epoch, agentId: task.parentAgentId, taskId: task.id }); }
    else router.push("/workspace");
  }
  function taskRow(task: BackendTask) {
    const running = !!tasks.active[task.id], label = task.name?.trim() || t("tasks.new");
    return <li className="sidebar-session sidebar-task" key={`task:${task.id}`}>
      <button type="button" className="sidebar-session-link" disabled={navigationBlocked} aria-current={tasks.activeTaskId === task.id ? "true" : undefined}
        title={label} onClick={() => void selectTask(task)}>
        {running && <LoaderCircle size={14} className="sidebar-session-indicator spinning" role="img" aria-label={t("sidebar.working")} />}
        <span className="sidebar-session-label"><span className="sidebar-session-name">{label}</span></span>
        <ListTodo size={14} className="sidebar-task-icon" role="img" aria-label={t("tasks.task")} />
      </button>
      <div className="sidebar-hover-actions"><Action label={t("tasks.edit")} disabled={blocked} onClick={() => void selectTask(task, "edit")}><Pencil size={14} /></Action>
        <Action label={t("tasks.delete")} disabled={blocked || running} onClick={() => void selectTask(task, "delete")}><Trash2 size={14} /></Action></div>
    </li>;
  }
  const resourceRow = (resource: Resource) => resource.kind === "task" ? taskRow(resource.item) : sessionRow(resource.item);
  return <section className="workspace-navigation workspace-tree" aria-label={t("workspace.selection")}>
    {index.statusPending && <p className="selection-notice" role="status">{t("sidebar.statusPending")}</p>}
    <section className="sidebar-agents-panel" aria-label={t("nav.agents")}>
      <div className="sidebar-panel-heading"><h2>{t("sidebar.agents")}</h2><Action label={t("agents.create")} disabled={blocked} onClick={() => openAgent("create")}><Plus size={17} /></Action></div>
      <ul className="sidebar-agent-tree">{agents.map(agent => {
        const sessions = index.sessions.filter(session => session.parentAgentId === agent.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        const resources: Resource[] = [...sessions.map((item): Resource => ({ kind: "session", item })), ...tasks.tasks.filter(task => task.parentAgentId === agent.id).map((item): Resource => ({ kind: "task", item }))];
        resources.sort((a, b) => Date.parse(b.item.createdAt) - Date.parse(a.item.createdAt));
        const isCollapsed = !!collapsed[agent.id];
        const agentRunning = a.runningAgentIds.includes(agent.id);
        const toggleLabel = t(isCollapsed ? "sidebar.expandAgent" : "sidebar.collapseAgent", { name: agent.name });
        return <li className="sidebar-agent" key={agent.id} draggable={!blocked} onDragStart={event => { event.dataTransfer.setData("application/x-mindrails-agent", agent.id); event.dataTransfer.effectAllowed = "move"; }}
          onDragOver={event => { if (event.dataTransfer.types.includes("application/x-mindrails-agent")) event.preventDefault(); }}
          onDrop={event => { const source = event.dataTransfer.getData("application/x-mindrails-agent"); if (!source) return; event.preventDefault(); event.stopPropagation(); index.reorder(moveAgent(agents.map(agent => agent.id), source, agent.id)); }}>
          <div className="sidebar-agent-heading"><button type="button" className="sidebar-agent-grip" aria-label={t("sidebar.reorderAgent")} title={t("sidebar.reorderAgent")} onKeyDown={event => {
            if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) { const at = agents.findIndex(item => item.id === agent.id), to = at + (event.key === "ArrowUp" ? -1 : 1); if (agents[to]) { event.preventDefault(); index.reorder(moveAgent(agents.map(item => item.id), agent.id, agents[to].id)); } }
          }}><GripVertical size={13} /></button>
            <button type="button" className="sidebar-action sidebar-agent-toggle" aria-label={toggleLabel} title={toggleLabel}
              aria-expanded={!isCollapsed} aria-controls={`agent-sessions-${agent.id}`}
              onClick={() => setCollapsed(previous => ({ ...previous, [agent.id]: !previous[agent.id] }))}>
              <ChevronDown size={16} aria-hidden="true" />
            </button>
            <button className="sidebar-agent-name" type="button" title={agent.name} disabled={navigationBlocked} onClick={() => void selectSession(agent.id)}>{agent.name}</button>
            <div className="sidebar-hover-actions"><Action label={t("sidebar.viewAgent")} disabled={blocked} onClick={() => openAgent("view", agent)}><Eye size={14} /></Action><Action label={t("agents.editAgent")} disabled={blocked || agentRunning} onClick={() => openAgent("edit", agent)}><Pencil size={14} /></Action><Action label={t("agents.deleteAgent")} disabled={blocked || agentRunning} onClick={() => openAgent("delete", agent)}><Trash2 size={14} /></Action><Action label={t("sidebar.readAll")} disabled={!sessions.some(session => index.unread.has(session.id))} onClick={() => index.markAgentRead(agent.id)}><CheckCheck size={14} /></Action></div>
            <Action label={t("tasks.createResource")} disabled={blocked} onClick={() => void open("create", agent.id)}><Plus size={16} /></Action>
          </div>
          <ul id={`agent-sessions-${agent.id}`} className="sidebar-agent-sessions" hidden={isCollapsed}>{(expanded[agent.id] ? resources : resources.slice(0, 5)).map(resourceRow)}</ul>
          {!isCollapsed && resources.length > 5 && <button type="button" className="sidebar-show-more" onClick={() => setExpanded(previous => ({ ...previous, [agent.id]: !previous[agent.id] }))}>{t(expanded[agent.id] ? "sidebar.showLess" : "sidebar.showMore")}<ChevronDown size={13} /></button>}
        </li>;
      })}</ul>
      {w.agentsStatus === "loading" && <p className="selection-notice" role="status">{t("rest.loading")}</p>}
      {!agents.length && w.agentsStatus === "ready" && <p className="selection-notice">{t("workspace.noAgentsYet")}</p>}
    </section>
    <section className="sidebar-recents-panel" aria-label={t("sidebar.recents")}>
      <div className="sidebar-panel-heading">
        <h2 className="sidebar-recents-title">
          <button type="button" className="sidebar-panel-toggle" aria-expanded={!recentsCollapsed} aria-controls="sidebar-recents-content"
            aria-label={t(recentsCollapsed ? "sidebar.expandRecents" : "sidebar.collapseRecents")}
            onClick={() => setRecentsCollapsed(value => !value)}>
            {t("sidebar.recents")}<ChevronDown size={16} aria-hidden="true" />
          </button>
        </h2>
      </div>
      <div id="sidebar-recents-content" className={`sidebar-recents-content${recentsCollapsed ? " is-collapsed" : ""}`}>
        <ul className="sidebar-recents-list" ref={recentList}>{recents.slice(0, capacity + moreRecents).map(resourceRow)}</ul>
        {recents.length > capacity + moreRecents && <button type="button" className="sidebar-show-more" onClick={() => setMoreRecents(value => value + 5)}>{t("sidebar.showMore")}<ChevronDown size={13} /></button>}
        {(index.error || tasks.status === "error") && <button type="button" className="sidebar-show-more" onClick={() => { index.refresh(); void tasks.refresh(); }}>{t("agents.retry")}</button>}
      </div>
    </section>
    {live?.taskId && live.type === "edit" && tasks.activeTask && <TaskDialog key={`${tasks.epoch}-${live.taskId}`} task={tasks.activeTask} onDismiss={() => setDialog(null)} />}
    {live?.taskId && live.type === "delete" && <Modal title={t("tasks.delete")} description={t("tasks.deleteHint")} dismissDisabled={!!tasks.mutation} onDismiss={() => setDialog(null)}>
      <TaskFeedback /><div className="modal-actions"><Button disabled={!!tasks.mutation} onClick={() => setDialog(null)}>{t("common.cancel")}</Button><Button variant="danger" disabled={!!tasks.mutation || !!tasks.active[live.taskId]} onClick={() => void tasks.remove(live.taskId!).then(ok => { if (ok) setDialog(null); })}>{t("tasks.delete")}</Button></div>
    </Modal>}
    {agentDialog && <SidebarAgentDialog dialog={agentDialog} onDismiss={() => setAgentDialog(null)} />}
    {live && !live.taskId && (live.type === "create" || live.type === "edit") && <SessionDialog key={`${live.epoch}-${live.type}-${live.sessionId ?? live.agentId}`} session={live.type === "edit" ? w.activeSession! : undefined} onDismiss={() => setDialog(null)} onCreated={() => { setCollapsed(previous => ({ ...previous, [live.agentId]: false })); setExpanded(previous => ({ ...previous, [live.agentId]: true })); router.push("/workspace"); }} />}
    {live && !live.taskId && (live.type === "delete" || live.type === "fork") && <Modal title={t(live.type === "fork" ? "rest.fork" : "workspace.deleteSessionTitle")} description={t(live.type === "fork" ? "rest.forkHint" : "rest.deleteHint")} dismissDisabled={w.busy || w.activeWaiting} onDismiss={() => setDialog(null)}>
      <WorkspaceFeedback /><div className="modal-actions"><Button disabled={w.busy} onClick={() => setDialog(null)}>{t("common.cancel")}</Button><Button variant={live.type === "fork" ? "primary" : "danger"} disabled={w.busy || w.activeWaiting || w.uncertain} onClick={async () => { const success = live.type === "fork" ? await w.forkSession() : await w.deleteSession(); if (success) { setDialog(null); index.refresh(); } }}>{t(live.type === "fork" ? "rest.fork" : "workspace.deleteSession")}</Button></div>
    </Modal>}
  </section>;
}
