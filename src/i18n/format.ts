import type { Dictionary, TranslationKey, TranslationParams } from "./types";

export function translate(dictionary: Dictionary, key: TranslationKey, params: TranslationParams = {}) {
  return dictionary[key].replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : placeholder);
}
