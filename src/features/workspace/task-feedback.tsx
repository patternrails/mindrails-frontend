"use client";
import { useTasks } from "@/providers/task-workspace-provider";
import { useI18n } from "@/i18n/use-i18n";
import { Button } from "@/components/ui/button";
export function TaskFeedback() {
  const tasks = useTasks(), { t } = useI18n();
  return <div className="workspace-feedback" aria-live="polite">
    {tasks.error && <p role="alert">{tasks.error.status === 409 || tasks.error.serverCode === "CONFLICT" ? t("tasks.conflict") : tasks.error.status === 400 ? t("tasks.invalid") : t("tasks.error")}
      <Button variant="ghost" disabled={!!tasks.mutation} onClick={() => void tasks.refresh()}>{t("agents.retry")}</Button></p>}
    {tasks.uncertain && <p role="alert">{t("rest.unknown")}</p>}
    {tasks.notice && <p role="status">{t(`tasks.${tasks.notice}`)}</p>}
  </div>;
}
