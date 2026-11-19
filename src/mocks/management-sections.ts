import type { TranslationKey } from "@/i18n/types";

type Section = { id: string; label: TranslationKey; description: TranslationKey; emptyTitle: TranslationKey; emptyDescription: TranslationKey };
type Module = { title: TranslationKey; description: TranslationKey; sections: Section[] };
type SectionPrefix = "library.knowledge" | "library.sources" | "library.retrieval" |
  "customize.skills" | "customize.mcp" |
  "settings.general" | "settings.providers" | "settings.metrics" | "settings.history";

function section(id: string, prefix: SectionPrefix): Section {
  return { id, label: `${prefix}.label`, description: `${prefix}.description`,
    emptyTitle: `${prefix}.title`, emptyDescription: `${prefix}.empty` };
}

export const managementSections: Record<"library" | "customize" | "settings", Module> = {
  library: { title: "nav.library", description: "library.description", sections: [
    section("knowledge", "library.knowledge"), section("sources", "library.sources"), section("retrieval", "library.retrieval"),
  ] },
  customize: { title: "nav.customize", description: "customize.description", sections: [
    section("skills", "customize.skills"), section("mcp", "customize.mcp"),
  ] },
  settings: { title: "nav.settings", description: "settings.description", sections: [
    section("general", "settings.general"),
    section("providers", "settings.providers"), section("metrics", "settings.metrics"),
    section("history", "settings.history"),
  ] },
};
