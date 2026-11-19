"use client";
import { RefreshCw } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { useI18n } from "@/i18n/use-i18n";
import type { BackendClientError } from "@/lib/backend-client";
export function ArchiveNotice({ connected, loading, error, retry }: { connected: boolean; loading: boolean; error?: BackendClientError; retry: () => void }) {
  const { t } = useI18n();
  if (!connected) return <div className="providers-notice"><p role="status">{t("archive.connect")}</p></div>;
  if (loading) return <p role="status">{t("archive.loading")}</p>;
  if (error) return <div className="providers-notice"><p role="alert" className="field-error">{t(error.status === 503 ? "archive.unavailable" : error.status === 404 ? "archive.missing" : "archive.error")}</p><IconButton icon={RefreshCw} label={t("archive.refresh")} onClick={retry} /></div>;
  return null;
}
