"use client";

import { useState } from "react";
import { Download, LoaderCircle, Trash2 } from "lucide-react";
import { AssetFileIcon } from "@/features/assets/asset-uploads";
import { useI18n } from "@/i18n/use-i18n";
import { formatFileSize } from "@/lib/file-size";
import { FileViewLink } from "@/components/content/file-view-link";
import { FileDownloadButton } from "@/components/content/file-download-button";

export type SessionFile = { id: string; name: string; bytes: number; href: string; description?: string };
export function SessionFileList({ kind, files, loading, error, deleting, disabled, onRemove, onRetry }: {
  kind: "attachments" | "deliverables"; files: SessionFile[]; loading: boolean; error?: string;
  deleting?: string | null; disabled: boolean; onRemove: (id: string) => Promise<void>; onRetry: () => void;
}) {
  const { t, locale } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [confirm, setConfirm] = useState<SessionFile | null>(null);
  const visible = expanded ? files : files.slice(0, 4);
  return <>
    {loading && !files.length ? <p className="session-details-empty" role="status">{t("sessionDetails.loading")}</p>
      : !files.length && !error && <p className="session-details-empty">{t(`sessionDetails.${kind}.empty`)}</p>}
    <ul className="session-file-list">{visible.map(file => <li key={file.id}>
      <AssetFileIcon filename={file.name} />
      <div className="session-file-name"><strong title={file.name}>{file.name}</strong>
        <small>{formatFileSize(file.bytes, locale)}{file.description ? ` · ${file.description}` : ""}</small></div>
      <div className="session-file-actions">
        <FileViewLink href={file.href} filename={file.name} />
        <FileDownloadButton href={file.href} filename={file.name} label={t("sessionDetails.download", { name: file.name })}><Download size={14} aria-hidden="true" /></FileDownloadButton>
        <button type="button" disabled={disabled || !!deleting} aria-label={t(`sessionDetails.${kind}.remove`, { name: file.name })}
          title={t(`sessionDetails.${kind}.remove`, { name: file.name })} onClick={() => setConfirm(file)}>
          {deleting === `${kind}:${file.id}` ? <LoaderCircle size={14} className="spinning" aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />}
        </button>
      </div>
    </li>)}</ul>
    {files.length > 4 && <button className="text-button session-files-more" type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
      {t(expanded ? "sidebar.showLess" : "sessionDetails.showMore", { count: files.length - 4 })}
    </button>}
    {confirm && <div className="session-file-confirm" role="alert">
      <p>{t(`sessionDetails.${kind}.confirm`, { name: confirm.name })}</p>
      <div><button type="button" className="text-button" disabled={!!deleting} onClick={() => setConfirm(null)}>{t("common.cancel")}</button>
        <button type="button" className="text-button" disabled={disabled || !!deleting} onClick={() => { void onRemove(confirm.id).then(() => setConfirm(null)); }}>{t("sessionDetails.confirmRemove")}</button></div>
    </div>}
    {error && <div className="session-file-error"><p role="alert">{error}</p><button type="button" className="text-button" onClick={onRetry}>{t("deliverables.retry")}</button></div>}
  </>;
}
