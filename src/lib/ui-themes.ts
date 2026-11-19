export const uiThemes = ["default", "solarized", "cayman", "hacker", "midnight"] as const;
export type Theme = typeof uiThemes[number];

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && uiThemes.some(theme => theme === value);
}
