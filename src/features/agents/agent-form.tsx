"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { normalizeAgentWrite, type AgentWriteInput } from "@/lib/backend-agents";
import type { BackendClientError } from "@/lib/backend-client";
import { AgentError } from "@/features/agents/agent-error";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/use-i18n";

const emptyInput: AgentWriteInput = { name: "", description: null, goal: null, systemMessage: null };

export function AgentForm({ initialValue = emptyInput, onSubmit, onCancel, editing, pending, serverError, uncertain }: {
  initialValue?: AgentWriteInput; onSubmit: (value: AgentWriteInput) => Promise<void>; onCancel: () => void;
  editing: boolean; pending: boolean; serverError: BackendClientError | null; uncertain: boolean;
}) {
  const { t } = useI18n();
  const id = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState({ ...initialValue, description: initialValue.description ?? "",
    goal: initialValue.goal ?? "", systemMessage: initialValue.systemMessage ?? "" });
  const [error, setError] = useState(false);
  useEffect(() => { nameRef.current?.focus(); }, []);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || uncertain) return;
    if (!value.name.trim()) {
      setError(true);
      nameRef.current?.focus();
      return;
    }
    void onSubmit(normalizeAgentWrite(value));
  }
  return <form className="agent-form" noValidate onSubmit={submit} aria-busy={pending}>
    <div className="form-field"><label htmlFor={`${id}-name`}>{t("agents.name")} <span className="field-required">{t("common.required")}</span></label>
      <input ref={nameRef} id={`${id}-name`} name="name" required value={value.name} disabled={pending}
        aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-name-error` : undefined}
        onChange={(event) => { setValue({ ...value, name: event.target.value }); if (event.target.value.trim()) setError(false); }} />
      {error && <p id={`${id}-name-error`} className="field-error" role="alert">{t("agents.nameError")}</p>}
    </div>
    {([ ["description", "agents.descriptionLabel", "agents.descriptionHint"],
      ["goal", "agents.goal", "agents.goalHint"],
      ["systemMessage", "agents.systemMessage", "agents.systemHint"] ] as const).map(([field, label, hint]) =>
      <div className="form-field" key={field}>
        <label htmlFor={`${id}-${field}`}>{t(label)} <span className="field-optional">{t("common.optional")}</span></label>
        <textarea id={`${id}-${field}`} name={field} rows={field === "systemMessage" ? 4 : 2} value={value[field]} disabled={pending}
          aria-describedby={`${id}-${field}-hint`} onChange={(event) => setValue({ ...value, [field]: event.target.value })} />
        <p id={`${id}-${field}-hint`} className="field-hint">{t(hint)}</p>
      </div>)}
    {editing && <p className="field-hint">{t("agents.sessionConfigHint")}</p>}
    {serverError && <AgentError error={serverError} />}
    {uncertain && <p className="field-error" role="alert">{t("agents.writeUncertain")}</p>}
    {pending && <p role="status" className="field-hint">{t("agents.saving")}</p>}
    <div className="modal-actions"><Button onClick={onCancel} disabled={pending}>{t("common.cancel")}</Button>
      <Button type="submit" variant="primary" disabled={pending || uncertain}>{t(editing ? "agents.save" : "agents.create")}</Button></div>
  </form>;
}
