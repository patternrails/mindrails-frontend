"use client";

import { en } from "@/i18n/en";
import { zh } from "@/i18n/zh";
import { translate } from "@/i18n/format";
import type { Locale, TranslationKey, TranslationParams } from "@/i18n/types";
import { useUiPreferences } from "@/providers/ui-preferences-provider";

export function useI18n(override?: Locale) {
  const { preferences } = useUiPreferences();
  const locale = override ?? preferences.locale;
  const dictionary = locale === "zh" ? zh : en;
  return { locale, t: (key: TranslationKey, params?: TranslationParams) => translate(dictionary, key, params) };
}
