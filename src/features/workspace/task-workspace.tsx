"use client";
import { useRef } from "react";
import { CalendarClock, Clock3, ListTodo, LoaderCircle, Play, Save, Square } from "lucide-react";
import { useTasks } from "@/providers/task-workspace-provider";
import { useBackendAgents } from "@/providers/backend-agents-provider";
import { WorkspaceFrame } from "@/components/shell/workspace-frame";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/content/markdown";
import { taskDirty } from "@/lib/task-workspace-store";
import type { BackendTask, TaskStatus } from "@/lib/backend-tasks";
import { streamAnswer } from "@/lib/session-stream";
import { useI18n } from "@/i18n/use-i18n";
import { StreamActivity } from "./stream-activity";
import { TaskDetails } from "./task-details";
import { TaskFeedback } from "./task-feedback";
import { taskStatusLabels } from "./task-status";
function CronPanel({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useI18n(), enabled = !!value.trim(), fields = value.trim().split(/\s+/);
  const preset = fields.length === 5 && /^\d+$/.test(fields[0]) && /^\d+$/.test(fields[1]) && fields[2] === "*" && fields[3] === "*"
    ? fields[4] === "*" ? "daily" : fields[4] === "1-5" ? "weekdays" : /^[0-6]$/.test(fields[4]) ? "weekly" : "custom" : "custom";
  const time = `${String(fields[1] ?? "9").padStart(2, "0")}:${String(fields[0] ?? "0").padStart(2, "0")}`;
  const schedule = (kind: string, nextTime = /^\d\d:\d\d$/.test(time) ? time : "09:00", day = fields[4] ?? "1") => {
    const [hour, minute] = nextTime.split(":").map(Number);
    onChange(`${minute} ${hour} * * ${kind === "daily" ? "*" : kind === "weekdays" ? "1-5" : /^[0-6]$/.test(day) ? day : "1"}`);
  };
  return <section className="task-schedule-panel" aria-labelledby="task-schedule-label">
    <div className="task-panel-heading"><h2 id="task-schedule-label"><CalendarClock size={17} aria-hidden="true" />{t("tasks.schedule")}</h2>
      <label className="task-schedule-toggle"><input type="checkbox" checked={enabled} onChange={e => onChange(e.target.checked ? "0 9 * * *" : "")} />{t("tasks.enableSchedule")}</label></div>
    {enabled ? <>
      <div className="task-schedule-controls"><div className="form-field"><label htmlFor="task-frequency">{t("tasks.frequency")}</label>
        <select id="task-frequency" className="agent-select" value={preset} onChange={e => { if (e.target.value === "custom") onChange("0 9 * * MON-FRI"); else schedule(e.target.value); }}>
          {(["daily", "weekdays", "weekly", "custom"] as const).map(p => <option key={p} value={p}>{t(`tasks.${p}`)}</option>)}
        </select></div>
        {preset !== "custom" && <div className="form-field"><label htmlFor="task-time">{t("tasks.time")}</label><input id="task-time" type="time" value={time} onChange={e => { if (e.target.value) schedule(preset, e.target.value); }} /></div>}
        {preset === "weekly" && <div className="form-field"><label htmlFor="task-weekday">{t("tasks.weekday")}</label><select id="task-weekday" className="agent-select" value={fields[4]} onChange={e => schedule("weekly", time, e.target.value)}>
          {[1, 2, 3, 4, 5, 6, 0].map(day => <option key={day} value={day}>{t(`tasks.day${day}` as "tasks.day0")}</option>)}</select></div>}
      </div>
      <div className="form-field"><label htmlFor="task-cron">{t("tasks.cron")}</label><input id="task-cron" className="task-cron-input" maxLength={255} value={value} placeholder="0 9 * * 1-5" required pattern="\S+\s+\S+\s+\S+\s+\S+\s+\S+" title={t("tasks.cronHint")} onChange={e => onChange(e.target.value)} />
        <p className="task-field-hint">{t("tasks.cronHint")}</p></div>
    </> : <p className="task-field-hint">{t("tasks.manualHint")}</p>}
  </section>;
}
export function TaskWorkspace({ task }: { task: BackendTask }) {
  const tasks = useTasks(), agents = useBackendAgents(), { t, locale } = useI18n(), detailsRef = useRef<HTMLElement>(null);
  const editor = tasks.editors[task.id] ?? { instructions: task.instructions, cronjob: task.cronjob ?? "" };
  const agent = agents.agents.find(agent => agent.id === task.parentAgentId);
  const active = tasks.active[task.id], running = !!active, cancelling = active?.status === "CANCELLING";
  const dirty = taskDirty(task, editor), busy = !!tasks.mutation || !!agents.mutation, connected = tasks.status !== "unavailable";
  const selected = tasks.selectedExecutions[task.id], savedExecution = tasks.details[selected] ?? tasks.executions[task.id]?.find(e => e.id === selected);
  const execution = savedExecution && active?.executionId === savedExecution.id ? { ...savedExecution, status: active.status } : savedExecution;
  const stream = tasks.streams[selected], answer = execution?.result?.lines.join("\n") ?? (stream ? streamAnswer(stream) : null);
  const executions = tasks.executions[task.id] ?? [];
  const feedback = `${execution?.id}:${execution?.status}:${stream?.tools.filter(tool => tool.executed).length}`;
  return <WorkspaceFrame details={<TaskDetails task={task} execution={execution} stream={stream} agentName={agent?.name} running={running} feedback={feedback} />} detailsLabel={t("tasks.details")} detailsRef={detailsRef}>
    <section className="workspace-chat task-workspace" aria-label={t("tasks.workspace")}>
      <header className="workspace-heading task-workspace-heading"><div className="task-title"><h1><ListTodo size={19} aria-hidden="true" />{task.name?.trim() || t("tasks.new")}</h1>
        <span className="task-save-state">{t(task.local ? "tasks.draft" : dirty ? "tasks.unsaved" : "tasks.definitionSaved")}</span></div>
        <p className="session-meta"><span>{agent?.name}</span><span aria-hidden="true">·</span><span>{task.provider.modelName}</span>
          {running && <span className="task-live-label" role="status"><LoaderCircle size={12} className="spinning" aria-hidden="true" />{t(cancelling ? "stream.cancelling" : "status.running")}</span>}</p>
      </header>
      <TaskFeedback />
      <div className="task-workspace-scroll">
        <form id="task-definition" className="task-definition" onSubmit={event => { event.preventDefault(); void tasks.save(task.id); }}>
          <section className="task-instructions-panel"><div className="task-panel-heading"><h2><ListTodo size={17} aria-hidden="true" />{t("tasks.instructions")}</h2></div>
            <label className="sr-only" htmlFor="task-instructions">{t("tasks.instructions")}</label>
            <textarea id="task-instructions" value={editor.instructions} rows={7} maxLength={100000} required placeholder={t("tasks.instructionsPlaceholder")} onChange={e => tasks.edit(task.id, { instructions: e.target.value })} />
            <p className="task-field-hint">{t("tasks.instructionsHint")}</p>
          </section>
          <CronPanel value={editor.cronjob} onChange={cronjob => tasks.edit(task.id, { cronjob })} />
        </form>
        <section className="task-results" aria-labelledby="task-results-label"><div className="task-panel-heading"><h2 id="task-results-label"><Clock3 size={17} aria-hidden="true" />{t("tasks.results")}</h2>
          {selected && <select className="task-execution-select agent-select" aria-label={t("tasks.chooseExecution")} value={selected} onChange={e => tasks.selectExecution(task.id, e.target.value)}>
            {!executions.some(e => e.id === selected) && <option value={selected}>{t("status.running")}</option>}
            {executions.map(e => <option key={e.id} value={e.id}>{new Date(e.createdAt).toLocaleString(locale === "zh" ? "zh-CN" : "en")} · {t(taskStatusLabels[e.status as TaskStatus])}</option>)}
          </select>}
        </div>
          {stream && <StreamActivity stream={stream} />}
          {answer && <div className="task-result-answer"><Markdown sources={execution?.result?.sources ?? []}>{answer}</Markdown></div>}
          {execution?.error && <p className="task-result-error" role={execution.status === "FAILED" ? "alert" : "status"}>{execution.error.message}</p>}
          {!selected && !running && <div className="task-results-empty"><Play size={23} aria-hidden="true" /><p>{t("tasks.noExecutions")}</p></div>}
          {tasks.loadingExecution === selected && !stream && <p className="task-field-hint" role="status">{t("rest.loading")}</p>}
          {stream?.phase === "unconfirmed" && <p className="task-field-hint">{t("tasks.checkStatus")}</p>}
        </section>
      </div>
      <footer className="task-workspace-actions"><p>{running ? t("tasks.runningHint") : t(dirty ? "tasks.saveBeforeExecute" : "tasks.ready")}</p>
        <div><Button type="submit" form="task-definition" disabled={!connected || busy || !dirty || !editor.instructions.trim() || tasks.uncertain}><Save size={15} aria-hidden="true" />{t(tasks.mutation === task.id ? "tasks.saving" : "agents.save")}</Button>
          <Button variant="primary" disabled={!connected || (running ? cancelling : busy || dirty || !tasks.checked[task.id] || tasks.uncertain)} onClick={() => void (running ? tasks.cancel(task.id) : tasks.execute(task.id))}>
            {running ? <><LoaderCircle size={15} className="spinning" aria-hidden="true" /><Square size={12} aria-hidden="true" />{t(cancelling ? "stream.cancelling" : "tasks.runningStop")}</> : <><Play size={15} aria-hidden="true" />{t("tasks.execute")}</>}
          </Button></div>
      </footer>
    </section>
  </WorkspaceFrame>;
}
