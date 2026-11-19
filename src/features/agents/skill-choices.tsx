"use client";
import { useEffect, useState } from "react";
import { useBackendConnection } from "@/providers/backend-connection-provider";
import { useI18n } from "@/i18n/use-i18n";
import { readSkills, type Skill } from "@/lib/backend-skills";

export function SkillChoices({ selected, onChange, disabled }: { selected: readonly string[]; onChange: (ids: string[]) => void; disabled: boolean }) {
  const { client } = useBackendConnection(), { t } = useI18n();
  const [items, setItems] = useState<Skill[] | null>(null), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!client) return;
    const controller = new AbortController();
    readSkills(client, controller.signal).then(items => { if (!controller.signal.aborted) setItems(items); })
      .catch(cause => { if (!controller.signal.aborted) setError(String(cause)); });
    return () => controller.abort();
  }, [client]);
  const choices = [...(items ?? []).map(s => ({ id: s.id, name: s.name })), ...selected.filter(id => !items?.some(s => s.id === id)).map(id => ({ id, name: t("resources.missing") }))];
  return <fieldset className="skill-choices" disabled={disabled}><legend>{t("customize.skills.label")}</legend>
    {error && <p className="field-error" role="alert">{error}</p>}
    {!items && !error && <p role="status">{t("skills.loading")}</p>}
    {items?.length === 0 && <p className="local-note">{t("resources.empty")}</p>}
    {choices.map(skill => <label key={skill.id}><input type="checkbox" checked={selected.includes(skill.id)} onChange={e => onChange(e.target.checked ? [...selected, skill.id] : selected.filter(id => id !== skill.id))} />{skill.name}</label>)}
  </fieldset>;
}
