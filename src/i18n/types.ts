import type { en } from "./en";

export type Locale = "en" | "zh";
export type TranslationKey = keyof typeof en;
export type Dictionary = Record<TranslationKey, string>;
export type TranslationParams = Record<string, string | number>;
