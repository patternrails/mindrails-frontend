"use client";

import { useI18n } from "@/i18n/use-i18n";
import { useUiPreferences } from "@/providers/ui-preferences-provider";
import { useState } from "react";
import { Check } from "lucide-react";
import { uiThemes } from "@/lib/ui-themes";
import { QuickSetupSetting } from "./provider-quick-setup";

export function GeneralSettings() {
  const { t } = useI18n();
  const [languageBusy, setLanguageBusy] = useState(false), [languageError, setLanguageError] = useState<string | null>(null);
  const { preferences, setLocale, setAppearance, setTheme } = useUiPreferences();
  return <>
    <p className="settings-intro">{t("settings.general.empty")}</p>
    <dl className="preference-summary">
      <QuickSetupSetting />
      <div><dt><label htmlFor="ui-language">{t("settings.language")}</label></dt><dd>
        <select id="ui-language" className="agent-select language-select" value={preferences.locale} disabled={languageBusy}
          aria-describedby="language-hint" onChange={(event) => {
            if (event.target.value === "en" || event.target.value === "zh") {
              setLanguageBusy(true); setLanguageError(null);
              void setLocale(event.target.value).catch(e => setLanguageError(e.message)).finally(() => setLanguageBusy(false));
            }
          }}>
          <option value="en" lang="en">English</option><option value="zh" lang="zh-CN">简体中文</option>
        </select>{languageError && <span role="alert" className="field-error">{languageError}</span>}<span id="language-hint">{t("settings.languageHint")}</span>
      </dd></div>
      <div><dt>{t("settings.appearance")}</dt><dd>
        <fieldset className="appearance-toggle" aria-describedby="appearance-hint">
          <legend className="sr-only">{t("settings.appearance")}</legend>
          {(["system", "light", "dark"] as const).map((mode) => <label className="appearance-option" key={mode}>
            <input type="radio" className="sr-only" name="ui-appearance" value={mode}
              checked={preferences.appearance === mode} onChange={() => setAppearance(mode)} />
            <span>{t(mode === "system" ? "settings.system" : mode === "light" ? "settings.light" : "settings.dark")}</span>
          </label>)}
        </fieldset>
        <span id="appearance-hint">{t("settings.appearanceHint")}</span>
        <fieldset className="theme-picker" aria-describedby="theme-hint">
          <legend>{t("settings.theme")}</legend>
          <div className="theme-options">{uiThemes.map(theme => <label className="theme-option" key={theme}>
            <input type="radio" className="sr-only" name="ui-theme" value={theme} checked={preferences.theme === theme}
              onChange={() => setTheme(theme)} aria-label={t(`settings.theme.${theme}`)} />
            <span className="theme-choice">
              <span className="theme-preview" data-theme={theme} aria-hidden="true">
                <span className="theme-preview-sidebar"><i /><i /><i /></span>
                <span className="theme-preview-content"><i /><i /><i /><b /></span>
              </span>
              <span className="theme-name">{t(`settings.theme.${theme}`)}<Check size={14} aria-hidden="true" /></span>
              <span className="theme-description">{t(`settings.theme.${theme}.description`)}</span>
            </span>
          </label>)}</div>
        </fieldset>
        <span id="theme-hint">{t("settings.themeHint")}</span>
      </dd></div>
    </dl>
  </>;
}
