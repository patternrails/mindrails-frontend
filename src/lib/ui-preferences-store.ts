import type { Locale } from "../i18n/types";
import { panelWidthSettings } from "./panel-width.ts";
import { isTheme, type Theme } from "./ui-themes.ts";

export type Appearance = "system" | "light" | "dark";
export type Preferences = { locale: Locale; appearance: Appearance; theme: Theme; sidebarCollapsed: boolean; detailsCollapsed: boolean; detailsWidth: number; sidebarWidth: number };
export const defaultPreferences: Preferences = { locale: "en", appearance: "system", theme: "default", sidebarCollapsed: false, detailsCollapsed: false,
  detailsWidth: panelWidthSettings.details.defaultWidth, sidebarWidth: panelWidthSettings.menu.defaultWidth };
export const preferencesStorageKey = "mindrails.ui-preferences.v1";
type StoragePort = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };

export function parsePreferences(value: unknown): Preferences {
  if (!value || typeof value !== "object" ||
    !("sidebarCollapsed" in value) || typeof value.sidebarCollapsed !== "boolean" ||
    !("detailsCollapsed" in value) || typeof value.detailsCollapsed !== "boolean") return defaultPreferences;
  // Older v1 records have only panel flags; keep those and default to English.
  const detailsWidth = "detailsWidth" in value && typeof value.detailsWidth === "number" &&
    Number.isFinite(value.detailsWidth) && value.detailsWidth >= defaultPreferences.detailsWidth
    ? value.detailsWidth : defaultPreferences.detailsWidth;
  const sidebarWidth = "sidebarWidth" in value && typeof value.sidebarWidth === "number" &&
    Number.isFinite(value.sidebarWidth) && value.sidebarWidth >= defaultPreferences.sidebarWidth
    ? value.sidebarWidth : defaultPreferences.sidebarWidth;
  const appearance = "appearance" in value && (value.appearance === "system" || value.appearance === "light" || value.appearance === "dark")
    ? value.appearance : defaultPreferences.appearance;
  const theme = "theme" in value && isTheme(value.theme) ? value.theme : defaultPreferences.theme;
  return { locale: "en", appearance, theme,
    sidebarCollapsed: value.sidebarCollapsed, detailsCollapsed: value.detailsCollapsed, detailsWidth, sidebarWidth };
}

export function createPreferencesStore(storage: () => StoragePort) {
  let snapshot = defaultPreferences;
  let initialized = false;
  const listeners = new Set<() => void>();
  function read() {
    try { return parsePreferences(JSON.parse(storage().getItem(preferencesStorageKey) ?? "null")); }
    catch { return defaultPreferences; }
  }
  function getSnapshot() {
    if (!initialized) { snapshot = read(); initialized = true; }
    return snapshot;
  }
  return {
    getSnapshot,
    getServerSnapshot: () => defaultPreferences,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    update: (patch: Partial<Preferences>) => {
      snapshot = { ...parsePreferences({ ...getSnapshot(), ...patch }), locale: patch.locale ?? getSnapshot().locale };
      try { storage().setItem(preferencesStorageKey, JSON.stringify({ ...snapshot, locale: undefined })); } catch { /* Storage is optional. */ }
      listeners.forEach((listener) => listener());
    },
    reload: () => { snapshot = { ...read(), locale: snapshot.locale }; initialized = true; listeners.forEach((listener) => listener()); },
  };
}
