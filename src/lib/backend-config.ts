import { normalizeBackendUrl } from "./backend-url.ts";

export type BackendConfig = Readonly<{ version: 1; BASE_URL: string }>;

export function parseBackendConfig(serialized: string | null): BackendConfig | null {
  try {
    const value: unknown = JSON.parse(serialized ?? "null");
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1 ||
      !("BASE_URL" in value) || typeof value.BASE_URL !== "string") return null;
    return { version: 1, BASE_URL: normalizeBackendUrl(value.BASE_URL) };
  } catch { return null; }
}
