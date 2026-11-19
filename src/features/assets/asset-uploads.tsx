"use client";
import { File, FileText, FileImage, Presentation, FileSpreadsheet, X, RotateCw, Check, LoaderCircle } from "lucide-react";
import { useI18n } from "@/i18n/use-i18n";
import { assetReady } from "@/lib/backend-assets";
import type { AssetUpload } from "./use-asset-uploads";

export function AssetFileIcon({ filename }: { filename: string }) { const ext = filename.split(".").pop()?.toLowerCase(); const Icon = ["pdf", "docx", "txt", "md", "html", "htm"].includes(ext ?? "") ? FileText : ["png", "jpg", "jpeg", "webp"].includes(ext ?? "") ? FileImage : ["ppt", "pptx"].includes(ext ?? "") ? Presentation : ["csv", "xlsx"].includes(ext ?? "") ? FileSpreadsheet : File; return <Icon size={18} aria-hidden="true" />; }
export function UploadRing({ progress }: { progress: number }) { const value = Math.round(Math.max(0, Math.min(1, progress)) * 100); return <svg className="upload-ring" viewBox="0 0 24 24" role="progressbar" aria-label={`${value}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}><circle cx="12" cy="12" r="9" className="upload-ring-track" /><circle cx="12" cy="12" r="9" className="upload-ring-value" pathLength="100" strokeDasharray={`${value} 100`} /></svg>; }
export function AssetUploads({ items, disabled = false, onRemove, onRetry }: { items: AssetUpload[]; disabled?: boolean; onRemove: (id: string) => void; onRetry: (item: AssetUpload) => void }) {
  const { t } = useI18n();
  return <div className="asset-uploads">{items.map(item => <div className={`asset-upload${item.error ? " asset-upload-error" : ""}`} key={item.id}>
    <AssetFileIcon filename={item.file.name} /><div className="asset-upload-name"><strong title={item.file.name}>{item.file.name}</strong><span role="status">{t(item.error ? "assets.failed" : item.progress < 1 ? "assets.uploading" : item.asset && assetReady(item.asset) ? "assets.ready" : "assets.processing")}</span>{item.error && <span className="asset-upload-reason" role="alert">{item.error}</span>}</div>
    {item.error ? <button type="button" className="icon-button" disabled={disabled} aria-label={t("assets.retry")} title={t("assets.retry")} onClick={() => onRetry(item)}><RotateCw size={14} /></button> : item.progress < 1 ? <UploadRing progress={item.progress} /> : item.asset && assetReady(item.asset) ? <Check size={16} aria-hidden="true" /> : <LoaderCircle size={16} className="spinning" aria-hidden="true" />}
    <button type="button" className="icon-button" disabled={disabled} aria-label={t("assets.remove")} onClick={() => onRemove(item.id)}><X size={14} /></button>
  </div>)}</div>;
}
