"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { FileText, RefreshCw, Trash2, Upload } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Markdown } from "@/components/content/markdown";
import { useI18n } from "@/i18n/use-i18n";
import { BackendClientError, type BackendClient } from "@/lib/backend-client";
import { parseSkillDetail, parseSkillPage, skillPath, uploadSkill, type Skill } from "@/lib/backend-skills";
import { useArchiveRequest } from "@/features/settings/use-archive-request";

export function SkillsSettings() {
  const { t } = useI18n();
  const [page, setPage] = useState(0), [search, setSearch] = useState("");
  const list = useArchiveRequest(`api/skills?page=${page}&size=20&q=${encodeURIComponent(search)}`, parseSkillPage);
  const { client } = list;
  const [dialog, setDialog] = useState<{ client: BackendClient; skill: Skill; mode: "detail" | "delete" } | null>(null);
  const active = dialog?.client === client ? dialog : null;
  const detail = useArchiveRequest(active?.mode === "detail" ? `${skillPath(active.skill.name)}/detail` : null, parseSkillDetail);
  const [result, setResult] = useState<{ client: BackendClient; busy: boolean; error?: string } | null>(null);
  const operation = result?.client === client ? result : null;
  const [upload, setUpload] = useState<{ client: BackendClient; busy?: boolean; name?: string; error?: string } | null>(null);
  const uploadStatus = upload?.client === client ? upload : null;
  const fileInput = useRef<HTMLInputElement>(null);
  const life = useRef<AbortController | null>(null), pending = useRef(false);
  useEffect(() => { const controller = new AbortController(); life.current = controller; pending.current = false; return () => controller.abort(); }, [client]);
  function open(skill: Skill, mode: "detail" | "delete") { if (client) { setResult(null); setDialog({ client, skill, mode }); } }
  async function remove() {
    const signal = life.current?.signal;
    if (!client || !active || !signal || pending.current) return;
    pending.current = true; setResult({ client, busy: true });
    try {
      await client.request(skillPath(active.skill.name), { method: "DELETE", signal });
      if (!signal.aborted) { setDialog(null); setResult({ client, busy: false }); setPage(0); list.retry(); }
    } catch (cause) {
      if (!signal.aborted) { setResult({ client, busy: false, error: t(cause instanceof BackendClientError && cause.status === 409 ? "skills.readOnly" : "skills.deleteFailed") }); list.retry(); }
    } finally { if (!signal.aborted) pending.current = false; }
  }

  async function uploadZip(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    const signal = life.current?.signal;
    if (!client || !file || !signal || pending.current) return;

    if (!/\.zip$/i.test(file.name) || file.size === 0 || file.size > 25 * 1024 * 1024) {
      setUpload({ client, error: t("skills.uploadInvalid") });
      return;
    }

    pending.current = true;
    setUpload({ client, busy: true });
    try {
      const skill = await uploadSkill(client, file, signal);
      if (signal.aborted) return;
      setUpload({ client, name: skill.name });
      setPage(0);
      setSearch("");
      list.retry();
    } catch (cause) {
      if (signal.aborted) return;
      const status = cause instanceof BackendClientError ? cause.status : undefined;
      const error = status === 400 ? t("skills.uploadRejected")
        : status === 413 ? t("skills.uploadInvalid") : t("skills.uploadFailed");
      setUpload({ client, error });
    } finally {
      if (!signal.aborted) pending.current = false;
    }
  }

  return <div className="mcp-settings skills-settings">
    <div className="archive-toolbar">
      <label>{t("skills.search")} <input className="agent-input" maxLength={1024} value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /></label>
      <input ref={fileInput} type="file" accept=".zip,application/zip" onChange={uploadZip} hidden />
      <Button disabled={!client || !!operation?.busy || !!uploadStatus?.busy} onClick={() => fileInput.current?.click()}>
        <Upload aria-hidden="true" size={16} /> {t(uploadStatus?.busy ? "skills.uploading" : "skills.upload")}
      </Button>
      <IconButton icon={RefreshCw} label={t("archive.refresh")} disabled={!client || list.loading} onClick={list.retry} />
    </div>
    {uploadStatus?.error && <p role="alert" className="form-error">{uploadStatus.error}</p>}
    {uploadStatus?.name && <p role="status">{t("skills.uploaded", { name: uploadStatus.name })}</p>}
    {!client && <p role="status">{t("skills.notConnected")}</p>}{list.loading && <p role="status">{t("skills.loading")}</p>}{list.error && <p className="form-error" role="alert">{t("skills.error")}</p>}
    {list.data && <><ul className="mcp-list">{list.data.items.length === 0 && <li>{t("skills.empty")}</li>}{list.data.items.map(skill => <li key={skill.name}>
      <div className="mcp-server-heading"><strong>{skill.name}</strong></div><p className="skill-description">{skill.description}</p><div className="mcp-actions"><IconButton icon={FileText} label={t("skills.details")} onClick={() => open(skill, "detail")} /><IconButton icon={Trash2} label={t("skills.delete")} variant="danger" disabled={!skill.root || !!uploadStatus?.busy} onClick={() => open(skill, "delete")} /></div>
    </li>)}</ul><div className="archive-toolbar"><Button disabled={page === 0 || list.loading} onClick={() => setPage(n => n - 1)}>{t("skills.previous")}</Button><span>{t("skills.page", { page: page + 1, total: list.data.total })}</span><Button disabled={!list.data.hasNext || list.loading} onClick={() => setPage(n => n + 1)}>{t("skills.next")}</Button></div></>}
    {active && <Modal title={active.mode === "delete" ? t("skills.delete") : active.skill.name} description={active.mode === "delete" ? active.skill.name : active.skill.description} onDismiss={() => setDialog(null)} dismissDisabled={!!operation?.busy} wide={active.mode === "detail"}>
      {operation?.error && <p className="form-error" role="alert">{operation.error}</p>}
      {active.mode === "detail" ? <>{detail.loading && <p role="status">{t("skills.loading")}</p>}{detail.error && <p role="alert" className="form-error">{t("skills.error")}</p>}{detail.data?.skill.name === active.skill.name && <div className="skills-detail"><Markdown>{detail.data.content}</Markdown>{!!detail.data.resources.length && <details><summary>{t("skills.resources")} ({detail.data.resources.length})</summary><ul>{detail.data.resources.map(file => <li key={file}><code>{file}</code></li>)}</ul></details>}</div>}</> : <><p>{t("skills.deleteConfirm")}</p><div className="modal-actions"><Button disabled={!!operation?.busy} onClick={() => setDialog(null)}>{t("knowledge.cancel")}</Button><Button variant="danger" disabled={!!operation?.busy} onClick={() => void remove()}>{t("skills.delete")}</Button></div></>}
    </Modal>}
  </div>;
}
