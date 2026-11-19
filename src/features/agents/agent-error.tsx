"use client";

import type { BackendClientError } from "@/lib/backend-client";
import { useI18n } from "@/i18n/use-i18n";

export function AgentError({ error }: { error: BackendClientError }) {
  const { t } = useI18n();
  const message = error.code === "http" ?
    error.status === 400 ? t("agents.error.invalid") : error.status === 404 ? t("agents.error.missing") :
    error.status === 409 ? t("agents.error.conflict") : t("agents.error.http", { status: error.status ?? "?" }) :
    error.code === "invalid-response" ? t("agents.error.response") : error.code === "invalid-request" ? t("agents.error.invalid") :
    error.code === "busy" ? t("agents.error.busy") : error.code === "network" ? t("agents.error.network") :
    error.code === "timeout" ? t("agents.error.timeout") : t("agents.error.unavailable");
  return <p className="field-error" role="alert">{message}</p>;
}
