"use client";

import { UsersSettings } from "@/features/users/users-settings";
import { useAuth } from "@/providers/auth-provider";
import { useState } from "react";
import { BookOpen, Boxes, Settings2 } from "lucide-react";
import { SectionTabs } from "@/components/ui/section-tabs";
import { ManagementPage } from "@/components/shell/management-page";
import { managementSections } from "@/mocks/management-sections";
import { useI18n } from "@/i18n/use-i18n";
import { GeneralSettings } from "@/features/settings/general-settings";
import { MetricsSettings } from "@/features/settings/metrics-settings";
import { HistorySettings } from "@/features/settings/history-settings";
import { ProvidersSettings } from "@/features/settings/providers-settings";
import { SkillsSettings } from "@/features/customize/skills-settings";
import { McpSettings } from "@/features/customize/mcp-settings";

export function FutureModule({ module, initialTab }: { module: keyof typeof managementSections; initialTab?: string }) {
  const definition = managementSections[module];
  const { t } = useI18n();
  const { user } = useAuth();
  const [tab, setTab] = useState(initialTab ?? definition.sections[0].id);
  const Icon = { library: BookOpen, customize: Boxes, settings: Settings2 }[module];
  function selectTab(value: string) {
    setTab(value);
    if (module !== "settings") return;
    const url = new URL(window.location.href);
    if (value === "providers") url.searchParams.set("tab", value);
    else url.searchParams.delete("tab");
    if (url.href !== window.location.href) window.history.replaceState(null, "", url);
  }
  return <ManagementPage title={t(definition.title)} description={t(definition.description)}>
    <SectionTabs label={t("module.sections", { title: t(definition.title) })} value={tab} onValueChange={selectTab}
      items={[...definition.sections.filter(section => module !== "settings" || section.id !== "providers" || user?.role === "SystemAdmin").map((section) => ({ ...section, label: t(section.label), content: <>
        <div className="section-heading"><div><h2>{t(section.label)}</h2><p>{t(section.description)}</p></div>
        </div>
        {module === "customize" && section.id === "mcp" ? <McpSettings /> :
          module === "customize" && section.id === "skills" ? <SkillsSettings /> :
          module === "settings" && section.id === "providers" ? <ProvidersSettings /> :
          module === "settings" && section.id === "metrics" ? <MetricsSettings /> :
          module === "settings" && section.id === "history" ? <HistorySettings /> :
          section.id === "general" ? <GeneralSettings /> :
          <div className="future-card"><span className="empty-icon"><Icon size={22} aria-hidden="true" /></span>
            <h3>{t(section.emptyTitle)}</h3><p>{t(section.emptyDescription)}</p>
          </div>}
      </> })), ...(module === "settings" && user?.role === "SystemAdmin" ? [{ id: "users", label: t("users.label"), content: <UsersSettings /> }] : [])]} />
  </ManagementPage>;
}
