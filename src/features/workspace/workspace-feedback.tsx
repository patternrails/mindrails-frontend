"use client";

import { useWorkspace } from "@/providers/workspace-provider";
import { useI18n } from "@/i18n/use-i18n";
export function WorkspaceFeedback() {
  const w = useWorkspace(), { t } = useI18n();
  return <div className="workspace-feedback" aria-live="polite">
    {w.error && <p role="alert">{w.error.code === "http" ? t("rest.httpError", { status: w.error.status ?? 0 }) :
      t(w.error.code === "timeout" ? "rest.timeout" : w.error.code === "invalid-response" ? "rest.invalidResponse" : "rest.requestError")}</p>}
    {w.uncertain && <p role="alert">{t("rest.unknown")}</p>}
    {w.notice && <p role="status">{t(`rest.${w.notice}`)}</p>}
  </div>;
}
