"use client";

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createPreferencesStore, preferencesStorageKey, type Appearance, type Preferences } from "@/lib/ui-preferences-store";
import { useBackendConnection } from "@/providers/backend-connection-provider";
import { authState, subscribeAuth, updateAuthUser, type UserProfile } from "@/lib/auth-session";
import type { Locale } from "@/i18n/types";
import type { Theme } from "@/lib/ui-themes";

const store = createPreferencesStore(() => window.localStorage);

function onStorage(event: StorageEvent) {
  if (event.key !== preferencesStorageKey && event.key !== null) return;
  try { if (event.storageArea === window.localStorage) store.reload(); } catch { /* Keep the current in-memory preferences. */ }
}

function togglePreference(key: "sidebarCollapsed" | "detailsCollapsed") {
  store.update({ [key]: !store.getSnapshot()[key] });
}

function setDetailsWidth(detailsWidth: number) {
  store.update({ detailsWidth });
}

function setSidebarWidth(sidebarWidth: number) {
  store.update({ sidebarWidth });
}

const PreferencesContext = createContext<{
  preferences: Preferences;
  toggleSidebar: () => void;
  toggleDetails: () => void;
  setDetailsWidth: (width: number) => void;
  setSidebarWidth: (width: number) => void;
  setLocale: (locale: Locale) => Promise<void>;
  setAppearance: (appearance: Appearance) => void;
  setTheme: (theme: Theme) => void;
} | null>(null);

export function UiPreferencesProvider({ children }: { children: ReactNode }) {
  const saved = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const { client, config } = useBackendConnection();
  const base = config?.BASE_URL;
  const user = useSyncExternalStore(subscribeAuth, () => base ? authState(base)?.session?.user ?? null : null, () => null);
  const preferences = { ...saved, locale: user?.language ?? saved.locale };
  useEffect(() => {
    document.documentElement.lang = preferences.locale === "zh" ? "zh-CN" : "en";
  }, [preferences.locale]);
  useEffect(() => {
    document.documentElement.style.colorScheme = preferences.appearance === "system" ? "light dark" : preferences.appearance;
  }, [preferences.appearance]);
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
  }, [preferences.theme]);
  useEffect(() => {
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return <PreferencesContext.Provider value={{ preferences,
    toggleSidebar: () => togglePreference("sidebarCollapsed"),
    toggleDetails: () => togglePreference("detailsCollapsed"),
    setDetailsWidth,
    setSidebarWidth,
    setLocale: async (locale) => {
      if (!user) { store.update({ locale }); return; }
      if (!client || !base) throw new Error("Backend is unavailable");
      const updated = await client.request("api/auth/language", { method: "PUT", json: { language: locale } }) as UserProfile;
      if (!["en", "zh"].includes(updated.language)) throw new Error("Invalid language response");
      updateAuthUser(base, updated);
    },
    setAppearance: (appearance) => store.update({ appearance }),
    setTheme: (theme) => store.update({ theme }),
  }}>{children}</PreferencesContext.Provider>;
}

export function useUiPreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("UI preferences require UiPreferencesProvider.");
  return value;
}
