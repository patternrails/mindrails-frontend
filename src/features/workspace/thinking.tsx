"use client";

import { useI18n } from "@/i18n/use-i18n";

export function Thinking({ summary }: { summary: string }) {
  const { t } = useI18n();
  return <details className="thinking-section" open>
    <summary>{t("details.thinking")}</summary>
    <p>{summary}</p>
  </details>;
}
