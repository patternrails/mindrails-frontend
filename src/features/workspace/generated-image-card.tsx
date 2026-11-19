"use client";

import { Download, ImageIcon } from "lucide-react";
import type { SessionDeliverable } from "@/lib/session-deliverables";
import { FileDownloadButton } from "@/components/content/file-download-button";
import { FileViewLink } from "@/components/content/file-view-link";
import { AuthenticatedImage } from "@/components/content/authenticated-image";
import { useI18n } from "@/i18n/use-i18n";
import { formatFileSize } from "@/lib/file-size";

/** Images use the regular Bearer/refresh path; remote provider URLs and credentials never reach img.src. */
export function GeneratedImageCard({ file }: { file: SessionDeliverable }) {
  const { t, locale } = useI18n();
  return <figure className="generated-image-card">
    <div className="generated-image-heading"><ImageIcon size={16} aria-hidden="true" /><strong>{t("imageCard.title")}</strong></div>
    <AuthenticatedImage href={file.downloadUrl} mediaType={file.mediaType ?? "image/png"} alt={file.name} />
    <figcaption><div><strong title={file.name}>{file.name}</strong><small>{formatFileSize(file.bytes, locale)}</small></div>
      <FileViewLink href={file.downloadUrl} filename={file.name} />
      <FileDownloadButton href={file.downloadUrl} filename={file.name} className="text-button"><Download size={14} aria-hidden="true" />{t("imageCard.download")}</FileDownloadButton></figcaption>
  </figure>;
}
