import { BackendClientError } from "./backend-client.ts";
import { parseBackendConfig, type BackendConfig } from "./backend-config.ts";

export async function readBackendConfig(fetcher: typeof fetch = (...args) => globalThis.fetch(...args)): Promise<BackendConfig> {
  try {
    const response = await fetcher("/api/backend-config", {
      cache: "no-store", credentials: "same-origin", redirect: "error", signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`Configuration returned HTTP ${response.status}.`);
    const value = await response.json();
    const config = parseBackendConfig(JSON.stringify(value?.config));
    if (!config) throw new Error("Invalid backend configuration response.");
    return config;
  } catch (cause) {
    throw new BackendClientError("configuration", "Unable to read backend configuration.", { cause });
  }
}
