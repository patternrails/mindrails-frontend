"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useArchiveRequest } from "@/features/settings/use-archive-request";
import { BackendClientError } from "@/lib/backend-client";
import { knowledgePath, parseAssignmentPage, type KnowledgeAssignment } from "@/lib/backend-knowledge";
import { useI18n } from "@/i18n/use-i18n";

export function KnowledgeAssignments({ knowledgeBaseId, name, onDismiss }: { knowledgeBaseId: string; name: string; onDismiss: () => void }) {
  const { t } = useI18n();
  const [page, setPage] = useState(0);
  const list = useArchiveRequest(`${knowledgePath(knowledgeBaseId)}/agents?page=${page}&size=20`, parseAssignmentPage);
  const { client } = list;
  const [operation, setOperation] = useState<{ client: typeof client; busy: boolean; error?: string } | null>(null);
  const active = operation?.client === client ? operation : null;
  const life = useRef<AbortController | null>(null), pending = useRef(false);
  useEffect(() => { const c = new AbortController(); life.current = c; pending.current = false; return () => c.abort(); }, [client, knowledgeBaseId]);
  async function toggle(item: KnowledgeAssignment) {
    const signal = life.current?.signal;
    if (!client || !signal || pending.current) return;
    pending.current = true; setOperation({ client, busy: true });
    try {
      await client.request(`${knowledgePath(knowledgeBaseId)}/agents/${item.agentId}`, { method: "PUT", signal, json: { assigned: !item.assigned, version: item.agentVersion } });
      if (!signal.aborted) { setOperation({ client, busy: false }); list.retry(); }
    } catch (cause) {
      if (!signal.aborted) { setOperation({ client, busy: false, error: t(cause instanceof BackendClientError && cause.status === 409 ? "knowledge.conflict" : "knowledge.uncertain") }); list.retry(); }
    } finally { pending.current = false; }
  }
  return <Modal title={t("knowledge.assign")} description={name} onDismiss={onDismiss} dismissDisabled={!!active?.busy}>
    <p className="local-note">{t("knowledge.assignHint")}</p>
    {(active?.error || list.error) && <p role="alert" className="form-error">{active?.error ?? t("knowledge.error")}</p>}
    {list.loading && <p role="status">{t("knowledge.loading")}</p>}
    {list.data && <ul className="mcp-list assignment-list">{!list.data.items.length && <li>{t("knowledge.noAgents")}</li>}{list.data.items.map(item => <li key={item.agentId}>
      <label><input type="checkbox" checked={item.assigned} disabled={!!active?.busy} onChange={() => void toggle(item)} /><span><strong>{item.name}</strong><small>{item.agentId.slice(0, 8)}</small></span></label>
    </li>)}</ul>}
    <div className="modal-actions"><Button disabled={page === 0 || !!active?.busy || list.loading} onClick={() => setPage(p => p - 1)}>{t("skills.previous")}</Button><span>{page + 1}</span><Button disabled={!list.data?.hasNext || !!active?.busy || list.loading} onClick={() => setPage(p => p + 1)}>{t("skills.next")}</Button><Button variant="primary" disabled={!!active?.busy} onClick={onDismiss}>{t("common.closeDialog")}</Button></div>
  </Modal>;
}
