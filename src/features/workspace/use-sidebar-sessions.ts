"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useBackendConnection } from "@/providers/backend-connection-provider";
import { useTasks } from "@/providers/task-workspace-provider";
import { useWorkspace } from "@/providers/workspace-provider";
import { BackendSessionsClient, type BackendSession } from "@/lib/backend-sessions";
import { sessionActivity, sessionCompletions, unreadSessions, readAgentSessions } from "@/lib/sidebar-sessions";

import { useUserSessionStatuses } from "@/providers/user-session-status-provider";

const noResults: Record<string, string> = {};

type Preferences = { scope: string; order: string[]; activity: Record<string, number>; completed: Record<string, string>; read: Record<string, string> };
const stringEntries = (value: unknown): Record<string, string> => value && typeof value === "object" && !Array.isArray(value)
  ? Object.fromEntries(Object.entries(value).filter(([, entry]) => typeof entry === "string")) : {};
export function useSidebarSessions() {
  const w = useWorkspace(), tasks = useTasks(), { client } = useBackendConnection();
  const userStatuses = useUserSessionStatuses();
  const liveResults = userStatuses.synced ? userStatuses.newResults : noResults;
  const pathname = usePathname();
  const viewing = !tasks.activeTaskId && pathname === "/workspace" && w.status === "ready" ? w.sessionId : null;
  const scope = client?.resourceScope ?? "";
  const key = `mindrails.workspace.sidebar:${scope}`;
  const [stored, setStored] = useState<Preferences>({ scope: "", order: [], activity: {}, completed: {}, read: {} });
  const [loaded, setLoaded] = useState<{ scope: string; client: typeof client; epoch: number; sessions: BackendSession[]; error: boolean } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      let order: string[] = [], activity: Record<string, number> = {}, completed: Record<string, string> = {}, read: Record<string, string> = {};
      try {
        const data = JSON.parse(localStorage.getItem(key) ?? "{}");
        if (Array.isArray(data.order)) order = data.order.filter((id: unknown) => typeof id === "string");
        // Discard legacy selection timestamps, but preserve the user's agent order.
        if (data.activityVersion === 2 && data.activity && typeof data.activity === "object") activity = Object.fromEntries(Object.entries(data.activity).filter(([, value]) => typeof value === "number" && Number.isFinite(value)) as [string, number][]);
        completed = stringEntries(data.completed); read = stringEntries(data.read);
      } catch { /* Local preferences are optional. */ }
      if (!cancelled) setStored({ scope, order, activity, completed, read });
    });
    return () => { cancelled = true; };
  }, [key, scope]);
  useEffect(() => {
    if (!client || w.agentsStatus !== "ready") return;
    const controller = new AbortController();
    void Promise.allSettled(w.agents.map(agent => new BackendSessionsClient(client).list(agent.id, controller.signal))).then(results => {
      if (!controller.signal.aborted) setLoaded({ scope, client, epoch: w.epoch, sessions: results.flatMap(result => result.status === "fulfilled" ? result.value : []), error: results.some(result => result.status === "rejected") });
    });
    return () => controller.abort();
  }, [client, scope, w.agents, w.agentsStatus, w.epoch, w.sessions, w.waiting, revision]);
  useEffect(() => {
    if (!scope) return;
    void Promise.resolve().then(() => setStored(previous => {
      if (previous.scope !== scope) return previous;
      const activity = sessionActivity(w.records, previous.activity);
      const completed = { ...sessionCompletions(w.records, previous.completed), ...liveResults };
      const read = viewing && completed[viewing] ? { ...previous.read, [viewing]: completed[viewing] } : previous.read;
      const changed = Object.entries(activity).some(([id, time]) => time !== previous.activity[id]) ||
        Object.entries(completed).some(([id, turn]) => turn !== previous.completed[id]) ||
        Object.entries(read).some(([id, turn]) => turn !== previous.read[id]);
      return changed ? { ...previous, activity, completed, read } : previous;
    }));
  }, [scope, w.records, viewing, stored.scope, liveResults]);
  useEffect(() => {
    if (stored.scope !== scope || !scope) return;
    try { localStorage.setItem(key, JSON.stringify({ ...stored, activityVersion: 2 })); } catch { /* Storage may be unavailable. */ }
  }, [stored, scope, key]);
  const activity = sessionActivity(w.records, stored.scope === scope ? stored.activity : {});
  const completed = { ...sessionCompletions(w.records, stored.scope === scope ? stored.completed : {}), ...liveResults };
  const unread = unreadSessions(completed, stored.scope === scope ? stored.read : {}, viewing);
  const running = userStatuses.synced
    ? new Set(Object.values(userStatuses.sessions).filter(s => s.state === "running").map(s => s.sessionId))
    : new Set(Object.entries(w.records).filter(([, record]) => record.turns.some(turn => turn.status === "waiting")).map(([identity]) => identity.split("/")[1]));
  const current = new Map((loaded?.client === client && loaded?.epoch === w.epoch ? loaded.sessions : []).map(session => [session.id, session]));
  // Active mutations and history restore are visible immediately, before the index refresh finishes.
  if (w.agentId && w.status === "ready") {
    for (const [id, session] of current) if (session.parentAgentId === w.agentId) current.delete(id);
    w.sessions.forEach(session => current.set(session.id, session));
  }
  const sessions = [...current.values()].filter(session => w.agents.some(agent => agent.id === session.parentAgentId));
  return { sessions, activity, unread, running, runtime: userStatuses.synced ? userStatuses.sessions : {}, statusPending: !!userStatuses.scope && !userStatuses.synced, error: loaded?.client === client && loaded?.epoch === w.epoch && loaded.error,
    order: stored.scope === scope ? stored.order : [], refresh: () => setRevision(value => value + 1),
    markAgentRead: (agentId: string) => setStored(previous => {
      if (previous.scope !== scope) return previous;
      const completed = { ...sessionCompletions(w.records, previous.completed), ...liveResults };
      const read = readAgentSessions(sessions, agentId, completed, previous.read);
      return { ...previous, completed, read };
    }),
    reorder: (order: string[]) => setStored(previous => previous.scope === scope ? { ...previous, order } : previous) };
}
