"use client";

import { useRef, useState } from "react";
import { FileText, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/i18n/use-i18n";
import type { KnowledgeConfig } from "@/lib/backend-knowledge";
import { knowledgeFileAccept, knowledgeFileDefaults, knowledgeFileError } from "@/lib/knowledge-upload";

type DialogProps = { busy: boolean; error?: string; onDismiss: () => void };
export type KnowledgeBaseDraft = { name: string; description: string; embeddingProvider: string };
export type KnowledgeSourceDraft = { key: string; title: string; tags: string[]; content: string; file: File | null };

export function KnowledgeCreateDialog({ config, busy, error, onDismiss, onSubmit }: DialogProps & {
  config: KnowledgeConfig; onSubmit: (draft: KnowledgeBaseDraft) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [provider, setProvider] = useState(config.providers.find(p => p.name === config.defaultEmbeddingProvider)?.name ?? config.providers[0]?.name ?? "");
  return <Modal title={t("knowledge.create")} description={t("knowledge.createHint")} onDismiss={onDismiss} dismissDisabled={busy}>
    <form onSubmit={e => { e.preventDefault(); if (!busy && name.trim() && provider) onSubmit({ name: name.trim(), description, embeddingProvider: provider }); }}>
      <fieldset className="agent-form knowledge-form" disabled={busy}>
        <label className="form-field">{t("knowledge.name")}<input className="agent-input" required maxLength={160} value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="form-field">{t("knowledge.description")}<textarea className="agent-textarea" maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} /></label>
        <label className="form-field">{t("knowledge.embedding")}<select className="agent-select" required value={provider} onChange={e => setProvider(e.target.value)}>{config.providers.map(p => <option key={p.name} value={p.name}>{p.name} · {p.modelName} · {p.dimensions}</option>)}</select></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><Button onClick={onDismiss}>{t("knowledge.cancel")}</Button><Button type="submit" variant="primary" disabled={busy || !name.trim() || !provider}>{t(busy ? "knowledge.submitting" : "knowledge.create")}</Button></div>
      </fieldset>
    </form>
  </Modal>;
}

export function KnowledgeSourceDialog({ baseName, mode, busy, error, onDismiss, onSubmit }: DialogProps & {
  baseName: string; mode: "file" | "text"; onSubmit: (draft: KnowledgeSourceDraft) => void;
}) {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [key, setKey] = useState(""), [title, setTitle] = useState(""), [tags, setTags] = useState(""), [content, setContent] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const parseTags = () => [...new Set(tags.split(/[,，]/).map(tag => tag.trim()).filter(Boolean))];
  const parsedTags = parseTags();
  const tagsValid = parsedTags.length <= 20 && parsedTags.every(tag => tag.length <= 64);
  function choose(files: File[]) {
    if (busy) return;
    setDragging(false);
    if (files.length !== 1) { setFileError(t("knowledge.oneFile")); return; }
    const next = files[0];
    const invalid = knowledgeFileError(next);
    if (invalid) { setFileError(t(invalid === "size" ? "knowledge.fileTooLarge" : "knowledge.unsupportedFile")); return; }
    const defaults = knowledgeFileDefaults(next.name);
    setFile(next); setKey(defaults.key); setTitle(defaults.title); setTags(defaults.tags.join(", ")); setFileError(null);
  }
  return <Modal title={t(mode === "file" ? "knowledge.file" : "knowledge.text")} description={baseName} onDismiss={onDismiss} dismissDisabled={busy}>
    <form onSubmit={e => { e.preventDefault(); if (!busy && !fileError && tagsValid && title.length <= 160 && (mode === "text" || file)) onSubmit({ key, title, tags: parsedTags, content, file }); }}>
      <fieldset className="agent-form knowledge-form" disabled={busy}>
        {mode === "file" && <>
          <input ref={input} className="knowledge-file-input" type="file" accept={knowledgeFileAccept} aria-label={t("knowledge.file")} tabIndex={-1}
            onChange={e => { if (e.target.files?.length) choose(Array.from(e.target.files)); e.target.value = ""; }} />
          <button type="button" className="knowledge-dropzone" data-dragging={dragging} aria-describedby="knowledge-file-formats"
            onClick={() => input.current?.click()}
            onDragEnter={e => { e.preventDefault(); if (!busy) setDragging(true); }}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = busy ? "none" : "copy"; }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
            onDrop={e => { e.preventDefault(); choose(Array.from(e.dataTransfer.files)); }}>
            {file ? <FileText size={25} aria-hidden="true" /> : <UploadCloud size={25} aria-hidden="true" />}
            <strong>{file ? file.name : t("knowledge.dropFile")}</strong>
            <span>{file ? `${(file.size / 1024).toFixed(1)} KB · ${t("knowledge.changeFile")}` : t("knowledge.browseFile")}</span>
          </button>
          <p id="knowledge-file-formats" className="field-hint">{t("knowledge.formats")}</p>
          {fileError && <p className="form-error" role="alert">{fileError}</p>}
          {file && <p className="field-hint" role="status">{t("knowledge.metadataHint")}</p>}
        </>}
        {(mode === "text" || file) && <>
          <label className="form-field">{t("knowledge.key")}<input className="agent-input" required pattern="[a-z0-9][a-z0-9._-]*" maxLength={128} value={key} onChange={e => setKey(e.target.value)} /></label>
          <label className="form-field">{t("knowledge.title")}<input className="agent-input" required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} /></label>
          {title.length > 160 && <p className="form-error" role="alert">{t("knowledge.titleLimit")}</p>}
          <label className="form-field">{t("knowledge.tags")}<input className="agent-input" value={tags} onChange={e => setTags(e.target.value)} /></label>
          {!tagsValid && <p className="form-error" role="alert">{t("knowledge.tagsLimit")}</p>}
          {mode === "text" && <label className="form-field">{t("knowledge.content")}<textarea className="agent-textarea knowledge-editor" required maxLength={2000000} value={content} onChange={e => setContent(e.target.value)} /></label>}
        </>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><Button onClick={onDismiss}>{t("knowledge.cancel")}</Button><Button type="submit" variant="primary" disabled={busy || !!fileError || (mode === "file" && !file) || !key.trim() || !title.trim() || title.length > 160 || !tagsValid || (mode === "text" && !content.trim())}>{t(busy ? "knowledge.submitting" : "knowledge.submit")}</Button></div>
      </fieldset>
    </form>
  </Modal>;
}
