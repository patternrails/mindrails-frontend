"use client";
import { Eye } from "lucide-react";
import { useBackendConnection } from "@/providers/backend-connection-provider";
import { useI18n } from "@/i18n/use-i18n";
import { fileViewHref, previewableFilename } from "@/lib/file-preview";
import "./file-view-link.css";

export function FileViewLink({ href, filename, className = "icon-button" }: { href: string; filename: string; className?: string }) {
  const { client } = useBackendConnection(), { t } = useI18n();
  const target = client && previewableFilename(filename) ? fileViewHref(client.BASE_URL, href) : null;
  return target ? <a href={target} target="_blank" rel="noopener noreferrer" className={`file-view-link ${className}`}
    aria-label={t("files.viewName", { name: filename })} title={t("files.viewName", { name: filename })}><Eye size={14} aria-hidden="true" /><span className="file-view-label">{t("files.view")}</span></a> : null;
}
